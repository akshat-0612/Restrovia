import { Router } from 'express';
import { z } from 'zod';
import { prisma, serialize } from '../../lib/prisma.js';
import { ApiError, asyncHandler } from '../../lib/errors.js';
import { requireRole } from '../../middleware/auth.js';
import { transitionOrder, ORDER_INCLUDE, STATUS_FLOW } from '../../services/orderService.js';
import { notifyOrderStatus, forgetOrderSubscriptions } from '../../services/pushService.js';
import { resolveRange } from '../../lib/time.js';

const router = Router();
const LIVE_STATUSES = ['PLACED', 'ACCEPTED', 'PREPARING', 'READY'];

/**
 * The kitchen board: everything not yet closed out. Polled every few seconds by
 * the admin app, so it stays deliberately small and index-backed.
 */
router.get('/live', asyncHandler(async (req, res) => {
  const orders = await prisma.order.findMany({
    where: { restaurantId: req.restaurantId, status: { in: LIVE_STATUSES } },
    include: ORDER_INCLUDE,
    orderBy: { placedAt: 'asc' },
  });
  res.json({ orders: serialize(orders), serverTime: new Date().toISOString() });
}));

/** Paginated history with filters — the "Orders" screen. */
router.get('/', asyncHandler(async (req, res) => {
  const q = z.object({
    status: z.string().optional(),
    search: z.string().optional(),
    range: z.string().optional(),
    from: z.string().optional(),
    to: z.string().optional(),
    table: z.string().optional(),
    page: z.coerce.number().int().min(1).default(1),
    pageSize: z.coerce.number().int().min(1).max(100).default(25),
    sort: z.enum(['newest', 'oldest', 'highest', 'lowest']).default('newest'),
  }).parse(req.query);

  const restaurant = await prisma.restaurant.findUnique({ where: { id: req.restaurantId } });
  const where = { restaurantId: req.restaurantId };

  if (q.status && q.status !== 'ALL') where.status = { in: q.status.split(',') };
  if (q.table) where.tableLabel = q.table;
  if (q.range && q.range !== 'all') {
    const { from, to } = resolveRange(q.range, restaurant.timezone, q.from, q.to);
    where.placedAt = { gte: from, lt: to };
  }
  if (q.search?.trim()) {
    const s = q.search.trim();
    where.OR = [
      { customerName: { contains: s, mode: 'insensitive' } },
      { customerPhone: { contains: s } },
      { tableLabel: { contains: s, mode: 'insensitive' } },
      ...(/^\d+$/.test(s) ? [{ orderNumber: Number(s) }] : []),
    ];
  }

  const orderBy =
    q.sort === 'oldest'  ? { placedAt: 'asc' } :
    q.sort === 'highest' ? { totalAmount: 'desc' } :
    q.sort === 'lowest'  ? { totalAmount: 'asc' } :
                           { placedAt: 'desc' };

  const [orders, total, aggregate] = await Promise.all([
    prisma.order.findMany({
      where, include: ORDER_INCLUDE, orderBy,
      skip: (q.page - 1) * q.pageSize, take: q.pageSize,
    }),
    prisma.order.count({ where }),
    // Revenue summary ignores cancelled orders even when the user is browsing them.
    prisma.order.aggregate({
      where: { ...where, status: { ...(where.status || {}), not: 'CANCELLED' } },
      _sum: { totalAmount: true }, _avg: { totalAmount: true }, _count: { _all: true },
    }),
  ]);

  res.json(serialize({
    orders,
    pagination: { page: q.page, pageSize: q.pageSize, total, pages: Math.ceil(total / q.pageSize) },
    summary: {
      totalRevenue: Number(aggregate._sum.totalAmount || 0),
      avgOrderValue: Number(aggregate._avg.totalAmount || 0),
      earningOrders: aggregate._count._all,
      count: total,
    },
  }));
}));

router.get('/:id', asyncHandler(async (req, res) => {
  const order = await prisma.order.findFirst({
    where: { id: req.params.id, restaurantId: req.restaurantId },
    include: {
      ...ORDER_INCLUDE,
      events: { orderBy: { createdAt: 'asc' }, include: { byUser: { select: { name: true } } } },
    },
  });
  if (!order) throw ApiError.notFound('Order not found');
  res.json({ order: serialize(order) });
}));

/** Advance an order through the pipeline. Legal moves are enforced in the service. */
router.patch('/:id/status', asyncHandler(async (req, res) => {
  const { status, note } = z.object({
    status: z.enum(['ACCEPTED', 'PREPARING', 'READY', 'COMPLETED', 'CANCELLED']),
    note: z.string().max(200).optional(),
  }).parse(req.body);

  const order = await prisma.order.findFirst({
    where: { id: req.params.id, restaurantId: req.restaurantId },
  });
  if (!order) throw ApiError.notFound('Order not found');

  const updated = await transitionOrder({ order, toStatus: status, user: req.user, note });
  // Every step the diner asked to follow. Fire-and-forget, as above.
  notifyOrderStatus(updated);
  // A cancellation is not announced — the kitchen will be telling them in person
  // — but its subscriptions have nothing left to carry.
  if (status === 'CANCELLED') forgetOrderSubscriptions(updated.id);
  res.json({ order: serialize(updated) });
}));

/** Mark a cash bill settled independently of fulfilment status. */
router.patch('/:id/payment', requireRole('PLATFORM_ADMIN', 'OWNER', 'MANAGER'), asyncHandler(async (req, res) => {
  const { isPaid, payMethod } = z.object({
    isPaid: z.boolean(),
    payMethod: z.enum(['CASH', 'UPI', 'CARD']).optional(),
  }).parse(req.body);

  const order = await prisma.order.findFirst({ where: { id: req.params.id, restaurantId: req.restaurantId } });
  if (!order) throw ApiError.notFound('Order not found');

  const updated = await prisma.order.update({
    where: { id: order.id },
    data: { isPaid, paidAt: isPaid ? new Date() : null, ...(payMethod ? { payMethod } : {}) },
    include: ORDER_INCLUDE,
  });
  res.json({ order: serialize(updated) });
}));

export default router;
