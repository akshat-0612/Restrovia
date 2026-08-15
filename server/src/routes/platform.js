import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { prisma, serialize } from '../lib/prisma.js';
import { ApiError, asyncHandler } from '../lib/errors.js';
import { requireAuth, requirePlatformAdmin } from '../middleware/auth.js';
import { round2 } from '../lib/money.js';
import { resolveRange } from '../lib/time.js';

const router = Router();
router.use(requireAuth, requirePlatformAdmin);

/** Cross-tenant roster: every restaurant sold, with headline numbers. */
router.get('/restaurants', asyncHandler(async (_req, res) => {
  const restaurants = await prisma.restaurant.findMany({
    orderBy: { createdAt: 'desc' },
    include: { _count: { select: { orders: true, users: true, menuItems: true } } },
  });

  const revenue = await prisma.order.groupBy({
    by: ['restaurantId'],
    where: { status: { not: 'CANCELLED' } },
    _sum: { totalAmount: true },
  });
  const revenueBy = new Map(revenue.map((r) => [r.restaurantId, Number(r._sum.totalAmount || 0)]));

  res.json(serialize({
    restaurants: restaurants.map((r) => ({
      id: r.id, slug: r.slug, name: r.name, plan: r.plan,
      isActive: r.isActive, isAcceptingOrders: r.isAcceptingOrders,
      city: r.city, phone: r.phone, email: r.email,
      logoEmoji: r.logoEmoji, currencySymbol: r.currencySymbol,
      createdAt: r.createdAt,
      orderCount: r._count.orders,
      userCount: r._count.users,
      menuItemCount: r._count.menuItems,
      lifetimeRevenue: round2(revenueBy.get(r.id) || 0),
    })),
  }));
}));

/** Platform-wide totals across every tenant. */
router.get('/stats', asyncHandler(async (_req, res) => {
  const tz = 'Asia/Kolkata';
  const { from: monthFrom, to: monthTo } = resolveRange('month', tz);
  const { from: todayFrom, to: todayTo } = resolveRange('today', tz);

  const [restaurants, activeRestaurants, allTime, thisMonth, today, perRestaurantMonth] = await Promise.all([
    prisma.restaurant.count(),
    prisma.restaurant.count({ where: { isActive: true } }),
    prisma.order.aggregate({ where: { status: { not: 'CANCELLED' } }, _sum: { totalAmount: true }, _count: { _all: true } }),
    prisma.order.aggregate({
      where: { status: { not: 'CANCELLED' }, placedAt: { gte: monthFrom, lt: monthTo } },
      _sum: { totalAmount: true }, _count: { _all: true },
    }),
    prisma.order.aggregate({
      where: { status: { not: 'CANCELLED' }, placedAt: { gte: todayFrom, lt: todayTo } },
      _sum: { totalAmount: true }, _count: { _all: true },
    }),
    prisma.order.groupBy({
      by: ['restaurantId'],
      where: { status: { not: 'CANCELLED' }, placedAt: { gte: monthFrom, lt: monthTo } },
      _sum: { totalAmount: true }, _count: { _all: true },
    }),
  ]);

  const names = await prisma.restaurant.findMany({ select: { id: true, name: true, logoEmoji: true } });
  const nameBy = new Map(names.map((n) => [n.id, n]));

  res.json(serialize({
    restaurants, activeRestaurants,
    allTime:   { revenue: round2(Number(allTime._sum.totalAmount || 0)),   orders: allTime._count._all },
    thisMonth: { revenue: round2(Number(thisMonth._sum.totalAmount || 0)), orders: thisMonth._count._all },
    today:     { revenue: round2(Number(today._sum.totalAmount || 0)),     orders: today._count._all },
    leaderboard: perRestaurantMonth
      .map((r) => ({
        restaurantId: r.restaurantId,
        name: nameBy.get(r.restaurantId)?.name ?? 'Unknown',
        logoEmoji: nameBy.get(r.restaurantId)?.logoEmoji ?? '🍽️',
        revenue: round2(Number(r._sum.totalAmount || 0)),
        orders: r._count._all,
      }))
      .sort((a, b) => b.revenue - a.revenue),
  }));
}));

/**
 * Onboards a new client: creates the tenant, its owner login, and a starter menu
 * scaffold — everything needed before handing over credentials.
 */
router.post('/restaurants', asyncHandler(async (req, res) => {
  const body = z.object({
    name: z.string().trim().min(2).max(80),
    slug: z.string().trim().min(2).max(40).regex(/^[a-z0-9-]+$/, 'Lowercase letters, numbers and hyphens only'),
    tagline: z.string().trim().max(120).optional(),
    logoEmoji: z.string().trim().max(8).default('🍽️'),
    primaryColor: z.string().regex(/^#[0-9a-fA-F]{6}$/).default('#e8552d'),
    city: z.string().trim().max(60).optional(),
    address: z.string().trim().max(200).optional(),
    phone: z.string().trim().max(20).optional(),
    taxPercent: z.number().min(0).max(50).default(5),
    timezone: z.string().default('Asia/Kolkata'),
    plan: z.enum(['STARTER', 'GROWTH', 'PRO']).default('STARTER'),
    ownerName: z.string().trim().min(2).max(60),
    ownerEmail: z.string().email(),
    ownerPassword: z.string().min(8, 'Owner password must be at least 8 characters'),
    tableCount: z.number().int().min(0).max(60).default(10),
    seedStarterMenu: z.boolean().default(true),
  }).parse(req.body);

  const taken = await prisma.restaurant.findUnique({ where: { slug: body.slug }, select: { id: true } });
  if (taken) throw ApiError.conflict(`The slug "${body.slug}" is already taken`);

  const result = await prisma.$transaction(async (tx) => {
    const restaurant = await tx.restaurant.create({
      data: {
        name: body.name, slug: body.slug, tagline: body.tagline ?? null,
        logoEmoji: body.logoEmoji, primaryColor: body.primaryColor,
        city: body.city ?? null, address: body.address ?? null, phone: body.phone ?? null,
        taxPercent: body.taxPercent, timezone: body.timezone, plan: body.plan,
      },
    });

    await tx.user.create({
      data: {
        restaurantId: restaurant.id,
        name: body.ownerName,
        email: body.ownerEmail.toLowerCase().trim(),
        passwordHash: await bcrypt.hash(body.ownerPassword, 10),
        role: 'OWNER',
      },
    });

    if (body.tableCount > 0) {
      await tx.restaurantTable.createMany({
        data: Array.from({ length: body.tableCount }, (_, i) => ({
          restaurantId: restaurant.id, label: `T${i + 1}`, seats: 4,
        })),
      });
    }

    if (body.seedStarterMenu) {
      const starters = [
        { name: 'Starters', icon: '🥟' },
        { name: 'Main Course', icon: '🍛' },
        { name: 'Beverages', icon: '☕' },
        { name: 'Desserts', icon: '🍰' },
      ];
      await tx.category.createMany({
        data: starters.map((c, i) => ({ ...c, restaurantId: restaurant.id, sortOrder: i })),
      });
    }

    return restaurant;
  });

  res.status(201).json({
    restaurant: serialize(result),
    hint: `Deploy the customer app with VITE_RESTAURANT_SLUG=${result.slug}`,
  });
}));

router.patch('/restaurants/:id', asyncHandler(async (req, res) => {
  const body = z.object({
    isActive: z.boolean().optional(),
    plan: z.enum(['STARTER', 'GROWTH', 'PRO']).optional(),
    planNotes: z.string().max(300).optional().nullable(),
    name: z.string().trim().min(2).max(80).optional(),
  }).parse(req.body);

  const restaurant = await prisma.restaurant.update({ where: { id: req.params.id }, data: body });
  res.json({ restaurant: serialize(restaurant) });
}));

/** Full teardown of a client. Irreversible — cascades through every tenant table. */
router.delete('/restaurants/:id', asyncHandler(async (req, res) => {
  const { confirmSlug } = z.object({ confirmSlug: z.string() }).parse(req.body);
  const restaurant = await prisma.restaurant.findUnique({ where: { id: req.params.id } });
  if (!restaurant) throw ApiError.notFound('Restaurant not found');
  if (confirmSlug !== restaurant.slug) {
    throw ApiError.badRequest('Type the exact restaurant slug to confirm deletion');
  }
  await prisma.restaurant.delete({ where: { id: restaurant.id } });
  res.json({ ok: true });
}));

export default router;
