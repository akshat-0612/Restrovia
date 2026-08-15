import jwt from 'jsonwebtoken';
import { prisma } from '../lib/prisma.js';
import { ApiError, asyncHandler } from '../lib/errors.js';

export function signToken(user) {
  return jwt.sign(
    { uid: user.id, rid: user.restaurantId, role: user.role },
    process.env.JWT_SECRET,
    { expiresIn: process.env.JWT_EXPIRES_IN || '7d' }
  );
}

/** Verifies the bearer token and loads the live user row (so deactivation takes effect immediately). */
export const requireAuth = asyncHandler(async (req, _res, next) => {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) throw ApiError.unauthorized('Missing bearer token');

  let payload;
  try {
    payload = jwt.verify(token, process.env.JWT_SECRET);
  } catch {
    throw ApiError.unauthorized('Session expired. Please sign in again.');
  }

  const user = await prisma.user.findUnique({
    where: { id: payload.uid },
    include: { restaurant: true },
  });
  if (!user || !user.isActive) throw ApiError.unauthorized('Account is no longer active');
  if (user.restaurant && !user.restaurant.isActive) {
    throw ApiError.forbidden('This restaurant account has been suspended. Contact support.');
  }

  req.user = user;
  next();
});

export const requireRole = (...roles) => (req, _res, next) => {
  if (!req.user) return next(ApiError.unauthorized());
  if (!roles.includes(req.user.role)) {
    return next(ApiError.forbidden('Your role does not have access to this action'));
  }
  next();
};

export const requirePlatformAdmin = requireRole('PLATFORM_ADMIN');
