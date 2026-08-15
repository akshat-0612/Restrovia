import { Router } from 'express';
import { z } from 'zod';
import { prisma, serialize } from '../../lib/prisma.js';
import { ApiError, asyncHandler } from '../../lib/errors.js';
import { requireRole } from '../../middleware/auth.js';

const router = Router();
const canEdit = requireRole('PLATFORM_ADMIN', 'OWNER', 'MANAGER');

/* ───────────────────────── Categories ───────────────────────── */

const categorySchema = z.object({
  name: z.string().trim().min(1, 'Category name is required').max(50),
  icon: z.string().trim().max(8).default('🍴'),
  sortOrder: z.number().int().optional(),
  isActive: z.boolean().optional(),
});

router.get('/categories', asyncHandler(async (req, res) => {
  const categories = await prisma.category.findMany({
    where: { restaurantId: req.restaurantId },
    orderBy: { sortOrder: 'asc' },
    include: { _count: { select: { menuItems: true } } },
  });
  res.json(serialize({
    categories: categories.map((c) => ({ ...c, itemCount: c._count.menuItems, _count: undefined })),
  }));
}));

router.post('/categories', canEdit, asyncHandler(async (req, res) => {
  const body = categorySchema.parse(req.body);
  const last = await prisma.category.findFirst({
    where: { restaurantId: req.restaurantId },
    orderBy: { sortOrder: 'desc' }, select: { sortOrder: true },
  });
  const category = await prisma.category.create({
    data: { ...body, restaurantId: req.restaurantId, sortOrder: body.sortOrder ?? (last?.sortOrder ?? 0) + 1 },
  });
  res.status(201).json({ category: serialize(category) });
}));

router.patch('/categories/:id', canEdit, asyncHandler(async (req, res) => {
  const body = categorySchema.partial().parse(req.body);
  const { count } = await prisma.category.updateMany({
    where: { id: req.params.id, restaurantId: req.restaurantId }, data: body,
  });
  if (!count) throw ApiError.notFound('Category not found');
  res.json({ category: serialize(await prisma.category.findUnique({ where: { id: req.params.id } })) });
}));

router.delete('/categories/:id', canEdit, asyncHandler(async (req, res) => {
  const category = await prisma.category.findFirst({
    where: { id: req.params.id, restaurantId: req.restaurantId },
    include: { _count: { select: { menuItems: true } } },
  });
  if (!category) throw ApiError.notFound('Category not found');
  if (category._count.menuItems > 0) {
    throw ApiError.badRequest(
      `Move or delete the ${category._count.menuItems} item(s) in "${category.name}" first`
    );
  }
  await prisma.category.delete({ where: { id: category.id } });
  res.json({ ok: true });
}));

/** Bulk reorder from drag-and-drop. */
router.post('/categories/reorder', canEdit, asyncHandler(async (req, res) => {
  const { ids } = z.object({ ids: z.array(z.string()).min(1) }).parse(req.body);
  await prisma.$transaction(
    ids.map((id, index) =>
      prisma.category.updateMany({
        where: { id, restaurantId: req.restaurantId },
        data: { sortOrder: index },
      })
    )
  );
  res.json({ ok: true });
}));

/* ───────────────────────── Items ───────────────────────── */

const variantSchema = z.object({
  label: z.string().trim().min(1).max(30),
  price: z.number().nonnegative(),
});

/**
 * Kept as a plain object so the update schema can call `.partial()` on it —
 * `.refine()` returns a ZodEffects, which has no `.partial()`.
 */
const itemFields = z.object({
  categoryId: z.string().min(1, 'Pick a category'),
  name: z.string().trim().min(1, 'Item name is required').max(80),
  description: z.string().trim().max(300).optional().nullable(),
  imageUrl: z.string().trim().url('Enter a valid image URL').optional().nullable().or(z.literal('')),
  basePrice: z.number().nonnegative().optional().nullable(),
  variants: z.array(variantSchema).max(6).optional(),
  isVeg: z.boolean().optional(),
  isAvailable: z.boolean().optional(),
  isFeatured: z.boolean().optional(),
  spiceLevel: z.number().int().min(0).max(3).optional(),
  prepTimeMins: z.number().int().min(1).max(120).optional(),
  sortOrder: z.number().int().optional(),
});

const PRICING_REQUIRED = 'Set a price, or add at least one size variant';

const itemCreateSchema = itemFields.refine(
  (v) => (v.variants && v.variants.length > 0) || v.basePrice != null,
  { message: PRICING_REQUIRED, path: ['basePrice'] }
);

/**
 * Updates are partial, so the pricing rule cannot be checked from the body alone —
 * it is enforced against the merged result in the handler, where the stored row is known.
 */
const itemUpdateSchema = itemFields.partial();

router.get('/items', asyncHandler(async (req, res) => {
  const { categoryId, search, available } = req.query;
  const items = await prisma.menuItem.findMany({
    where: {
      restaurantId: req.restaurantId,
      ...(categoryId ? { categoryId } : {}),
      ...(available === 'true' ? { isAvailable: true } : available === 'false' ? { isAvailable: false } : {}),
      ...(search?.trim() ? { name: { contains: search.trim(), mode: 'insensitive' } } : {}),
    },
    include: { variants: { orderBy: { sortOrder: 'asc' } }, category: { select: { id: true, name: true, icon: true } } },
    orderBy: [{ category: { sortOrder: 'asc' } }, { sortOrder: 'asc' }, { name: 'asc' }],
  });
  res.json({ items: serialize(items) });
}));

/** Verifies a category belongs to this tenant before an item is attached to it. */
async function assertCategory(restaurantId, categoryId) {
  const cat = await prisma.category.findFirst({ where: { id: categoryId, restaurantId }, select: { id: true } });
  if (!cat) throw ApiError.badRequest('That category does not exist');
}

router.post('/items', canEdit, asyncHandler(async (req, res) => {
  const body = itemCreateSchema.parse(req.body);
  await assertCategory(req.restaurantId, body.categoryId);

  const { variants = [], ...rest } = body;
  const item = await prisma.menuItem.create({
    data: {
      ...rest,
      imageUrl: rest.imageUrl || null,
      // Variant-priced items carry no base price — the variants are the truth.
      basePrice: variants.length > 0 ? null : rest.basePrice,
      restaurantId: req.restaurantId,
      variants: { create: variants.map((v, i) => ({ ...v, sortOrder: i })) },
    },
    include: { variants: true, category: true },
  });
  res.status(201).json({ item: serialize(item) });
}));

router.patch('/items/:id', canEdit, asyncHandler(async (req, res) => {
  const body = itemUpdateSchema.parse(req.body);
  const existing = await prisma.menuItem.findFirst({
    where: { id: req.params.id, restaurantId: req.restaurantId },
    include: { variants: true },
  });
  if (!existing) throw ApiError.notFound('Item not found');
  if (body.categoryId) await assertCategory(req.restaurantId, body.categoryId);

  // Check the state the item will end up in, not just what the request carried.
  const nextVariants = body.variants ?? existing.variants;
  const nextBasePrice = body.basePrice !== undefined ? body.basePrice : existing.basePrice;
  if (nextVariants.length === 0 && nextBasePrice == null) {
    throw ApiError.badRequest(PRICING_REQUIRED);
  }

  const { variants, ...rest } = body;
  const item = await prisma.$transaction(async (tx) => {
    if (variants) {
      await tx.menuVariant.deleteMany({ where: { menuItemId: existing.id } });
      if (variants.length > 0) {
        await tx.menuVariant.createMany({
          data: variants.map((v, i) => ({ ...v, menuItemId: existing.id, sortOrder: i })),
        });
      }
    }
    return tx.menuItem.update({
      where: { id: existing.id },
      data: {
        ...rest,
        ...(rest.imageUrl !== undefined ? { imageUrl: rest.imageUrl || null } : {}),
        ...(variants ? { basePrice: variants.length > 0 ? null : (rest.basePrice ?? existing.basePrice) } : {}),
      },
      include: { variants: { orderBy: { sortOrder: 'asc' } }, category: true },
    });
  });
  res.json({ item: serialize(item) });
}));

/** One-tap availability toggle from the menu grid — the most-used action on a busy day. */
router.patch('/items/:id/availability', asyncHandler(async (req, res) => {
  const { isAvailable } = z.object({ isAvailable: z.boolean() }).parse(req.body);
  const { count } = await prisma.menuItem.updateMany({
    where: { id: req.params.id, restaurantId: req.restaurantId }, data: { isAvailable },
  });
  if (!count) throw ApiError.notFound('Item not found');
  res.json({ ok: true, isAvailable });
}));

router.delete('/items/:id', canEdit, asyncHandler(async (req, res) => {
  const { count } = await prisma.menuItem.deleteMany({
    where: { id: req.params.id, restaurantId: req.restaurantId },
  });
  if (!count) throw ApiError.notFound('Item not found');
  res.json({ ok: true });
}));

router.post('/items/reorder', canEdit, asyncHandler(async (req, res) => {
  const { ids } = z.object({ ids: z.array(z.string()).min(1) }).parse(req.body);
  await prisma.$transaction(
    ids.map((id, index) =>
      prisma.menuItem.updateMany({ where: { id, restaurantId: req.restaurantId }, data: { sortOrder: index } })
    )
  );
  res.json({ ok: true });
}));

export default router;
