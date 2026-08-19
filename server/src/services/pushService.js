import { prisma } from '../lib/prisma.js';
import { sendToAll, pushEnabled } from '../lib/push.js';
import { formatCurrency } from '@restrovia/shared';

/**
 * The notification's picture: the restaurant's logo, absolute because a service
 * worker fetches it with no page to resolve a relative path against.
 *
 * Built from PUBLIC_API_URL rather than a request, since nothing here is
 * answering one — a notification is sent long after the request that triggered it.
 */
function logoFor(restaurant) {
  if (!restaurant) return undefined;
  const base = process.env.PUBLIC_API_URL?.replace(/\/+$/, '');
  if (restaurant.logoImageId && base) return `${base}/api/public/images/${restaurant.logoImageId}`;
  return restaurant.logoUrl || undefined;
}

/**
 * What each side gets told, and when.
 *
 * Both functions are fire-and-forget: callers start them and move on, so a slow
 * or failing push service can never delay an order being placed or a status
 * being saved. Failures are logged, not raised.
 */

/** Everyone watching the kitchen board for this restaurant. */
export function notifyNewOrder(order) {
  if (!pushEnabled) return;

  (async () => {
    const rows = await prisma.pushSubscription.findMany({
      where: { restaurantId: order.restaurantId, userId: { not: null } },
    });
    if (rows.length === 0) return;

    const restaurant = await prisma.restaurant.findUnique({
      where: { id: order.restaurantId },
      select: { currencySymbol: true, logoImageId: true, logoUrl: true },
    });
    const items = order.items?.length ?? order.itemCount ?? 0;

    await sendToAll(rows, {
      title: `New order #${order.orderNumber}`,
      body: [
        order.tableLabel ? `Table ${order.tableLabel}` : null,
        `${items} item${items === 1 ? '' : 's'}`,
        formatCurrency(order.totalAmount, restaurant?.currencySymbol || '₹'),
      ].filter(Boolean).join(' · '),
      tag: `order-${order.id}`,
      url: '/live',
      icon: logoFor(restaurant),
      because: 'new-order',
    });
  })().catch((err) => console.error('[push] notifyNewOrder failed:', err.message));
}

/**
 * What a diner is told at each step of their order.
 *
 * Written for someone glancing at a lock screen, so each line says what changed
 * and — where it matters — what to do about it. PLACED is absent on purpose:
 * they were looking at the screen when they placed it.
 */
const DINER_UPDATE = {
  ACCEPTED: (order) => ({
    title: `Order #${order.orderNumber} confirmed`,
    body: 'The kitchen has your order.',
  }),
  PREPARING: (order) => ({
    title: `Order #${order.orderNumber} is being cooked`,
    body: 'Your food is on the stove.',
  }),
  READY: (order) => ({
    title: `Order #${order.orderNumber} is ready`,
    body: order.tableLabel
      ? `It's on its way to table ${order.tableLabel}.`
      : 'Your food is ready.',
  }),
  COMPLETED: (order) => ({
    title: `Order #${order.orderNumber} served`,
    body: 'Enjoy your meal. Settle the bill at the counter.',
  }),
};

/** Statuses a diner has asked to hear about. */
export const NOTIFIED_STATUSES = Object.keys(DINER_UPDATE);

/**
 * Tells the diner their order moved.
 *
 * The subscription is kept until the order ends, because they asked to follow it
 * rather than to hear one thing. All updates share a notification tag, so a lock
 * screen shows the current state instead of a stack of superseded ones.
 */
export function notifyOrderStatus(order) {
  if (!pushEnabled) return;

  const compose = DINER_UPDATE[order.status];
  if (!compose) return;

  (async () => {
    const rows = await prisma.pushSubscription.findMany({ where: { orderId: order.id } });
    if (rows.length === 0) return;

    const restaurant = await prisma.restaurant.findUnique({
      where: { id: order.restaurantId },
      select: { logoImageId: true, logoUrl: true },
    });

    await sendToAll(rows, {
      ...compose(order),
      tag: `order-${order.id}`,
      url: '/',
      icon: logoFor(restaurant),
      because: `order-${order.status.toLowerCase()}`,
    });

    // Served is the last thing there is to say, so the subscriptions go with it —
    // after the message, not before, or there would be nobody left to tell.
    if (order.status === 'COMPLETED') {
      await prisma.pushSubscription.deleteMany({ where: { orderId: order.id } });
    }
  })().catch((err) => console.error('[push] notifyOrderStatus failed:', err.message));
}

/**
 * Drops the subscriptions attached to an order that will never be announced.
 *
 * A cancelled or completed order has nothing left to say, and its rows would
 * otherwise sit against the restaurant for good — one per diner who ever asked
 * to be told, pointing at endpoints nothing will send to again.
 */
export function forgetOrderSubscriptions(orderId) {
  prisma.pushSubscription
    .deleteMany({ where: { orderId } })
    .catch((err) => console.error('[push] cleanup failed:', err.message));
}
