import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { api, RESTAURANT_SLUG } from '../lib/api';

// Namespaced by slug so two restaurants open in one browser keep separate histories.
const STORAGE_KEY = `restrovia:orders:${RESTAURANT_SLUG}`;

const TERMINAL = ['COMPLETED', 'CANCELLED'];
const POLL_MS = 12000;
/** Matches the server's per-request cap on the lookup endpoint. */
const MAX_TRACKED = 20;

export const isTerminal = (order) => TERMINAL.includes(order.status);

function readRefs() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((r) => Number.isInteger(r?.orderNumber) && typeof r?.token === 'string' && r.token)
      .slice(0, MAX_TRACKED);
  } catch {
    return [];
  }
}

function writeRefs(refs) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(refs)); } catch { /* private mode */ }
}

/**
 * Every order this device has placed at this restaurant, newest first.
 *
 * A customer who orders food and then dessert has two live orders, and both need
 * to stay reachable — so the device keeps a list rather than only the latest.
 * Each entry carries the token its order was placed with, because the server
 * proves every order independently.
 *
 * Polling lives here rather than on the tracking screen, so statuses stay current
 * while the customer is back on the menu.
 */
export function useMyOrders() {
  const [orders, setOrders] = useState([]);
  const [restoring, setRestoring] = useState(() => readRefs().length > 0);
  const refsRef = useRef(readRefs());

  const fetchAll = useCallback(async (signal) => {
    const refs = refsRef.current;
    if (refs.length === 0) { setOrders([]); return []; }
    try {
      const { orders: fresh } = await api.lookupOrders(
        refs.map(({ orderNumber, token }) => ({ orderNumber, token })),
        signal
      );
      setOrders(fresh);

      // Prune references the server no longer recognises — a re-seeded database
      // or a deleted order shouldn't leave a permanent ghost in the list.
      if (fresh.length !== refs.length) {
        const alive = new Set(fresh.map((o) => o.orderNumber));
        refsRef.current = refs.filter((r) => alive.has(r.orderNumber));
        writeRefs(refsRef.current);
      }
      return fresh;
    } catch (err) {
      // Keep the last known list on a transient failure rather than blanking it.
      if (err.name !== 'AbortError') setOrders((prev) => prev);
      return null;
    }
  }, []);

  const remember = useCallback((order) => {
    const entry = {
      orderNumber: order.orderNumber,
      token: order.customerPhone || order.customerName,
      placedAt: order.placedAt,
    };
    refsRef.current = [entry, ...refsRef.current.filter((r) => r.orderNumber !== entry.orderNumber)]
      .slice(0, MAX_TRACKED);
    writeRefs(refsRef.current);
    setOrders((prev) => [order, ...prev.filter((o) => o.orderNumber !== order.orderNumber)]);
  }, []);

  const forget = useCallback((orderNumber) => {
    refsRef.current = refsRef.current.filter((r) => r.orderNumber !== orderNumber);
    writeRefs(refsRef.current);
    setOrders((prev) => prev.filter((o) => o.orderNumber !== orderNumber));
  }, []);

  /** Clears finished orders but keeps anything still cooking. */
  const clearFinished = useCallback(() => {
    setOrders((prev) => {
      const keep = prev.filter((o) => !isTerminal(o));
      const keepNumbers = new Set(keep.map((o) => o.orderNumber));
      refsRef.current = refsRef.current.filter((r) => keepNumbers.has(r.orderNumber));
      writeRefs(refsRef.current);
      return keep;
    });
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    fetchAll(controller.signal).finally(() => setRestoring(false));
    return () => controller.abort();
  }, [fetchAll]);

  const activeOrders = useMemo(() => orders.filter((o) => !isTerminal(o)), [orders]);

  // Poll only while something is still moving through the kitchen.
  const hasActive = activeOrders.length > 0;
  useEffect(() => {
    if (!hasActive) return undefined;
    const controller = new AbortController();
    const id = setInterval(() => fetchAll(controller.signal), POLL_MS);
    return () => { clearInterval(id); controller.abort(); };
  }, [hasActive, fetchAll]);

  const sorted = useMemo(
    () => [...orders].sort((a, b) => new Date(b.placedAt) - new Date(a.placedAt)),
    [orders]
  );

  return {
    orders: sorted,
    activeOrders,
    hasActive,
    restoring,
    remember,
    forget,
    clearFinished,
    refresh: () => fetchAll(),
  };
}
