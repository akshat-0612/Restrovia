/**
 * Seeds the platform with:
 *   • a platform-admin (vendor) account
 *   • "Delight Food" — the first client, with its real menu
 *   • a second demo tenant, to prove tenant isolation with one command
 *   • ~90 days of realistic order history so the analytics screens have shape
 *
 * Safe to re-run: it wipes and recreates the seeded tenants only.
 */
import 'dotenv/config';
import bcrypt from 'bcryptjs';
import { PrismaClient } from '@prisma/client';
import { computeTotals, round2 } from '../src/lib/money.js';
import { isoToUtc, zonedDateKey, zonedHour } from '../src/lib/time.js';

const prisma = new PrismaClient();

const DELIGHT_MENU = {
  'Chinese': { icon: '🍜', items: [
    ['Veg Fried Rice',    'Wok-tossed rice with fresh vegetables and soy sauce',       null, [['Half', 80], ['Full', 150]], true,  1],
    ['Veg Hakka Noodles', 'Stir-fried noodles with veggies in soy-chilli sauce',       null, [['Half', 80], ['Full', 150]], true,  1],
    ['Manchurian Dry',    'Crispy veg balls tossed in a tangy Manchurian sauce',       null, [['Half', 90], ['Full', 170]], true,  2],
    ['Spring Rolls',      'Crispy rolls stuffed with spiced mixed vegetables',           80, null,                          true,  1],
    ['Chilli Paneer',     'Soft paneer cubes tossed in a spicy Chinese sauce',         null, [['Half', 110], ['Full', 200]], true, 2],
  ]},
  'Snacks': { icon: '🥪', items: [
    ['Veg Sandwich',     'Fresh vegetables and chutney between toasted bread',   60, null, true, 0],
    ['Grilled Sandwich', 'Grilled to order with cheese and garden veggies',      70, null, true, 0],
    ['French Fries',     'Golden, crisp and salted just right',                  70, null, true, 0],
    ['Pav Bhaji',        'Buttery pav with rich, spiced mashed vegetables',      90, null, true, 2],
    ['Samosa',           'Flaky pastry with a spiced potato filling',            25, null, true, 1],
    ['Bread Pakora',     'Deep-fried bread fritter with a potato centre',        40, null, true, 1],
  ]},
  'Pasta & Maggie': { icon: '🍝', items: [
    ['Red Sauce Pasta',   'Penne in a herbed tomato sauce',              null, [['Half', 90], ['Full', 160]],  true, 1],
    ['White Sauce Pasta', 'Creamy béchamel with garlic and herbs',       null, [['Half', 100], ['Full', 175]], true, 0],
    ['Masala Maggie',     'The classic, with our own masala blend',        60, null,                           true, 1],
    ['Cheese Maggie',     'Masala maggie loaded with melted cheese',       75, null,                           true, 1],
  ]},
  'Chai & Coffee': { icon: '☕', items: [
    ['Masala Chai', 'Slow-brewed with ginger, cardamom and clove', 25, null, true, 0],
    ['Ginger Chai', 'Strong, gingery and served piping hot',       25, null, true, 0],
    ['Cappuccino',  'Espresso topped with velvety steamed milk',   80, null, true, 0],
    ['Café Latte',  'Smooth espresso with generous steamed milk',  90, null, true, 0],
    ['Cold Coffee', 'Chilled, frothy and lightly sweetened',       90, null, true, 0],
  ]},
  'Shakes & Cold Coffee': { icon: '🥤', items: [
    ['Chocolate Shake',            'Thick shake with real cocoa',                 110, null, true, 0],
    ['Strawberry Shake',           'Fresh strawberry blended with cold milk',     110, null, true, 0],
    ['Mango Shake',                'Seasonal alphonso, blended thick',            120, null, true, 0],
    ['Oreo Shake',                 'Cookies and cream, blended and topped',       130, null, true, 0],
    ['Cold Coffee with Ice Cream', 'Cold coffee crowned with vanilla ice cream',  120, null, true, 0],
  ]},
  'Soft Drinks': { icon: '🧃', items: [
    ['Coca Cola',    'Chilled 300ml bottle', 40, null, true, 0],
    ['Sprite',       'Chilled 300ml bottle', 40, null, true, 0],
    ['Mango Frooti', 'Chilled 200ml pack',   20, null, true, 0],
    ['Limca',        'Chilled 300ml bottle', 40, null, true, 0],
  ]},
  'Water': { icon: '💧', items: [
    ['Mineral Water 500ml', 'Sealed bottle', 15, null, true, 0],
    ['Mineral Water 1L',    'Sealed bottle', 20, null, true, 0],
  ]},
};

const DEMO_MENU = {
  'Pizzas': { icon: '🍕', items: [
    ['Margherita',      'Tomato, mozzarella and basil',            null, [['7"', 199], ['12"', 349]], true, 0],
    ['Farmhouse',       'Onion, capsicum, tomato and mushroom',    null, [['7"', 249], ['12"', 429]], true, 1],
    ['Peri Peri Paneer','Paneer tossed in peri peri spice',        null, [['7"', 269], ['12"', 459]], true, 2],
  ]},
  'Burgers': { icon: '🍔', items: [
    ['Classic Veg Burger', 'Crisp patty, lettuce and mayo',   119, null, true, 0],
    ['Cheese Burst Burger','Double cheese, double happiness', 169, null, true, 1],
  ]},
  'Beverages': { icon: '🥤', items: [
    ['Iced Tea',     'Lemon and mint',        79, null, true, 0],
    ['Fresh Lime Soda', 'Sweet, salt or mixed', 69, null, true, 0],
  ]},
};

const CUSTOMER_NAMES = [
  'Aarav Sharma', 'Diya Patel', 'Vivaan Reddy', 'Ananya Iyer', 'Aditya Nair',
  'Ishaan Gupta', 'Saanvi Joshi', 'Kabir Mehta', 'Myra Desai', 'Reyansh Rao',
  'Anika Bose', 'Arjun Malhotra', 'Kiara Kulkarni', 'Vihaan Shetty', 'Navya Menon',
  'Rohan Kapoor', 'Aisha Khan', 'Dhruv Chauhan', 'Tara Pillai', 'Neel Bhatt',
];

const CANCEL_REASONS = [
  'Customer left before the order was served',
  'Item unavailable in the kitchen',
  'Duplicate order placed by mistake',
  'Customer changed their mind',
];

const ORDER_NOTES = [
  null, null, null, null, null,
  'Less spicy please', 'No onion', 'Extra cheese', 'Pack it to go',
  'Serve the drinks first', 'Birthday — please add a candle',
];

const rand   = (n) => Math.floor(Math.random() * n);
const pick   = (arr) => arr[rand(arr.length)];
const chance = (p) => Math.random() < p;

/**
 * Café footfall is not uniform — it peaks at breakfast, lunch and evening tea.
 * Weighting the hour of day makes the "peak hours" chart tell a true story.
 */
const HOUR_WEIGHTS = [
  0, 0, 0, 0, 0, 0, 0, 1, 3, 5, 6, 9,      // 00–11
  14, 16, 11, 7, 9, 14, 18, 20, 15, 9, 4, 1, // 12–23
];

/** Draws an hour from the footfall curve, optionally capped at `maxHour`. */
function weightedHour(maxHour = 23) {
  const weights = HOUR_WEIGHTS.slice(0, maxHour + 1);
  const total = weights.reduce((a, b) => a + b, 0);
  if (total === 0) return maxHour;
  let roll = Math.random() * total;
  for (let h = 0; h < weights.length; h++) {
    roll -= weights[h];
    if (roll <= 0) return h;
  }
  return maxHour;
}

async function createTenantMenu(restaurantId, menuSpec) {
  const created = [];
  let catIndex = 0;
  for (const [categoryName, spec] of Object.entries(menuSpec)) {
    const category = await prisma.category.create({
      data: { restaurantId, name: categoryName, icon: spec.icon, sortOrder: catIndex++ },
    });
    let itemIndex = 0;
    for (const [name, description, basePrice, variants, isVeg, spiceLevel] of spec.items) {
      const item = await prisma.menuItem.create({
        data: {
          restaurantId, categoryId: category.id, name, description,
          basePrice, isVeg, spiceLevel, sortOrder: itemIndex++,
          prepTimeMins: variants ? 15 : 8,
          isFeatured: itemIndex <= 2 && catIndex <= 3,
          variants: variants
            ? { create: variants.map(([label, price], i) => ({ label, price, sortOrder: i })) }
            : undefined,
        },
        include: { variants: true },
      });
      created.push({ ...item, categoryName });
    }
  }
  return created;
}

/**
 * Generates order history working backwards from today. Volume trends gently
 * upward and weekends run busier, so growth charts have a believable slope.
 *
 * Days are bucketed in the restaurant's own timezone, not the seeding machine's
 * — otherwise "today" on the dashboard and "today" in the data disagree whenever
 * the two zones differ.
 */
async function generateOrders(restaurant, menuItems, tables, { days, baseOrdersPerDay }) {
  const tz = restaurant.timezone || 'Asia/Kolkata';
  const taxPercent = Number(restaurant.taxPercent);
  const now = new Date();
  const nowHour = zonedHour(now, tz);
  let orderNumber = 0;
  const rows = [];
  const itemCounters = new Map();

  const buildOrder = ({ placedAt, status, forceLive }) => {
    // Basket size skews small; a few large table orders create a realistic tail.
    const lineCount = chance(0.12) ? 4 + rand(3) : 1 + rand(3);
    const chosen = new Map();
    for (let l = 0; l < lineCount; l++) {
      const item = pick(menuItems);
      const variant = item.variants.length ? pick(item.variants) : null;
      const key = `${item.id}::${variant?.label ?? ''}`;
      if (chosen.has(key)) { chosen.get(key).quantity += 1; continue; }
      chosen.set(key, {
        menuItemId: item.id,
        nameSnapshot: item.name,
        categorySnapshot: item.categoryName,
        variantLabel: variant?.label ?? null,
        unitPrice: Number(variant ? variant.price : item.basePrice),
        quantity: chance(0.22) ? 2 : 1,
      });
    }

    const lineItems = [...chosen.values()].map((li) => ({
      ...li, lineTotal: round2(li.unitPrice * li.quantity),
    }));
    const totals = computeTotals({ lineItems, taxPercent });
    const table = tables.length ? pick(tables) : null;

    const acceptMins = 1 + rand(4);
    const prepMins   = 8 + rand(18);
    const serveMins  = 3 + rand(8);
    const at = (mins) => new Date(placedAt.getTime() + mins * 60000);

    const PIPELINE = ['ACCEPTED', 'PREPARING', 'READY', 'COMPLETED'];
    const reached = (s) => PIPELINE.indexOf(status) >= PIPELINE.indexOf(s);

    // A live order has only progressed as far as the clock allows.
    const stamp = (mins) => (forceLive && at(mins) > now ? null : at(mins));

    const order = {
      restaurantId: restaurant.id,
      orderNumber: ++orderNumber,
      tableId: table?.id ?? null,
      tableLabel: table?.label ?? null,
      customerName: pick(CUSTOMER_NAMES),
      customerPhone: chance(0.75) ? `9${String(100000000 + rand(899999999)).slice(0, 9)}` : null,
      notes: pick(ORDER_NOTES),
      status,
      subtotal: totals.subtotal,
      taxPercent,
      taxAmount: totals.taxAmount,
      discountAmount: 0,
      totalAmount: totals.totalAmount,
      itemCount: totals.itemCount,
      isPaid: status === 'COMPLETED',
      paidAt: status === 'COMPLETED' ? at(acceptMins + prepMins + serveMins) : null,
      placedAt,
      acceptedAt: status !== 'PLACED' && status !== 'CANCELLED' ? stamp(acceptMins) : null,
      readyAt: reached('READY') ? stamp(acceptMins + prepMins) : null,
      completedAt: status === 'COMPLETED' ? at(acceptMins + prepMins + serveMins) : null,
      cancelledAt: status === 'CANCELLED' ? at(acceptMins) : null,
      cancelReason: status === 'CANCELLED' ? pick(CANCEL_REASONS) : null,
      _lineItems: lineItems,
    };

    if (status !== 'CANCELLED') {
      for (const li of lineItems) {
        itemCounters.set(li.menuItemId, (itemCounters.get(li.menuItemId) || 0) + li.quantity);
      }
    }
    return order;
  };

  for (let dayOffset = days; dayOffset >= 0; dayOffset--) {
    const dateKey = zonedDateKey(new Date(now.getTime() - dayOffset * 86400000), tz);
    const dayStart = isoToUtc(`${dateKey}T00:00:00`, tz);
    const dow = new Date(`${dateKey}T12:00:00Z`).getUTCDay();

    const weekendBoost = dow === 0 || dow === 6 ? 1.45 : dow === 5 ? 1.2 : 1;
    const growth = 1 + ((days - dayOffset) / days) * 0.35;
    const noise = 0.75 + Math.random() * 0.5;

    // Today is only partly over, so scale it by the share of the day's usual
    // footfall that has already happened. Without this, "today vs yesterday"
    // always looks like a collapse.
    const isToday = dayOffset === 0;
    const totalWeight = HOUR_WEIGHTS.reduce((a, b) => a + b, 0);
    const elapsedWeight = HOUR_WEIGHTS.slice(0, nowHour + 1).reduce((a, b) => a + b, 0);
    const dayFraction = isToday ? elapsedWeight / totalWeight : 1;

    const count = Math.max(
      isToday ? 0 : 1,
      Math.round(baseOrdersPerDay * weekendBoost * growth * noise * dayFraction)
    );

    for (let i = 0; i < count; i++) {
      const hour = isToday ? weightedHour(nowHour) : weightedHour();
      const placedAt = new Date(dayStart.getTime() + (hour * 60 + rand(60)) * 60000 + rand(60) * 1000);
      if (placedAt > now) continue;

      const status = chance(0.045) ? 'CANCELLED' : 'COMPLETED';
      rows.push(buildOrder({ placedAt, status }));
    }
  }

  // A handful of orders still moving through the kitchen, so the live board has
  // something on it the moment the owner signs in — whatever time you seed at.
  const liveStatuses = ['PLACED', 'PLACED', 'ACCEPTED', 'PREPARING', 'PREPARING', 'READY'];
  for (const status of liveStatuses) {
    const minutesAgo = 2 + rand(70);
    rows.push(buildOrder({
      placedAt: new Date(now.getTime() - minutesAgo * 60000),
      status,
      forceLive: true,
    }));
  }

  rows.sort((a, b) => a.placedAt - b.placedAt);
  rows.forEach((r, i) => { r.orderNumber = i + 1; });

  // Insert in batches — a single createMany of thousands of rows is slower and
  // gives no progress signal during seeding.
  const BATCH = 200;
  for (let i = 0; i < rows.length; i += BATCH) {
    const batch = rows.slice(i, i + BATCH);
    await prisma.$transaction(
      batch.map(({ _lineItems, ...order }) =>
        prisma.order.create({
          data: {
            ...order,
            items: { create: _lineItems },
            events: {
              create: [
                { toStatus: 'PLACED', byName: order.customerName, note: 'Order placed', createdAt: order.placedAt },
                ...(order.acceptedAt ? [{ fromStatus: 'PLACED', toStatus: 'ACCEPTED', byName: 'Kitchen', createdAt: order.acceptedAt }] : []),
                ...(order.completedAt ? [{ fromStatus: 'READY', toStatus: 'COMPLETED', byName: 'Kitchen', createdAt: order.completedAt }] : []),
                ...(order.cancelledAt ? [{ fromStatus: 'PLACED', toStatus: 'CANCELLED', byName: 'Kitchen', note: order.cancelReason, createdAt: order.cancelledAt }] : []),
              ],
            },
          },
        })
      )
    );
    process.stdout.write(`\r      orders: ${Math.min(i + BATCH, rows.length)}/${rows.length}`);
  }
  process.stdout.write('\n');

  await Promise.all(
    [...itemCounters.entries()].map(([id, qty]) =>
      prisma.menuItem.update({ where: { id }, data: { timesOrdered: qty } })
    )
  );

  return rows.length;
}

async function seedRestaurant(config) {
  console.log(`\n  ▸ ${config.name}`);

  await prisma.restaurant.deleteMany({ where: { slug: config.slug } });

  const restaurant = await prisma.restaurant.create({ data: config.restaurant });
  console.log(`      restaurant  ✓  /${restaurant.slug}`);

  for (const u of config.users) {
    await prisma.user.create({
      data: {
        restaurantId: restaurant.id,
        name: u.name, email: u.email.toLowerCase(), role: u.role,
        phone: u.phone ?? null,
        passwordHash: await bcrypt.hash(u.password, 10),
      },
    });
  }
  console.log(`      users       ✓  ${config.users.length}`);

  const menuItems = await createTenantMenu(restaurant.id, config.menu);
  console.log(`      menu        ✓  ${menuItems.length} items`);

  await prisma.restaurantTable.createMany({
    data: Array.from({ length: config.tableCount }, (_, i) => ({
      restaurantId: restaurant.id,
      label: `T${i + 1}`,
      seats: i % 4 === 3 ? 6 : 4,
    })),
  });
  const tables = await prisma.restaurantTable.findMany({ where: { restaurantId: restaurant.id } });
  console.log(`      tables      ✓  ${tables.length}`);

  if (config.coupons?.length) {
    await prisma.coupon.createMany({
      data: config.coupons.map((c) => ({ ...c, restaurantId: restaurant.id })),
    });
    console.log(`      coupons     ✓  ${config.coupons.length}`);
  }

  const count = await generateOrders(restaurant, menuItems, tables, config.history);
  console.log(`      orders      ✓  ${count}`);

  return restaurant;
}

async function main() {
  console.log('\n╭───────────────────────────────────────────╮');
  console.log('│  Seeding Delightful                       │');
  console.log('╰───────────────────────────────────────────╯');

  // ── Platform admin (the vendor account, no restaurant) ──
  const platformEmail = (process.env.SEED_PLATFORM_EMAIL || 'platform@delightful.app').toLowerCase();
  await prisma.user.deleteMany({ where: { restaurantId: null, email: platformEmail } });
  await prisma.user.create({
    data: {
      name: 'Platform Admin',
      email: platformEmail,
      role: 'PLATFORM_ADMIN',
      passwordHash: await bcrypt.hash(process.env.SEED_PLATFORM_PASSWORD || 'platform123', 10),
    },
  });
  console.log(`\n  ▸ Platform\n      admin       ✓  ${platformEmail}`);

  await seedRestaurant({
    name: 'Delight Food',
    slug: 'delight-food',
    restaurant: {
      slug: 'delight-food',
      name: 'Delight Food',
      tagline: 'Fresh, fast and full of flavour',
      logoEmoji: '🍽️',
      primaryColor: '#e8552d',
      accentColor: '#f5b301',
      phone: '+91 98765 43210',
      email: 'hello@delightfood.in',
      address: '14 MG Road, Camp',
      city: 'Pune',
      gstNumber: '27AABCD1234E1Z5',
      taxPercent: 5,
      taxLabel: 'GST',
      avgPrepTimeMins: 15,
      openingTime: '08:00',
      closingTime: '23:00',
      plan: 'GROWTH',
    },
    users: [
      { name: 'Rahul Deshmukh', email: process.env.SEED_OWNER_EMAIL || 'owner@delightfood.in', password: process.env.SEED_OWNER_PASSWORD || 'owner123', role: 'OWNER', phone: '+91 98765 43210' },
      { name: 'Priya Nair',     email: 'manager@delightfood.in', password: 'manager123', role: 'MANAGER' },
      { name: 'Sameer Khan',    email: 'staff@delightfood.in',   password: 'staff123',   role: 'STAFF' },
    ],
    menu: DELIGHT_MENU,
    tableCount: 14,
    coupons: [
      { code: 'WELCOME10', description: '10% off your first order', discountType: 'PERCENT', value: 10, minOrderAmount: 200, maxDiscount: 100 },
      { code: 'CHAI20',    description: 'Flat ₹20 off on orders above ₹150', discountType: 'FLAT', value: 20, minOrderAmount: 150 },
      { code: 'FEAST15',   description: '15% off on orders above ₹500', discountType: 'PERCENT', value: 15, minOrderAmount: 500, maxDiscount: 200 },
    ],
    history: { days: 90, baseOrdersPerDay: 22 },
  });

  // A second tenant proves the isolation story end to end — same database,
  // completely separate menu, staff, tables and numbers.
  await seedRestaurant({
    name: 'Urban Slice (demo tenant)',
    slug: 'urban-slice',
    restaurant: {
      slug: 'urban-slice',
      name: 'Urban Slice',
      tagline: 'Wood-fired, every time',
      logoEmoji: '🍕',
      primaryColor: '#c2410c',
      accentColor: '#facc15',
      phone: '+91 90000 11111',
      city: 'Bengaluru',
      taxPercent: 5,
      plan: 'STARTER',
    },
    users: [
      { name: 'Meera Rao', email: 'owner@urbanslice.in', password: 'owner123', role: 'OWNER' },
    ],
    menu: DEMO_MENU,
    tableCount: 8,
    history: { days: 45, baseOrdersPerDay: 9 },
  });

  console.log('\n╭───────────────────────────────────────────╮');
  console.log('│  Sign in                                  │');
  console.log('├───────────────────────────────────────────┤');
  console.log('│  Platform  platform@delightful.app        │');
  console.log('│            platform123                    │');
  console.log('│  Owner     owner@delightfood.in           │');
  console.log('│            owner123                       │');
  console.log('│  Manager   manager@delightfood.in         │');
  console.log('│            manager123                     │');
  console.log('│  Staff     staff@delightfood.in           │');
  console.log('│            staff123                       │');
  console.log('╰───────────────────────────────────────────╯\n');
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
