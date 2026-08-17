import { Router } from 'express';
import { z } from 'zod';
import { prisma, serialize } from '../../lib/prisma.js';
import { ApiError, asyncHandler } from '../../lib/errors.js';
import { requireRole } from '../../middleware/auth.js';
import { publicImageUrl } from '../../lib/images.js';
import { STOREFRONT_THEME_IDS, HERO_STYLE_IDS } from '@restrovia/shared';

const router = Router();

/**
 * How many storefront photos one restaurant may keep.
 *
 * Image bytes live in Postgres, so a gallery is not free the way a bucket
 * would be. Eight is more than a slideshow can show before a customer has
 * ordered, which makes it a generous ceiling rather than a restriction.
 */
const MAX_PHOTOS = 8;

const PHOTO_SELECT = {
  id: true, caption: true, sortOrder: true,
  image: { select: { id: true, width: true, height: true, sizeBytes: true } },
};

/** What the picker in the admin portal expects back: an image with a URL on it. */
function shapePhoto(req, photo) {
  return {
    id: photo.id,
    caption: photo.caption,
    sortOrder: photo.sortOrder,
    image: { ...photo.image, url: publicImageUrl(req, photo.image.id) },
  };
}

/** Attaches servable URLs to the uploaded logo and any storefront photos. */
function withImageUrls(req, restaurant) {
  if (!restaurant) return restaurant;
  return {
    ...restaurant,
    ...(restaurant.logoImage
      ? { logoImage: { ...restaurant.logoImage, url: publicImageUrl(req, restaurant.logoImage.id) } }
      : {}),
    ...(restaurant.photos
      ? { photos: restaurant.photos.map((photo) => shapePhoto(req, photo)) }
      : {}),
  };
}
const canEdit = requireRole('PLATFORM_ADMIN', 'OWNER');

/** Photos are part of the storefront's look, so a manager may curate them too. */
const canEditPhotos = requireRole('PLATFORM_ADMIN', 'OWNER', 'MANAGER');

router.get('/', asyncHandler(async (req, res) => {
  const restaurant = await prisma.restaurant.findUnique({
    where: { id: req.restaurantId },
    include: {
      domains: { orderBy: [{ isPrimary: 'desc' }, { hostname: 'asc' }] },
      logoImage: { select: { id: true, width: true, height: true, sizeBytes: true } },
      photos: { orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }], select: PHOTO_SELECT },
    },
  });
  res.json({ restaurant: serialize(withImageUrls(req, restaurant)) });
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
  menuTheme: z.enum(STOREFRONT_THEME_IDS).optional(),
  heroStyle: z.enum(HERO_STYLE_IDS).optional(),
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
    include: {
      logoImage: { select: { id: true, width: true, height: true, sizeBytes: true } },
      photos: { orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }], select: PHOTO_SELECT },
    },
  });
  res.json({ restaurant: serialize(withImageUrls(req, restaurant)) });
}));

/* ─────────────────────── Storefront photos ─────────────────────── */

/**
 * Adds an already-uploaded image to the storefront gallery.
 *
 * Upload and placement are two steps because the upload endpoint is shared with
 * menu photos and logos: it puts bytes in the library, and this decides what
 * they are for.
 */
router.post('/photos', canEditPhotos, asyncHandler(async (req, res) => {
  const body = z.object({
    imageId: z.string().min(1),
    caption: z.string().trim().max(80).optional().nullable(),
  }).parse(req.body);

  const image = await prisma.image.findFirst({
    where: { id: body.imageId, restaurantId: req.restaurantId }, select: { id: true },
  });
  if (!image) throw ApiError.badRequest('That image does not exist');

  const [count, last] = await Promise.all([
    prisma.storefrontPhoto.count({ where: { restaurantId: req.restaurantId } }),
    prisma.storefrontPhoto.findFirst({
      where: { restaurantId: req.restaurantId },
      orderBy: { sortOrder: 'desc' }, select: { sortOrder: true },
    }),
  ]);
  if (count >= MAX_PHOTOS) {
    throw ApiError.badRequest(`You can keep ${MAX_PHOTOS} storefront photos — remove one first`);
  }
  // Already in the gallery: adding it twice would show the same room twice.
  const existing = await prisma.storefrontPhoto.findFirst({
    where: { restaurantId: req.restaurantId, imageId: body.imageId }, select: { id: true },
  });
  if (existing) throw ApiError.badRequest('That photo is already on your storefront');

  const photo = await prisma.storefrontPhoto.create({
    data: {
      restaurantId: req.restaurantId,
      imageId: body.imageId,
      caption: body.caption || null,
      sortOrder: (last?.sortOrder ?? -1) + 1,
    },
    select: PHOTO_SELECT,
  });
  res.status(201).json({ photo: serialize(shapePhoto(req, photo)) });
}));

router.patch('/photos/:id', canEditPhotos, asyncHandler(async (req, res) => {
  const body = z.object({
    caption: z.string().trim().max(80).optional().nullable(),
  }).parse(req.body);

  const { count } = await prisma.storefrontPhoto.updateMany({
    where: { id: req.params.id, restaurantId: req.restaurantId },
    data: { caption: body.caption || null },
  });
  if (!count) throw ApiError.notFound('Photo not found');

  const photo = await prisma.storefrontPhoto.findUnique({
    where: { id: req.params.id }, select: PHOTO_SELECT,
  });
  res.json({ photo: serialize(shapePhoto(req, photo)) });
}));

/**
 * Removes a photo from the storefront, and its bytes with it when nothing else
 * is using them.
 *
 * Images sit in the database, so a gallery that only ever forgets its
 * references would grow the table on every replaced photo. The check is what
 * stops it deleting a picture that is also a menu photo or the logo — those were
 * placed elsewhere and are not this endpoint's to remove.
 */
router.delete('/photos/:id', canEditPhotos, asyncHandler(async (req, res) => {
  const photo = await prisma.storefrontPhoto.findFirst({
    where: { id: req.params.id, restaurantId: req.restaurantId },
    select: { id: true, imageId: true },
  });
  if (!photo) throw ApiError.notFound('Photo not found');

  const [usedByMenu, usedAsLogo] = await Promise.all([
    prisma.menuItem.count({ where: { imageId: photo.imageId } }),
    prisma.restaurant.count({ where: { logoImageId: photo.imageId } }),
  ]);

  if (usedByMenu || usedAsLogo) {
    await prisma.storefrontPhoto.delete({ where: { id: photo.id } });
  } else {
    // Cascades the gallery row away with the bytes.
    await prisma.image.delete({ where: { id: photo.imageId } });
  }
  res.json({ ok: true });
}));

/**
 * Rewrites the gallery order.
 *
 * The whole order arrives at once rather than one photo's new position: the
 * first photo is the one customers see, so a half-applied reorder would be
 * visible on the storefront.
 */
router.post('/photos/order', canEditPhotos, asyncHandler(async (req, res) => {
  const { ids } = z.object({ ids: z.array(z.string().min(1)).max(MAX_PHOTOS) }).parse(req.body);

  const owned = await prisma.storefrontPhoto.findMany({
    where: { restaurantId: req.restaurantId }, select: { id: true },
  });
  const ownedIds = new Set(owned.map((p) => p.id));
  if (ids.length !== ownedIds.size || ids.some((id) => !ownedIds.has(id))) {
    throw ApiError.badRequest('Send every photo id exactly once');
  }

  await prisma.$transaction(
    ids.map((id, index) => prisma.storefrontPhoto.update({ where: { id }, data: { sortOrder: index } }))
  );

  const photos = await prisma.storefrontPhoto.findMany({
    where: { restaurantId: req.restaurantId },
    orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
    select: PHOTO_SELECT,
  });
  res.json({ photos: serialize(photos.map((photo) => shapePhoto(req, photo))) });
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
