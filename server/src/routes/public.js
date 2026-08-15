import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { z } from 'zod';
import { prisma, serialize } from '../lib/prisma.js';
import { ApiError, asyncHandler } from '../lib/errors.js';
import { resolvePublicTenant } from '../middleware/tenant.js';
import { createOrder, quoteOrder, ORDER_INCLUDE } from '../services/orderService.js';

const router = Router();

/** Unauthenticated write endpoint — throttled per IP so a bot can't flood the kitchen. */
const orderLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many orders from this device. Please wait a few minutes.' },
});

const cartSchema = z.array(
  z.object({
    menuItemId: z.string().min(1),
    variantLabel: z.string().nullable().optional(),
    quantity: z.number().int().min(1).max(50),
  })
).min(1, 'Your cart is empty');

/** Public storefront config — branding, tax, hours. Drives the whole customer app. */
router.get('/restaurant', resolvePublicTenant, (req, res) => {
  const r = req.restaurant;
  res.json(serialize({
    id: r.id, slug: r.slug, name: r.name, tagline: r.tagline,
    logoEmoji: r.logoEmoji, logoUrl: r.logoUrl,
    primaryColor: r.primaryColor, accentColor: r.accentColor,
    phone: r.phone, address: r.address, city: r.city,
    currency: r.currency, currencySymbol: r.currencySymbol,
    taxPercent: Number(r.taxPercent), taxLabel: r.taxLabel, taxInclusive: r.taxInclusive,
    minOrderAmount: Number(r.minOrderAmount), avgPrepTimeMins: r.avgPrepTimeMins,
    isAcceptingOrders: r.isAcceptingOrders, closedMessage: r.closedMessage,
    openingTime: r.openingTime, closingTime: r.closingTime,
  }));
});

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
        id: i.id, name: i.name, description: i.description, imageUrl: i.imageUrl,
        categoryId: c.id, categoryName: c.name, categoryIcon: c.icon,
        basePrice: i.basePrice == null ? null : Number(i.basePrice),
        isVeg: i.isVeg, isAvailable: i.isAvailable, isFeatured: i.isFeatured,
        spiceLevel: i.spiceLevel, prepTimeMins: i.prepTimeMins,
        variants: i.variants.map((v) => ({ label: v.label, price: Number(v.price) })),
      })),
    })),
  }));
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
  res.status(201).json({ order: serialize(order) });
}));

/**
 * Order tracking. Requires the order number *and* the phone/name it was placed
 * with, so a customer cannot walk the sequence and read other people's orders.
 */
router.get('/orders/:orderNumber', resolvePublicTenant, asyncHandler(async (req, res) => {
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
