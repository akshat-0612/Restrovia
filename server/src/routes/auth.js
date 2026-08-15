import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { serialize } from '../lib/prisma.js';
import { ApiError, asyncHandler } from '../lib/errors.js';
import { signToken, requireAuth } from '../middleware/auth.js';

const router = Router();

const loginSchema = z.object({
  email: z.string().email('Enter a valid email'),
  password: z.string().min(1, 'Password is required'),
  /// Optional: disambiguates when the same email exists at two restaurants.
  restaurantSlug: z.string().optional(),
});

function publicUser(user) {
  return serialize({
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
    restaurantId: user.restaurantId,
    restaurant: user.restaurant
      ? { id: user.restaurant.id, name: user.restaurant.name, slug: user.restaurant.slug,
          logoEmoji: user.restaurant.logoEmoji, currencySymbol: user.restaurant.currencySymbol,
          timezone: user.restaurant.timezone }
      : null,
  });
}

router.post('/login', asyncHandler(async (req, res) => {
  const { email, password, restaurantSlug } = loginSchema.parse(req.body);

  const candidates = await prisma.user.findMany({
    where: {
      email: email.toLowerCase().trim(),
      ...(restaurantSlug ? { restaurant: { slug: restaurantSlug } } : {}),
    },
    include: { restaurant: true },
  });

  // Uniform failure message: never reveal whether the email exists.
  const invalid = ApiError.unauthorized('Incorrect email or password');
  if (candidates.length === 0) {
    await bcrypt.compare(password, '$2a$10$invalidinvalidinvalidinvalidinvalidinvalidinvalidinv');
    throw invalid;
  }

  let matched = null;
  for (const user of candidates) {
    if (await bcrypt.compare(password, user.passwordHash)) { matched = user; break; }
  }
  if (!matched) throw invalid;
  if (!matched.isActive) throw ApiError.forbidden('This account has been deactivated');
  if (matched.restaurant && !matched.restaurant.isActive) {
    throw ApiError.forbidden('This restaurant account has been suspended');
  }

  await prisma.user.update({ where: { id: matched.id }, data: { lastLoginAt: new Date() } });

  res.json({ token: signToken(matched), user: publicUser(matched) });
}));

router.get('/me', requireAuth, (req, res) => {
  res.json({ user: publicUser(req.user) });
});

router.post('/change-password', requireAuth, asyncHandler(async (req, res) => {
  const { currentPassword, newPassword } = z.object({
    currentPassword: z.string().min(1),
    newPassword: z.string().min(8, 'New password must be at least 8 characters'),
  }).parse(req.body);

  if (!(await bcrypt.compare(currentPassword, req.user.passwordHash))) {
    throw ApiError.badRequest('Current password is incorrect');
  }
  await prisma.user.update({
    where: { id: req.user.id },
    data: { passwordHash: await bcrypt.hash(newPassword, 10) },
  });
  res.json({ ok: true });
}));

export default router;
