import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { z } from 'zod';
import { prisma, serialize } from '../lib/prisma.js';
import { ApiError, asyncHandler } from '../lib/errors.js';
import { resolvePublicTenant } from '../middleware/tenant.js';
import { createOrder, quoteOrder, ORDER_INCLUDE } from '../services/orderService.js';
import { publicImageUrl } from '../lib/images.js';
import { vapidPublicKey, pushEnabled } from '../lib/push.js';
import { notifyNewOrder } from '../services/pushService.js';

const router = Router();

/**
 * Unauthenticated write endpoint — throttled per IP so a bot can't flood the kitchen.
 *
 * Every customer on the restaurant's wifi shares one NAT'd IP, so this ceiling is
 * for a whole room, not one person. It is env-tunable because a busy kitchen will
 * legitimately exceed a conservative default.
 */
const orderLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  max: Number(process.env.ORDER_RATE_LIMIT || 60),
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many orders from this network right now. Please wait a moment and try again.' },
});

/** Order tracking is a read and gets polled, so it needs far more headroom. */
const trackingLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  max: Number(process.env.TRACKING_RATE_LIMIT || 600),
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests. Please wait a moment.' },
});

const cartSchema = z.array(
  z.object({
    menuItemId: z.string().min(1),
    variantLabel: z.string().nullable().optional(),
    quantity: z.number().int().min(1).max(50),
  })
).min(1, 'Your cart is empty');

/**
 * Serves an uploaded image.
 *
 * Deliberately not tenant-scoped by slug: the id is an unguessable cuid, the
 * bytes are a menu photo meant to be seen, and requiring the slug would stop the
 * admin portal — which is not on a restaurant domain — from rendering previews.
 *
 * Cached hard and immutably. A new upload gets a new id, so a stored copy can
 * never be stale, and a customer opening a menu of twenty photos on a free-tier
 * API should be paying for those bytes once, not on every visit.
 */
router.get('/images/:id', asyncHandler(async (req, res) => {
  const image = await prisma.image.findUnique({
    where: { id: req.params.id },
    select: { mimeType: true, data: true, sizeBytes: true, createdAt: true },
  });
  if (!image) throw ApiError.notFound('Image not found');

  const etag = `"${req.params.id}-${image.sizeBytes}"`;
  res.set({
    'Content-Type': image.mimeType,
    'Content-Length': String(image.sizeBytes),
    'Cache-Control': 'public, max-age=31536000, immutable',
    'Last-Modified': image.createdAt.toUTCString(),
    ETag: etag,
  });
  if (req.headers['if-none-match'] === etag) return res.status(304).end();
  res.send(image.data);
}));

/** Public storefront config — branding, theme, tax, hours. Drives the whole customer app. */
router.get('/restaurant', resolvePublicTenant, asyncHandler(async (req, res) => {
  const r = req.restaurant;

  // Skipped entirely when the owner has turned photos off, so a storefront that
  // shows none never pays for the query.
  const photos = r.heroStyle === 'off' ? [] : await prisma.storefrontPhoto.findMany({
    where: { restaurantId: r.id },
    orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
    select: { id: true, caption: true, imageId: true },
  });

  res.json(serialize({
    id: r.id, slug: r.slug, name: r.name, tagline: r.tagline,
    logoEmoji: r.logoEmoji, logoUrl: r.logoImageId ? publicImageUrl(req, r.logoImageId) : r.logoUrl,
    primaryColor: r.primaryColor, accentColor: r.accentColor,
    menuTheme: r.menuTheme, heroStyle: r.heroStyle,
    photos: photos.map((p) => ({ id: p.id, caption: p.caption, url: publicImageUrl(req, p.imageId) })),
    phone: r.phone, address: r.address, city: r.city,
    currency: r.currency, currencySymbol: r.currencySymbol,
    taxPercent: Number(r.taxPercent), taxLabel: r.taxLabel, taxInclusive: r.taxInclusive,
    minOrderAmount: Number(r.minOrderAmount), avgPrepTimeMins: r.avgPrepTimeMins,
    isAcceptingOrders: r.isAcceptingOrders, closedMessage: r.closedMessage,
    openingTime: r.openingTime, closingTime: r.closingTime,
  }));
}));

/** The full menu, grouped by category. Unavailable items are included but flagged. */
router.get('/menu', resolvePublicTenant, asyncHandler(async (req, res) => {
  const categories = await prisma.category.findMany({
    where: { restaurantId: req.restaurantId, isActive: true },
    orderBy: { sortOrder: 'asc' },
    include: {
      menuItems: {
        orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
        include: { variants: { orderBy: { sortOrder: 'asc' } } },
      },
    },
  });

  res.json(serialize({
    categories: categories.map((c) => ({
      id: c.id, name: c.name, icon: c.icon,
      items: c.menuItems.map((i) => ({
        id: i.id, name: i.name, description: i.description,
        imageUrl: i.imageId ? publicImageUrl(req, i.imageId) : i.imageUrl,
        categoryId: c.id, categoryName: c.name, categoryIcon: c.icon,
        basePrice: i.basePrice == null ? null : Number(i.basePrice),
        isVeg: i.isVeg, isAvailable: i.isAvailable, isFeatured: i.isFeatured,
        spiceLevel: i.spiceLevel, prepTimeMins: i.prepTimeMins,
        variants: i.variants.map((v) => ({ label: v.label, price: Number(v.price) })),
      })),
    })),
  }));
}));

/** The key a diner's browser needs before it can subscribe. */
router.get('/push/key', (_req, res) => {
  res.json({ publicKey: vapidPublicKey(), enabled: pushEnabled });
});

/**
 * Registers a diner's browser to be told when one order is ready.
 *
 * Proof of the order is required for exactly the reason tracking requires it:
 * without it anyone could subscribe to a stranger's order number and be told
 * about someone else's table. The same name-or-phone check is used, so a
 * subscription can only be created by whoever placed the order.
 */
router.post('/push/subscribe', trackingLimiter, resolvePublicTenant, asyncHandler(async (req, res) => {
  const body = z.object({
    subscription: z.object({
      endpoint: z.string().url().max(2000),
      keys: z.object({ p256dh: z.string().min(1).max(255), auth: z.string().min(1).max(255) }),
    }),
    orderNumber: z.number().int().positive(),
    token: z.string().trim().min(1).max(60),
  }).parse(req.body);

  const order = await prisma.order.findUnique({
    where: { restaurantId_orderNumber: { restaurantId: req.restaurantId, orderNumber: body.orderNumber } },
    select: { id: true, customerName: true, customerPhone: true, status: true },
  });
  if (!order) throw ApiError.notFound('Order not found');

  const proof = body.token.toLowerCase();
  const matches = proof === (order.customerPhone || '').toLowerCase()
    || proof === order.customerName.toLowerCase();
  if (!matches) throw ApiError.forbidden('Confirm the name or phone number used to place this order');

  const { endpoint, keys } = body.subscription;
  // One row per browser per order, so re-asking never doubles the message.
  await prisma.pushSubscription.deleteMany({ where: { endpoint, orderId: order.id } });
  await prisma.pushSubscription.create({
    data: {
      restaurantId: req.restaurantId,
      orderId: order.id,
      endpoint,
      p256dh: keys.p256dh,
      auth: keys.auth,
    },
  });
  res.status(201).json({ ok: true });
}));

/** Active tables, so a customer can pick theirs from a dropdown. */
router.get('/tables', resolvePublicTenant, asyncHandler(async (req, res) => {
  const tables = await prisma.restaurantTable.findMany({
    where: { restaurantId: req.restaurantId, isActive: true },
    orderBy: { label: 'asc' },
    select: { id: true, label: true, seats: true },
  });
  res.json({ tables });
}));

/** Resolves a scanned table QR token to its table. */
router.get('/tables/by-token/:token', resolvePublicTenant, asyncHandler(async (req, res) => {
  const table = await prisma.restaurantTable.findFirst({
    where: { qrToken: req.params.token, restaurantId: req.restaurantId, isActive: true },
    select: { id: true, label: true, seats: true },
  });
  if (!table) throw ApiError.notFound('That table code is not recognised');
  res.json({ table });
}));

/** Live cart pricing — authoritative subtotal, tax and total. */
router.post('/quote', resolvePublicTenant, asyncHandler(async (req, res) => {
  const body = z.object({
    cart: cartSchema,
    couponCode: z.string().optional().nullable(),
  }).parse(req.body);
  res.json(await quoteOrder(req.restaurant, body));
}));

router.post('/orders', orderLimiter, resolvePublicTenant, asyncHandler(async (req, res) => {
  const body = z.object({
    cart: cartSchema,
    customerName: z.string().trim().min(2, 'Tell us your name').max(60),
    customerPhone: z.string().trim().regex(/^[0-9+\-\s]{7,15}$/, 'Enter a valid phone number').optional().or(z.literal('')),
    tableId: z.string().optional().nullable(),
    tableLabel: z.string().max(30).optional().nullable(),
    notes: z.string().max(300).optional().nullable(),
    couponCode: z.string().optional().nullable(),
  }).parse(req.body);

  if (!body.tableId && !body.tableLabel) {
    throw ApiError.badRequest('Select your table so we know where to bring your order');
  }

  const order = await createOrder(req.restaurant, body);
  // Deliberately not awaited: the diner's confirmation must not wait on a push
  // service, and a failure to notify is not a failure to order.
  notifyNewOrder(order);
  res.status(201).json({ order: serialize(order) });
}));

/**
 * Batch tracking for every order a device has placed.
 *
 * Each reference is proved on its own: holding the token for order #12 reveals
 * nothing about #13, so a caller cannot widen their view by bundling guesses.
 * Unmatched references are simply omitted rather than reported, which keeps this
 * from doubling as an oracle for which order numbers exist.
 */
router.post('/orders/lookup', trackingLimiter, resolvePublicTenant, asyncHandler(async (req, res) => {
  const { refs } = z.object({
    refs: z.array(z.object({
      orderNumber: z.number().int().positive(),
      token: z.string().trim().min(1).max(60),
    })).min(1).max(20),
  }).parse(req.body);

  const orders = await prisma.order.findMany({
    where: {
      restaurantId: req.restaurantId,
      orderNumber: { in: refs.map((r) => r.orderNumber) },
    },
    include: ORDER_INCLUDE,
    orderBy: { placedAt: 'desc' },
  });

  const proofFor = new Map(refs.map((r) => [r.orderNumber, r.token.toLowerCase()]));
  const visible = orders.filter((order) => {
    const proof = proofFor.get(order.orderNumber);
    return Boolean(proof) && (
      proof === (order.customerPhone || '').toLowerCase() ||
      proof === order.customerName.toLowerCase()
    );
  });

  res.json({ orders: serialize(visible) });
}));

/**
 * Order tracking. Requires the order number *and* the phone/name it was placed
 * with, so a customer cannot walk the sequence and read other people's orders.
 */
router.get('/orders/:orderNumber', trackingLimiter, resolvePublicTenant, asyncHandler(async (req, res) => {
  const orderNumber = Number(req.params.orderNumber);
  if (!Number.isInteger(orderNumber)) throw ApiError.badRequest('Invalid order number');

  const order = await prisma.order.findUnique({
    where: { restaurantId_orderNumber: { restaurantId: req.restaurantId, orderNumber } },
    include: ORDER_INCLUDE,
  });
  if (!order) throw ApiError.notFound('Order not found');

  const proof = String(req.query.token || '').trim().toLowerCase();
  const matches =
    proof.length > 0 &&
    (proof === (order.customerPhone || '').toLowerCase() ||
     proof === order.customerName.toLowerCase());
  if (!matches) throw ApiError.forbidden('Confirm the name or phone number used to place this order');

  res.json({ order: serialize(order) });
}));

export default router;
