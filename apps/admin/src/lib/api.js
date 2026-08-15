const BASE = (import.meta.env.VITE_API_URL || '').replace(/\/$/, '');
const TOKEN_KEY = 'delightful:admin:token';
/** Set only for platform admins, who have no home restaurant of their own. */
const IMPERSONATE_KEY = 'delightful:admin:restaurantId';

export const tokenStore = {
  get:   () => localStorage.getItem(TOKEN_KEY),
  set:   (t) => localStorage.setItem(TOKEN_KEY, t),
  clear: () => { localStorage.removeItem(TOKEN_KEY); localStorage.removeItem(IMPERSONATE_KEY); },
};

export const impersonation = {
  get:   () => localStorage.getItem(IMPERSONATE_KEY),
  set:   (id) => localStorage.setItem(IMPERSONATE_KEY, id),
  clear: () => localStorage.removeItem(IMPERSONATE_KEY),
};

export class ApiError extends Error {
  constructor(message, status, details) {
    super(message);
    this.status = status;
    this.details = details;
  }
}

/** Fired on a 401 so the app can drop to the login screen from anywhere. */
const AUTH_FAILED = 'delightful:auth-failed';
export const onAuthFailure = (handler) => {
  window.addEventListener(AUTH_FAILED, handler);
  return () => window.removeEventListener(AUTH_FAILED, handler);
};

async function request(path, { method = 'GET', body, signal, raw = false } = {}) {
  const headers = { 'Content-Type': 'application/json' };
  const token = tokenStore.get();
  if (token) headers.Authorization = `Bearer ${token}`;

  const restaurantId = impersonation.get();
  if (restaurantId) headers['X-Restaurant-Id'] = restaurantId;

  let response;
  try {
    response = await fetch(`${BASE}/api${path}`, {
      method, headers, signal,
      body: body ? JSON.stringify(body) : undefined,
    });
  } catch (err) {
    if (err.name === 'AbortError') throw err;
    throw new ApiError('Cannot reach the server. Check your connection.', 0);
  }

  if (response.status === 401) {
    tokenStore.clear();
    window.dispatchEvent(new Event(AUTH_FAILED));
    throw new ApiError('Your session expired. Please sign in again.', 401);
  }

  if (raw) {
    if (!response.ok) throw new ApiError('Export failed', response.status);
    return response.blob();
  }

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const detail = payload.details?.[0]?.message;
    throw new ApiError(detail || payload.error || 'Request failed', response.status, payload.details);
  }
  return payload;
}

const qs = (params) => {
  const search = new URLSearchParams(
    Object.entries(params || {}).filter(([, v]) => v !== undefined && v !== null && v !== '')
  ).toString();
  return search ? `?${search}` : '';
};

export const api = {
  // Auth
  login:  (body) => request('/auth/login', { method: 'POST', body }),
  me:     (signal) => request('/auth/me', { signal }),
  changePassword: (body) => request('/auth/change-password', { method: 'POST', body }),

  // Analytics
  quickStats: (signal) => request('/admin/analytics/quick', { signal }),
  overview:   (params, signal) => request(`/admin/analytics/overview${qs(params)}`, { signal }),

  // Orders
  liveOrders:  (signal) => request('/admin/orders/live', { signal }),
  orders:      (params, signal) => request(`/admin/orders${qs(params)}`, { signal }),
  order:       (id) => request(`/admin/orders/${id}`),
  setStatus:   (id, status, note) => request(`/admin/orders/${id}/status`, { method: 'PATCH', body: { status, note } }),
  setPayment:  (id, isPaid, payMethod) => request(`/admin/orders/${id}/payment`, { method: 'PATCH', body: { isPaid, payMethod } }),
  exportOrders: (params) => request(`/admin/export/orders.csv${qs(params)}`, { raw: true }),
  exportItems:  (params) => request(`/admin/export/items.csv${qs(params)}`, { raw: true }),

  // Menu
  categories:      (signal) => request('/admin/menu/categories', { signal }),
  createCategory:  (body) => request('/admin/menu/categories', { method: 'POST', body }),
  updateCategory:  (id, body) => request(`/admin/menu/categories/${id}`, { method: 'PATCH', body }),
  deleteCategory:  (id) => request(`/admin/menu/categories/${id}`, { method: 'DELETE' }),
  reorderCategories: (ids) => request('/admin/menu/categories/reorder', { method: 'POST', body: { ids } }),

  menuItems:     (params, signal) => request(`/admin/menu/items${qs(params)}`, { signal }),
  createItem:    (body) => request('/admin/menu/items', { method: 'POST', body }),
  updateItem:    (id, body) => request(`/admin/menu/items/${id}`, { method: 'PATCH', body }),
  deleteItem:    (id) => request(`/admin/menu/items/${id}`, { method: 'DELETE' }),
  setAvailability: (id, isAvailable) =>
    request(`/admin/menu/items/${id}/availability`, { method: 'PATCH', body: { isAvailable } }),

  // Tables
  tables:       (signal) => request('/admin/tables', { signal }),
  createTable:  (body) => request('/admin/tables', { method: 'POST', body }),
  bulkTables:   (body) => request('/admin/tables/bulk', { method: 'POST', body }),
  updateTable:  (id, body) => request(`/admin/tables/${id}`, { method: 'PATCH', body }),
  deleteTable:  (id) => request(`/admin/tables/${id}`, { method: 'DELETE' }),
  regenerateQr: (id) => request(`/admin/tables/${id}/regenerate-qr`, { method: 'POST' }),

  // Staff
  staff:        (signal) => request('/admin/staff', { signal }),
  createStaff:  (body) => request('/admin/staff', { method: 'POST', body }),
  updateStaff:  (id, body) => request(`/admin/staff/${id}`, { method: 'PATCH', body }),
  deleteStaff:  (id) => request(`/admin/staff/${id}`, { method: 'DELETE' }),

  // Coupons
  coupons:      (signal) => request('/admin/coupons', { signal }),
  createCoupon: (body) => request('/admin/coupons', { method: 'POST', body }),
  updateCoupon: (id, body) => request(`/admin/coupons/${id}`, { method: 'PATCH', body }),
  deleteCoupon: (id) => request(`/admin/coupons/${id}`, { method: 'DELETE' }),

  // Settings
  settings:       (signal) => request('/admin/settings', { signal }),
  updateSettings: (body) => request('/admin/settings', { method: 'PATCH', body }),
  toggleOrders:   () => request('/admin/settings/toggle-orders', { method: 'POST' }),

  // Platform (vendor tier)
  platformStats:       (signal) => request('/platform/stats', { signal }),
  platformRestaurants: (signal) => request('/platform/restaurants', { signal }),
  createRestaurant:    (body) => request('/platform/restaurants', { method: 'POST', body }),
  updateRestaurant:    (id, body) => request(`/platform/restaurants/${id}`, { method: 'PATCH', body }),
  deleteRestaurant:    (id, confirmSlug) =>
    request(`/platform/restaurants/${id}`, { method: 'DELETE', body: { confirmSlug } }),
};
