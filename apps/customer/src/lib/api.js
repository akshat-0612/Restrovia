/**
 * Every request carries the restaurant slug this build was compiled for, so the
 * same codebase deployed twice serves two different restaurants without a fork.
 */
const SLUG = import.meta.env.VITE_RESTAURANT_SLUG || 'delight-food';
const BASE = (import.meta.env.VITE_API_URL || '').replace(/\/$/, '');

export const RESTAURANT_SLUG = SLUG;

class ApiError extends Error {
  constructor(message, status, details) {
    super(message);
    this.status = status;
    this.details = details;
  }
}

async function request(path, { method = 'GET', body, signal } = {}) {
  const joiner = path.includes('?') ? '&' : '?';
  const url = `${BASE}/api/public${path}${joiner}restaurant=${encodeURIComponent(SLUG)}`;

  let response;
  try {
    response = await fetch(url, {
      method,
      signal,
      headers: { 'Content-Type': 'application/json', 'X-Restaurant-Slug': SLUG },
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
