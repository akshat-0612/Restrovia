/**
 * End-to-end API checks against a running server with seeded data.
 *
 *   npm run db:seed -w server     # reset to known data
 *   npm run dev:server            # in another shell
 *   npm run test:api -w server
 *
 * Covers the things that matter most for a multi-tenant product: role gates,
 * cross-tenant isolation, order-state legality, and server-side pricing.
 *
 * Sign-in throttling counts only failures, and is keyed per account, so running
 * this suite repeatedly does not lock anything out.
 */
const API = process.env.API_URL || 'http://localhost:4000/api';

let pass = 0, fail = 0;
const ok = (c, m) => { c ? (pass++, console.log(`  ✓ ${m}`)) : (fail++, console.log(`  ✗ ${m}`)); };

async function call(path, { method = 'GET', body, token, restaurantId } = {}) {
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;
  if (restaurantId) headers['X-Restaurant-Id'] = restaurantId;
  const r = await fetch(`${API}${path}`, { method, headers, body: body ? JSON.stringify(body) : undefined });
  const text = await r.text();
  let json; try { json = JSON.parse(text); } catch { json = { raw: text.slice(0, 120) }; }
  return { status: r.status, json };
}
const login = async (email, password) => (await call('/auth/login', { method: 'POST', body: { email, password } })).json.token;

console.log('\n── AUTH & RBAC ──');
const owner    = await login('owner@delightfood.in', 'owner123');
const manager  = await login('manager@delightfood.in', 'manager123');
const staff    = await login('staff@delightfood.in', 'staff123');
const platform = await login('platform@restrovia.app', 'platform123');
const rival    = await login('owner@urbanslice.in', 'owner123');
ok(owner && manager && staff && platform && rival, 'all five roles can sign in');

ok((await call('/auth/login', { method: 'POST', body: { email: 'owner@delightfood.in', password: 'wrong' } })).status === 401, 'wrong password rejected');
ok((await call('/admin/orders/live')).status === 401, 'no token → 401');
ok((await call('/admin/orders/live', { token: 'garbage' })).status === 401, 'bad token → 401');

ok((await call('/admin/staff', { token: staff })).status === 403, 'STAFF blocked from staff list');
ok((await call('/admin/settings', { token: staff, method: 'PATCH', body: { name: 'Hacked' } })).status === 403, 'STAFF blocked from settings write');
ok((await call('/admin/staff', { token: manager })).status === 403, 'MANAGER blocked from staff list');
ok((await call('/admin/menu/items', { token: manager })).status === 200, 'MANAGER can read menu');
ok((await call('/admin/orders/live', { token: staff })).status === 200, 'STAFF can read the live board');
ok((await call('/platform/stats', { token: owner })).status === 403, 'OWNER blocked from platform tier');
ok((await call('/platform/stats', { token: platform })).status === 200, 'PLATFORM_ADMIN can read platform stats');
ok((await call('/admin/orders/live', { token: platform })).status === 400, 'PLATFORM_ADMIN must name a restaurant');

console.log('\n── SIGN-IN THROTTLING ──');
// Successful sign-ins must not consume the budget, or switching between the
// owner, manager and staff accounts would lock the whole restaurant out.
let switching = true;
for (let round = 0; round < 6 && switching; round++) {
  for (const [email, password] of [
    ['owner@delightfood.in', 'owner123'],
    ['manager@delightfood.in', 'manager123'],
    ['staff@delightfood.in', 'staff123'],
    ['platform@restrovia.app', 'platform123'],
  ]) {
    if ((await call('/auth/login', { method: 'POST', body: { email, password } })).status !== 200) switching = false;
  }
}
ok(switching, 'switching between four accounts repeatedly is never throttled');

// A throwaway email, so brute-forcing in a test never locks out a real account.
const victim = `throttle-${Date.now().toString(36)}@example.test`;
let throttledAt = null;
for (let i = 1; i <= 16 && throttledAt === null; i++) {
  if ((await call('/auth/login', { method: 'POST', body: { email: victim, password: `guess-${i}` } })).status === 429) {
    throttledAt = i;
  }
}
ok(throttledAt !== null, `repeated failures against one email are throttled (after ${throttledAt})`);
ok((await call('/auth/login', { method: 'POST', body: { email: 'owner@delightfood.in', password: 'owner123' } })).status === 200,
  'throttling one email leaves every other account signable');

console.log('\n── TENANT ISOLATION ──');
const mine = (await call('/admin/orders?pageSize=1', { token: owner })).json;
const theirs = (await call('/admin/orders?pageSize=1', { token: rival })).json;
const myOrderId = mine.orders[0].id, theirOrderId = theirs.orders[0].id;
ok(myOrderId !== theirOrderId, 'two tenants see different orders');
ok((await call(`/admin/orders/${theirOrderId}`, { token: owner })).status === 404, "owner cannot read a rival's order by id");
ok((await call(`/admin/orders/${theirOrderId}/status`, { token: owner, method: 'PATCH', body: { status: 'ACCEPTED' } })).status === 404, "owner cannot mutate a rival's order");

const theirCats = (await call('/admin/menu/categories', { token: rival })).json.categories;
ok((await call('/admin/menu/items', { token: owner, method: 'POST',
  body: { name: 'Smuggled', categoryId: theirCats[0].id, basePrice: 10 } })).status === 400,
  "owner cannot attach an item to a rival's category");

const theirTables = (await call('/admin/tables', { token: rival })).json.tables;
ok((await call(`/admin/tables/${theirTables[0].id}`, { token: owner, method: 'PATCH', body: { seats: 6 } })).status === 404,
  "owner cannot edit a rival's table");

const theirStaff = (await call('/admin/staff', { token: rival })).json.staff;
ok((await call(`/admin/staff/${theirStaff[0].id}`, { token: owner, method: 'PATCH', body: { role: 'STAFF' } })).status === 404,
  "owner cannot demote a rival's staff");

console.log('\n── MENU CRUD ──');
// Re-runnable: clear leftovers from an aborted previous run.
for (const stale of (await call('/admin/menu/items?search=Test', { token: owner })).json.items ?? []) {
  await call(`/admin/menu/items/${stale.id}`, { token: owner, method: 'DELETE' });
}
for (const stale of (await call('/admin/menu/items?search=Renamed', { token: owner })).json.items ?? []) {
  await call(`/admin/menu/items/${stale.id}`, { token: owner, method: 'DELETE' });
}
// A crashed run can leave items behind in the test category; clear it out entirely.
for (const cat of (await call('/admin/menu/categories', { token: owner })).json.categories ?? []) {
  if (cat.name !== 'Test Cat') continue;
  for (const stale of (await call(`/admin/menu/items?categoryId=${cat.id}`, { token: owner })).json.items ?? []) {
    await call(`/admin/menu/items/${stale.id}`, { token: owner, method: 'DELETE' });
  }
}
for (const stale of (await call('/admin/menu/categories', { token: owner })).json.categories ?? []) {
  if (stale.name === 'Test Cat') await call(`/admin/menu/categories/${stale.id}`, { token: owner, method: 'DELETE' });
}
const cat = (await call('/admin/menu/categories', { token: owner, method: 'POST', body: { name: 'Test Cat', icon: '🧪' } })).json.category;
ok(!!cat?.id, 'category created');
ok((await call('/admin/menu/categories', { token: owner, method: 'POST', body: { name: 'Test Cat' } })).status === 409, 'duplicate category name → 409');

const flat = (await call('/admin/menu/items', { token: owner, method: 'POST',
  body: { name: 'Test Flat', categoryId: cat.id, basePrice: 99, isVeg: true } })).json.item;
ok(Number(flat.basePrice) === 99 && flat.variants.length === 0, 'flat-priced item created');

const varied = (await call('/admin/menu/items', { token: owner, method: 'POST',
  body: { name: 'Test Sized', categoryId: cat.id, variants: [{ label: 'S', price: 50 }, { label: 'L', price: 90 }] } })).json.item;
ok(varied.basePrice === null && varied.variants.length === 2, 'variant item ignores basePrice');

ok((await call('/admin/menu/items', { token: owner, method: 'POST',
  body: { name: 'No price', categoryId: cat.id } })).status === 400, 'item with no price rejected');

const upd = (await call(`/admin/menu/items/${varied.id}`, { token: owner, method: 'PATCH',
  body: { variants: [{ label: 'Only', price: 120 }] } })).json.item;
ok(upd.variants.length === 1 && upd.variants[0].label === 'Only', 'variants replaced on update');

ok((await call(`/admin/menu/items/${flat.id}/availability`, { token: owner, method: 'PATCH', body: { isAvailable: false } })).status === 200, 'availability toggled');
ok((await call(`/admin/menu/categories/${cat.id}`, { token: owner, method: 'DELETE' })).status === 400, 'non-empty category cannot be deleted');

console.log('\n── COUPON CRUD ──');
const code = `TEST${Date.now().toString(36).toUpperCase().slice(-6)}`;
const coup = (await call('/admin/coupons', { token: owner, method: 'POST',
  body: { code, discountType: 'PERCENT', value: 20, minOrderAmount: 50 } })).json.coupon;
ok(!!coup?.id, 'coupon created');
ok((await call('/admin/coupons', { token: owner, method: 'POST',
  body: { code: `${code}X`, discountType: 'PERCENT', value: 150 } })).status === 400, 'percent > 100 rejected on create');
const cUpd = await call(`/admin/coupons/${coup.id}`, { token: owner, method: 'PATCH', body: { value: 30 } });
ok(cUpd.status === 200 && Number(cUpd.json.coupon.value) === 30, 'coupon value updated (partial body)');
ok((await call(`/admin/coupons/${coup.id}`, { token: owner, method: 'PATCH', body: { value: 150 } })).status === 400,
  'percent > 100 rejected on partial update');
ok((await call(`/admin/coupons/${coup.id}`, { token: rival, method: 'PATCH', body: { value: 5 } })).status === 404,
  "rival cannot edit another tenant's coupon");
ok((await call(`/admin/coupons/${coup.id}`, { token: owner, method: 'DELETE' })).status === 200, 'coupon deleted');

console.log('\n── ITEM UPDATE PRICING GUARD ──');
ok((await call(`/admin/menu/items/${flat.id}`, { token: owner, method: 'PATCH',
  body: { variants: [], basePrice: null } })).status === 400, 'update leaving an item unpriced rejected');
const renamed = await call(`/admin/menu/items/${flat.id}`, { token: owner, method: 'PATCH', body: { name: 'Test Renamed' } });
ok(renamed.status === 200 && renamed.json.item.name === 'Test Renamed', 'partial update of a single field works');

console.log('\n── ACCEPTING-ORDERS SWITCH ──');
// Also establishes the precondition the lifecycle tests below depend on, rather
// than assuming whatever state the restaurant happened to be left in.
const settingsNow = (await call('/admin/settings', { token: owner })).json.restaurant;
if (settingsNow.isAcceptingOrders) await call('/admin/settings/toggle-orders', { token: owner, method: 'POST' });
ok((await call('/admin/settings', { token: owner })).json.restaurant.isAcceptingOrders === false, 'orders can be paused');

const whileClosed = await call('/public/orders?restaurant=delight-food', { method: 'POST',
  body: { cart: [{ menuItemId: (await call('/public/menu?restaurant=delight-food')).json.categories[0].items[0].id, quantity: 1 }],
          customerName: 'Closed Test', tableId: (await call('/public/tables?restaurant=delight-food')).json.tables[0].id } });
ok(whileClosed.status === 400 && /not taking orders/i.test(whileClosed.json.error || ''),
  'customers cannot order while paused');

await call('/admin/settings/toggle-orders', { token: owner, method: 'POST' });
ok((await call('/admin/settings', { token: owner })).json.restaurant.isAcceptingOrders === true, 'orders can be resumed');

console.log('\n── ORDER LIFECYCLE ──');
const menu = (await call('/public/menu?restaurant=delight-food')).json;
const item = menu.categories.flatMap((c) => c.items).find((i) => i.isAvailable && !i.variants.length);
const tbl = (await call('/public/tables?restaurant=delight-food')).json.tables[0];
const placedRes = await call('/public/orders?restaurant=delight-food', { method: 'POST',
  body: { cart: [{ menuItemId: item.id, quantity: 3 }], customerName: 'Lifecycle Test', customerPhone: '9000000001', tableId: tbl.id } });
if (placedRes.status === 429) {
  console.log(`\n  ! Order rate limit reached (${placedRes.json.error})`);
  console.log('    Restart the API to clear the in-memory counter, then re-run.\n');
  process.exit(1);
}
const placed = placedRes.json.order;
ok(placed?.status === 'PLACED', `order placed${placed ? '' : ` — got ${placedRes.status}: ${placedRes.json.error}`}`);
ok(Number(placed.subtotal) === Number(item.basePrice) * 3, 'server priced the cart itself');

ok((await call(`/admin/orders/${placed.id}/status`, { token: owner, method: 'PATCH', body: { status: 'READY' } })).status === 400,
  'illegal transition PLACED→READY rejected');
ok((await call(`/admin/orders/${placed.id}/status`, { token: owner, method: 'PATCH', body: { status: 'CANCELLED' } })).status === 400,
  'cancel without a reason rejected');

for (const s of ['ACCEPTED', 'PREPARING', 'READY', 'COMPLETED']) {
  const r = await call(`/admin/orders/${placed.id}/status`, { token: owner, method: 'PATCH', body: { status: s } });
  ok(r.status === 200 && r.json.order.status === s, `transition → ${s}`);
}
const done = (await call(`/admin/orders/${placed.id}`, { token: owner })).json.order;
ok(done.isPaid === true && done.paidAt, 'completing the order settled the bill');
ok(done.events.length === 5, `audit trail has 5 events (got ${done.events.length})`);
ok((await call(`/admin/orders/${placed.id}/status`, { token: owner, method: 'PATCH', body: { status: 'ACCEPTED' } })).status === 400,
  'a completed order is terminal');

console.log('\n── PRICING & COUPONS ──');
const q = (await call('/public/quote?restaurant=delight-food', { method: 'POST',
  body: { cart: [{ menuItemId: item.id, quantity: 4 }], couponCode: 'WELCOME10' } })).json;
const expectSub = Number(item.basePrice) * 4;
ok(q.subtotal === expectSub, 'quote subtotal correct');
ok(q.discountAmount === Math.round(expectSub * 0.1 * 100) / 100 || q.discountAmount === 100, 'percent coupon applied (capped at 100)');
ok(Math.abs(q.totalAmount - Math.round((expectSub - q.discountAmount) * 1.05 * 100) / 100) < 0.02, 'tax applied after discount');
ok((await call('/public/quote?restaurant=delight-food', { method: 'POST',
  body: { cart: [{ menuItemId: item.id, quantity: 1 }], couponCode: 'NOPE' } })).status === 400, 'unknown coupon rejected');
ok((await call('/public/quote?restaurant=delight-food', { method: 'POST',
  body: { cart: [{ menuItemId: item.id, quantity: 1 }], couponCode: 'FEAST15' } })).status === 400, 'coupon below its minimum rejected');

console.log('\n── HOSTNAME TENANT RESOLUTION ──');
// One customer-app deployment serves every restaurant; the host a visitor arrived
// on is what picks the tenant. These run against whatever PLATFORM_DOMAIN is set.
const asHost = async (host, path = '/restaurant') => {
  const r = await fetch(`${API}/public${path}`, { headers: { Origin: `https://${host}` } });
  return { status: r.status, json: await r.json().catch(() => ({})) };
};

const restaurantsList = (await call('/platform/restaurants', { token: platform })).json.restaurants;
const rDelight = restaurantsList.find((r) => r.slug === 'delight-food');
const rUrban = restaurantsList.find((r) => r.slug === 'urban-slice');

const hostA = `test-${Date.now().toString(36)}.example.com`;
const hostB = `other-${Date.now().toString(36)}.example.com`;
const addA = await call(`/platform/restaurants/${rDelight.id}/domains`, {
  token: platform, method: 'POST', body: { hostname: hostA, isPrimary: true },
});
const addB = await call(`/platform/restaurants/${rUrban.id}/domains`, {
  token: platform, method: 'POST', body: { hostname: hostB },
});
ok(addA.status === 201 && addB.status === 201, 'domains attached to two restaurants');

ok((await asHost(hostA)).json.slug === 'delight-food', 'first host resolves to its restaurant');
ok((await asHost(hostB)).json.slug === 'urban-slice', 'second host resolves to the other restaurant');

ok((await call(`/platform/restaurants/${rUrban.id}/domains`, {
  token: platform, method: 'POST', body: { hostname: hostA },
})).status === 409, 'a domain cannot be claimed by two restaurants');

ok((await asHost(hostA.toUpperCase())).json.slug === 'delight-food', 'hostname matching is case-insensitive');

// An unknown origin is stopped at the CORS layer, before any tenant lookup.
ok((await asHost('nobody-owns-this.example.com')).status === 403, 'an unclaimed host is refused');

// The whole storefront works with no slug named anywhere.
const hostMenu = await asHost(hostA, '/menu');
ok(hostMenu.status === 200 && hostMenu.json.categories.length > 0, 'menu loads over the host alone');
const hostTables = await asHost(hostA, '/tables');
const hostItem = hostMenu.json.categories.flatMap((c) => c.items).find((i) => i.isAvailable && !i.variants.length);
const hostOrder = await fetch(`${API}/public/orders`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', Origin: `https://${hostA}` },
  body: JSON.stringify({ cart: [{ menuItemId: hostItem.id, quantity: 1 }],
    customerName: 'Host Resolution', customerPhone: '9700000009', tableId: hostTables.json.tables[0].id }),
}).then((r) => r.json());
ok(hostOrder.order?.orderNumber > 0, 'an order can be placed with the host as the only tenant signal');

// An explicit slug still wins, which is what makes local development work.
const overridden = await fetch(`${API}/public/restaurant?restaurant=urban-slice`, {
  headers: { Origin: `https://${hostA}` },
}).then((r) => r.json());
ok(overridden.slug === 'urban-slice', 'an explicit slug overrides the host');

// Detaching frees the host immediately rather than after the cache expires.
const attached = (await call('/platform/restaurants', { token: platform })).json.restaurants
  .flatMap((r) => r.domains).filter((d) => d.hostname === hostA || d.hostname === hostB);
for (const d of attached) await call(`/platform/domains/${d.id}`, { token: platform, method: 'DELETE' });
ok((await asHost(hostA)).status === 403, 'a detached host stops resolving at once');

console.log('\n── BATCH ORDER LOOKUP ──');
const tbl2 = (await call('/public/tables?restaurant=delight-food')).json.tables[1];
const mk = async (name, phone) => (await call('/public/orders?restaurant=delight-food', { method: 'POST',
  body: { cart: [{ menuItemId: item.id, quantity: 1 }], customerName: name, customerPhone: phone, tableId: tbl2.id } })).json.order;
const oA = await mk('Lookup A', '9111100001');
const oB = await mk('Lookup B', '9111100002');

const both = await call('/public/orders/lookup?restaurant=delight-food', { method: 'POST',
  body: { refs: [{ orderNumber: oA.orderNumber, token: '9111100001' }, { orderNumber: oB.orderNumber, token: '9111100002' }] } });
ok(both.status === 200 && both.json.orders.length === 2, 'two correctly-proved orders are returned');
ok(both.json.orders.every((o) => o.items.length > 0), 'lookup includes line items');

// The security property: one order's token must not unlock another's.
const mixed = await call('/public/orders/lookup?restaurant=delight-food', { method: 'POST',
  body: { refs: [{ orderNumber: oA.orderNumber, token: '9111100001' }, { orderNumber: oB.orderNumber, token: '9111100001' }] } });
ok(mixed.json.orders.length === 1 && mixed.json.orders[0].orderNumber === oA.orderNumber,
  "a valid token for one order does not reveal another");

const guessed = await call('/public/orders/lookup?restaurant=delight-food', { method: 'POST',
  body: { refs: [{ orderNumber: oA.orderNumber, token: 'not-the-token' }] } });
ok(guessed.status === 200 && guessed.json.orders.length === 0, 'a wrong token yields nothing, not an error');

// Cross-tenant: another restaurant's order number must not resolve here.
const rivalOrder = (await call('/admin/orders?pageSize=1', { token: rival })).json.orders[0];
const leaked = await call('/public/orders/lookup?restaurant=delight-food', { method: 'POST',
  body: { refs: [{ orderNumber: rivalOrder.orderNumber, token: rivalOrder.customerName }] } });
ok(!leaked.json.orders.some((o) => o.customerName === rivalOrder.customerName && o.orderNumber === rivalOrder.orderNumber
    && Number(o.totalAmount) === Number(rivalOrder.totalAmount)),
  "another restaurant's order is not reachable through this slug");

ok((await call('/public/orders/lookup?restaurant=delight-food', { method: 'POST',
  body: { refs: [] } })).status === 400, 'empty ref list rejected');
ok((await call('/public/orders/lookup?restaurant=delight-food', { method: 'POST',
  body: { refs: Array.from({ length: 21 }, (_, i) => ({ orderNumber: i + 1, token: 'x' })) } })).status === 400,
  'more than 20 refs rejected');

for (const o of [oA, oB]) {
  await call(`/admin/orders/${o.id}/status`, { token: owner, method: 'PATCH', body: { status: 'CANCELLED', note: 'test cleanup' } });
}

console.log('\n── VALIDATION ──');
ok((await call('/public/orders?restaurant=delight-food', { method: 'POST',
  body: { cart: [{ menuItemId: item.id, quantity: 1 }], customerName: 'A', tableId: tbl.id } })).status === 400, 'short name rejected');
ok((await call('/public/orders?restaurant=delight-food', { method: 'POST',
  body: { cart: [], customerName: 'Valid Name', tableId: tbl.id } })).status === 400, 'empty cart rejected');
ok((await call('/public/orders?restaurant=delight-food', { method: 'POST',
  body: { cart: [{ menuItemId: item.id, quantity: 1 }], customerName: 'Valid Name' } })).status === 400, 'missing table rejected');
ok((await call('/public/orders?restaurant=delight-food', { method: 'POST',
  body: { cart: [{ menuItemId: flat.id, quantity: 1 }], customerName: 'Valid Name', tableId: tbl.id } })).status === 400, 'unavailable item rejected');
ok((await call('/public/restaurant?restaurant=does-not-exist')).status === 404, 'unknown restaurant slug → 404');

console.log('\n── OWNER SELF-LOCKOUT GUARDS ──');
const me = (await call('/auth/me', { token: owner })).json.user;
ok((await call(`/admin/staff/${me.id}`, { token: owner, method: 'PATCH', body: { isActive: false } })).status === 400, 'owner cannot deactivate themselves');
ok((await call(`/admin/staff/${me.id}`, { token: owner, method: 'DELETE' })).status === 400, 'owner cannot delete themselves');

console.log('\n── PLATFORM ONBOARDING ──');
const slug = `test-cafe-${Date.now().toString(36)}`;
const created = await call('/platform/restaurants', { token: platform, method: 'POST',
  body: { name: 'Test Cafe', slug, ownerName: 'Test Owner', ownerEmail: `o@${slug}.test`, ownerPassword: 'testpass123', tableCount: 4 } });
ok(created.status === 201, 'restaurant onboarded');
const newId = created.json.restaurant?.id;
ok((await call('/platform/restaurants', { token: platform, method: 'POST',
  body: { name: 'Dup Cafe', slug, ownerName: 'Dup Owner', ownerEmail: 'dup@y.test', ownerPassword: 'testpass123' } })).status === 409, 'duplicate slug → 409');

const newOwner = await login(`o@${slug}.test`, 'testpass123');
ok(!!newOwner, 'the new owner can sign in immediately');
const newTables = (await call('/admin/tables', { token: newOwner })).json.tables;
ok(newTables.length === 4, 'starter tables created');
ok((await call('/admin/menu/categories', { token: newOwner })).json.categories.length === 4, 'starter categories created');
ok((await call('/admin/orders?pageSize=5', { token: newOwner })).json.orders.length === 0, 'a fresh tenant sees zero orders');

ok((await call(`/platform/restaurants/${newId}`, { token: platform, method: 'DELETE', body: { confirmSlug: 'wrong' } })).status === 400, 'delete needs the exact slug');
ok((await call(`/platform/restaurants/${newId}`, { token: platform, method: 'DELETE', body: { confirmSlug: slug } })).status === 200, 'restaurant deleted with confirmation');

console.log('\n── CLEANUP ──');
await call(`/admin/menu/items/${flat.id}`, { token: owner, method: 'DELETE' });
await call(`/admin/menu/items/${upd.id}`, { token: owner, method: 'DELETE' });
ok((await call(`/admin/menu/categories/${cat.id}`, { token: owner, method: 'DELETE' })).status === 200, 'empty category deleted');

console.log(`\n${'═'.repeat(40)}\n  PASS ${pass}   FAIL ${fail}\n${'═'.repeat(40)}`);
process.exit(fail ? 1 : 0);
