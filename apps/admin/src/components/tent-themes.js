/**
 * Tent design catalogue and the QR image helper.
 *
 * Kept apart from the component so that file exports components only — which is
 * what keeps fast refresh working.
 */

export const TENT_THEMES = [
  { id: 'classic',  name: 'Classic',  note: 'Hairline frame, black on white. Cheapest to print.' },
  { id: 'band',     name: 'Banner',   note: 'Your colour across the top, name reversed out.' },
  { id: 'bold',     name: 'Bold',     note: 'Full-colour card. Uses the most ink.' },
  { id: 'kraft',    name: 'Kraft',    note: 'Warm paper tone with a cut line. Café feel.' },
  { id: 'midnight', name: 'Midnight', note: 'Dark card for dim rooms. Heavy on ink.' },
];

/** Ink-hungry themes; worth saying so before someone prints forty of them. */
export const HEAVY_INK = ['bold', 'midnight'];

/**
 * 1000px keeps the code crisp at the ~46mm it prints to. A screen-sized image
 * prints visibly fuzzy at the distance a diner holds a phone. Margin is zero
 * because the tent draws its own quiet zone.
 */
export function qrImageFor(url, size = 1000) {
  return `https://api.qrserver.com/v1/create-qr-code/?size=${size}x${size}&margin=0&ecc=M&data=${encodeURIComponent(url)}`;
}
