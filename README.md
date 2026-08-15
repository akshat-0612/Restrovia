# Delightful

A multi-tenant restaurant ordering platform: a customer web app for placing dine-in
orders, and an admin portal where the restaurant owner runs the floor and reads their
numbers. One shared database serves every restaurant, so a new client is a
configuration change rather than a fork.

Built first for **Delight Food**, Pune.

---

## What's in the box

| Piece | Path | What it is |
|---|---|---|
| Customer app | `apps/customer` | Menu, cart, checkout, live order tracking. One deploy per restaurant. |
| Admin portal | `apps/admin` | Dashboard, kitchen board, orders, analytics, menu, tables, coupons, staff, settings. |
| API | `server` | Express + Prisma + PostgreSQL. Every tenant lives in one database. |
| Shared | `packages/shared` | Status vocabulary and formatting both frontends agree on. |

**No payments.** A customer browses, adds to cart, gives their name and table, and
places the order. The bill is settled at the counter, and the kitchen marks it paid.

---

## Getting started

Requires Node 18.18+ and Docker (for Postgres).

```bash
npm install
npm run db:up        # Postgres on :5544
npm run db:migrate   # create the schema
npm run db:seed      # two restaurants, ~3,200 orders of history
npm run dev          # API :4000 · customer :5173 · admin :5174
```

`npm run setup` does all of the above in one command.

### Seeded sign-ins

| Role | Email | Password |
|---|---|---|
| Platform admin (you, the vendor) | `platform@delightful.app` | `platform123` |
| Restaurant owner | `owner@delightfood.in` | `owner123` |
| Manager | `manager@delightfood.in` | `manager123` |
| Kitchen staff | `staff@delightfood.in` | `staff123` |

The seed creates a second restaurant, **Urban Slice** (`owner@urbanslice.in` /
`owner123`), with its own menu and numbers — sign in as each in turn to see that the
two tenants share a database and see nothing of each other.

---

## Selling to a new restaurant

The whole point of the architecture: **one API, one database, one customer-app
codebase, many deployments.**

1. Sign in to the admin portal as the platform admin and choose **Onboard restaurant**.
   That creates the tenant, its owner login, its tables, and a starter menu skeleton,
   then shows you the handover details.
2. Deploy a copy of `apps/customer` for that client with two environment variables:

   ```
   VITE_RESTAURANT_SLUG=their-slug
   VITE_API_URL=https://your-api-domain.com
   ```

3. Add their domain to `CORS_ORIGINS` on the API.
4. Hand the owner their sign-in. They add their real menu, print their table QR codes,
   and start taking orders.

Nothing else changes per client. Branding, menu, tax rate, currency, opening hours and
prep-time estimates all come from that restaurant's row in the database, so the same
build serves a café in Pune and a pizzeria in Bengaluru.

---

## How tenancy works

`Restaurant` is the tenant root; every other tenant-owned table carries `restaurantId`.

- **Customer requests** identify their restaurant by slug (`resolvePublicTenant`).
- **Admin requests** are pinned to `req.restaurantId` by `resolveTenant`, taken from the
  authenticated user's own record — never from the request body. Every admin query
  filters on it, so a crafted id belonging to another restaurant simply returns 404.
- **Platform admins** have no home restaurant and must name one explicitly via the
  `X-Restaurant-Id` header. That is what "open a client's portal" does.

`server/test/integration.mjs` asserts this: an owner cannot read another restaurant's
order, edit its tables, move an item into its categories, or touch its staff.

### Roles

| Role | Can do |
|---|---|
| `PLATFORM_ADMIN` | Everything, across every restaurant. Onboards and suspends clients. |
| `OWNER` | Everything within their own restaurant, including staff and settings. |
| `MANAGER` | Orders, menu, tables, coupons, analytics. Not staff or settings. |
| `STAFF` | The live order board only. |

---

## What the customer gets

- **Menu** — categories, search, sizes, veg marker, spice level and prep time, all
  driven by the restaurant's own data.
- **Cart** — persisted locally, re-priced by the server on every change, and pruned
  automatically if an item sells out while it's sitting there.
- **Checkout** — name, table and an optional phone number and note. No account, no
  payment. Scanning the table's QR code fills the table in for them.
- **Live tracking** — a status timeline that updates itself as the kitchen moves the
  order.

Tracking survives a reload. The order reference is kept on the device, so a customer
who locks their phone or closes the tab comes back to their order rather than losing
it, and a banner on the menu offers a way back while it's still cooking. Once the
order is served and dismissed, the reference is cleared.

## What the admin portal gives the owner

- **Dashboard** — today's revenue, orders and average order value with a day-over-day
  delta; live order feed; 30-day revenue trend; best sellers; category mix; kitchen
  timing metrics.
- **Live orders** — a kanban board from New through Served, with a chime for new
  arrivals, an age badge that turns amber past 25 minutes, and cancellation reasons.
- **Orders** — every order, filterable and searchable, with a detail drawer showing the
  full audit trail, plus CSV exports of orders and item-level sales.
- **Analytics** — revenue over time, peak hours, day-of-week rhythm, best sellers,
  category revenue share, table performance, repeat-customer rate, order outcomes, and
  the items nobody ordered.
- **Menu** — categories and items with sizes, availability toggles, spice level, veg
  flag and prep time. Changes reach the customer app immediately.
- **Tables** — per-table QR codes that pre-fill the table when scanned.
- **Coupons** — percentage or flat discounts with minimums, caps, usage limits, expiry.
- **Staff** — accounts and roles, with guards against locking yourself out.
- **Settings** — profile, branding (with a live preview), tax rules, hours, timezone.

Analytics run in the restaurant's own timezone, so "today" means their midnight.
Revenue counts every non-cancelled order — money they will collect — and cancellations
are reported separately rather than quietly dropped.

---

## Money and correctness

Prices are never trusted from the client. The cart sends only item ids, sizes and
quantities; the server looks up the price, applies the coupon, then the tax, and stores
the result. Order lines are snapshotted at purchase time, so changing a menu price
never rewrites history.

Order numbers are allocated inside a transaction behind a per-restaurant advisory lock,
so two customers checking out at the same instant cannot claim the same number — and
two restaurants never block each other.

Status transitions are validated server-side (`STATUS_FLOW`); a completed order is
terminal, and cancelling requires a reason.

---

## Commands

| Command | What it does |
|---|---|
| `npm run dev` | API, customer app and admin portal together |
| `npm run build` | Production builds of both frontends |
| `npm run db:up` / `db:down` | Start/stop Postgres |
| `npm run db:migrate` | Apply migrations |
| `npm run db:seed` | Reset seeded restaurants and regenerate history |
| `npm run db:studio` | Prisma Studio |
| `npm run test:api -w server` | Integration suite (needs a running API + seeded data) |

---

## Deploying

- **API** — any Node host (Railway, Render, Fly). Set `DATABASE_URL`, a long random
  `JWT_SECRET`, and `CORS_ORIGINS` listing every restaurant's customer domain plus the
  admin portal. Run `npm run db:deploy -w server` on release.
- **Frontends** — static builds; any static host works. The customer app needs
  `VITE_RESTAURANT_SLUG` and `VITE_API_URL`; the admin portal needs `VITE_API_URL` and
  `VITE_CUSTOMER_URL` (used to build table QR codes).

Change `JWT_SECRET` and every seeded password before going live.
