/**
 * Absolute URL for a stored image.
 *
 * Built from the incoming request rather than configuration, so the same server
 * serves correct URLs on localhost, on its Render address and behind a custom
 * domain without anything to keep in sync. `trust proxy` is set, so the protocol
 * reflects the original scheme rather than the proxy's hop.
 */
export function publicImageUrl(req, id) {
  const base = publicApiBase() || `${req.protocol}://${req.get('host')}`;
  return `${base}/api/public/images/${id}`;
}

/**
 * This API's own public address, or null when it has not been configured.
 *
 * Accepts a bare hostname as well as a full URL, because Render's blueprint can
 * wire a service's own host in automatically but has no way to prepend a scheme.
 * Taking either form means the value can be filled in by the platform rather
 * than typed by hand, and a typo'd scheme stops being a way to silently lose
 * notification icons.
 */
export function publicApiBase() {
  const raw = process.env.PUBLIC_API_URL?.trim();
  if (!raw) return null;
  const trimmed = raw.replace(/\/+$/, '');
  return /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
}
