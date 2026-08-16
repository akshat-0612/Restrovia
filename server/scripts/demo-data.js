/**
 * Fills a restaurant with believable demo data — a full menu, coupons, and
 * months of order history — so an empty account has something to show.
 *
 *   DATABASE_URL="…" node scripts/demo-data.js --restaurant delight-food
 *
 * Additive by design. It never touches the restaurant's own settings, its staff
 * logins, or its tables — table QR codes may already be printed and stuck to
 * furniture, so regenerating them would strand every one of them. Existing menu
 * items and orders are left alone; order numbers continue from the highest
 * already in use.
 *
 * Written against raw SQL rather than the Prisma client on purpose: this is
 * meant to run against a deployed database, which may be an older migration than
 * the checkout it is run from, and raw statements only touch the columns named.
 */
import 'dotenv/config';
import { PrismaClient } from '@prisma/client';

const db = new PrismaClient();

const arg = (name, fallback) => {
  const i = process.argv.indexOf(`--${name}`);
  return i > -1 ? process.argv[i + 1] : fallback;
};

const SLUG = arg('restaurant');
const DAYS = Number(arg('days', 75));
const PER_DAY = Number(arg('per-day', 26));
const DRY = process.argv.includes('--dry-run');

/** Prisma generates ids client-side, so raw inserts have to supply their own. */
const ALPHABET = 'abcdefghijklmnopqrstuvwxyz0123456789';
let counter = 0;
function cuid() {
  const stamp = Date.now().toString(36);
  const rand = Array.from({ length: 12 }, () => ALPHABET[Math.floor(Math.random() * 36)]).join('');
  return `c${stamp}${(counter++).toString(36).padStart(3, '0')}${rand}`;
}

const rand = (n) => Math.floor(Math.random() * n);
const pick = (a) => a[rand(a.length)];
const chance = (p) => Math.random() < p;
const round2 = (n) => Math.round((n + Number.EPSILON) * 100) / 100;

/* ── The menu ─────────────────────────────────────────────────────────── */

const MENU = {
  'Chinese': { icon: '🍜', items: [
    ['Veg Fried Rice',    'Wok-tossed rice with fresh vegetables and soy sauce',   null, [['Half', 80], ['Full', 150]], 1],
    ['Veg Hakka Noodles', 'Stir-fried noodles with veggies in soy-chilli sauce',   null, [['Half', 80], ['Full', 150]], 1],
    ['Manchurian Dry',    'Crispy veg balls tossed in a tangy Manchurian sauce',   null, [['Half', 90], ['Full', 170]], 2],
    ['Spring Rolls',      'Crispy rolls stuffed with spiced mixed vegetables',       80, null,                          1],
    ['Chilli Paneer',     'Soft paneer cubes tossed in a spicy Chinese sauce',     null, [['Half', 110], ['Full', 200]], 2],
  ]},
  'Snacks': { icon: '🥪', items: [
    ['Veg Sandwich',     'Fresh vegetables and chutney between toasted bread', 60, null, 0],
    ['Grilled Sandwich', 'Grilled to order with cheese and garden veggies',    70, null, 0],
    ['French Fries',     'Golden, crisp and salted just right',                70, null, 0],
    ['Pav Bhaji',        'Buttery pav with rich, spiced mashed vegetables',    90, null, 2],
    ['Samosa',           'Flaky pastry with a spiced potato filling',          25, null, 1],
    ['Bread Pakora',     'Deep-fried bread fritter with a potato centre',      40, null, 1],
  ]},
  'Pasta & Maggie': { icon: '🍝', items: [
    ['Red Sauce Pasta',   'Penne in a herbed tomato sauce',        null, [['Half', 90], ['Full', 160]],  1],
    ['White Sauce Pasta', 'Creamy béchamel with garlic and herbs', null, [['Half', 100], ['Full', 175]], 0],
    ['Masala Maggie',     "The classic, with our own masala blend",  60, null,                           1],
    ['Cheese Maggie',     'Masala maggie loaded with melted cheese', 75, null,                           1],
  ]},
  'Chai & Coffee': { icon: '☕', items: [
    ['Masala Chai', 'Slow-brewed with ginger, cardamom and clove', 25, null, 0],
    ['Ginger Chai', 'Strong, gingery and served piping hot',       25, null, 0],
    ['Cappuccino',  'Espresso topped with velvety steamed milk',   80, null, 0],
    ['Café Latte',  'Smooth espresso with generous steamed milk',  90, null, 0],
    ['Cold Coffee', 'Chilled, frothy and lightly sweetened',       90, null, 0],
  ]},
  'Shakes & Cold Coffee': { icon: '🥤', items: [
    ['Chocolate Shake',            'Thick shake with real cocoa',                110, null, 0],
    ['Strawberry Shake',           'Fresh strawberry blended with cold milk',    110, null, 0],
    ['Mango Shake',                'Seasonal alphonso, blended thick',           120, null, 0],
    ['Oreo Shake',                 'Cookies and cream, blended and topped',      130, null, 0],
    ['Cold Coffee with Ice Cream', 'Cold coffee crowned with vanilla ice cream', 120, null, 0],
  ]},
  'Soft Drinks': { icon: '🧃', items: [
    ['Coca Cola',    'Chilled 300ml bottle', 40, null, 0],
    ['Sprite',       'Chilled 300ml bottle', 40, null, 0],
    ['Mango Frooti', 'Chilled 200ml pack',   20, null, 0],
    ['Limca',        'Chilled 300ml bottle', 40, null, 0],
  ]},
  'Water': { icon: '💧', items: [
    ['Mineral Water 500ml', 'Sealed bottle', 15, null, 0],
    ['Mineral Water 1L',    'Sealed bottle', 20, null, 0],
  ]},
};

const COUPONS = [
  ['WELCOME10', '10% off your first order',           'PERCENT', 10, 200, 100],
  ['CHAI20',    'Flat ₹20 off on orders above ₹150',  'FLAT',    20, 150, null],
  ['FEAST15',   '15% off on orders above ₹500',       'PERCENT', 15, 500, 200],
];

const NAMES = [
  'Aarav Sharma', 'Diya Patel', 'Vivaan Reddy', 'Ananya Iyer', 'Aditya Nair',
  'Ishaan Gupta', 'Saanvi Joshi', 'Kabir Mehta', 'Myra Desai', 'Reyansh Rao',
  'Anika Bose', 'Arjun Malhotra', 'Kiara Kulkarni', 'Vihaan Shetty', 'Navya Menon',
  'Rohan Kapoor', 'Aisha Khan', 'Dhruv Chauhan', 'Tara Pillai', 'Neel Bhatt',
  'Ritika Sen', 'Kunal Verma', 'Sneha Rane', 'Yash Agarwal', 'Pooja Nambiar',
];
const NOTES = [null, null, null, null, null, null,
  'Less spicy please', 'No onion', 'Extra cheese', 'Pack it to go',
  'Serve the drinks first', 'Birthday — please add a candle', 'Extra napkins'];
const CANCEL_REASONS = [
  'Customer left before the order was served',
  'Item unavailable in the kitchen',
  'Duplicate order placed by mistake',
];

/** Café footfall: quiet mornings, a lunch peak, a bigger evening one. */
const HOUR_WEIGHTS = [0,0,0,0,0,0,0,1,3,5,6,9,14,16,11,7,9,14,18,20,15,9,4,1];
function weightedHour(maxHour = 23) {
  const w = HOUR_WEIGHTS.slice(0, maxHour + 1);
  const total = w.reduce((a, b) => a + b, 0);
  if (!total) return maxHour;
  let roll = Math.random() * total;
  for (let h = 0; h < w.length; h++) { roll -= w[h]; if (roll <= 0) return h; }
  return maxHour;
}

const zonedHour = (d, tz) =>
  Number(new Intl.DateTimeFormat('en-US', { timeZone: tz, hour: '2-digit', hour12: false }).format(d)) % 24;
const zonedDateKey = (d, tz) =>
  new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).format(d);

/** Interprets a wall-clock string as local time in `tz`, returns the UTC instant. */
function isoToUtc(isoLocal, tz) {
  const guess = new Date(`${isoLocal}Z`);
  const dtf = new Intl.DateTimeFormat('en-US', {
    timeZone: tz, hour12: false, year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  });
  const p = Object.fromEntries(dtf.formatToParts(guess).map((x) => [x.type, x.value]));
  const asUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour % 24, p.minute, p.second);
  return new Date(guess.getTime() - (asUtc - Math.floor(guess.getTime() / 1000) * 1000));
}

async function main() {
  if (!SLUG) throw new Error('Pass --restaurant <slug>');

  const [restaurant] = await db.$queryRaw`
    SELECT id, name, slug, timezone, "taxPercent" FROM restaurants WHERE slug = ${SLUG}`;
  if (!restaurant) throw new Error(`No restaurant with slug "${SLUG}"`);

  const tz = restaurant.timezone || 'Asia/Kolkata';
  const taxPercent = Number(restaurant.taxPercent);
  console.log(`\n  ${restaurant.name} (/${restaurant.slug})  ·  ${tz}  ·  ${taxPercent}% tax`);

  const tables = await db.$queryRaw`
    SELECT id, label FROM restaurant_tables WHERE "restaurantId" = ${restaurant.id} AND "isActive" = true`;
  if (!tables.length) throw new Error('This restaurant has no tables; add some before generating orders.');
  console.log(`  using ${tables.length} existing tables — QR codes untouched`);

  /* ── Menu ─────────────────────────────────────────────────────────── */

  const existingCats = await db.$queryRaw`
    SELECT c.id, c.name, count(m.id)::int AS items
    FROM categories c LEFT JOIN menu_items m ON m."categoryId" = c.id
    WHERE c."restaurantId" = ${restaurant.id} GROUP BY c.id`;
  const existingItems = await db.$queryRaw`
    SELECT id, name, "categoryId" FROM menu_items WHERE "restaurantId" = ${restaurant.id}`;
  const haveItem = new Map(existingItems.map((i) => [i.name.toLowerCase(), i]));
  const catByName = new Map(existingCats.map((c) => [c.name, c]));

  console.log(`\n  menu before: ${existingCats.length} categories, ${existingItems.length} items`);
  if (DRY) { console.log('  (dry run — nothing written)\n'); await db.$disconnect(); return; }

  let order = existingCats.length;
  const catIds = new Map();
  for (const [name, spec] of Object.entries(MENU)) {
    if (catByName.has(name)) { catIds.set(name, catByName.get(name).id); continue; }
    const id = cuid();
    await db.$executeRaw`
      INSERT INTO categories (id, "restaurantId", name, icon, "sortOrder", "isActive", "createdAt", "updatedAt")
      VALUES (${id}, ${restaurant.id}, ${name}, ${spec.icon}, ${order++}, true, now(), now())`;
    catIds.set(name, id);
  }

  const menuItems = [];
  for (const [catName, spec] of Object.entries(MENU)) {
    let sort = 0;
    for (const [name, description, basePrice, variants, spice] of spec.items) {
      const already = haveItem.get(name.toLowerCase());
      if (already) {
        // Keep the item they already made, but file it under the right category.
        await db.$executeRaw`UPDATE menu_items SET "categoryId" = ${catIds.get(catName)} WHERE id = ${already.id}`;
        const vs = await db.$queryRaw`SELECT label, price FROM menu_variants WHERE "menuItemId" = ${already.id}`;
        const [row] = await db.$queryRaw`SELECT "basePrice" FROM menu_items WHERE id = ${already.id}`;
        menuItems.push({
          id: already.id, name, categoryName: catName,
          basePrice: row.basePrice == null ? null : Number(row.basePrice),
          variants: vs.map((v) => ({ label: v.label, price: Number(v.price) })),
        });
        sort++;
        continue;
      }
      const id = cuid();
      await db.$executeRaw`
        INSERT INTO menu_items (id, "restaurantId", "categoryId", name, description, "basePrice",
          "isVeg", "isAvailable", "isFeatured", "spiceLevel", "prepTimeMins", "sortOrder",
          "timesOrdered", "createdAt", "updatedAt")
        VALUES (${id}, ${restaurant.id}, ${catIds.get(catName)}, ${name}, ${description},
          ${basePrice == null ? null : basePrice}, true, true, ${sort < 2}, ${spice},
          ${variants ? 15 : 8}, ${sort}, 0, now(), now())`;
      if (variants) {
        let vi = 0;
        for (const [label, price] of variants) {
          await db.$executeRaw`
            INSERT INTO menu_variants (id, "menuItemId", label, price, "sortOrder")
            VALUES (${cuid()}, ${id}, ${label}, ${price}, ${vi++})`;
        }
      }
      menuItems.push({
        id, name, categoryName: catName,
        basePrice, variants: (variants || []).map(([label, price]) => ({ label, price })),
      });
      sort++;
    }
  }
  console.log(`  menu after:  ${catIds.size} categories, ${menuItems.length} items`);

  // Starter categories left empty by onboarding just look unfinished on a demo.
  const emptied = await db.$queryRaw`
    SELECT c.id, c.name FROM categories c
    LEFT JOIN menu_items m ON m."categoryId" = c.id
    WHERE c."restaurantId" = ${restaurant.id} GROUP BY c.id HAVING count(m.id) = 0`;
  for (const c of emptied) {
    await db.$executeRaw`DELETE FROM categories WHERE id = ${c.id}`;
  }
  if (emptied.length) console.log(`  removed ${emptied.length} empty categories: ${emptied.map((c) => c.name).join(', ')}`);

  /* ── Coupons ──────────────────────────────────────────────────────── */
  let coupons = 0;
  for (const [code, description, type, value, min, max] of COUPONS) {
    const [dupe] = await db.$queryRaw`
      SELECT id FROM coupons WHERE "restaurantId" = ${restaurant.id} AND code = ${code}`;
    if (dupe) continue;
    await db.$executeRaw`
      INSERT INTO coupons (id, "restaurantId", code, description, "discountType", value,
        "minOrderAmount", "maxDiscount", "timesUsed", "validFrom", "isActive", "createdAt")
      VALUES (${cuid()}, ${restaurant.id}, ${code}, ${description}, ${type}::"DiscountType", ${value},
        ${min}, ${max}, 0, now(), true, now())`;
    coupons++;
  }
  console.log(`  coupons:     +${coupons}`);

  /* ── Orders ───────────────────────────────────────────────────────── */

  const [{ max: highest }] = await db.$queryRaw`
    SELECT COALESCE(MAX("orderNumber"), 0)::int AS max FROM orders WHERE "restaurantId" = ${restaurant.id}`;
  let orderNumber = highest;
  console.log(`  orders continue from #${highest + 1}`);

  const now = new Date();
  const nowHour = zonedHour(now, tz);
  const rows = [];
  const sold = new Map();

  const build = ({ placedAt, status, live }) => {
    const lineCount = chance(0.12) ? 4 + rand(3) : 1 + rand(3);
    const chosen = new Map();
    for (let i = 0; i < lineCount; i++) {
      const item = pick(menuItems);
      const variant = item.variants.length ? pick(item.variants) : null;
      const key = `${item.id}::${variant?.label ?? ''}`;
      if (chosen.has(key)) { chosen.get(key).quantity += 1; continue; }
      chosen.set(key, {
        menuItemId: item.id, nameSnapshot: item.name, categorySnapshot: item.categoryName,
        variantLabel: variant?.label ?? null,
        unitPrice: Number(variant ? variant.price : item.basePrice),
        quantity: chance(0.22) ? 2 : 1,
      });
    }
    const lines = [...chosen.values()]
      .filter((l) => Number.isFinite(l.unitPrice))
      .map((l) => ({ ...l, lineTotal: round2(l.unitPrice * l.quantity) }));
    if (!lines.length) return null;

    const subtotal = round2(lines.reduce((s, l) => s + l.lineTotal, 0));
    const taxAmount = round2((subtotal * taxPercent) / 100);
    const totalAmount = round2(subtotal + taxAmount);
    const itemCount = lines.reduce((s, l) => s + l.quantity, 0);

    const table = pick(tables);
    const accept = 1 + rand(4), prep = 8 + rand(18), serve = 3 + rand(8);
    const at = (m) => new Date(placedAt.getTime() + m * 60000);
    const stamp = (m) => (live && at(m) > now ? null : at(m));
    const reached = (s) => ['ACCEPTED','PREPARING','READY','COMPLETED'].indexOf(status)
                        >= ['ACCEPTED','PREPARING','READY','COMPLETED'].indexOf(s);

    if (status !== 'CANCELLED') {
      for (const l of lines) sold.set(l.menuItemId, (sold.get(l.menuItemId) || 0) + l.quantity);
    }
    return {
      id: cuid(), orderNumber: ++orderNumber,
      tableId: table.id, tableLabel: table.label,
      customerName: pick(NAMES),
      customerPhone: chance(0.75) ? `9${String(100000000 + rand(899999999)).slice(0, 9)}` : null,
      notes: pick(NOTES), status,
      subtotal, taxPercent, taxAmount, totalAmount, itemCount,
      isPaid: status === 'COMPLETED',
      paidAt: status === 'COMPLETED' ? at(accept + prep + serve) : null,
      placedAt,
      acceptedAt: status !== 'PLACED' && status !== 'CANCELLED' ? stamp(accept) : null,
      readyAt: reached('READY') ? stamp(accept + prep) : null,
      completedAt: status === 'COMPLETED' ? at(accept + prep + serve) : null,
      cancelledAt: status === 'CANCELLED' ? at(accept) : null,
      cancelReason: status === 'CANCELLED' ? pick(CANCEL_REASONS) : null,
      lines,
    };
  };

  for (let back = DAYS; back >= 0; back--) {
    const key = zonedDateKey(new Date(now.getTime() - back * 86400000), tz);
    const dayStart = isoToUtc(`${key}T00:00:00`, tz);
    const dow = new Date(`${key}T12:00:00Z`).getUTCDay();
    const weekend = dow === 0 || dow === 6 ? 1.45 : dow === 5 ? 1.2 : 1;
    const growth = 1 + ((DAYS - back) / DAYS) * 0.35;
    const noise = 0.75 + Math.random() * 0.5;

    const today = back === 0;
    const total = HOUR_WEIGHTS.reduce((a, b) => a + b, 0);
    const elapsed = HOUR_WEIGHTS.slice(0, nowHour + 1).reduce((a, b) => a + b, 0);
    const fraction = today ? elapsed / total : 1;
    const count = Math.max(today ? 0 : 1, Math.round(PER_DAY * weekend * growth * noise * fraction));

    for (let i = 0; i < count; i++) {
      const hour = today ? weightedHour(nowHour) : weightedHour();
      const placedAt = new Date(dayStart.getTime() + (hour * 60 + rand(60)) * 60000 + rand(60) * 1000);
      if (placedAt > now) continue;
      const row = build({ placedAt, status: chance(0.045) ? 'CANCELLED' : 'COMPLETED' });
      if (row) rows.push(row);
    }
  }

  // A few still moving, so the live board has something on it during the demo.
  for (const status of ['PLACED', 'PLACED', 'ACCEPTED', 'PREPARING', 'PREPARING', 'READY']) {
    const row = build({ placedAt: new Date(now.getTime() - (2 + rand(70)) * 60000), status, live: true });
    if (row) rows.push(row);
  }

  rows.sort((a, b) => a.placedAt - b.placedAt);
  rows.forEach((r, i) => { r.orderNumber = highest + 1 + i; });

  /**
   * Batched, because a remote database makes round trips the whole cost: one
   * statement per row meant thousands of Singapore round trips and a run that
   * never finished. Postgres caps a statement at 65535 parameters, so the batch
   * sizes below stay well inside that.
   */
  async function bulk(table, columns, values, rowsPer) {
    if (!values.length) return;
    const width = columns.length;
    for (let i = 0; i < values.length; i += rowsPer) {
      const slice = values.slice(i, i + rowsPer);
      const tuples = slice.map((row, r) =>
        `(${row.map((_, c) => {
          const n = r * width + c + 1;
          return columns[c].cast ? `$${n}::"${columns[c].cast}"` : `$${n}`;
        }).join(',')})`).join(',');
      await db.$executeRawUnsafe(
        `INSERT INTO ${table} (${columns.map((c) => `"${c.name}"`).join(',')}) VALUES ${tuples}`,
        ...slice.flat()
      );
      process.stdout.write(`\r  ${table}: ${Math.min(i + rowsPer, values.length)}/${values.length}   `);
    }
    process.stdout.write('\n');
  }

  await bulk('orders', [
    { name: 'id' }, { name: 'restaurantId' }, { name: 'orderNumber' }, { name: 'tableId' },
    { name: 'tableLabel' }, { name: 'customerName' }, { name: 'customerPhone' }, { name: 'notes' },
    { name: 'status', cast: 'OrderStatus' }, { name: 'subtotal' }, { name: 'taxPercent' },
    { name: 'taxAmount' }, { name: 'discountAmount' }, { name: 'totalAmount' }, { name: 'itemCount' },
    { name: 'isPaid' }, { name: 'paidAt' }, { name: 'payMethod', cast: 'PaymentMethod' },
    { name: 'placedAt' }, { name: 'acceptedAt' }, { name: 'readyAt' }, { name: 'completedAt' },
    { name: 'cancelledAt' }, { name: 'cancelReason' },
  ], rows.map((o) => [
    o.id, restaurant.id, o.orderNumber, o.tableId, o.tableLabel, o.customerName, o.customerPhone,
    o.notes, o.status, o.subtotal, o.taxPercent, o.taxAmount, 0, o.totalAmount, o.itemCount,
    o.isPaid, o.paidAt, 'CASH', o.placedAt, o.acceptedAt, o.readyAt, o.completedAt,
    o.cancelledAt, o.cancelReason,
  ]), 100);

  await bulk('order_items', [
    { name: 'id' }, { name: 'orderId' }, { name: 'menuItemId' }, { name: 'nameSnapshot' },
    { name: 'categorySnapshot' }, { name: 'variantLabel' }, { name: 'unitPrice' },
    { name: 'quantity' }, { name: 'lineTotal' },
  ], rows.flatMap((o) => o.lines.map((l) => [
    cuid(), o.id, l.menuItemId, l.nameSnapshot, l.categorySnapshot, l.variantLabel,
    l.unitPrice, l.quantity, l.lineTotal,
  ])), 400);

  const events = [];
  for (const o of rows) {
    events.push([cuid(), o.id, null, 'PLACED', o.customerName, 'Order placed', o.placedAt]);
    if (o.acceptedAt) events.push([cuid(), o.id, 'PLACED', 'ACCEPTED', 'Kitchen', null, o.acceptedAt]);
    if (o.completedAt) events.push([cuid(), o.id, 'READY', 'COMPLETED', 'Kitchen', null, o.completedAt]);
    if (o.cancelledAt) events.push([cuid(), o.id, 'PLACED', 'CANCELLED', 'Kitchen', o.cancelReason, o.cancelledAt]);
  }
  await bulk('order_events', [
    { name: 'id' }, { name: 'orderId' }, { name: 'fromStatus', cast: 'OrderStatus' },
    { name: 'toStatus', cast: 'OrderStatus' }, { name: 'byName' }, { name: 'note' }, { name: 'createdAt' },
  ], events, 400);

  console.log(`  orders:      +${rows.length}`);

  if (sold.size) {
    const pairs = [...sold.entries()];
    await db.$executeRawUnsafe(
      `UPDATE menu_items SET "timesOrdered" = "timesOrdered" + v.qty
       FROM (VALUES ${pairs.map((_, i) => `($${i * 2 + 1}, $${i * 2 + 2}::int)`).join(',')}) AS v(id, qty)
       WHERE menu_items.id = v.id`,
      ...pairs.flat()
    );
  }

  console.log('\n  Done. Settings, staff logins and table QR codes were not touched.\n');
}

main()
  .catch((e) => { console.error('\n  ✗', e.message, '\n'); process.exit(1); })
  .finally(() => db.$disconnect());
