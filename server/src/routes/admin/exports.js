import { Router } from 'express';
import { prisma } from '../../lib/prisma.js';
import { asyncHandler } from '../../lib/errors.js';
import { requireRole } from '../../middleware/auth.js';
import { resolveRange } from '../../lib/time.js';

const router = Router();

const esc = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;

/** CSV export for the owner's accountant. */
router.get('/orders.csv', requireRole('PLATFORM_ADMIN', 'OWNER', 'MANAGER'), asyncHandler(async (req, res) => {
  const restaurant = await prisma.restaurant.findUnique({ where: { id: req.restaurantId } });
  const { range = 'month', from: cf, to: ct } = req.query;
  const { from, to } = resolveRange(range, restaurant.timezone, cf, ct);

  const orders = await prisma.order.findMany({
    where: { restaurantId: req.restaurantId, placedAt: { gte: from, lt: to } },
    include: { items: true },
    orderBy: { placedAt: 'asc' },
  });

  const header = ['Order #', 'Placed At', 'Status', 'Table', 'Customer', 'Phone', 'Items',
                  'Subtotal', 'Discount', 'Tax', 'Total', 'Paid', 'Method'];
  const lines = [header.join(',')];

  for (const o of orders) {
    lines.push([
      o.orderNumber,
      o.placedAt.toISOString(),
      o.status,
      o.tableLabel || '',
      o.customerName,
      o.customerPhone || '',
      o.items.map((i) => `${i.quantity}x ${i.nameSnapshot}${i.variantLabel ? ` (${i.variantLabel})` : ''}`).join(' | '),
      Number(o.subtotal), Number(o.discountAmount), Number(o.taxAmount), Number(o.totalAmount),
      o.isPaid ? 'Yes' : 'No', o.payMethod,
    ].map(esc).join(','));
  }

  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="${restaurant.slug}-orders-${range}.csv"`);
  res.send(lines.join('\n'));
}));

/** Item-level sales export — what actually left the kitchen, line by line. */
router.get('/items.csv', requireRole('PLATFORM_ADMIN', 'OWNER', 'MANAGER'), asyncHandler(async (req, res) => {
  const restaurant = await prisma.restaurant.findUnique({ where: { id: req.restaurantId } });
  const { range = 'month', from: cf, to: ct } = req.query;
  const { from, to } = resolveRange(range, restaurant.timezone, cf, ct);

  const rows = await prisma.$queryRaw`
    SELECT oi."categorySnapshot" AS category, oi."nameSnapshot" AS item, oi."variantLabel" AS variant,
           SUM(oi.quantity)::int AS qty, SUM(oi."lineTotal") AS revenue
    FROM order_items oi JOIN orders o ON o.id = oi."orderId"
    WHERE o."restaurantId" = ${restaurant.id} AND o."placedAt" >= ${from} AND o."placedAt" < ${to}
      AND o.status <> 'CANCELLED'
    GROUP BY 1,2,3 ORDER BY revenue DESC
  `;

  const lines = ['Category,Item,Variant,Quantity Sold,Revenue'];
  for (const r of rows) {
    lines.push([r.category, r.item, r.variant || '—', Number(r.qty), Number(r.revenue)].map(esc).join(','));
  }

  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="${restaurant.slug}-item-sales-${range}.csv"`);
  res.send(lines.join('\n'));
}));

export default router;
