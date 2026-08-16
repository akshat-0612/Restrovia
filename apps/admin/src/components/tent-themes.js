import QRCode from 'qrcode';

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
 * Builds the QR as an SVG path, synchronously and offline.
 *
 * These used to come from a public image renderer, which meant a print of forty
 * tables fired forty requests and the dialog opened before they landed — codes
 * came out as blank white squares. Generating locally removes the network from
 * the path entirely, and being vector it stays sharp at any print size.
 *
 * Error correction stays at M: high enough to survive a scuffed card on a table,
 * low enough to keep the modules large and easy to scan across a room.
 */
export function qrPath(text) {
  const { modules } = QRCode.create(text, { errorCorrectionLevel: 'M' });
  const { size, data } = modules;

  // One path for every dark module; far fewer DOM nodes than a rect each.
  let d = '';
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      if (data[y * size + x]) d += `M${x} ${y}h1v1h-1z`;
    }
  }
  return { d, size };
}
