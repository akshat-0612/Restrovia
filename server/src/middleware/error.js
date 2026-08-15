import { ZodError } from 'zod';
import { ApiError } from '../lib/errors.js';

export function notFoundHandler(req, res) {
  res.status(404).json({ error: `No route for ${req.method} ${req.originalUrl}` });
}

// eslint-disable-next-line no-unused-vars -- Express identifies error middleware by arity
export function errorHandler(err, req, res, _next) {
  if (err instanceof ZodError) {
    return res.status(400).json({
      error: 'Validation failed',
      details: err.errors.map((e) => ({ field: e.path.join('.'), message: e.message })),
    });
  }
  if (err instanceof ApiError) {
    return res.status(err.status).json({ error: err.message, details: err.details });
  }
  // Prisma unique-constraint violation
  if (err.code === 'P2002') {
    return res.status(409).json({ error: `That ${err.meta?.target?.join(', ') || 'value'} is already in use` });
  }
  if (err.code === 'P2025') {
    return res.status(404).json({ error: 'Record not found' });
  }

  console.error('[unhandled]', err);
  res.status(500).json({ error: 'Something went wrong on our end' });
}
