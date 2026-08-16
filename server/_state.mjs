import { PrismaClient } from '@prisma/client';
const db = new PrismaClient();
const q = (s) => db.$queryRawUnsafe(s);
const [r] = await q(`SELECT id FROM restaurants WHERE slug='delight-food'`);
for (const t of ['categories','menu_items','menu_variants','coupons','orders','order_items','order_events']) {
  const [{ n }] = await q(`SELECT count(*)::int n FROM ${t}`);
  console.log(`  ${t.padEnd(16)} ${n}`);
}
const [{ max }] = await q(`SELECT COALESCE(MAX("orderNumber"),0)::int max FROM orders`);
console.log('  highest order #', max);
const cats = await q(`SELECT c.name, count(m.id)::int items FROM categories c LEFT JOIN menu_items m ON m."categoryId"=c.id GROUP BY c.id ORDER BY c."sortOrder"`);
console.log('  categories:', cats.map(c => `${c.name}(${c.items})`).join(', '));
await db.$disconnect();
