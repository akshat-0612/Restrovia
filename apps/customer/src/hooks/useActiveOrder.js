import { useCallback, useEffect, useRef, useState } from 'react';
import { api, RESTAURANT_SLUG } from '../lib/api';

// Namespaced by slug so two restaurants open in one browser don't overwrite
// each other's order reference.
const STORAGE_KEY = `delightful:order:${RESTAURANT_SLUG}`;

const TERMINAL = ['COMPLETED', 'CANCELLED'];
const POLL_MS = 12000;

function readRef() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : null;
    return parsed?.orderNumber && parsed?.token ? parsed : null;
  } catch {
    return null;
  }
}

/**
 * Keeps the customer's most recent order alive across reloads.
 *
 * The tracking endpoint needs the order number plus the name or phone it was
 * placed with, so both are stored locally — that pair is the only thing standing
 * between a curious customer and someone else's order, and it never leaves the
 * device it was created on.
 *
 * Polling lives here rather than in the tracker screen so the header badge stays
 * current while the customer carries on browsing the menu.
 */
export function useActiveOrder() {
  const [order, setOrder] = useState(null);
  const [restoring, setRestoring] = useState(() => readRef() !== null);
  const refRef = useRef(readRef());

  const forget = useCallback(() => {
    refRef.current = null;
    setOrder(null);
    try { localStorage.removeItem(STORAGE_KEY); } catch { /* private mode */ }
  }, []);

  const fetchOnce = useCallback(async () => {
    const stored = refRef.current;
    if (!stored) return null;
    try {
      const { order: fresh } = await api.trackOrder(stored.orderNumber, stored.token);
      setOrder(fresh);
      return fresh;
    } catch (err) {
      // 403/404 means the reference is stale or belongs to a re-seeded database —
      // drop it rather than nagging the customer about an order they can't see.
      if (err.status === 404 || err.status === 403) forget();
      return null;
    }
  }, [forget]);

  const remember = useCallback((fresh) => {
    const stored = {
      orderNumber: fresh.orderNumber,
      token: fresh.customerPhone || fresh.customerName,
    };
    refRef.current = stored;
    setOrder(fresh);
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(stored)); } catch { /* private mode */ }
  }, []);

  // Restore on first load.
  useEffect(() => {
    if (!refRef.current) return;
    fetchOnce().finally(() => setRestoring(false));
  }, [fetchOnce]);

  // Poll only while the order is still moving.
  const isActive = Boolean(order) && !TERMINAL.includes(order.status);
  useEffect(() => {
    if (!isActive) return undefined;
    const id = setInterval(fetchOnce, POLL_MS);
    return () => clearInterval(id);
  }, [isActive, fetchOnce]);

  return { order, isActive, restoring, remember, forget, refresh: fetchOnce };
}
