/**
 * Storefront theme catalogue — the looks a restaurant owner can put their
 * customer app in.
 *
 * A theme is a set of CSS custom properties, nothing more. The customer app
 * writes them onto the document root at boot and every stylesheet rule reads
 * them, so switching theme is one owner-chosen string rather than six
 * stylesheets to keep in step. The admin portal renders its previews from this
 * same table, which is why it lives in shared: a preview that disagreed with
 * the storefront would be worse than no preview.
 *
 * The owner's primary and accent colours are deliberately *not* part of a
 * theme. Those are the restaurant's brand and survive a change of look — a
 * theme decides the paper, the brand decides the ink.
 *
 * Font stacks name only faces that ship with common desktop and mobile
 * systems. A storefront is opened on a phone on café wifi, and a webfont is
 * either a blocking request or a flash of the wrong face; neither is worth it.
 *
 * `--photo-tint` is the one token worth explaining: it is the wash laid over a
 * full-page backdrop photo. Much above ~0.8 and the photo stops being visible
 * at all — the backdrop option then looks identical to the banner one, which is
 * how these were first set and wrong. These values leave the room legible while
 * keeping menu text well clear of the contrast floor.
 */

const SANS = "system-ui, -apple-system, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif";

export const STOREFRONT_THEMES = [
  {
    id: 'midnight',
    name: 'Midnight',
    note: 'Near-black and quiet. Photos of food carry the colour.',
    mode: 'dark',
    swatch: ['#0c0c10', '#1a1a20', '#ececef'],
    tokens: {
      '--bg': '#0c0c10',
      '--bg-tint': '#131319',
      '--surface': '#17171c',
      '--surface-2': '#1e1e25',
      '--surface-3': '#26262e',
      '--border': '#2a2a33',
      '--border-strong': '#3a3a45',
      '--text': '#ecedf1',
      '--text-muted': '#9b9daa',
      '--text-dim': '#6a6c79',
      '--green': '#3ecf8e',
      '--on-green': '#08281a',
      '--red': '#f2555a',
      '--amber': '#f5b301',
      '--radius': '14px',
      '--radius-sm': '10px',
      '--radius-lg': '22px',
      '--shadow': '0 18px 44px rgba(0, 0, 0, 0.5)',
      '--shadow-soft': '0 6px 18px rgba(0, 0, 0, 0.32)',
      '--font-body': SANS,
      '--font-head': SANS,
      '--head-weight': '700',
      '--head-spacing': '-0.018em',
      '--head-case': 'none',
      '--hero-scrim': 'linear-gradient(180deg, rgba(8,8,11,0.2) 0%, rgba(8,8,11,0.34) 52%, rgba(12,12,16,0.9) 76%, rgba(12,12,16,0.995) 100%)',
      '--glass': 'rgba(15, 15, 19, 0.86)',
      '--photo-tint': 'rgba(10, 10, 14, 0.74)',
    },
  },
  {
    id: 'noir',
    name: 'Noir',
    note: 'Sharp corners, spaced capitals, warm charcoal. Fine dining.',
    mode: 'dark',
    swatch: ['#131110', '#221f1b', '#f5efe4'],
    tokens: {
      '--bg': '#131110',
      '--bg-tint': '#1a1715',
      '--surface': '#1c1917',
      '--surface-2': '#241f1c',
      '--surface-3': '#2e2823',
      '--border': '#332c25',
      '--border-strong': '#4a4036',
      '--text': '#f5efe4',
      '--text-muted': '#b0a494',
      '--text-dim': '#7d7264',
      '--green': '#7fbf95',
      '--on-green': '#0f2418',
      '--red': '#e2716f',
      '--amber': '#dcae5f',
      '--radius': '3px',
      '--radius-sm': '2px',
      '--radius-lg': '4px',
      '--shadow': '0 22px 50px rgba(0, 0, 0, 0.62)',
      '--shadow-soft': '0 8px 20px rgba(0, 0, 0, 0.4)',
      '--font-body': "'Optima', Candara, 'Gill Sans', " + SANS,
      '--font-head': "Didot, 'Hoefler Text', 'Playfair Display', Baskerville, Garamond, serif",
      '--head-weight': '500',
      '--head-spacing': '0.14em',
      '--head-case': 'uppercase',
      '--hero-scrim': 'linear-gradient(180deg, rgba(10,8,7,0.22) 0%, rgba(10,8,7,0.36) 52%, rgba(19,17,16,0.9) 76%, rgba(19,17,16,0.995) 100%)',
      '--glass': 'rgba(20, 17, 16, 0.88)',
      '--photo-tint': 'rgba(14, 12, 11, 0.74)',
    },
  },
  {
    id: 'ivory',
    name: 'Ivory',
    note: 'Off-white paper and a book serif. Bakeries and cafés.',
    mode: 'light',
    swatch: ['#faf7f1', '#ffffff', '#221f1b'],
    tokens: {
      '--bg': '#faf7f1',
      '--bg-tint': '#f3ede3',
      '--surface': '#ffffff',
      '--surface-2': '#f6f1e8',
      '--surface-3': '#ece5d8',
      '--border': '#e5dccd',
      '--border-strong': '#cfc2ad',
      '--text': '#221f1b',
      '--text-muted': '#6c6559',
      '--text-dim': '#938a7c',
      '--green': '#1e8a5c',
      '--on-green': '#ffffff',
      '--red': '#c93b3f',
      '--amber': '#a97a08',
      '--radius': '16px',
      '--radius-sm': '11px',
      '--radius-lg': '26px',
      '--shadow': '0 20px 42px rgba(60, 47, 30, 0.16)',
      '--shadow-soft': '0 4px 14px rgba(60, 47, 30, 0.1)',
      '--font-body': SANS,
      '--font-head': "'Palatino Linotype', Palatino, 'Iowan Old Style', Georgia, serif",
      '--head-weight': '600',
      '--head-spacing': '-0.005em',
      '--head-case': 'none',
      '--hero-scrim': 'linear-gradient(180deg, rgba(34,28,20,0.1) 0%, rgba(34,28,20,0.2) 52%, rgba(250,247,241,0.88) 76%, rgba(250,247,241,0.995) 100%)',
      '--glass': 'rgba(250, 247, 241, 0.9)',
      '--photo-tint': 'rgba(250, 247, 241, 0.78)',
    },
  },
  {
    id: 'terracotta',
    name: 'Terracotta',
    note: 'Warm sand and clay, generously rounded. Desi kitchens.',
    mode: 'light',
    swatch: ['#fdf5ec', '#fffbf6', '#3b2417'],
    tokens: {
      '--bg': '#fdf5ec',
      '--bg-tint': '#f8e8d6',
      '--surface': '#fffbf6',
      '--surface-2': '#faeee1',
      '--surface-3': '#f2e0cc',
      '--border': '#ebd8c1',
      '--border-strong': '#d5b795',
      '--text': '#3b2417',
      '--text-muted': '#836450',
      '--text-dim': '#a68a72',
      '--green': '#1f8a52',
      '--on-green': '#ffffff',
      '--red': '#c33f33',
      '--amber': '#b07407',
      '--radius': '20px',
      '--radius-sm': '14px',
      '--radius-lg': '30px',
      '--shadow': '0 20px 40px rgba(104, 63, 30, 0.18)',
      '--shadow-soft': '0 5px 16px rgba(104, 63, 30, 0.12)',
      '--font-body': "'Avenir Next', Avenir, Corbel, " + SANS,
      '--font-head': "Georgia, 'Iowan Old Style', 'Palatino Linotype', serif",
      '--head-weight': '700',
      '--head-spacing': '-0.012em',
      '--head-case': 'none',
      '--hero-scrim': 'linear-gradient(180deg, rgba(59,36,23,0.1) 0%, rgba(59,36,23,0.22) 52%, rgba(253,245,236,0.88) 76%, rgba(253,245,236,0.995) 100%)',
      '--glass': 'rgba(253, 245, 236, 0.9)',
      '--photo-tint': 'rgba(253, 245, 236, 0.78)',
    },
  },
  {
    id: 'slate',
    name: 'Slate',
    note: 'Cool greys, tight corners, heavy headings. Fast casual.',
    mode: 'light',
    swatch: ['#f3f5f7', '#ffffff', '#12161c'],
    tokens: {
      '--bg': '#f3f5f7',
      '--bg-tint': '#e8ebef',
      '--surface': '#ffffff',
      '--surface-2': '#eef0f4',
      '--surface-3': '#e2e6ec',
      '--border': '#dde1e8',
      '--border-strong': '#bfc6d1',
      '--text': '#12161c',
      '--text-muted': '#5a6472',
      '--text-dim': '#8a939f',
      '--green': '#0f7d4f',
      '--on-green': '#ffffff',
      '--red': '#cf3239',
      '--amber': '#8f6b04',
      '--radius': '10px',
      '--radius-sm': '7px',
      '--radius-lg': '16px',
      '--shadow': '0 18px 38px rgba(18, 26, 38, 0.14)',
      '--shadow-soft': '0 3px 12px rgba(18, 26, 38, 0.09)',
      '--font-body': SANS,
      '--font-head': SANS,
      '--head-weight': '800',
      '--head-spacing': '-0.03em',
      '--head-case': 'none',
      '--hero-scrim': 'linear-gradient(180deg, rgba(14,20,28,0.12) 0%, rgba(14,20,28,0.24) 52%, rgba(243,245,247,0.88) 76%, rgba(243,245,247,0.995) 100%)',
      '--glass': 'rgba(243, 245, 247, 0.9)',
      '--photo-tint': 'rgba(243, 245, 247, 0.78)',
    },
  },
  {
    id: 'forest',
    name: 'Forest',
    note: 'Deep green with cream ink. Vegetarian and farm-to-table.',
    mode: 'dark',
    swatch: ['#0b1512', '#14241e', '#e9f2ea'],
    tokens: {
      '--bg': '#0b1512',
      '--bg-tint': '#102019',
      '--surface': '#13221c',
      '--surface-2': '#1a2c24',
      '--surface-3': '#22392e',
      '--border': '#23392f',
      '--border-strong': '#33513f',
      '--text': '#e9f2ea',
      '--text-muted': '#96b0a0',
      '--text-dim': '#6b8677',
      '--green': '#5fd39a',
      '--on-green': '#072315',
      '--red': '#ef6f6c',
      '--amber': '#e3b658',
      '--radius': '18px',
      '--radius-sm': '12px',
      '--radius-lg': '28px',
      '--shadow': '0 20px 46px rgba(0, 14, 8, 0.55)',
      '--shadow-soft': '0 6px 18px rgba(0, 14, 8, 0.34)',
      '--font-body': "Optima, Candara, 'Gill Sans', " + SANS,
      '--font-head': "Optima, Candara, 'Gill Sans', 'Trebuchet MS', " + SANS,
      '--head-weight': '700',
      '--head-spacing': '0.005em',
      '--head-case': 'none',
      '--hero-scrim': 'linear-gradient(180deg, rgba(6,16,12,0.2) 0%, rgba(6,16,12,0.34) 52%, rgba(11,21,18,0.9) 76%, rgba(11,21,18,0.995) 100%)',
      '--glass': 'rgba(13, 26, 21, 0.88)',
      '--photo-tint': 'rgba(9, 18, 15, 0.74)',
    },
  },
];

export const STOREFRONT_THEME_IDS = STOREFRONT_THEMES.map((t) => t.id);
export const DEFAULT_STOREFRONT_THEME = 'midnight';

/** Falls back rather than throwing: an unknown id must never blank a storefront. */
export function storefrontTheme(id) {
  return STOREFRONT_THEMES.find((t) => t.id === id)
    || STOREFRONT_THEMES.find((t) => t.id === DEFAULT_STOREFRONT_THEME);
}

/**
 * How the owner's photos are used on the storefront.
 *
 * `banner` is the safe default — a photo at the top of the menu, where a bad
 * one costs nothing but its own space. `backdrop` also washes it behind the
 * whole page, which looks best and is the easiest to get wrong, so it is opt-in.
 */
export const HERO_STYLES = [
  { id: 'banner',   name: 'Banner',   note: 'A photo across the top of the menu.' },
  { id: 'backdrop', name: 'Backdrop', note: 'Banner, plus a soft wash of the photo behind the whole page.' },
  { id: 'off',      name: 'Off',      note: 'No photos — just your logo and colours.' },
];
export const HERO_STYLE_IDS = HERO_STYLES.map((s) => s.id);
export const DEFAULT_HERO_STYLE = 'banner';

/** Perceived brightness of a #rrggbb colour, 0–1. sRGB coefficients. */
export function luminanceOf(hex) {
  const clean = String(hex || '').replace('#', '');
  if (clean.length !== 6) return 0;
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(clean.slice(i, i + 2), 16) / 255);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/**
 * Ink that stays legible on a given fill.
 *
 * Brand colours are owner-chosen, and a fair number of restaurants pick a
 * bright yellow or lime. White text on those is unreadable, so the label
 * colour has to follow the fill rather than be assumed.
 */
export function readableInk(hex) {
  return luminanceOf(hex) > 0.62 ? '#17130f' : '#ffffff';
}

/**
 * The complete custom-property set for a storefront: theme paper plus brand ink.
 *
 * Returned as a plain object so it works both as a React `style` prop in the
 * admin preview and as a loop of setProperty calls on the real document.
 */
export function storefrontVars({ theme, primaryColor, accentColor }) {
  const resolved = storefrontTheme(theme);
  const brand = primaryColor || '#e8552d';
  const accent = accentColor || '#f5b301';
  return {
    ...resolved.tokens,
    '--brand': brand,
    '--accent': accent,
    '--on-brand': readableInk(brand),
    '--on-accent': readableInk(accent),
  };
}
