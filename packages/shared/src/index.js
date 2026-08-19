/**
 * Shared vocabulary for the customer app, the admin portal and the API.
 * Anything both frontends need to agree on lives here so the two cannot drift.
 */

export const ORDER_STATUS = {
  PLACED:    { key: 'PLACED',    label: 'New',        customerLabel: 'Order received',  tone: 'blue',   icon: '🔔' },
  ACCEPTED:  { key: 'ACCEPTED',  label: 'Accepted',   customerLabel: 'Confirmed',       tone: 'violet', icon: '👍' },
  PREPARING: { key: 'PREPARING', label: 'Preparing',  customerLabel: 'In the kitchen',  tone: 'amber',  icon: '🍳' },
  READY:     { key: 'READY',     label: 'Ready',      customerLabel: 'Ready for you',   tone: 'green',  icon: '✅' },
  COMPLETED: { key: 'COMPLETED', label: 'Completed',  customerLabel: 'Served',          tone: 'slate',  icon: '🎉' },
  CANCELLED: { key: 'CANCELLED', label: 'Cancelled',  customerLabel: 'Cancelled',       tone: 'red',    icon: '✖️' },
};

/** The order a customer's status tracker walks through. */
export const CUSTOMER_JOURNEY = ['PLACED', 'ACCEPTED', 'PREPARING', 'READY', 'COMPLETED'];

export const ROLE_LABELS = {
  PLATFORM_ADMIN: 'Platform Admin',
  OWNER: 'Owner',
  MANAGER: 'Manager',
  STAFF: 'Staff',
};

export const SPICE_LABELS = ['', 'Mild', 'Medium', 'Hot'];

export const ANALYTICS_RANGES = [
  { key: 'today',     label: 'Today' },
  { key: 'yesterday', label: 'Yesterday' },
  { key: 'week',      label: '7 days' },
  { key: 'month',     label: '30 days' },
  { key: 'quarter',   label: '90 days' },
  { key: 'all',       label: 'All time' },
];

/** Indian-style grouping (1,23,456) — the format every rupee figure uses. */
export function formatCurrency(amount, symbol = '₹', { compact = false } = {}) {
  const n = Number(amount) || 0;
  if (compact) {
    if (Math.abs(n) >= 10000000) return `${symbol}${(n / 10000000).toFixed(2)}Cr`;
    if (Math.abs(n) >= 100000)   return `${symbol}${(n / 100000).toFixed(2)}L`;
    if (Math.abs(n) >= 1000)     return `${symbol}${(n / 1000).toFixed(1)}K`;
  }
  return `${symbol}${n.toLocaleString('en-IN', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;
}

export function formatNumber(n) {
  return (Number(n) || 0).toLocaleString('en-IN');
}

/** "2m ago", "3h ago" — used all over the live order board. */
export function timeAgo(date, now = Date.now()) {
  const seconds = Math.floor((now - new Date(date).getTime()) / 1000);
  if (seconds < 60) return 'just now';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  return new Date(date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
}

/** Minutes elapsed since an order was placed — drives the "running late" highlight. */
/**
 * A waiting time, in the largest unit that still reads honestly.
 *
 * The kitchen board shows how long an order has been sitting, and raw minutes
 * stop being readable long before they stop being counted — "2975m" is a number
 * to decode, not a duration to feel. Anything under an hour stays in minutes,
 * because that is the range the kitchen actually works in.
 */
export function formatElapsed(minutes) {
  const total = Math.max(0, Math.round(Number(minutes) || 0));
  if (total < 60) return `${total}m`;

  const hours = Math.floor(total / 60);
  if (hours < 24) {
    const rest = total % 60;
    return rest ? `${hours}h ${rest}m` : `${hours}h`;
  }

  const days = Math.floor(hours / 24);
  const restHours = hours % 24;
  return restHours ? `${days}d ${restHours}h` : `${days}d`;
}

export function minutesSince(date, now = Date.now()) {
  return Math.floor((now - new Date(date).getTime()) / 60000);
}

export function formatDateTime(date, timeZone = 'Asia/Kolkata') {
  return new Date(date).toLocaleString('en-IN', {
    timeZone, day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit', hour12: true,
  });
}

export function formatTime(date, timeZone = 'Asia/Kolkata') {
  return new Date(date).toLocaleString('en-IN', {
    timeZone, hour: 'numeric', minute: '2-digit', hour12: true,
  });
}

/** 14 → "2 PM". Axis labels for the peak-hours chart. */
export function formatHour(hour) {
  if (hour === 0) return '12 AM';
  if (hour === 12) return '12 PM';
  return hour < 12 ? `${hour} AM` : `${hour - 12} PM`;
}

/**
 * How a storefront names itself — in the browser tab, and in the preview card
 * when someone shares the link.
 *
 * The restaurant's own tagline is the subtitle when it has one: "Delight Food —
 * Fresh, fast and full of flavour" says something about the place, where the
 * platform's generic line said the same thing for every client. The fallback
 * only applies to a restaurant that has not written a tagline yet.
 *
 * Lives here because two very different places need the identical string — the
 * build-time meta tags and the runtime document.title — and a preview card that
 * disagreed with the tab would be its own small bug.
 */
export function storefrontTitle(restaurant) {
  const name = restaurant?.name?.trim() || 'Restrovia';
  const tagline = restaurant?.tagline?.trim();
  return tagline ? `${name} — ${tagline}` : `${name} — Order from your table`;
}

/** The supporting line under the title in a shared preview. */
export function storefrontDescription(restaurant) {
  const name = restaurant?.name?.trim();
  return name
    ? `Browse the menu at ${name} and order from your table.`
    : 'Browse the menu and order from your table.';
}

/** Stable key for a cart line: the same item in two sizes is two lines. */
export function cartKeyFor(itemId, variantLabel) {
  return variantLabel ? `${itemId}::${variantLabel}` : String(itemId);
}

export {
  STOREFRONT_THEMES,
  STOREFRONT_THEME_IDS,
  DEFAULT_STOREFRONT_THEME,
  storefrontTheme,
  storefrontVars,
  readableInk,
  luminanceOf,
  HERO_STYLES,
  HERO_STYLE_IDS,
  DEFAULT_HERO_STYLE,
} from './storefront-themes.js';
