import { useEffect } from 'react';
import { storefrontVars, storefrontTheme } from '@shared';

/**
 * Dresses the storefront in the theme its owner chose.
 *
 * The whole look is custom properties on the document root, so a theme change
 * is a handful of setProperty calls rather than a different stylesheet — which
 * is what lets the admin portal preview the same themes from the same table.
 *
 * Written to `documentElement` rather than a wrapper element because the sheets
 * and the cart sidebar are fixed-position and the `body` background shows
 * through the overscroll area on iOS; both need the tokens above the app root.
 */
export function useStorefrontTheme(restaurant) {
  useEffect(() => {
    if (!restaurant) return;

    const root = document.documentElement;
    const vars = storefrontVars({
      theme: restaurant.menuTheme,
      primaryColor: restaurant.primaryColor,
      accentColor: restaurant.accentColor,
    });
    for (const [name, value] of Object.entries(vars)) root.style.setProperty(name, value);

    // Lets the browser's own furniture — form controls, scrollbars, the URL bar
    // on mobile Safari — match a light theme instead of staying dark.
    root.style.colorScheme = storefrontTheme(restaurant.menuTheme).mode;
    document.title = `${restaurant.name} — Order from your table`;
  }, [restaurant]);
}
