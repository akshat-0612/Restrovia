import { Router } from 'express';
import { z } from 'zod';
import { prisma, serialize } from '../../lib/prisma.js';
import { ApiError, asyncHandler } from '../../lib/errors.js';
import { requireRole } from '../../middleware/auth.js';

const router = Router();
const canEdit = requireRole('PLATFORM_ADMIN', 'OWNER', 'MANAGER');

/** Plain object, so the update schema can `.partial()` it — see menu.js for the same reason. */
const couponFields = z.object({
  code: z.string().trim().min(3, 'Code must be at least 3 characters').max(20)
    .regex(/^[A-Za-z0-9]+$/, 'Use letters and numbers only'),
  description: z.string().trim().max(120).optional().nullable(),
  discountType: z.enum(['PERCENT', 'FLAT']).default('PERCENT'),
  value: z.number().positive('Discount must be greater than zero'),
  minOrderAmount: z.number().min(0).default(0),
  maxDiscount: z.number().positive().optional().nullable(),
  usageLimit: z.number().int().positive().optional().nullable(),
  validUntil: z.string().datetime().optional().nullable(),
  isActive: z.boolean().optional(),
});

const PERCENT_CAP = 'A percentage discount cannot exceed 100';

const couponCreateSchema = couponFields.refine(
  (v) => v.discountType !== 'PERCENT' || v.value <= 100,
  { message: PERCENT_CAP, path: ['value'] }
);

const couponUpdateSchema = couponFields.partial();

router.get('/', asyncHandler(async (req, res) => {
  const coupons = await prisma.coupon.findMany({
    where: { restaurantId: req.restaurantId }, orderBy: { createdAt: 'desc' },
  });
  res.json({ coupons: serialize(coupons) });
}));

router.post('/', canEdit, asyncHandler(async (req, res) => {
  const body = couponCreateSchema.parse(req.body);
  const coupon = await prisma.coupon.create({
    data: {
      ...body,
      code: body.code.toUpperCase(),
      validUntil: body.validUntil ? new Date(body.validUntil) : null,
      restaurantId: req.restaurantId,
    },
  });
  res.status(201).json({ coupon: serialize(coupon) });
}));

router.patch('/:id', canEdit, asyncHandler(async (req, res) => {
  const body = couponUpdateSchema.parse(req.body);

  const existing = await prisma.coupon.findFirst({
    where: { id: req.params.id, restaurantId: req.restaurantId },
  });
  if (!existing) throw ApiError.notFound('Coupon not found');

  // The percentage cap depends on both fields, and a partial body may carry only one.
  const nextType = body.discountType ?? existing.discountType;
  const nextValue = body.value ?? Number(existing.value);
  if (nextType === 'PERCENT' && nextValue > 100) throw ApiError.badRequest(PERCENT_CAP);

  const { count } = await prisma.coupon.updateMany({
    where: { id: req.params.id, restaurantId: req.restaurantId },
    data: {
      ...body,
      ...(body.code ? { code: body.code.toUpperCase() } : {}),
      ...(body.validUntil !== undefined ? { validUntil: body.validUntil ? new Date(body.validUntil) : null } : {}),
    },
  });
  if (!count) throw ApiError.notFound('Coupon not found');
  res.json({ coupon: serialize(await prisma.coupon.findUnique({ where: { id: req.params.id } })) });
}));

router.delete('/:id', canEdit, asyncHandler(async (req, res) => {
  const { count } = await prisma.coupon.deleteMany({
    where: { id: req.params.id, restaurantId: req.restaurantId },
  });
  if (!count) throw ApiError.notFound('Coupon not found');
  res.json({ ok: true });
}));

export default router;
