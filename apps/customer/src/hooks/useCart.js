import { useCallback, useEffect, useMemo, useState } from 'react';
import { cartKeyFor } from '@shared';
import { RESTAURANT_SLUG } from '../lib/api';

// Namespaced by slug so two restaurants opened in the same browser keep
// separate carts.
const STORAGE_KEY = `restrovia:cart:${RESTAURANT_SLUG}`;

function readStored() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

/**
 * Cart state, persisted across reloads. Prices held here are for display only —
 * the server re-prices everything at checkout.
 */
export function useCart(menuItems) {
  const [lines, setLines] = useState(readStored);

  useEffect(() => {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(lines)); } catch { /* quota or private mode */ }
  }, [lines]);

  // Drop anything that has left the menu since the cart was saved, and refresh
  // prices so a stale cart never shows yesterday's number.
  useEffect(() => {
    if (!menuItems?.length) return;
    const byId = new Map(menuItems.map((i) => [i.id, i]));
    setLines((prev) => {
      const next = prev
        .map((line) => {
          const item = byId.get(line.menuItemId);
          if (!item || !item.isAvailable) return null;
          const price = line.variantLabel
            ? item.variants.find((v) => v.label === line.variantLabel)?.price
            : item.basePrice;
          if (price == null) return null;
          return { ...line, name: item.name, price: Number(price), categoryName: item.categoryName };
        })
        .filter(Boolean);

      const changed =
        next.length !== prev.length ||
        next.some((l, i) => l.price !== prev[i].price || l.name !== prev[i].name);
      return changed ? next : prev;
    });
  }, [menuItems]);

  const add = useCallback((item, variant) => {
    const key = cartKeyFor(item.id, variant?.label);
    setLines((prev) => {
      const existing = prev.find((l) => l.key === key);
      if (existing) return prev.map((l) => (l.key === key ? { ...l, quantity: l.quantity + 1 } : l));
      return [...prev, {
        key,
        menuItemId: item.id,
        name: item.name,
        categoryName: item.categoryName,
        categoryIcon: item.categoryIcon,
        variantLabel: variant?.label ?? null,
        price: Number(variant ? variant.price : item.basePrice),
        quantity: 1,
      }];
    });
  }, []);

  const changeQty = useCallback((key, delta) => {
    setLines((prev) =>
      prev
        .map((l) => (l.key === key ? { ...l, quantity: l.quantity + delta } : l))
        .filter((l) => l.quantity > 0)
    );
  }, []);

  const remove = useCallback((key) => setLines((prev) => prev.filter((l) => l.key !== key)), []);
  const clear  = useCallback(() => setLines([]), []);

  const quantityOf = useCallback(
    (itemId, variantLabel) => lines.find((l) => l.key === cartKeyFor(itemId, variantLabel))?.quantity ?? 0,
    [lines]
  );

  const totals = useMemo(() => ({
    count:    lines.reduce((s, l) => s + l.quantity, 0),
    subtotal: lines.reduce((s, l) => s + l.price * l.quantity, 0),
  }), [lines]);

  /** The minimal shape the API accepts — no prices, no names. */
  const payload = useMemo(
    () => lines.map((l) => ({ menuItemId: l.menuItemId, variantLabel: l.variantLabel, quantity: l.quantity })),
    [lines]
  );

  return { lines, add, changeQty, remove, clear, quantityOf, totals, payload };
}
