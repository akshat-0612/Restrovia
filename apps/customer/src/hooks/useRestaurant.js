import { useEffect, useState } from 'react';
import { api } from '../lib/api';

/**
 * Loads the storefront: branding, tax config and the full menu. Everything the
 * customer app renders is downstream of this one call pair, so the app shows a
 * single loading state rather than a dozen skeletons.
 */
export function useRestaurant() {
  const [state, setState] = useState({ status: 'loading', restaurant: null, categories: [], error: null });

  useEffect(() => {
    const controller = new AbortController();

    (async () => {
      try {
        const [restaurantData, menuData] = await Promise.all([
          api.getRestaurant(controller.signal),
          api.getMenu(controller.signal),
        ]);
        setState({ status: 'ready', restaurant: restaurantData, categories: menuData.categories, error: null });
      } catch (err) {
        if (err.name === 'AbortError') return;
        setState({ status: 'error', restaurant: null, categories: [], error: err.message });
      }
    })();

    return () => controller.abort();
  }, []);

  return state;
}

/** Flattens the grouped menu into a single searchable list. */
export function flattenMenu(categories) {
  return categories.flatMap((c) =>
    c.items.map((i) => ({ ...i, categoryName: c.name, categoryIcon: c.icon }))
  );
}
