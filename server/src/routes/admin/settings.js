import { Router } from 'express';
import { z } from 'zod';
import { prisma, serialize } from '../../lib/prisma.js';
import { ApiError, asyncHandler } from '../../lib/errors.js';
import { requireRole } from '../../middleware/auth.js';
import { publicImageUrl } from '../../lib/images.js';

const router = Router();

/** Attaches a servable URL to the uploaded logo, if there is one. */
function withLogoUrl(req, restaurant) {
  if (!restaurant?.logoImage) return restaurant;
  return {
    ...restaurant,
    logoImage: { ...restaurant.logoImage, url: publicImageUrl(req, restaurant.logoImage.id) },
  };
}
const canEdit = requireRole('PLATFORM_ADMIN', 'OWNER');

router.get('/', asyncHandler(async (req, res) => {
  const restaurant = await prisma.restaurant.findUnique({
    where: { id: req.restaurantId },
    include: {
      domains: { orderBy: [{ isPrimary: 'desc' }, { hostname: 'asc' }] },
      logoImage: { select: { id: true, width: true, height: true, sizeBytes: true } },
    },
  });
  res.json({ restaurant: serialize(withLogoUrl(req, restaurant)) });
}));

/** Fields an owner may edit. `slug` and `plan` are deliberately absent — those are platform-owned. */
const settingsSchema = z.object({
  name: z.string().trim().min(1).max(80).optional(),
  tagline: z.string().trim().max(120).optional().nullable(),
  logoEmoji: z.string().trim().max(8).optional(),
  logoUrl: z.string().trim().url().optional().nullable().or(z.literal('')),
  logoImageId: z.string().optional().nullable(),
  storefrontUrl: z.string().trim().url('Enter a full URL, e.g. https://your-app.pages.dev')
    .optional().nullable().or(z.literal('')),
  qrTheme: z.enum(['classic', 'band', 'bold', 'kraft', 'midnight']).optional(),
  primaryColor: z.string().regex(/^#[0-9a-fA-F]{6}$/, 'Use a hex colour like #e8552d').optional(),
  accentColor: z.string().regex(/^#[0-9a-fA-F]{6}$/, 'Use a hex colour like #f5b301').optional(),
  phone: z.string().trim().max(20).optional().nullable(),
  email: z.string().email().optional().nullable().or(z.literal('')),
  address: z.string().trim().max(200).optional().nullable(),
  city: z.string().trim().max(60).optional().nullable(),
  gstNumber: z.string().trim().max(30).optional().nullable(),
  currencySymbol: z.string().trim().max(4).optional(),
  timezone: z.string().trim().max(60).optional(),
  taxPercent: z.number().min(0).max(50).optional(),
  taxLabel: z.string().trim().max(20).optional(),
  taxInclusive: z.boolean().optional(),
  serviceChargePct: z.number().min(0).max(50).optional(),
  minOrderAmount: z.number().min(0).optional(),
  avgPrepTimeMins: z.number().int().min(1).max(180).optional(),
  isAcceptingOrders: z.boolean().optional(),
  closedMessage: z.string().trim().max(200).optional(),
  openingTime: z.string().regex(/^\d{2}:\d{2}$/).optional(),
  closingTime: z.string().regex(/^\d{2}:\d{2}$/).optional(),
});

router.patch('/', canEdit, asyncHandler(async (req, res) => {
  const body = settingsSchema.parse(req.body);
  if (body.logoImageId) {
    const owned = await prisma.image.findFirst({
      where: { id: body.logoImageId, restaurantId: req.restaurantId }, select: { id: true },
    });
    if (!owned) throw ApiError.badRequest('That image does not exist');
  }

  const restaurant = await prisma.restaurant.update({
    where: { id: req.restaurantId },
    data: {
      ...body,
      ...(body.logoUrl !== undefined ? { logoUrl: body.logoUrl || null } : {}),
      // Strip any trailing slash so QR links never come out with a double slash.
      ...(body.storefrontUrl !== undefined
        ? { storefrontUrl: body.storefrontUrl ? body.storefrontUrl.replace(/\/+$/, '') : null }
        : {}),
      ...(body.email !== undefined ? { email: body.email || null } : {}),
    },
    include: { logoImage: { select: { id: true, width: true, height: true, sizeBytes: true } } },
  });
  res.json({ restaurant: serialize(withLogoUrl(req, restaurant)) });
}));

/** The big red switch on the dashboard — stop taking orders without closing the shop. */
router.post('/toggle-orders', asyncHandler(async (req, res) => {
  const current = await prisma.restaurant.findUnique({
    where: { id: req.restaurantId }, select: { isAcceptingOrders: true },
  });
  const restaurant = await prisma.restaurant.update({
    where: { id: req.restaurantId },
    data: { isAcceptingOrders: !current.isAcceptingOrders },
  });
  res.json({ isAcceptingOrders: restaurant.isAcceptingOrders });
}));

export default router;
