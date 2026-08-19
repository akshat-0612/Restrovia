import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../../lib/prisma.js';
import { asyncHandler } from '../../lib/errors.js';
import { vapidPublicKey, pushEnabled } from '../../lib/push.js';

const router = Router();

const subscriptionSchema = z.object({
  endpoint: z.string().url().max(2000),
  keys: z.object({ p256dh: z.string().min(1).max(255), auth: z.string().min(1).max(255) }),
});

/** The key the browser needs before it can subscribe. Null when push is unconfigured. */
router.get('/key', (_req, res) => {
  res.json({ publicKey: vapidPublicKey(), enabled: pushEnabled });
});

/**
 * Registers this browser to be told when an order comes in.
 *
 * Keyed to the signed-in user, so alerts follow the person: a manager who signs
 * in on the counter tablet and again on their phone gets both, and removing
 * their account takes the subscriptions with it.
 */
router.post('/subscribe', asyncHandler(async (req, res) => {
  const sub = subscriptionSchema.parse(req.body.subscription);

  // Replace rather than duplicate — a browser re-subscribes on every visit.
  await prisma.pushSubscription.deleteMany({ where: { endpoint: sub.endpoint } });
  await prisma.pushSubscription.create({
    data: {
      restaurantId: req.restaurantId,
      userId: req.user.id,
      endpoint: sub.endpoint,
      p256dh: sub.keys.p256dh,
      auth: sub.keys.auth,
    },
  });
  res.status(201).json({ ok: true });
}));

router.post('/unsubscribe', asyncHandler(async (req, res) => {
  const endpoint = z.string().url().max(2000).parse(req.body.endpoint);
  await prisma.pushSubscription.deleteMany({ where: { endpoint, userId: req.user.id } });
  res.json({ ok: true });
}));

/** Whether this particular browser is already registered. */
router.get('/status', asyncHandler(async (req, res) => {
  const endpoint = String(req.query.endpoint || '');
  if (!endpoint) return res.json({ subscribed: false });
  const row = await prisma.pushSubscription.findFirst({
    where: { endpoint, userId: req.user.id }, select: { id: true },
  });
  res.json({ subscribed: Boolean(row) });
}));

export default router;
