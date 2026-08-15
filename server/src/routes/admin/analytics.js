import { Router } from 'express';
import { prisma } from '../../lib/prisma.js';
import { asyncHandler } from '../../lib/errors.js';
import { getOverview, getQuickStats } from '../../services/analyticsService.js';

const router = Router();

const loadRestaurant = asyncHandler(async (req, _res, next) => {
  req.restaurantRecord = await prisma.restaurant.findUnique({ where: { id: req.restaurantId } });
  next();
});

router.use(loadRestaurant);

/** Header tiles: today, this month, lifetime, plus the live order count. */
router.get('/quick', asyncHandler(async (req, res) => {
  res.json(await getQuickStats(req.restaurantRecord));
}));

/** Everything the analytics screen needs, in one request. */
router.get('/overview', asyncHandler(async (req, res) => {
  const { range = 'today', from, to } = req.query;
  res.json(await getOverview(req.restaurantRecord, { range, from, to }));
}));

export default router;
