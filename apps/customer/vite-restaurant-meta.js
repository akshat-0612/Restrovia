import { storefrontTheme } from '../../packages/shared/src/storefront-themes.js';
import { storefrontTitle, storefrontDescription } from '../../packages/shared/src/index.js';

/**
 * Writes the restaurant's identity into index.html at build time.
 *
 * Link previews — WhatsApp, iMessage, Slack — are made by crawlers that fetch
 * the HTML and never run the JavaScript. Setting document.title once the app has
 * booted is therefore invisible to them, which is why a shared storefront link
 * showed "Restrovia" instead of the restaurant's own name.
 *
 * Only possible for a build pinned to one restaurant with VITE_RESTAURANT_SLUG.
 * The shared multi-tenant deployment serves every restaurant from one set of
 * files, so its HTML cannot name any of them; there the tab title and icon are
 * corrected at runtime instead (see useStorefrontTheme), and a link preview
 * falls back to the platform wording below.
 *
 * A failure here is never fatal. A storefront that builds with generic tags is
 * worth far more than a deploy that fails because the API was briefly down.
 */
export function restaurantMeta() {
  const slug = process.env.VITE_RESTAURANT_SLUG || '';
  const apiUrl = (process.env.VITE_API_URL || '').replace(/\/+$/, '');
  let cached;

  async function load() {
    if (cached !== undefined) return cached;
    cached = null;
    if (!slug || !apiUrl) return cached;

    try {
      const response = await fetch(`${apiUrl}/api/public/restaurant?restaurant=${encodeURIComponent(slug)}`);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      cached = await response.json();
    } catch (err) {
      console.warn(
        `\n[restaurant-meta] Could not reach ${apiUrl} for "${slug}" (${err.message}).\n` +
        '                  Building with generic tags — shared links will say "Restrovia".\n'
      );
    }
    return cached;
  }

  /** An emoji favicon, for a restaurant that has not uploaded a logo. */
  const emojiIcon = (emoji) =>
    'data:image/svg+xml,' + encodeURIComponent(
      `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><text y=".9em" font-size="90">${emoji}</text></svg>`
    );

  const escape = (value) => String(value ?? '')
    .replace(/&/g, '&amp;').replace(/"/g, '&quot;')
    .replace(/</g, '&lt;').replace(/>/g, '&gt;');

  return {
    name: 'restrovia:restaurant-meta',

    async transformIndexHtml(html) {
      const r = await load();
      if (!r) return html;

      const title = storefrontTitle(r);
      const description = storefrontDescription(r);

      // A storefront photo makes a far better preview card than a square logo;
      // the logo is the fallback, and some restaurants have neither.
      const image = r.photos?.[0]?.url || r.logoUrl || null;
      const icon = r.logoUrl || emojiIcon(r.logoEmoji || '🍽️');
      const themeColor = storefrontTheme(r.menuTheme).tokens['--bg'];

      const tags = [
        `<meta property="og:type" content="website" />`,
        `<meta property="og:site_name" content="${escape(r.name)}" />`,
        `<meta property="og:title" content="${escape(title)}" />`,
        `<meta property="og:description" content="${escape(description)}" />`,
        image ? `<meta property="og:image" content="${escape(image)}" />` : null,
        `<meta name="twitter:card" content="${image ? 'summary_large_image' : 'summary'}" />`,
        `<meta name="twitter:title" content="${escape(title)}" />`,
        `<meta name="twitter:description" content="${escape(description)}" />`,
        image ? `<meta name="twitter:image" content="${escape(image)}" />` : null,
        `<link rel="apple-touch-icon" href="${escape(icon)}" />`,
      ].filter(Boolean).join('\n    ');

      /*
       * Replacements are given as functions, not strings: a URL containing `$&`
       * or `$1` would otherwise be treated as a backreference by String.replace.
       *
       * The icon pattern runs to the closing `/>` rather than the first `>`,
       * because the tag it replaces is an inline SVG data URL full of `>`
       * characters — matching `[^>]*` stopped inside it and left the tail of the
       * old tag loose in the markup.
       */
      return html
        .replace(/<title>[\s\S]*?<\/title>/, () => `<title>${escape(title)}</title>`)
        .replace(
          /<meta name="description"[\s\S]*?\/>/,
          () => `<meta name="description" content="${escape(description)}" />`
        )
        .replace(/<meta name="theme-color"[\s\S]*?\/>/, () => `<meta name="theme-color" content="${themeColor}" />`)
        .replace(/<link rel="icon"[\s\S]*?\/>/, () => `<link rel="icon" href="${escape(icon)}" />`)
        .replace('</head>', () => `  ${tags}\n  </head>`);
    },
  };
}
