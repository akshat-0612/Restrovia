import { useEffect } from 'react';
import { storefrontVars, storefrontTheme, storefrontTitle } from '@shared';

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
    const theme = storefrontTheme(restaurant.menuTheme);
    root.style.colorScheme = theme.mode;

    document.title = storefrontTitle(restaurant);
    setFavicon(restaurant);
    setMeta('theme-color', theme.tokens['--bg']);
  }, [restaurant]);
}

/**
 * Swaps the tab icon to the restaurant's logo.
 *
 * The build already writes this into the HTML for a storefront pinned to one
 * restaurant. This is for the shared deployment, where the same files serve
 * every restaurant and the correct icon is only knowable once the storefront
 * config has loaded — and for any restaurant that changes its logo after the
 * last build.
 */
function setFavicon(restaurant) {
  const href = restaurant.logoUrl || emojiIcon(restaurant.logoEmoji || '🍽️');

  for (const rel of ['icon', 'apple-touch-icon']) {
    let link = document.querySelector(`link[rel="${rel}"]`);
    if (!link) {
      link = document.createElement('link');
      link.rel = rel;
      document.head.appendChild(link);
    }
    if (link.href !== href) link.href = href;
  }
}

function emojiIcon(emoji) {
  return 'data:image/svg+xml,' + encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><text y=".9em" font-size="90">${emoji}</text></svg>`
  );
}

function setMeta(name, content) {
  let tag = document.querySelector(`meta[name="${name}"]`);
  if (!tag) {
    tag = document.createElement('meta');
    tag.name = name;
    document.head.appendChild(tag);
  }
  tag.content = content;
}
