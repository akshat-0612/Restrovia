import { Router } from 'express';
import { z } from 'zod';
import { prisma, serialize } from '../../lib/prisma.js';
import { ApiError, asyncHandler } from '../../lib/errors.js';
import { requireRole } from '../../middleware/auth.js';

const router = Router();
const canEdit = requireRole('PLATFORM_ADMIN', 'OWNER', 'MANAGER');

const tableSchema = z.object({
  label: z.string().trim().min(1, 'Table label is required').max(30),
  seats: z.number().int().min(1).max(50).default(4),
  isActive: z.boolean().optional(),
});

router.get('/', asyncHandler(async (req, res) => {
  const tables = await prisma.restaurantTable.findMany({
    where: { restaurantId: req.restaurantId },
    orderBy: { label: 'asc' },
    include: {
      _count: { select: { orders: true } },
      orders: {
        where: { status: { in: ['PLACED', 'ACCEPTED', 'PREPARING', 'READY'] } },
        select: { id: true, orderNumber: true, status: true, totalAmount: true },
      },
    },
  });
  res.json(serialize({
    tables: tables.map((t) => ({
      id: t.id, label: t.label, seats: t.seats, qrToken: t.qrToken, isActive: t.isActive,
      lifetimeOrders: t._count.orders,
      activeOrders: t.orders,
      isOccupied: t.orders.length > 0,
    })),
  }));
}));

router.post('/', canEdit, asyncHandler(async (req, res) => {
  const body = tableSchema.parse(req.body);
  const table = await prisma.restaurantTable.create({
    data: { ...body, restaurantId: req.restaurantId },
  });
  res.status(201).json({ table: serialize(table) });
}));

/** Creates T1..Tn in one go — the usual first thing an owner does at setup. */
router.post('/bulk', canEdit, asyncHandler(async (req, res) => {
  const { prefix, count, seats } = z.object({
    prefix: z.string().trim().max(10).default('T'),
    count: z.number().int().min(1).max(60),
    seats: z.number().int().min(1).max(50).default(4),
  }).parse(req.body);

  const existing = await prisma.restaurantTable.findMany({
    where: { restaurantId: req.restaurantId }, select: { label: true },
  });
  const taken = new Set(existing.map((t) => t.label));

  const toCreate = [];
  for (let n = 1; toCreate.length < count && n < count * 4; n++) {
    const label = `${prefix}${n}`;
    if (!taken.has(label)) toCreate.push({ label, seats, restaurantId: req.restaurantId });
  }

  await prisma.restaurantTable.createMany({ data: toCreate, skipDuplicates: true });
  res.status(201).json({ created: toCreate.length });
}));

router.patch('/:id', canEdit, asyncHandler(async (req, res) => {
  const body = tableSchema.partial().parse(req.body);
  const { count } = await prisma.restaurantTable.updateMany({
    where: { id: req.params.id, restaurantId: req.restaurantId }, data: body,
  });
  if (!count) throw ApiError.notFound('Table not found');
  res.json({ table: serialize(await prisma.restaurantTable.findUnique({ where: { id: req.params.id } })) });
}));

/** Rotates the QR token — used when a printed code leaks or a table is re-numbered. */
router.post('/:id/regenerate-qr', canEdit, asyncHandler(async (req, res) => {
  const table = await prisma.restaurantTable.findFirst({
    where: { id: req.params.id, restaurantId: req.restaurantId },
  });
  if (!table) throw ApiError.notFound('Table not found');
  const updated = await prisma.restaurantTable.update({
    where: { id: table.id },
    data: { qrToken: `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}` },
  });
  res.json({ table: serialize(updated) });
}));

router.delete('/:id', canEdit, asyncHandler(async (req, res) => {
  const table = await prisma.restaurantTable.findFirst({
    where: { id: req.params.id, restaurantId: req.restaurantId },
    include: { _count: { select: { orders: true } } },
  });
  if (!table) throw ApiError.notFound('Table not found');

  // Past orders keep their tableLabel snapshot, so deleting is safe — but a table
  // with history is usually meant to be deactivated instead.
  if (table._count.orders > 0) {
    const updated = await prisma.restaurantTable.update({
      where: { id: table.id }, data: { isActive: false },
    });
    return res.json({
      table: serialize(updated),
      deactivated: true,
      message: 'This table has order history, so it was deactivated instead of deleted.',
    });
  }
  await prisma.restaurantTable.delete({ where: { id: table.id } });
  res.json({ ok: true });
}));

export default router;
