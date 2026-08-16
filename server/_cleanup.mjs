import { PrismaClient } from '@prisma/client';
const db = new PrismaClient();
const [r] = await db.$queryRaw`SELECT id FROM restaurants WHERE slug='delight-food'`;

// Their own first four orders predate this script; only remove what it created.
const removed = await db.$executeRaw`
  DELETE FROM orders WHERE "restaurantId" = ${r.id} AND "orderNumber" > 4`;
console.log('  removed partial-run orders:', removed);

// Those inserts bumped popularity counters; put them back to zero for the items
// the script created, leaving the pre-existing item's own count intact.
await db.$executeRaw`
  UPDATE menu_items SET "timesOrdered" = 0
  WHERE "restaurantId" = ${r.id} AND name <> 'Veg Hakka Noodles'`;
const [{ n }] = await db.$queryRaw`SELECT count(*)::int n FROM orders WHERE "restaurantId" = ${r.id}`;
console.log('  orders remaining (theirs):', n);
await db.$disconnect();
