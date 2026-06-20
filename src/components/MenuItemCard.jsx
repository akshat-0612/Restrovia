import { useState } from 'react';

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

export default function MenuItemCard({ item, cartItems, onAddToCart, onUpdateQty, onCardClick }) {
  const hasVariants = Array.isArray(item.variants) && item.variants.length > 1;
  const [selectedVariant, setSelectedVariant] = useState(
    hasVariants ? item.variants[0] : null
  );

  const icon     = CATEGORY_ICONS[item.category] || '🍴';
  const price    = hasVariants ? selectedVariant.price : item.price;
  const cartKey  = hasVariants ? `${item.id}_${selectedVariant.label}` : `${item.id}`;
  const cartItem = cartItems.find((ci) => ci.cartKey === cartKey);
  const qty      = cartItem ? cartItem.qty : 0;

  return (
    <div className="menu-card" onClick={() => onCardClick(item)}>
      {/* Image with tap hint */}
      <div className="menu-card-img-wrap">
        {item.image ? (
          <img src={item.image} alt={item.name} className="menu-card-image" />
        ) : (
          <div className="menu-card-image-placeholder">{icon}</div>
        )}
        <div className="card-tap-hint">tap for details</div>
      </div>

      <div className="menu-card-body">
        <span className="menu-card-category">{item.category}</span>
        <h3 className="menu-card-name">{item.name}</h3>
        <p className="menu-card-desc">{item.description}</p>

        {/* Variant selector */}
        {hasVariants && (
          <div className="variant-selector">
            {item.variants.map((v) => (
              <button
                key={v.label}
                className={`variant-btn ${selectedVariant.label === v.label ? 'active' : ''}`}
                onClick={(e) => { e.stopPropagation(); setSelectedVariant(v); }}
              >
                {v.label}
                <br />
                <span style={{ fontSize: '0.7rem' }}>₹{v.price}</span>
              </button>
            ))}
          </div>
        )}

        <div className="menu-card-footer">
          <span className="menu-card-price">₹{price}</span>

          {qty === 0 ? (
            <button
              className="btn-add-to-cart"
              onClick={(e) => { e.stopPropagation(); onAddToCart(item, selectedVariant); }}
            >
              + Add
            </button>
          ) : (
            <div className="card-qty-control" onClick={(e) => e.stopPropagation()}>
              <button className="card-qty-btn" onClick={() => onUpdateQty(cartKey, -1)}>−</button>
              <span className="card-qty-value">{qty}</span>
              <button className="card-qty-btn" onClick={() => onUpdateQty(cartKey, +1)}>+</button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
