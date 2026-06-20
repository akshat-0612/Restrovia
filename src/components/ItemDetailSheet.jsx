import { useState, useEffect } from 'react';

const CATEGORY_ICONS = {
  'Chinese':              '🍜',
  'Snacks':               '🥪',
  'Pasta & Maggie':       '🍝',
  'Chai & Coffee':        '☕',
  'Shakes & Cold Coffee': '🥤',
  'Soft Drinks':          '🧃',
  'Water':                '💧',
  'Desserts':             '🍰',
};

export default function ItemDetailSheet({ item, cartItems, onAddToCart, onUpdateQty, onClose }) {
  const hasVariants = Array.isArray(item.variants) && item.variants.length > 1;
  const [selectedVariant, setSelectedVariant] = useState(
    hasVariants ? item.variants[0] : null
  );
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    // tiny delay so the slide-up animation triggers
    const t = setTimeout(() => setVisible(true), 10);
    return () => clearTimeout(t);
  }, []);

  function handleClose() {
    setVisible(false);
    setTimeout(onClose, 260);
  }

  const icon     = CATEGORY_ICONS[item.category] || '🍴';
  const price    = hasVariants ? selectedVariant.price : item.price;
  const cartKey  = hasVariants ? `${item.id}_${selectedVariant.label}` : `${item.id}`;
  const cartItem = cartItems.find((ci) => ci.cartKey === cartKey);
  const qty      = cartItem ? cartItem.qty : 0;

  function handleAdd(e) {
    e.stopPropagation();
    onAddToCart(item, selectedVariant);
  }

  function handleQty(e, delta) {
    e.stopPropagation();
    onUpdateQty(cartKey, delta);
  }

  return (
    <>
      <div
        className={`sheet-overlay ${visible ? 'visible' : ''}`}
        onClick={handleClose}
      />
      <div className={`item-sheet ${visible ? 'visible' : ''}`}>
        {/* ── Image ── */}
        <div className="sheet-image-wrap">
          {item.image ? (
            <img src={item.image} alt={item.name} className="sheet-image" />
          ) : (
            <div className="sheet-image-placeholder">{icon}</div>
          )}
          <button className="sheet-close-btn" onClick={handleClose}>✕</button>
          {/* drag handle */}
          <div className="sheet-handle" />
        </div>

        {/* ── Content ── */}
        <div className="sheet-content">
          <div className="sheet-name-row">
            <h2 className="sheet-name">{item.name}</h2>
            <span className="sheet-price">₹{price}</span>
          </div>

          <span className="sheet-category-badge">{item.category}</span>

          <p className="sheet-desc">{item.description || 'No description available.'}</p>

          {/* Variant selector */}
          {hasVariants && (
            <div className="sheet-variants">
              <p className="sheet-variants-label">Choose size</p>
              <div className="sheet-variants-row">
                {item.variants.map((v) => (
                  <button
                    key={v.label}
                    className={`sheet-variant-btn ${selectedVariant.label === v.label ? 'active' : ''}`}
                    onClick={(e) => { e.stopPropagation(); setSelectedVariant(v); }}
                  >
                    <span className="sv-label">{v.label}</span>
                    <span className="sv-price">₹{v.price}</span>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* ── Action bar ── */}
        <div className="sheet-action-bar">
          {qty > 0 ? (
            <>
              <div className="sheet-qty-control">
                <button className="sheet-qty-btn" onClick={(e) => handleQty(e, -1)}>−</button>
                <span className="sheet-qty-value">{qty}</span>
                <button className="sheet-qty-btn" onClick={(e) => handleQty(e, +1)}>+</button>
              </div>
              <button className="sheet-add-btn" onClick={handleAdd}>
                🛒 Add 1 More · ₹{price}
              </button>
            </>
          ) : (
            <button className="sheet-add-btn full-width" onClick={handleAdd}>
              🛒 Add to Cart · ₹{price}
            </button>
          )}
        </div>
      </div>
    </>
  );
}
