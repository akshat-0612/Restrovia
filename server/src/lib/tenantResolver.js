import { prisma } from './prisma.js';

/**
 * Resolving a tenant from a hostname happens on every public request, including
 * CORS preflights, so the lookup is cached briefly. A minute is short enough that
 * attaching a domain feels immediate and long enough to keep a busy lunch service
 * off the database for this.
 */
const CACHE_TTL_MS = 60_000;
const cache = new Map();

/** Cleared whenever domains change, so a newly attached domain works at once. */
export function invalidateHostnameCache(hostname) {
  if (hostname) cache.delete(hostname.toLowerCase());
  else cache.clear();
}

function readCache(hostname) {
  const hit = cache.get(hostname);
  if (!hit) return undefined;
  if (Date.now() - hit.at > CACHE_TTL_MS) { cache.delete(hostname); return undefined; }
  return hit.slug;
}

/** Strips scheme, port and trailing dot. Returns null for anything unparseable. */
export function normalizeHostname(value) {
  if (!value) return null;
  let host = String(value).trim().toLowerCase();
  if (host.includes('://')) {
    try { host = new URL(host).hostname; } catch { return null; }
  }
  host = host.split('/')[0].split(':')[0].replace(/\.$/, '');
  return host || null;
}

/**
 * The host the *customer* is on — which is not the host this API answers on.
 * A browser making a cross-origin call sends Origin; that is the storefront's
 * domain and the only trustworthy signal here. Referer is a fallback for the
 * rare client that omits Origin on a GET.
 */
export function requestHostname(req) {
  return normalizeHostname(req.header('origin')) ||
         normalizeHostname(req.header('referer'));
}

/**
 * Subdomains of the platform domain map straight to a slug, so every restaurant
 * has a working address the moment it is created — no DNS, no domain row.
 * `delight-food.restrovia.app` → `delight-food`.
 */
function slugFromPlatformSubdomain(hostname) {
  const platform = normalizeHostname(process.env.PLATFORM_DOMAIN);
  if (!platform || !hostname) return null;
  if (!hostname.endsWith(`.${platform}`)) return null;
  const label = hostname.slice(0, -(platform.length + 1));
  // Only a single label counts; "a.b.platform.app" is not a tenant address.
  return label && !label.includes('.') ? label : null;
}

/** Resolves a hostname to a restaurant slug, or null if it belongs to no tenant. */
export async function slugForHostname(hostname) {
  if (!hostname) return null;

  const cached = readCache(hostname);
  if (cached !== undefined) return cached;

  const fromSubdomain = slugFromPlatformSubdomain(hostname);
  if (fromSubdomain) {
    // Still confirm the restaurant exists, so a typo'd subdomain 404s rather
    // than sailing through to a "restaurant not found" later.
    const exists = await prisma.restaurant.findUnique({
      where: { slug: fromSubdomain }, select: { slug: true },
    });
    const slug = exists?.slug ?? null;
    cache.set(hostname, { slug, at: Date.now() });
    return slug;
  }

  const domain = await prisma.restaurantDomain.findUnique({
    where: { hostname },
    select: { restaurant: { select: { slug: true } } },
  });
  const slug = domain?.restaurant.slug ?? null;
  cache.set(hostname, { slug, at: Date.now() });
  return slug;
}

/**
 * Whether a browser Origin may call this API.
 *
 * Replaces a hand-maintained allowlist: any host that resolves to a restaurant is
 * by definition one of ours. A suspended restaurant is still allowed through so the
 * app can render "not currently available" rather than an opaque CORS failure.
 */
export async function isAllowedOrigin(origin, staticAllowList) {
  if (staticAllowList.includes(origin)) return true;

  const hostname = normalizeHostname(origin);
  if (!hostname) return false;

  const platform = normalizeHostname(process.env.PLATFORM_DOMAIN);
  if (platform && (hostname === platform || hostname.endsWith(`.${platform}`))) return true;

  return (await slugForHostname(hostname)) !== null;
}
