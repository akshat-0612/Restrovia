import { storefrontVars } from '@shared';

/**
 * A miniature of the customer app, drawn with the same theme tokens the real
 * storefront uses.
 *
 * The point is that an owner should not have to open their storefront in another
 * tab to find out what "Noir" means. Because both this and the customer app read
 * `storefrontVars` from the shared catalogue, the preview cannot drift from the
 * thing it is previewing — the one failure that would make a preview worse than
 * none at all.
 *
 * Deliberately not a live copy of the real components: it shows the decisions a
 * theme makes (paper, corners, headline face, how brand colour is used) at a
 * size an owner can compare six of, and nothing else.
 */
export default function StorefrontPreview({
  theme, restaurant, photo, heroStyle = 'banner', compact = false,
}) {
  const vars = storefrontVars({
    theme,
    primaryColor: restaurant.primaryColor,
    accentColor: restaurant.accentColor,
  });
  const showPhoto = heroStyle !== 'off' && Boolean(photo);
  // The only thing "Backdrop" adds over "Banner" — without it the two options
  // preview identically, which is worse than not previewing them at all.
  const showBackdrop = heroStyle === 'backdrop' && Boolean(photo);

  return (
    <div className={`sf-preview ${compact ? 'compact' : ''} ${showBackdrop ? 'has-backdrop' : ''}`} style={vars}>
      <div className={`sf-hero ${showPhoto ? '' : 'plate'}`}>
        {showPhoto && <img src={photo.url} alt="" className="sf-hero-photo" />}
        <div className="sf-hero-scrim" />
        <div className="sf-hero-body">
          <span className="sf-mark">
            {restaurant.logoImage?.url || restaurant.logoUrl
              ? <img src={restaurant.logoImage?.url || restaurant.logoUrl} alt="" />
              : restaurant.logoEmoji}
          </span>
          <strong className="sf-name">{restaurant.name}</strong>
          {!compact && restaurant.tagline && <span className="sf-tagline">{restaurant.tagline}</span>}
        </div>
      </div>

      {/* The menu, and — in backdrop mode — the room showing through behind it. */}
      <div className="sf-body">
        {showBackdrop && (
          <div className="sf-backdrop">
            <img src={photo.url} alt="" />
          </div>
        )}

        <div className="sf-bar">
          <span className="sf-chip active">All</span>
          <span className="sf-chip">Starters</span>
          {!compact && <span className="sf-chip">Mains</span>}
        </div>

        <div className="sf-grid">
          {(compact ? [0] : [0, 1]).map((i) => (
            <div key={i} className="sf-card">
              <div className="sf-card-img" />
              <div className="sf-card-body">
                <span className="sf-card-name">Paneer Tikka</span>
                <div className="sf-card-foot">
                  <span className="sf-price">{restaurant.currencySymbol}240</span>
                  <span className="sf-add">+ Add</span>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
