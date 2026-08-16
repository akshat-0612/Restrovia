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

One repository, three deployment targets. Nothing is split into separate repos —
each host builds the whole tree and is told which workspace to produce.

| What | Where | Cost |
|---|---|---|
| Customer app | Cloudflare Pages (static) | free |
| Admin portal | Cloudflare Pages (static) | free |
| API | Render web service | free tier, or ~$5/mo to avoid cold starts |
| Database | Neon (Postgres) | free |

### The monorepo rule

**Every host must build from the repository root, not from a subdirectory.**
npm workspaces hoist `node_modules` to the root, and the frontends resolve
`@shared` through a relative path into `packages/shared`. A build that only sees
`apps/customer` has neither. So leave "root directory" blank everywhere and let the
build command pick the target.

### 1. Database — Neon

Create a project and take the **pooled** connection string (the one containing
`-pooler`). Prisma opens a connection per instance and will exhaust a direct
connection limit:

```
DATABASE_URL="postgresql://user:pass@ep-xxx-pooler.region.aws.neon.tech/restrovia?sslmode=require&pgbouncer=true&connection_limit=1"
```

### 2. API — Render

There is a `render.yaml` blueprint in the repo, or configure it by hand:

| Setting | Value |
|---|---|
| Root directory | *(blank — repo root)* |
| Build command | `npm ci && npm run build:server` |
| Start command | `npm run start:server` |
| Health check path | `/api/health` |

`build:server` generates the Prisma client and applies pending migrations. Render's
free tier has no separate release phase, so migrations ride along with the build.

Environment variables:

| Key | Value |
|---|---|
| `DATABASE_URL` | the pooled Neon string |
| `JWT_SECRET` | a long random string — generate a fresh one, never reuse the dev value |
| `CORS_ORIGINS` | the admin portal URL. Restaurant domains resolve from the database and are not listed here |
| `PLATFORM_DOMAIN` | e.g. `restrovia.app` — every restaurant gets `<slug>.<this>` for free |
| `NODE_ENV` | `production` |
| `NODE_VERSION` | `20` |

Render sets `PORT` itself, and the server already reads it.

Seed nothing in production. Create your first restaurant through the platform
admin screen instead — `db:seed` deletes and recreates the seeded tenants.
To create the very first platform-admin account, run this once against the
production database from your machine:

```bash
DATABASE_URL="<neon-pooled-url>" node -e "
import('bcryptjs').then(async ({default:bcrypt}) => {
  const {PrismaClient} = await import('@prisma/client');
  const db = new PrismaClient();
  await db.user.create({ data: {
    name: 'Platform Admin', email: 'you@yourdomain.com', role: 'PLATFORM_ADMIN',
    passwordHash: await bcrypt.hash('<a-strong-password>', 10),
  }});
  console.log('created'); await db.\$disconnect();
})"
```

### 3. Frontends — Cloudflare Pages

Two Pages projects, both pointed at the same repository, differing only in build
command and output directory.

**Use the Git integration, not a deploy command.** Connect the repo to a Pages
project and Cloudflare builds *and* publishes the output itself — no `wrangler`, no
API token, nothing to authenticate. The Workers-style "deploy command" field is for
Workers; pointing `wrangler pages deploy` at a project that does not exist yet fails
with `Project not found [code: 8000007]`, and pointing it at one you do own still
needs an API token carrying **Account · Cloudflare Pages · Edit** (an account role of
Super Administrator does not grant this — a token is scoped separately).

| Setting | Admin portal | Customer app |
|---|---|---|
| Build command | `npm run build:admin` | `npm run build:customer` |
| Build output directory | `apps/admin/dist` | `apps/customer/dist` |
| Deploy command | *(leave empty)* | *(leave empty)* |
| Root directory | *(blank — repo root)* | *(blank — repo root)* |

Environment variables:

| Key | Admin portal | Customer app |
|---|---|---|
| `VITE_API_URL` | your Render URL | your Render URL |
| `VITE_CUSTOMER_URL` | the customer domain (builds table QR codes) | — |
| `NODE_VERSION` | `20` | `20` |

**Do not put `npm ci` in the build command.** Cloudflare installs dependencies
before running it — the log line is `Installing project dependencies: npm
clean-install`. Adding your own repeats the whole install and roughly doubles build
time for nothing. Render is the opposite: it runs only the build command, so its
`npm ci` is required.

Both apps ship a `public/_redirects` containing `/* /index.html 200`. Without it a
static host returns 404 for `/orders` or any refreshed deep link, because it looks
for a file rather than handing the path to the router.

<details>
<summary>If you would rather upload from CI than connect Git</summary>

Direct Upload needs the project to exist first — `wrangler pages deploy` only
uploads into an existing one:

```bash
npx wrangler pages project create restrovia-admin --production-branch=main
npx wrangler pages project create restrovia-order --production-branch=main
```

Then deploy with `npx wrangler pages deploy apps/admin/dist --project-name=restrovia-admin`,
with `CLOUDFLARE_API_TOKEN` carrying **Account · Cloudflare Pages · Edit**. Note that
environment variables are not applied to a Direct Upload build the way they are with
the Git integration, so `VITE_*` values must be present in the shell that runs the
build.

</details>

### One customer deployment, many restaurants

There is **one** customer-app project no matter how many restaurants you sell to.
Which one a visitor sees is decided by the host they arrived on, resolved by the API:

1. an explicit slug, if the build is pinned to one (development, one-off builds)
2. a custom domain attached to a restaurant
3. a subdomain of `PLATFORM_DOMAIN` — `delight-food.restrovia.app` → `delight-food`

Point a wildcard CNAME (`*.restrovia.app`) at the customer-app deployment and every
restaurant has a working storefront the moment it is created — no DNS, no build, no
redeploy. A client who wants their own domain points a CNAME at the same deployment,
and you attach it under **Domains** on the platform screen; it works on the next
request.

`CORS_ORIGINS` no longer grows with each sale. Any host that resolves to a restaurant
is allowed by definition, so the list is only for things that aren't storefronts —
chiefly the admin portal.

### Order of operations

1. Create the Neon database.
2. Deploy the API to Render with `DATABASE_URL` and `JWT_SECRET` (leave `CORS_ORIGINS` empty for now) — the build applies migrations.
3. Create the platform-admin account with the snippet above.
4. Deploy the admin portal to Pages with `VITE_API_URL`.
5. Set `CORS_ORIGINS` on Render to the admin URL and redeploy.
6. Deploy the customer app to Pages — once, with no slug — and point a wildcard
   CNAME (`*.yourdomain`) at it. Set `PLATFORM_DOMAIN` on the API to match.
7. Sign in and onboard your first restaurant. Its storefront is live immediately at
   `<slug>.yourdomain`. Attach a custom domain later from the same screen.

Selling to the next restaurant is then step 7 alone.

### Custom domains

Add the client's domain to the single Pages project, have them point a CNAME at it,
then attach it to their restaurant under **Domains**. Keep the deployment in **your**
Cloudflare account rather than theirs: one place to ship fixes, your source stays
yours, and suspending a non-paying client is an `isActive` toggle on their restaurant
row rather than a negotiation.

### Known limits of the free tier

- **Render free sleeps after 15 minutes idle** and takes roughly 50 seconds to wake.
  A customer scanning a QR code at a quiet hour waits that long. Fine while
  demoing; move to a paid instance before a real restaurant depends on it.
- **Rate-limit state is in memory**, so it resets on restart and is per-instance.
  Running more than one API instance needs a shared store behind it.
- Neon free projects suspend when idle but wake in under a second.
