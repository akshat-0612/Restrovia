import { PrismaClient } from '@prisma/client';

export const prisma = new PrismaClient({
  log: process.env.NODE_ENV === 'development' ? ['warn', 'error'] : ['error'],
});

/**
 * Prisma returns Decimal instances, which JSON.stringify renders as objects.
 * Every response goes through this so the frontends receive plain numbers.
 */
export function serialize(value) {
  return JSON.parse(
    JSON.stringify(value, (_key, val) => {
      if (val && typeof val === 'object' && typeof val.toFixed === 'function' && val.constructor?.name === 'Decimal') {
        return Number(val);
      }
      return val;
    })
  );
}
