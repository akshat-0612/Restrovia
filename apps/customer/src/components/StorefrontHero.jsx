import { useEffect, useState } from 'react';

/**
 * The top of the storefront: the restaurant's own photographs, its name, and
 * the two facts a customer wants before they start reading — whether the
 * kitchen is open and roughly how long food takes.
 *
 * With no photos it falls back to a brand-coloured plate rather than collapsing.
 * A restaurant that has not uploaded anything yet still gets a front door, and
 * the layout does not shift when they finally do.
 */

/** Long enough to look at a room, short enough that nobody waits for the next. */
const SLIDE_MS = 6000;

export default function StorefrontHero({ restaurant, tableLabel, photos = [] }) {
  const [index, setIndex] = useState(0);

  useEffect(() => {
    if (photos.length < 2) return undefined;
    const timer = setInterval(() => setIndex((i) => (i + 1) % photos.length), SLIDE_MS);
    return () => clearInterval(timer);
  }, [photos.length]);

  // A slideshow of photos that are no longer there would hold a stale index.
  useEffect(() => { setIndex(0); }, [photos.length]);

  const hasPhotos = photos.length > 0;
  const caption = photos[index]?.caption;

  return (
    <section className={`hero ${hasPhotos ? 'has-photos' : 'plate'}`}>
      {hasPhotos && (
        <div className="hero-photos" aria-hidden>
          {photos.map((photo, i) => (
            <img
              key={photo.id}
              src={photo.url}
              alt=""
              className={`hero-photo ${i === index ? 'showing' : ''}`}
              /* The first photo is what the page opens on, so it is the one
                 worth fetching eagerly; the rest can wait for their turn. */
              loading={i === 0 ? 'eager' : 'lazy'}
              fetchPriority={i === 0 ? 'high' : 'low'}
            />
          ))}
        </div>
      )}

      <div className="hero-scrim" aria-hidden />

      <div className="hero-body">
        <div className="hero-mark">
          {restaurant.logoUrl
            ? <img src={restaurant.logoUrl} alt="" />
            : <span>{restaurant.logoEmoji}</span>}
        </div>

        <h1 className="hero-name">{restaurant.name}</h1>
        {restaurant.tagline && <p className="hero-tagline">{restaurant.tagline}</p>}

        <div className="hero-meta">
          <span className={`hero-status ${restaurant.isAcceptingOrders ? 'open' : 'shut'}`}>
            <i className="hero-status-dot" aria-hidden />
            {restaurant.isAcceptingOrders ? 'Open now' : 'Not taking orders'}
          </span>
          <span className="hero-meta-sep" aria-hidden>·</span>
          <span>{restaurant.openingTime} – {restaurant.closingTime}</span>
          {restaurant.avgPrepTimeMins > 0 && (
            <>
              <span className="hero-meta-sep" aria-hidden>·</span>
              <span>~{restaurant.avgPrepTimeMins} min</span>
            </>
          )}
          {restaurant.city && (
            <>
              <span className="hero-meta-sep" aria-hidden>·</span>
              <span>{restaurant.city}</span>
            </>
          )}
        </div>

        {tableLabel && (
          <p className="hero-table">
            <span className="hero-table-badge">Table {tableLabel}</span>
            Order below and we&apos;ll bring it over
          </p>
        )}

        {caption && <p className="hero-caption">{caption}</p>}
      </div>

      {photos.length > 1 && (
        <div className="hero-dots">
          {photos.map((photo, i) => (
            <button
              key={photo.id}
              type="button"
              className={`hero-dot ${i === index ? 'active' : ''}`}
              onClick={() => setIndex(i)}
              aria-label={`Show photo ${i + 1}`}
            />
          ))}
        </div>
      )}
    </section>
  );
}
