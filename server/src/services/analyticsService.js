import { prisma } from '../lib/prisma.js';
import { round2 } from '../lib/money.js';
import { resolveRange } from '../lib/time.js';

// Revenue counts every order that was not cancelled — money the restaurant will
// collect, including orders still cooking. Cancelled orders are reported
// separately rather than silently dropped. Every query below spells this as
// `status <> 'CANCELLED'`.

const num = (v) => (v == null ? 0 : Number(v));

/** Percent change vs the previous period. Null when there's no baseline to compare against. */
function delta(current, previous) {
  if (previous == null || previous === 0) return current > 0 ? null : 0;
  return round2(((current - previous) / previous) * 100);
}

// Prisma stores DateTime as `timestamp` in UTC, so reporting in the restaurant's
// local day means re-anchoring to UTC first ("AT TIME ZONE 'UTC'") and then
// converting into the restaurant's zone. That pairing appears in every bucketed
// query below.

async function headlineFor(restaurantId, from, to) {
  const [row] = await prisma.$queryRaw`
    SELECT
      COALESCE(SUM("totalAmount") FILTER (WHERE status <> 'CANCELLED'), 0)  AS revenue,
      COALESCE(SUM("subtotal")    FILTER (WHERE status <> 'CANCELLED'), 0)  AS net_sales,
      COALESCE(SUM("taxAmount")   FILTER (WHERE status <> 'CANCELLED'), 0)  AS tax_collected,
      COALESCE(SUM("discountAmount") FILTER (WHERE status <> 'CANCELLED'), 0) AS discounts,
      COUNT(*) FILTER (WHERE status <> 'CANCELLED')                         AS orders,
      COUNT(*) FILTER (WHERE status =  'CANCELLED')                         AS cancelled,
      COALESCE(SUM("itemCount") FILTER (WHERE status <> 'CANCELLED'), 0)    AS items_sold,
      COUNT(DISTINCT COALESCE("customerPhone", "customerName"))
        FILTER (WHERE status <> 'CANCELLED')                                AS customers,
      COALESCE(SUM("totalAmount") FILTER (WHERE "isPaid"), 0)               AS collected
    FROM orders
    WHERE "restaurantId" = ${restaurantId}
      AND "placedAt" >= ${from} AND "placedAt" < ${to}
  `;

  const orders = Number(row.orders);
  return {
    revenue: round2(num(row.revenue)),
    netSales: round2(num(row.net_sales)),
    taxCollected: round2(num(row.tax_collected)),
    discounts: round2(num(row.discounts)),
    orders,
    cancelled: Number(row.cancelled),
    itemsSold: Number(row.items_sold),
    customers: Number(row.customers),
    collected: round2(num(row.collected)),
    avgOrderValue: orders ? round2(num(row.revenue) / orders) : 0,
    avgItemsPerOrder: orders ? round2(Number(row.items_sold) / orders) : 0,
  };
}

/** Median prep time (placed → ready) in minutes, plus the p90 tail. */
async function prepTimeStats(restaurantId, from, to) {
  const [row] = await prisma.$queryRaw`
    SELECT
      PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY EXTRACT(EPOCH FROM ("readyAt" - "placedAt")) / 60) AS median,
      PERCENTILE_CONT(0.9) WITHIN GROUP (ORDER BY EXTRACT(EPOCH FROM ("readyAt" - "placedAt")) / 60) AS p90,
      AVG(EXTRACT(EPOCH FROM ("acceptedAt" - "placedAt")) / 60)                                      AS avg_accept
    FROM orders
    WHERE "restaurantId" = ${restaurantId}
      AND "placedAt" >= ${from} AND "placedAt" < ${to}
      AND "readyAt" IS NOT NULL
  `;
  return {
    medianPrepMins: row.median == null ? null : round2(num(row.median)),
    p90PrepMins: row.p90 == null ? null : round2(num(row.p90)),
    avgAcceptMins: row.avg_accept == null ? null : round2(num(row.avg_accept)),
  };
}

/** Revenue over time — hourly buckets for a single day, daily buckets otherwise. */
async function timeseries(restaurantId, from, to, tz) {
  const spanDays = (to - from) / 86400000;
  const grain = spanDays <= 1.5 ? 'hour' : spanDays <= 120 ? 'day' : 'week';

  const rows = await prisma.$queryRawUnsafe(
    `
    SELECT
      date_trunc($4, ("placedAt" AT TIME ZONE 'UTC' AT TIME ZONE $3)) AS bucket,
      COALESCE(SUM("totalAmount") FILTER (WHERE status <> 'CANCELLED'), 0) AS revenue,
      COUNT(*) FILTER (WHERE status <> 'CANCELLED') AS orders
    FROM orders
    WHERE "restaurantId" = $1 AND "placedAt" >= $2::timestamp AND "placedAt" < $5::timestamp
    GROUP BY 1 ORDER BY 1 ASC
    `,
    restaurantId, from, tz, grain, to
  );

  return {
    grain,
    points: rows.map((r) => ({
      bucket: r.bucket instanceof Date ? r.bucket.toISOString() : String(r.bucket),
      revenue: round2(num(r.revenue)),
      orders: Number(r.orders),
    })),
  };
}

/** Best sellers, ranked by revenue, with quantity alongside. */
async function topItems(restaurantId, from, to, limit = 10) {
  const rows = await prisma.$queryRaw`
    SELECT
      oi."nameSnapshot"     AS name,
      oi."categorySnapshot" AS category,
      SUM(oi."quantity")::int AS qty,
      SUM(oi."lineTotal")   AS revenue,
      COUNT(DISTINCT oi."orderId")::int AS order_count
    FROM order_items oi
    JOIN orders o ON o.id = oi."orderId"
    WHERE o."restaurantId" = ${restaurantId}
      AND o."placedAt" >= ${from} AND o."placedAt" < ${to}
      AND o.status <> 'CANCELLED'
    GROUP BY 1, 2
    ORDER BY revenue DESC
    LIMIT ${limit}
  `;
  return rows.map((r) => ({
    name: r.name, category: r.category,
    quantity: Number(r.qty), revenue: round2(num(r.revenue)), orderCount: Number(r.order_count),
  }));
}

/** Revenue share by category — where the money actually comes from. */
async function categoryMix(restaurantId, from, to) {
  const rows = await prisma.$queryRaw`
    SELECT
      oi."categorySnapshot" AS category,
      SUM(oi."quantity")::int AS qty,
      SUM(oi."lineTotal")   AS revenue
    FROM order_items oi
    JOIN orders o ON o.id = oi."orderId"
    WHERE o."restaurantId" = ${restaurantId}
      AND o."placedAt" >= ${from} AND o."placedAt" < ${to}
      AND o.status <> 'CANCELLED'
    GROUP BY 1 ORDER BY revenue DESC
  `;
  const total = rows.reduce((s, r) => s + num(r.revenue), 0);
  return rows.map((r) => ({
    category: r.category,
    quantity: Number(r.qty),
    revenue: round2(num(r.revenue)),
    share: total ? round2((num(r.revenue) / total) * 100) : 0,
  }));
}

/** Orders and revenue by hour of day — tells the owner when to roster staff. */
async function hourlyPattern(restaurantId, from, to, tz) {
  const rows = await prisma.$queryRawUnsafe(
    `
    SELECT
      EXTRACT(HOUR FROM ("placedAt" AT TIME ZONE 'UTC' AT TIME ZONE $3))::int AS hour,
      COUNT(*)::int AS orders,
      COALESCE(SUM("totalAmount"), 0) AS revenue
    FROM orders
    WHERE "restaurantId" = $1 AND "placedAt" >= $2::timestamp AND "placedAt" < $4::timestamp
      AND status <> 'CANCELLED'
    GROUP BY 1 ORDER BY 1
    `,
    restaurantId, from, tz, to
  );
  const byHour = new Map(rows.map((r) => [Number(r.hour), r]));
  return Array.from({ length: 24 }, (_, h) => ({
    hour: h,
    orders: byHour.has(h) ? Number(byHour.get(h).orders) : 0,
    revenue: byHour.has(h) ? round2(num(byHour.get(h).revenue)) : 0,
  }));
}

/** Orders by day of week, averaged — the weekly rhythm of the business. */
async function weekdayPattern(restaurantId, from, to, tz) {
  const rows = await prisma.$queryRawUnsafe(
    `
    SELECT
      EXTRACT(DOW FROM ("placedAt" AT TIME ZONE 'UTC' AT TIME ZONE $3))::int AS dow,
      COUNT(*)::int AS orders,
      COALESCE(SUM("totalAmount"), 0) AS revenue,
      COUNT(DISTINCT date_trunc('day', ("placedAt" AT TIME ZONE 'UTC' AT TIME ZONE $3)))::int AS days
    FROM orders
    WHERE "restaurantId" = $1 AND "placedAt" >= $2::timestamp AND "placedAt" < $4::timestamp
      AND status <> 'CANCELLED'
    GROUP BY 1 ORDER BY 1
    `,
    restaurantId, from, tz, to
  );
  const names = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const byDow = new Map(rows.map((r) => [Number(r.dow), r]));
  return names.map((name, dow) => {
    const r = byDow.get(dow);
    const days = r ? Math.max(Number(r.days), 1) : 1;
    return {
      day: name,
      orders: r ? Number(r.orders) : 0,
      revenue: r ? round2(num(r.revenue)) : 0,
      avgOrders: r ? round2(Number(r.orders) / days) : 0,
    };
  });
}

/** Which tables earn the most — useful for seating and layout decisions. */
async function tablePerformance(restaurantId, from, to, limit = 12) {
  const rows = await prisma.$queryRaw`
    SELECT
      COALESCE("tableLabel", 'Unassigned') AS label,
      COUNT(*)::int AS orders,
      COALESCE(SUM("totalAmount"), 0) AS revenue,
      COALESCE(AVG("totalAmount"), 0) AS avg_value
    FROM orders
    WHERE "restaurantId" = ${restaurantId}
      AND "placedAt" >= ${from} AND "placedAt" < ${to}
      AND status <> 'CANCELLED'
    GROUP BY 1 ORDER BY revenue DESC LIMIT ${limit}
  `;
  return rows.map((r) => ({
    label: r.label,
    orders: Number(r.orders),
    revenue: round2(num(r.revenue)),
    avgValue: round2(num(r.avg_value)),
  }));
}

/** Split of orders across the fulfilment pipeline in this period. */
async function statusBreakdown(restaurantId, from, to) {
  const rows = await prisma.order.groupBy({
    by: ['status'],
    where: { restaurantId, placedAt: { gte: from, lt: to } },
    _count: { _all: true },
    _sum: { totalAmount: true },
  });
  return rows.map((r) => ({
    status: r.status,
    orders: r._count._all,
    revenue: round2(num(r._sum.totalAmount)),
  }));
}

/** Repeat-customer rate, keyed on phone number where one was given. */
async function customerInsights(restaurantId, from, to) {
  const rows = await prisma.$queryRaw`
    SELECT
      COALESCE("customerPhone", "customerName") AS key,
      MAX("customerName") AS name,
      COUNT(*)::int AS orders,
      COALESCE(SUM("totalAmount"), 0) AS spend,
      MAX("placedAt") AS last_order
    FROM orders
    WHERE "restaurantId" = ${restaurantId}
      AND "placedAt" >= ${from} AND "placedAt" < ${to}
      AND status <> 'CANCELLED'
    GROUP BY 1
    ORDER BY spend DESC
  `;
  const total = rows.length;
  const repeat = rows.filter((r) => Number(r.orders) > 1).length;
  return {
    totalCustomers: total,
    repeatCustomers: repeat,
    repeatRate: total ? round2((repeat / total) * 100) : 0,
    topCustomers: rows.slice(0, 8).map((r) => ({
      name: r.name,
      orders: Number(r.orders),
      spend: round2(num(r.spend)),
      lastOrder: r.last_order,
    })),
  };
}

/** Items on the menu that nobody ordered in this window — candidates to cut. */
async function underperformers(restaurantId, from, to, limit = 8) {
  const rows = await prisma.$queryRaw`
    SELECT mi.id, mi.name, c.name AS category, mi."timesOrdered"::int AS lifetime
    FROM menu_items mi
    JOIN categories c ON c.id = mi."categoryId"
    WHERE mi."restaurantId" = ${restaurantId}
      AND mi."isAvailable" = true
      AND NOT EXISTS (
        SELECT 1 FROM order_items oi
        JOIN orders o ON o.id = oi."orderId"
        WHERE oi."menuItemId" = mi.id
          AND o."restaurantId" = ${restaurantId}
          AND o."placedAt" >= ${from} AND o."placedAt" < ${to}
          AND o.status <> 'CANCELLED'
      )
    ORDER BY mi."timesOrdered" ASC, mi.name ASC
    LIMIT ${limit}
  `;
  return rows.map((r) => ({ id: r.id, name: r.name, category: r.category, lifetimeOrders: Number(r.lifetime) }));
}

/**
 * One call powering the whole analytics screen. Assembled server-side so the
 * dashboard is a single round trip rather than a dozen.
 */
export async function getOverview(restaurant, { range = 'today', from: cFrom, to: cTo }) {
  const tz = restaurant.timezone || 'Asia/Kolkata';
  const { from, to, prev, label } = resolveRange(range, tz, cFrom, cTo);
  const rid = restaurant.id;

  const [current, previous, prep, series, items, mix, hours, weekdays, tables, statuses, customers, dormant] =
    await Promise.all([
      headlineFor(rid, from, to),
      prev ? headlineFor(rid, prev.from, prev.to) : Promise.resolve(null),
      prepTimeStats(rid, from, to),
      timeseries(rid, from, to, tz),
      topItems(rid, from, to),
      categoryMix(rid, from, to),
      hourlyPattern(rid, from, to, tz),
      weekdayPattern(rid, from, to, tz),
      tablePerformance(rid, from, to),
      statusBreakdown(rid, from, to),
      customerInsights(rid, from, to),
      underperformers(rid, from, to),
    ]);

  const totalOrders = current.orders + current.cancelled;

  return {
    range: { key: range, label, from, to, timezone: tz },
    kpis: {
      ...current,
      cancellationRate: totalOrders ? round2((current.cancelled / totalOrders) * 100) : 0,
      ...prep,
      deltas: previous && {
        revenue: delta(current.revenue, previous.revenue),
        orders: delta(current.orders, previous.orders),
        avgOrderValue: delta(current.avgOrderValue, previous.avgOrderValue),
        itemsSold: delta(current.itemsSold, previous.itemsSold),
        customers: delta(current.customers, previous.customers),
      },
      previous,
    },
    timeseries: series,
    topItems: items,
    categoryMix: mix,
    hourlyPattern: hours,
    weekdayPattern: weekdays,
    tablePerformance: tables,
    statusBreakdown: statuses,
    customers,
    underperformers: dormant,
  };
}

/** Compact tile set for the dashboard header: today / this month / lifetime. */
export async function getQuickStats(restaurant) {
  const tz = restaurant.timezone || 'Asia/Kolkata';
  const today = resolveRange('today', tz);
  const month = resolveRange('month', tz);
  const all = resolveRange('all', tz);

  const [todayStats, yesterdayStats, monthStats, prevMonthStats, lifetime, liveCount] = await Promise.all([
    headlineFor(restaurant.id, today.from, today.to),
    headlineFor(restaurant.id, today.prev.from, today.prev.to),
    headlineFor(restaurant.id, month.from, month.to),
    headlineFor(restaurant.id, month.prev.from, month.prev.to),
    headlineFor(restaurant.id, all.from, all.to),
    prisma.order.count({
      where: { restaurantId: restaurant.id, status: { in: ['PLACED', 'ACCEPTED', 'PREPARING', 'READY'] } },
    }),
  ]);

  return {
    today: { ...todayStats, deltas: { revenue: delta(todayStats.revenue, yesterdayStats.revenue), orders: delta(todayStats.orders, yesterdayStats.orders) } },
    month: { ...monthStats, deltas: { revenue: delta(monthStats.revenue, prevMonthStats.revenue), orders: delta(monthStats.orders, prevMonthStats.orders) } },
    lifetime,
    liveOrders: liveCount,
  };
}
