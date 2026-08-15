import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { prisma, serialize } from '../../lib/prisma.js';
import { ApiError, asyncHandler } from '../../lib/errors.js';
import { requireRole } from '../../middleware/auth.js';

const router = Router();
/** Staff management is an owner-level action — managers run the floor, not the payroll. */
const canManage = requireRole('PLATFORM_ADMIN', 'OWNER');

const SELECT = {
  id: true, name: true, email: true, phone: true, role: true,
  isActive: true, lastLoginAt: true, createdAt: true,
};

router.get('/', canManage, asyncHandler(async (req, res) => {
  const staff = await prisma.user.findMany({
    where: { restaurantId: req.restaurantId },
    select: SELECT,
    orderBy: [{ role: 'asc' }, { name: 'asc' }],
  });
  res.json({ staff: serialize(staff) });
}));

router.post('/', canManage, asyncHandler(async (req, res) => {
  const body = z.object({
    name: z.string().trim().min(2).max(60),
    email: z.string().email(),
    phone: z.string().trim().max(20).optional(),
    password: z.string().min(8, 'Password must be at least 8 characters'),
    role: z.enum(['OWNER', 'MANAGER', 'STAFF']).default('STAFF'),
  }).parse(req.body);

  const user = await prisma.user.create({
    data: {
      name: body.name,
      email: body.email.toLowerCase().trim(),
      phone: body.phone || null,
      role: body.role,
      restaurantId: req.restaurantId,
      passwordHash: await bcrypt.hash(body.password, 10),
    },
    select: SELECT,
  });
  res.status(201).json({ user: serialize(user) });
}));

router.patch('/:id', canManage, asyncHandler(async (req, res) => {
  const body = z.object({
    name: z.string().trim().min(2).max(60).optional(),
    phone: z.string().trim().max(20).optional(),
    role: z.enum(['OWNER', 'MANAGER', 'STAFF']).optional(),
    isActive: z.boolean().optional(),
    password: z.string().min(8).optional(),
  }).parse(req.body);

  const target = await prisma.user.findFirst({
    where: { id: req.params.id, restaurantId: req.restaurantId },
  });
  if (!target) throw ApiError.notFound('Staff member not found');

  // Guard against an owner locking themselves out of their own restaurant.
  if (target.id === req.user.id && (body.isActive === false || (body.role && body.role !== target.role))) {
    throw ApiError.badRequest('You cannot change your own role or deactivate yourself');
  }
  if (target.role === 'OWNER' && body.role && body.role !== 'OWNER') {
    const owners = await prisma.user.count({
      where: { restaurantId: req.restaurantId, role: 'OWNER', isActive: true },
    });
    if (owners <= 1) throw ApiError.badRequest('A restaurant must keep at least one active owner');
  }

  const { password, ...rest } = body;
  const user = await prisma.user.update({
    where: { id: target.id },
    data: { ...rest, ...(password ? { passwordHash: await bcrypt.hash(password, 10) } : {}) },
    select: SELECT,
  });
  res.json({ user: serialize(user) });
}));

router.delete('/:id', canManage, asyncHandler(async (req, res) => {
  if (req.params.id === req.user.id) throw ApiError.badRequest('You cannot remove your own account');
  const target = await prisma.user.findFirst({
    where: { id: req.params.id, restaurantId: req.restaurantId },
  });
  if (!target) throw ApiError.notFound('Staff member not found');

  // Soft-delete: order events reference the user, and that trail should survive.
  await prisma.user.update({ where: { id: target.id }, data: { isActive: false } });
  res.json({ ok: true, deactivated: true });
}));

export default router;
