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
    callback(new Error(`Origin ${origin} is not allowed by CORS`));
  },
  credentials: true,
}));

if (process.env.NODE_ENV !== 'test') app.use(morgan('dev'));

app.use('/api/auth/login', rateLimit({
  windowMs: 15 * 60 * 1000, max: 20,
  message: { error: 'Too many sign-in attempts. Try again in a few minutes.' },
  standardHeaders: true, legacyHeaders: false,
}));

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
