import { prisma, serialize } from '../lib/prisma.js';
import { ApiError } from '../lib/errors.js';
import { computeTotals, round2 } from '../lib/money.js';

/** Which status moves are legal. Anything else is rejected before it touches the DB. */
export const STATUS_FLOW = {
  PLACED:    ['ACCEPTED', 'CANCELLED'],
  ACCEPTED:  ['PREPARING', 'CANCELLED'],
  PREPARING: ['READY', 'CANCELLED'],
  READY:     ['COMPLETED', 'CANCELLED'],
  COMPLETED: [],
  CANCELLED: [],
};

const TIMESTAMP_FOR_STATUS = {
  ACCEPTED:  'acceptedAt',
  READY:     'readyAt',
  COMPLETED: 'completedAt',
  CANCELLED: 'cancelledAt',
};

export const ORDER_INCLUDE = {
  items: true,
  table: { select: { id: true, label: true } },
  events: { orderBy: { createdAt: 'asc' } },
};

/**
 * Turns a cart of { menuItemId, variantLabel, quantity } into priced line items.
 * Prices come from the database, never from the client — the cart only says what
 * was wanted, the server decides what it costs.
 */
async function priceCart(restaurantId, cart) {
  const ids = [...new Set(cart.map((c) => c.menuItemId))];
  const menuItems = await prisma.menuItem.findMany({
    where: { id: { in: ids }, restaurantId },
    include: { variants: true, category: true },
  });
  const byId = new Map(menuItems.map((m) => [m.id, m]));

  const lineItems = [];
  for (const entry of cart) {
    const item = byId.get(entry.menuItemId);
    if (!item) throw ApiError.badRequest(`An item in your cart is no longer on the menu`);
    if (!item.isAvailable) throw ApiError.badRequest(`"${item.name}" just went out of stock`);

    let unitPrice;
    let variantLabel = null;
    if (item.variants.length > 0) {
      const variant = item.variants.find((v) => v.label === entry.variantLabel);
      if (!variant) throw ApiError.badRequest(`Choose a size for "${item.name}"`);
      unitPrice = Number(variant.price);
      variantLabel = variant.label;
    } else {
      if (item.basePrice == null) throw ApiError.badRequest(`"${item.name}" is not priced`);
      unitPrice = Number(item.basePrice);
    }

    lineItems.push({
      menuItemId: item.id,
      nameSnapshot: item.name,
      categorySnapshot: item.category.name,
      variantLabel,
      unitPrice,
      quantity: entry.quantity,
      lineTotal: round2(unitPrice * entry.quantity),
    });
  }
  return lineItems;
}

/** Validates a coupon against the cart subtotal and returns the discount in currency. */
async function resolveCoupon(restaurantId, code, subtotal) {
  if (!code) return { discountAmount: 0, couponCode: null };

  const coupon = await prisma.coupon.findUnique({
    where: { restaurantId_code: { restaurantId, code: code.toUpperCase().trim() } },
  });
  const now = new Date();
  if (!coupon || !coupon.isActive) throw ApiError.badRequest('That coupon code is not valid');
  if (coupon.validFrom > now) throw ApiError.badRequest('That coupon is not active yet');
  if (coupon.validUntil && coupon.validUntil < now) throw ApiError.badRequest('That coupon has expired');
  if (coupon.usageLimit != null && coupon.timesUsed >= coupon.usageLimit) {
    throw ApiError.badRequest('That coupon has been fully redeemed');
  }
  if (subtotal < Number(coupon.minOrderAmount)) {
    throw ApiError.badRequest(`Add a little more — this coupon needs a minimum of ${Number(coupon.minOrderAmount)}`);
  }

  let discount = coupon.discountType === 'PERCENT'
    ? round2((subtotal * Number(coupon.value)) / 100)
    : Number(coupon.value);
  if (coupon.maxDiscount != null) discount = Math.min(discount, Number(coupon.maxDiscount));

  return { discountAmount: round2(Math.min(discount, subtotal)), couponCode: coupon.code, couponId: coupon.id };
}

/** Prices a cart without committing anything — powers the live cart total. */
export async function quoteOrder(restaurant, { cart, couponCode }) {
  const lineItems = await priceCart(restaurant.id, cart);
  const rawSubtotal = round2(lineItems.reduce((s, li) => s + li.lineTotal, 0));
  const { discountAmount, couponCode: code } = await resolveCoupon(restaurant.id, couponCode, rawSubtotal);

  const totals = computeTotals({
    lineItems,
    taxPercent: Number(restaurant.taxPercent),
    discountAmount,
    taxInclusive: restaurant.taxInclusive,
  });

  return serialize({
    lineItems,
    couponCode: code,
    taxPercent: Number(restaurant.taxPercent),
    taxLabel: restaurant.taxLabel,
    taxInclusive: restaurant.taxInclusive,
    ...totals,
  });
}

/**
 * Creates the order. Runs in a transaction with a per-restaurant advisory lock so
 * two customers checking out at the same instant cannot claim the same order number.
 */
export async function createOrder(restaurant, payload) {
  const { cart, customerName, customerPhone, notes, tableId, tableLabel, couponCode } = payload;

  if (!restaurant.isAcceptingOrders) throw ApiError.badRequest(restaurant.closedMessage);

  const lineItems = await priceCart(restaurant.id, cart);
  const rawSubtotal = round2(lineItems.reduce((s, li) => s + li.lineTotal, 0));
  const { discountAmount, couponCode: code, couponId } = await resolveCoupon(restaurant.id, couponCode, rawSubtotal);

  const totals = computeTotals({
    lineItems,
    taxPercent: Number(restaurant.taxPercent),
    discountAmount,
    taxInclusive: restaurant.taxInclusive,
  });

  if (totals.totalAmount < Number(restaurant.minOrderAmount)) {
    throw ApiError.badRequest(
      `Minimum order is ${restaurant.currencySymbol}${Number(restaurant.minOrderAmount)}`
    );
  }

  let resolvedTable = null;
  if (tableId) {
    resolvedTable = await prisma.restaurantTable.findFirst({
      where: { id: tableId, restaurantId: restaurant.id, isActive: true },
    });
    if (!resolvedTable) throw ApiError.badRequest('That table is not available');
  }

  return prisma.$transaction(async (tx) => {
    // Serialize order-number allocation per restaurant. Two tenants never block
    // each other because the lock key is derived from the restaurant id.
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${restaurant.id}))`;

    const [{ next }] = await tx.$queryRaw`
      SELECT COALESCE(MAX("orderNumber"), 0) + 1 AS next
      FROM orders WHERE "restaurantId" = ${restaurant.id}
    `;
    const orderNumber = Number(next);

    const order = await tx.order.create({
      data: {
        restaurantId: restaurant.id,
        orderNumber,
        tableId: resolvedTable?.id ?? null,
        tableLabel: resolvedTable?.label ?? tableLabel ?? null,
        customerName: customerName.trim(),
        customerPhone: customerPhone?.trim() || null,
        notes: notes?.trim() || null,
        status: 'PLACED',
        subtotal: totals.subtotal,
        taxPercent: Number(restaurant.taxPercent),
        taxAmount: totals.taxAmount,
        discountAmount: totals.discountAmount,
        couponCode: code,
        totalAmount: totals.totalAmount,
        itemCount: totals.itemCount,
        items: { create: lineItems },
        events: { create: { toStatus: 'PLACED', byName: customerName.trim(), note: 'Order placed' } },
      },
      include: ORDER_INCLUDE,
    });

    // Denormalised popularity counter — keeps "top items" cheap on the dashboard.
    await Promise.all(
      lineItems.map((li) =>
        tx.menuItem.update({
          where: { id: li.menuItemId },
          data: { timesOrdered: { increment: li.quantity } },
        })
      )
    );
    if (couponId) {
      await tx.coupon.update({ where: { id: couponId }, data: { timesUsed: { increment: 1 } } });
    }

    return order;
  });
}

/** Applies a status transition, stamping the matching timestamp and writing an audit event. */
export async function transitionOrder({ order, toStatus, user, note }) {
  const allowed = STATUS_FLOW[order.status] || [];
  if (!allowed.includes(toStatus)) {
    throw ApiError.badRequest(
      `An order that is ${order.status.toLowerCase()} cannot move to ${toStatus.toLowerCase()}`
    );
  }
  if (toStatus === 'CANCELLED' && !note?.trim()) {
    throw ApiError.badRequest('Give a reason for cancelling');
  }

  const data = { status: toStatus };
  const stampField = TIMESTAMP_FOR_STATUS[toStatus];
  if (stampField) data[stampField] = new Date();
  // PREPARING has no dedicated column; treat first movement as acceptance.
  if (toStatus === 'PREPARING' && !order.acceptedAt) data.acceptedAt = new Date();
  if (toStatus === 'CANCELLED') data.cancelReason = note.trim();
  // Completing a dine-in order settles the bill — cash handed over at the table.
  if (toStatus === 'COMPLETED' && !order.isPaid) { data.isPaid = true; data.paidAt = new Date(); }

  return prisma.order.update({
    where: { id: order.id },
    data: {
      ...data,
      events: {
        create: {
          fromStatus: order.status,
          toStatus,
          byUserId: user?.id ?? null,
          byName: user?.name ?? 'System',
          note: note?.trim() || null,
        },
      },
    },
    include: ORDER_INCLUDE,
  });
}
