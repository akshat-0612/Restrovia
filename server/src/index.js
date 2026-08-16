import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import morgan from 'morgan';
import rateLimit from 'express-rate-limit';

import authRoutes from './routes/auth.js';
import publicRoutes from './routes/public.js';
import platformRoutes from './routes/platform.js';
import ordersRoutes from './routes/admin/orders.js';
import menuRoutes from './routes/admin/menu.js';
import tablesRoutes from './routes/admin/tables.js';
import staffRoutes from './routes/admin/staff.js';
import settingsRoutes from './routes/admin/settings.js';
import couponsRoutes from './routes/admin/coupons.js';
import analyticsRoutes from './routes/admin/analytics.js';
import exportsRoutes from './routes/admin/exports.js';

import { requireAuth } from './middleware/auth.js';
import { resolveTenant } from './middleware/tenant.js';
import { errorHandler, notFoundHandler } from './middleware/error.js';
import { ApiError } from './lib/errors.js';
import { prisma } from './lib/prisma.js';

const app = express();
const PORT = Number(process.env.PORT || 4000);

app.set('trust proxy', 1);
app.use(express.json({ limit: '1mb' }));

/**
 * Every restaurant's customer app runs on its own domain, so the allowlist grows
 * with each sale. In development any localhost port is accepted.
 */
const allowed = (process.env.CORS_ORIGINS || '')
  .split(',').map((s) => s.trim()).filter(Boolean);

app.use(cors({
  origin(origin, callback) {
    if (!origin) return callback(null, true); // curl, server-to-server, health checks
    if (allowed.includes(origin)) return callback(null, true);
    if (process.env.NODE_ENV !== 'production' && /^https?:\/\/localhost(:\d+)?$/.test(origin)) {
      return callback(null, true);
    }
    // A rejected origin is a configuration mistake, not a server fault. Returning
    // a plain Error here would surface as a 500 and log a stack trace for every
    // blocked request, burying real errors while saying nothing useful.
    callback(ApiError.forbidden(
      `Origin ${origin} is not allowed. Add it to CORS_ORIGINS on the API.`
    ));
  },
  credentials: true,
}));

if (process.env.NODE_ENV !== 'test') app.use(morgan('dev'));

/**
 * Collapses a client address to a stable key. IPv6 is cut to its /64 prefix so a
 * client with a large allocation can't sidestep a limit by rotating the host bits;
 * IPv4-mapped addresses (::ffff:1.2.3.4) are unwrapped first.
 */
function clientKey(req) {
  const raw = req.ip || req.socket?.remoteAddress || 'unknown';
  const ip = raw.startsWith('::ffff:') ? raw.slice(7) : raw;
  if (!ip.includes(':')) return ip;
  return `${ip.split(':').slice(0, 4).join(':')}::/64`;
}

/**
 * Sign-in throttling, in two layers.
 *
 * The inner layer is keyed on address *and* email rather than address alone,
 * because a restaurant's whole team signs in from one NAT'd IP — the kitchen
 * tablet, the manager's phone, the owner's laptop. Keyed on address only, one
 * person mistyping their password locks out everybody else, and simply moving
 * between accounts burns the budget for all of them.
 *
 * Successful sign-ins are not counted. A correct password is proof of identity,
 * not evidence of an attack, so only failures consume the allowance.
 *
 * There is deliberately no per-email limit spanning all addresses: it would let
 * anyone lock a known owner out of their own restaurant just by failing against
 * their email repeatedly.
 */
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: Number(process.env.LOGIN_RATE_LIMIT || 10),
  skipSuccessfulRequests: true,
  keyGenerator: (req) => `${clientKey(req)}|${String(req.body?.email || '').trim().toLowerCase()}`,
  message: {
    error: 'Too many failed sign-in attempts for this account. Try again in a few minutes.',
  },
  standardHeaders: true,
  legacyHeaders: false,
  validate: { keyGeneratorIpFallback: false },
});

/**
 * Outer backstop against one host spraying many different emails. Loose enough
 * that a busy restaurant on shared wifi will never reach it.
 */
const loginSprayLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: Number(process.env.LOGIN_SPRAY_LIMIT || 100),
  skipSuccessfulRequests: true,
  keyGenerator: clientKey,
  message: { error: 'Too many failed sign-in attempts from this network. Try again later.' },
  standardHeaders: true,
  legacyHeaders: false,
  validate: { keyGeneratorIpFallback: false },
});

app.use('/api/auth/login', loginLimiter, loginSprayLimiter);

app.get('/api/health', async (_req, res) => {
  try {
    await prisma.$queryRaw`SELECT 1`;
    res.json({ ok: true, service: 'delightful-api', db: 'up', time: new Date().toISOString() });
  } catch {
    res.status(503).json({ ok: false, db: 'down' });
  }
});

// Customer-facing — no auth, tenant resolved from the restaurant slug.
app.use('/api/public', publicRoutes);

app.use('/api/auth', authRoutes);

// Vendor-only, above all tenants.
app.use('/api/platform', platformRoutes);

// Restaurant admin — authenticated, and hard-scoped to one restaurant.
const admin = express.Router();
admin.use(requireAuth, resolveTenant);
admin.use('/orders', ordersRoutes);
admin.use('/menu', menuRoutes);
admin.use('/tables', tablesRoutes);
admin.use('/staff', staffRoutes);
admin.use('/settings', settingsRoutes);
admin.use('/coupons', couponsRoutes);
admin.use('/analytics', analyticsRoutes);
admin.use('/export', exportsRoutes);
app.use('/api/admin', admin);

app.use(notFoundHandler);
app.use(errorHandler);

app.listen(PORT, () => {
  console.log(`\n  Delightful API  →  http://localhost:${PORT}`);
  console.log(`  Health          →  http://localhost:${PORT}/api/health\n`);
});

const shutdown = async () => { await prisma.$disconnect(); process.exit(0); };
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
