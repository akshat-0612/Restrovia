import { prisma } from '../lib/prisma.js';
import { ApiError, asyncHandler } from '../lib/errors.js';

/**
 * Resolves which restaurant an authenticated admin request acts on, and pins it
 * to req.restaurantId. Every admin query filters on this value — it is the only
 * thing standing between two tenants' data, so it is never taken from the body.
 *
 * A restaurant user is locked to their own restaurant. A PLATFORM_ADMIN has no
 * home restaurant and must name one explicitly via ?restaurantId= or the
 * X-Restaurant-Id header (that is how "impersonate a client" works).
 */
export const resolveTenant = asyncHandler(async (req, _res, next) => {
  if (req.user.role === 'PLATFORM_ADMIN') {
    const id = req.header('x-restaurant-id') || req.query.restaurantId;
    if (!id) throw ApiError.badRequest('Platform admins must specify a restaurant (X-Restaurant-Id)');
    const exists = await prisma.restaurant.findUnique({ where: { id }, select: { id: true } });
    if (!exists) throw ApiError.notFound('Restaurant not found');
    req.restaurantId = id;
  } else {
    if (!req.user.restaurantId) throw ApiError.forbidden('User is not attached to a restaurant');
    req.restaurantId = req.user.restaurantId;
  }
  next();
});

/**
 * Public (customer-facing) counterpart: identifies the restaurant from its slug.
 * Each deployed customer app ships with its own slug baked into the build.
 */
export const resolvePublicTenant = asyncHandler(async (req, _res, next) => {
  const slug = req.params.slug || req.header('x-restaurant-slug') || req.query.restaurant;
  if (!slug) throw ApiError.badRequest('Restaurant not specified');

  const restaurant = await prisma.restaurant.findUnique({ where: { slug } });
  if (!restaurant) throw ApiError.notFound('Restaurant not found');
  if (!restaurant.isActive) throw ApiError.forbidden('This restaurant is not currently available');

  req.restaurant = restaurant;
  req.restaurantId = restaurant.id;
  next();
});
