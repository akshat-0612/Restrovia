/**
 * A printable table tent: the card that sits on a table and gets scanned.
 *
 * These are printed once and then live on the tables for months, so they carry
 * the restaurant's own name and colours rather than looking like admin output.
 * Each theme is a different treatment of the same three things — who you are,
 * scan this, which table.
 *
 * Two constraints shape every theme:
 *  · the QR always sits on a light panel, because scanners need the contrast;
 *  · the code is drawn as vector SVG generated on the spot, so it is sharp at
 *    any print size and never waits on a network request.
 */

import { qrPath } from './tent-themes';
import RestaurantMark from './RestaurantMark';

export default function TableTent({ restaurant, table, url, theme = 'classic', preview = false }) {
  const brand = restaurant?.primaryColor || '#c4451f';
  const accent = restaurant?.accentColor || '#f5b301';
  const name = restaurant?.name || 'Restaurant';
  // Synchronous: nothing to await, so the print dialog can never open early.
  const { d, size } = qrPath(url);

  return (
    <div
      className={`tent tent-${theme} ${preview ? 'tent-preview' : ''}`}
      style={{ '--tent-brand': brand, '--tent-accent': accent }}
    >
      <div className="tent-head">
        <RestaurantMark restaurant={restaurant} className="tent-mark" />
        <span className="tent-name">{name}</span>
        {restaurant?.tagline && <span className="tent-tagline">{restaurant.tagline}</span>}
      </div>

      <div className="tent-qr-frame">
        <svg
          className="tent-qr"
          viewBox={`0 0 ${size} ${size}`}
          shapeRendering="crispEdges"
          role="img"
          aria-label={`Order at table ${table.label}`}
        >
          <path d={d} fill="#000000" />
        </svg>
      </div>

      <p className="tent-cta">Scan to see the menu &amp; order</p>

      <div className="tent-table">
        <span className="tent-table-rule" aria-hidden />
        <span className="tent-table-label">Table {table.label}</span>
        <span className="tent-table-rule" aria-hidden />
      </div>

      <p className="tent-foot">No app needed · Pay at the counter</p>
    </div>
  );
}
