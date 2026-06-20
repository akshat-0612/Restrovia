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

export default function CartSidebar({ cartItems, onUpdateQty, onClose, onPlaceOrder }) {
  const total = cartItems.reduce((sum, i) => sum + i.price * i.qty, 0);
  const totalQty = cartItems.reduce((s, i) => s + i.qty, 0);

  return (
    <>
      <div className="cart-overlay" onClick={onClose} />
      <aside className="cart-sidebar">
        <div className="cart-header">
          <h2>Your Cart</h2>
          <button className="btn-close" onClick={onClose}>✕</button>
        </div>

        <div className="cart-items">
          {cartItems.length === 0 ? (
            <div className="cart-empty">
              <span className="empty-icon">🛒</span>
              Your cart is empty.
            </div>
          ) : (
            cartItems.map((item) => (
              <div key={item.cartKey} className="cart-item">
                <div className="cart-item-icon">
                  {CATEGORY_ICONS[item.category] || '🍴'}
                </div>
                <div className="cart-item-info">
                  <div className="cart-item-name">{item.name}</div>
                  {item.variant && (
                    <div className="cart-item-meta">{item.variant}</div>
                  )}
                  <div className="cart-item-price">
                    ₹{(item.price * item.qty).toFixed(2)}
                  </div>
                </div>
                <div className="cart-item-qty">
                  <button className="qty-btn" onClick={() => onUpdateQty(item.cartKey, -1)}>−</button>
                  <span className="qty-value">{item.qty}</span>
                  <button className="qty-btn" onClick={() => onUpdateQty(item.cartKey, +1)}>+</button>
                </div>
              </div>
            ))
          )}
        </div>

        <div className="cart-footer">
          <div className="cart-total">
            <span className="cart-total-label">
              Total ({totalQty} {totalQty === 1 ? 'item' : 'items'})
            </span>
            <span className="cart-total-value">₹{total.toFixed(2)}</span>
          </div>
          <button
            className="btn-place-order"
            disabled={cartItems.length === 0}
            onClick={onPlaceOrder}
          >
            Place Order →
          </button>
        </div>
      </aside>
    </>
  );
}
