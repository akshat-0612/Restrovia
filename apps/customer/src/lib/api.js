/**
 * Which restaurant this app is showing.
 *
 * In production this is empty: one deployment serves every restaurant, and the API
 * works out which one from the domain the visitor arrived on. Setting the variable
 * pins the build to a single restaurant, which is how local development works
 * against a single API — and remains an escape hatch for a one-off deployment.
 */
const SLUG = import.meta.env.VITE_RESTAURANT_SLUG || '';
const BASE = (import.meta.env.VITE_API_URL || '').replace(/\/$/, '');

/** Namespaces per-restaurant local storage. Falls back to the host when unpinned. */
export const RESTAURANT_SLUG =
  SLUG || (typeof window !== 'undefined' ? window.location.hostname : 'default');

class ApiError extends Error {
  constructor(message, status, details) {
    super(message);
    this.status = status;
    this.details = details;
  }
}

async function request(path, { method = 'GET', body, signal } = {}) {
  // Only name the restaurant when this build is pinned to one; otherwise let the
  // API infer it from the request's own Origin.
  const url = SLUG
    ? `${BASE}/api/public${path}${path.includes('?') ? '&' : '?'}restaurant=${encodeURIComponent(SLUG)}`
    : `${BASE}/api/public${path}`;

  let response;
  try {
    response = await fetch(url, {
      method,
      signal,
      headers: {
        'Content-Type': 'application/json',
        ...(SLUG ? { 'X-Restaurant-Slug': SLUG } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
    });
  } catch (err) {
    if (err.name === 'AbortError') throw err;
    throw new ApiError("Can't reach the kitchen right now. Check your connection.", 0);
  }

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    // Zod validation errors carry field-level detail worth surfacing verbatim.
    const detail = payload.details?.[0]?.message;
    throw new ApiError(detail || payload.error || 'Something went wrong', response.status, payload.details);
  }
  return payload;
}

export const api = {
  getRestaurant: (signal) => request('/restaurant', { signal }),
  getMenu:       (signal) => request('/menu', { signal }),
  getTables:     (signal) => request('/tables', { signal }),
  getTableByToken: (token) => request(`/tables/by-token/${encodeURIComponent(token)}`),
  quote:      (cart, couponCode) => request('/quote', { method: 'POST', body: { cart, couponCode } }),
  placeOrder: (payload)          => request('/orders', { method: 'POST', body: payload }),
  trackOrder: (orderNumber, token) =>
    request(`/orders/${orderNumber}?token=${encodeURIComponent(token)}`),
  /** Batch tracking: one request no matter how many orders the device holds. */
  lookupOrders: (refs, signal) => request('/orders/lookup', { method: 'POST', body: { refs }, signal }),
};

export { ApiError };
