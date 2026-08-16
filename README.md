# Restrovia

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
| Platform admin (you, the vendor) | `platform@restrovia.app` | `platform123` |
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

- **Customer requests** identify their restaurant by the host they arrived on
  (`resolvePublicTenant` → `slugForHostname`), or by an explicit slug when a build is
  pinned to one. A hostname maps to a tenant through the `restaurant_domains` table
  or as a subdomain of `PLATFORM_DOMAIN`; the lookup is cached for a minute and
  invalidated the moment a domain is attached or detached.
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

### Sign-in throttling

Failed sign-ins are counted per account, not per address, and successful ones are
never counted at all. A restaurant's whole team shares one NAT'd IP — the kitchen
tablet, the manager's phone, the owner's laptop — so an address-wide counter would
mean one person mistyping their password locks out the room, and simply switching
between the owner, manager and staff accounts would burn the budget for all of them.

Brute-forcing a single account still trips after ten failures, without affecting any
other account. There is deliberately no per-email limit spanning every address: that
would let anyone lock an owner out of their own restaurant just by failing against
their email repeatedly.

Signing in always lands on the dashboard rather than wherever the previous user
was, and `/platform` is routable only by platform admins — otherwise an owner
signing in after a platform admin on a shared machine would land on a screen that
could only refuse them.

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

- **Your orders** — every order placed on that device, not just the latest. Ordering
  food and then dessert leaves two live orders, and both stay reachable.

Tracking survives a reload. Each order's reference is kept on the device, so a
customer who locks their phone or closes the tab comes back to their orders rather
than losing them. A banner on the menu shows the live one's status, or a count when
several are cooking. Finished orders drop into an "Earlier" group and can be cleared.

The server proves each order independently: holding the token for one order reveals
nothing about any other, so bundling guesses into a lookup buys nothing.

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
- **Photos** — uploaded and cropped in the browser, not pasted as URLs. The crop is
  locked to one shape per use (4:3 for dishes, square for the logo), so the menu grid
  stays even however the photos were taken.
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

Three things get deployed, all from this one repository:

| What | Where | Cost |
|---|---|---|
| API | Render web service | free |
| Database | Neon Postgres | free |
| Admin portal | Cloudflare Pages | free |
| Customer app | Cloudflare Pages — one project per restaurant | free |

**No domain purchase is required.** Cloudflare gives every Pages project a free
`<name>.pages.dev` address, and that is enough to run the whole platform. A domain
only becomes worth buying later; see *When a domain is worth buying* at the end.

### The one rule that trips people up

**Every host must build from the repository root, never a subdirectory.** npm
workspaces hoist `node_modules` to the root, and the frontends resolve `@shared`
through a relative path into `packages/shared`. A build scoped to `apps/customer`
has neither. Leave "root directory" blank everywhere and let the build command pick
the target.

---

### Step 1 · Database (Neon)

Create a project and copy the **pooled** connection string — the one containing
`-pooler`. Prisma opens a connection per instance and will exhaust a direct limit:

```
postgresql://user:pass@ep-xxx-pooler.region.aws.neon.tech/neondb?sslmode=require&pgbouncer=true&connection_limit=1
```

### Step 2 · API (Render)

New Web Service → connect this repo. There is a `render.yaml` blueprint, or set it
by hand:

| Setting | Value |
|---|---|
| Root directory | *(blank)* |
| Build command | `npm ci && npm run build:server` |
| Start command | `npm run start:server` |
| Health check path | `/api/health` |

| Variable | Value |
|---|---|
| `DATABASE_URL` | the pooled Neon string |
| `JWT_SECRET` | a long random string — never reuse the dev value |
| `NODE_ENV` | `production` |
| `NODE_VERSION` | `20` |
| `CORS_ORIGINS` | leave empty for now; filled in at step 5 |

The build applies migrations. Render sets `PORT` itself. Note the service URL, e.g.
`https://restrovia.onrender.com` — every frontend points at it.

### Step 3 · Your platform-admin account

Never run `db:seed` against production — it deletes and recreates the seeded
tenants. Create your own login once, from your machine:

```bash
DATABASE_URL="<pooled-neon-url>" \
ADMIN_EMAIL="you@yourdomain.com" \
ADMIN_PASSWORD="<a-strong-password>" \
  npm run create:admin -w server
```

### Step 4 · Admin portal (Cloudflare Pages)

Workers & Pages → Create → at the bottom, **"Looking to deploy Pages? Get started"**
→ Connect to Git. The Workers flow has no "build output directory" field; the Pages
flow does.

| Setting | Value |
|---|---|
| Project name | `restrovia-admin` |
| Framework preset | `None` |
| Build command | `npm run build:admin` |
| Build output directory | `apps/admin/dist` |
| Root directory | *(blank)* |

| Variable | Value |
|---|---|
| `VITE_API_URL` | your Render URL, no trailing slash |
| `NODE_VERSION` | `20` |

Do **not** put `npm ci` in a Cloudflare build command — Cloudflare installs
dependencies before running it, so adding your own doubles build time. Render is the
opposite and needs it.

### Step 5 · Let the admin portal talk to the API

Set `CORS_ORIGINS` on Render to the admin URL and redeploy:

```
https://restrovia-admin.pages.dev
```

Sign in. A blank screen with a 403 in the console saying *"Origin … is not allowed"*
means this step was missed.

### Step 6 · Onboard your first restaurant

In the admin portal, **All restaurants → Onboard restaurant**. Note the **slug** it
generates — lowercase and hyphenated, e.g. `Delight Food` becomes `delight-food`.
That slug is permanent.

### Step 7 · Customer app (Cloudflare Pages)

A second Pages project, same repository:

| Setting | Value |
|---|---|
| Project name | `delight-food-order` |
| Build command | `npm run build:customer` |
| Build output directory | `apps/customer/dist` |

| Variable | Value |
|---|---|
| `VITE_API_URL` | the same Render URL |
| `VITE_RESTAURANT_SLUG` | **that restaurant's slug**, e.g. `delight-food` |
| `NODE_VERSION` | `20` |

`VITE_RESTAURANT_SLUG` is what lets this work on a free `.pages.dev` address. It
pins the build to one restaurant so the API never has to identify one from the
domain.

### Step 8 · Tell the restaurant where its storefront lives

In the admin portal, **Settings → Storefront**, set the storefront URL to the
address from step 7:

```
https://delight-food-order.pages.dev
```

Table QR codes are built from this. The admin portal is shared by every restaurant,
so each one carries its own value — get it right before printing codes, or you will
be reprinting them.

### Step 9 · Allow the storefront to call the API

Add the customer URL to `CORS_ORIGINS` on Render and redeploy. The list grows by one
entry per restaurant:

```
https://restrovia-admin.pages.dev,https://delight-food-order.pages.dev
```

---

### Adding your next restaurant

The API, database and admin portal are shared and never touched again. Per new
client, repeat four steps:

1. **Step 6** — onboard in the admin portal, note the slug.
2. **Step 7** — new Pages project with that slug in `VITE_RESTAURANT_SLUG`.
3. **Step 8** — set that restaurant's storefront URL.
4. **Step 9** — add its URL to `CORS_ORIGINS` and redeploy the API.

Step 9 is the one that gets forgotten; the symptom is a storefront that loads but
whose every request fails.

### When a domain is worth buying

Around ₹800/year, and it buys convenience rather than capability:

- **Branded URLs** — `order.theirrestaurant.com` rather than `xyz.pages.dev`.
- **One deployment for every client.** Point a wildcard CNAME (`*.yourdomain`) at a
  single customer Pages project and set `PLATFORM_DOMAIN` on the API. Leave
  `VITE_RESTAURANT_SLUG` unset; the API then identifies the restaurant from the
  subdomain it was reached on. Onboarding collapses to step 6 alone — no new
  project, no CORS edit, no redeploy.

Worth doing when repeating those four steps starts to annoy you. Not before.

### Custom domains for a client

Once you own a domain, add the client's hostname to the customer Pages project, have
them point a CNAME at it, then attach it to their restaurant under **Domains** and
update their storefront URL. Keep the deployment in **your** Cloudflare account, not
theirs: one place to ship fixes, your source stays yours, and suspending a
non-paying client is an `isActive` toggle rather than a negotiation.

### Where images live

Photos are stored in Postgres as bytes, in their own table, and served by the API
with a one-year immutable cache.

That is a deliberate choice at this size rather than a default. The browser crops,
resizes and re-encodes to WebP before uploading, so a phone photo of several
megabytes arrives as roughly 40–70KB — a hundred dishes is single-digit megabytes
against Neon's free 500MB. Keeping them in the database means no second service to
run, no credentials to hold, and backups that actually contain the images.

Two things would change that calculation. If storage grows past a few hundred
megabytes, or if serving image bytes from a sleeping free-tier API starts hurting,
move the bytes to object storage — **Cloudflare R2** is the natural fit, since the
frontends are already there and its free tier charges nothing for egress. Only the
upload route and the URL helper would need to change: everything else already refers
to images by id.

### Known limits of the free tier

- **Render free sleeps after 15 minutes idle** and takes roughly 50 seconds to wake.
  A customer scanning a QR code at a quiet hour waits that long. Fine while
  demoing; move to a paid instance before a real restaurant depends on it.
- **Rate-limit state is in memory**, so it resets on restart and is per-instance.
  Running more than one API instance needs a shared store behind it.
- Neon free projects suspend when idle but wake in under a second.
