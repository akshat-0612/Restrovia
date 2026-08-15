import { useCallback, useEffect, useState } from 'react';
import { SPICE_LABELS } from '@shared';

export default function ItemDetailSheet({ item, currencySymbol, quantityOf, onAdd, onChangeQty, onClose }) {
  const hasVariants = item.variants.length > 0;
  const [variant, setVariant] = useState(hasVariants ? item.variants[0] : null);
  const [visible, setVisible] = useState(false);

  // Mount hidden, then flip on the next frame so the slide-up actually animates.
  useEffect(() => {
    const id = requestAnimationFrame(() => setVisible(true));
    return () => cancelAnimationFrame(id);
  }, []);

  // Play the slide-down before unmounting, so the sheet doesn't vanish abruptly.
  const close = useCallback(() => {
    setVisible(false);
    setTimeout(onClose, 240);
  }, [onClose]);

  useEffect(() => {
    const onKey = (e) => e.key === 'Escape' && close();
    window.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = '';
    };
  }, [close]);

  const price = hasVariants ? variant.price : item.basePrice;
  const qty = quantityOf(item.id, variant?.label);

  return (
    <>
      <div className={`sheet-overlay ${visible ? 'visible' : ''}`} onClick={close} />
      <div className={`item-sheet ${visible ? 'visible' : ''}`} role="dialog" aria-label={item.name}>
        <div className="sheet-image-wrap">
          {item.imageUrl
            ? <img src={item.imageUrl} alt="" className="sheet-image" />
            : <div className="sheet-image-placeholder">{item.categoryIcon}</div>}
          <button className="sheet-close-btn" onClick={close} aria-label="Close">✕</button>
          <div className="sheet-handle" />
        </div>

        <div className="sheet-content">
          <div className="sheet-name-row">
            <div>
              <span className={`veg-dot ${item.isVeg ? 'veg' : 'nonveg'}`} />
              <h2 className="sheet-name">{item.name}</h2>
            </div>
            <span className="sheet-price">{currencySymbol}{price}</span>
          </div>

          <div className="sheet-badges">
            <span className="sheet-category-badge">{item.categoryIcon} {item.categoryName}</span>
            {item.spiceLevel > 0 && (
              <span className="sheet-category-badge spice">{'🌶'.repeat(item.spiceLevel)} {SPICE_LABELS[item.spiceLevel]}</span>
            )}
            <span className="sheet-category-badge">⏱ ~{item.prepTimeMins} min</span>
          </div>

          <p className="sheet-desc">{item.description || 'Freshly prepared to order.'}</p>

          {hasVariants && (
            <div className="sheet-variants">
              <p className="sheet-variants-label">Choose a size</p>
              <div className="sheet-variants-row">
                {item.variants.map((v) => (
                  <button
                    key={v.label}
                    className={`sheet-variant-btn ${variant.label === v.label ? 'active' : ''}`}
                    onClick={() => setVariant(v)}
                  >
                    <span className="sv-label">{v.label}</span>
                    <span className="sv-price">{currencySymbol}{v.price}</span>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        <div className="sheet-action-bar">
          {qty > 0 ? (
            <>
              <div className="sheet-qty-control">
                <button className="sheet-qty-btn" onClick={() => onChangeQty(item.id, variant?.label, -1)}>−</button>
                <span className="sheet-qty-value">{qty}</span>
                <button className="sheet-qty-btn" onClick={() => onChangeQty(item.id, variant?.label, +1)}>+</button>
              </div>
              <button className="sheet-add-btn" onClick={close}>
                Done · {currencySymbol}{(price * qty).toFixed(0)}
              </button>
            </>
          ) : (
            <button className="sheet-add-btn full-width" onClick={() => { onAdd(item, variant); close(); }}>
              Add to cart · {currencySymbol}{price}
            </button>
          )}
        </div>
      </div>
    </>
  );
}
