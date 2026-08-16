/**
 * Absolute URL for a stored image.
 *
 * Built from the incoming request rather than configuration, so the same server
 * serves correct URLs on localhost, on its Render address and behind a custom
 * domain without anything to keep in sync. `trust proxy` is set, so the protocol
 * reflects the original scheme rather than the proxy's hop.
 */
export function publicImageUrl(req, id) {
  const base = process.env.PUBLIC_API_URL?.replace(/\/+$/, '')
    || `${req.protocol}://${req.get('host')}`;
  return `${base}/api/public/images/${id}`;
}
