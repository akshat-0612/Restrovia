import { useState } from 'react';
import { SPICE_LABELS } from '@shared';

export default function MenuItemCard({ item, currencySymbol, quantityOf, onAdd, onChangeQty, onOpen }) {
  const hasVariants = item.variants.length > 0;
  const [variant, setVariant] = useState(hasVariants ? item.variants[0] : null);

  const price = hasVariants ? variant.price : item.basePrice;
  const qty = quantityOf(item.id, variant?.label);
  const stop = (e) => e.stopPropagation();

  return (
    <article
      className={`menu-card ${item.isAvailable ? '' : 'sold-out'}`}
      onClick={() => item.isAvailable && onOpen(item)}
    >
      <div className="menu-card-img-wrap">
        {item.imageUrl
          ? <img src={item.imageUrl} alt="" className="menu-card-image" loading="lazy" />
          : <div className="menu-card-image-placeholder">{item.categoryIcon}</div>}

        <div className="menu-card-flags">
          <span className={`veg-dot ${item.isVeg ? 'veg' : 'nonveg'}`} title={item.isVeg ? 'Vegetarian' : 'Non-vegetarian'} />
          {item.isFeatured && item.isAvailable && <span className="flag-badge">★ Popular</span>}
        </div>

        {!item.isAvailable && <div className="sold-out-overlay">Sold out</div>}
        {item.isAvailable && <div className="card-tap-hint">tap for details</div>}
      </div>

      <div className="menu-card-body">
        <h3 className="menu-card-name">{item.name}</h3>
        {item.description && <p className="menu-card-desc">{item.description}</p>}

        <div className="menu-card-meta">
          {item.spiceLevel > 0 && (
            <span className="meta-pill spice">
              {'🌶'.repeat(item.spiceLevel)} {SPICE_LABELS[item.spiceLevel]}
            </span>
          )}
          <span className="meta-pill">⏱ {item.prepTimeMins} min</span>
        </div>

        {hasVariants && (
          <div className="variant-selector" onClick={stop}>
            {item.variants.map((v) => (
              <button
                key={v.label}
                type="button"
                className={`variant-btn ${variant.label === v.label ? 'active' : ''}`}
                onClick={() => setVariant(v)}
              >
                <span className="variant-label">{v.label}</span>
                <span className="variant-price">{currencySymbol}{v.price}</span>
              </button>
            ))}
          </div>
        )}

        <div className="menu-card-footer">
          <span className="menu-card-price">{currencySymbol}{price}</span>

          {!item.isAvailable ? (
            <span className="unavailable-tag">Unavailable</span>
          ) : qty === 0 ? (
            <button
              type="button"
              className="btn-add-to-cart"
              onClick={(e) => { stop(e); onAdd(item, variant); }}
            >
              + Add
            </button>
          ) : (
            <div className="card-qty-control" onClick={stop}>
              <button type="button" className="card-qty-btn" onClick={() => onChangeQty(item.id, variant?.label, -1)} aria-label="Remove one">−</button>
              <span className="card-qty-value">{qty}</span>
              <button type="button" className="card-qty-btn" onClick={() => onChangeQty(item.id, variant?.label, +1)} aria-label="Add one">+</button>
            </div>
          )}
        </div>
      </div>
    </article>
  );
}
