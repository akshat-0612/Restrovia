import { useCallback, useEffect, useMemo, useState } from 'react';
import { api, tokenStore, impersonation, onAuthFailure } from '../lib/api';
import { AuthContext } from './auth-context';

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [restaurantId, setRestaurantId] = useState(impersonation.get());
  const [status, setStatus] = useState('checking');

  // Restore the session on load — the token alone isn't trusted, the API confirms it.
  useEffect(() => {
    if (!tokenStore.get()) { setStatus('anonymous'); return undefined; }
    const controller = new AbortController();
    api.me(controller.signal)
      .then(({ user: me }) => { setUser(me); setStatus('authenticated'); })
      .catch((err) => { if (err.name !== 'AbortError') { tokenStore.clear(); setStatus('anonymous'); } });
    return () => controller.abort();
  }, []);

  useEffect(() => onAuthFailure(() => { setUser(null); setStatus('anonymous'); }), []);

  const login = useCallback(async (credentials) => {
    const { token, user: me } = await api.login(credentials);
    tokenStore.set(token);
    // A restaurant user is pinned to their own restaurant; a platform admin
    // picks one from the restaurants list before the admin screens open.
    if (me.restaurantId) { impersonation.set(me.restaurantId); setRestaurantId(me.restaurantId); }
    else { impersonation.clear(); setRestaurantId(null); }
    setUser(me);
    setStatus('authenticated');
    return me;
  }, []);

  const logout = useCallback(() => {
    tokenStore.clear();
    setUser(null);
    setRestaurantId(null);
    setStatus('anonymous');
  }, []);

  /** Platform admins use this to open a client's portal. */
  const selectRestaurant = useCallback((id) => {
    if (id) impersonation.set(id); else impersonation.clear();
    setRestaurantId(id);
  }, []);

  const value = useMemo(() => ({
    user, status, restaurantId,
    isPlatformAdmin: user?.role === 'PLATFORM_ADMIN',
    can: (...roles) => Boolean(user && roles.includes(user.role)),
    login, logout, selectRestaurant,
  }), [user, status, restaurantId, login, logout, selectRestaurant]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
