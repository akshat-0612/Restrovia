import { formatCurrency } from '@shared';

export default function CartSidebar({
  lines, totals, currencySymbol, quote, quoteError, isAcceptingOrders, closedMessage,
  onChangeQty, onRemove, onClose, onCheckout,
}) {
  const empty = lines.length === 0;

  return (
    <>
      <div className="cart-overlay" onClick={onClose} />
      <aside className="cart-sidebar" role="dialog" aria-label="Your cart">
        <div className="cart-header">
          <h2>Your order</h2>
          <button className="btn-close" onClick={onClose} aria-label="Close cart">✕</button>
        </div>

        <div className="cart-items">
          {empty ? (
            <div className="cart-empty">
              <span className="empty-icon">🛒</span>
              <p>Your cart is empty</p>
              <span className="cart-empty-hint">Add something from the menu to get started.</span>
            </div>
          ) : (
            lines.map((line) => (
              <div key={line.key} className="cart-item">
                <div className="cart-item-icon">{line.categoryIcon || '🍴'}</div>
                <div className="cart-item-info">
                  <div className="cart-item-name">{line.name}</div>
                  <div className="cart-item-meta">
                    {line.variantLabel && <span className="cart-variant-tag">{line.variantLabel}</span>}
                    <span>{formatCurrency(line.price, currencySymbol)} each</span>
                  </div>
                  <div className="cart-item-price">{formatCurrency(line.price * line.quantity, currencySymbol)}</div>
                </div>
                <div className="cart-item-actions">
                  <div className="cart-item-qty">
                    <button className="qty-btn" onClick={() => onChangeQty(line.key, -1)} aria-label="Remove one">−</button>
                    <span className="qty-value">{line.quantity}</span>
                    <button className="qty-btn" onClick={() => onChangeQty(line.key, +1)} aria-label="Add one">+</button>
                  </div>
                  <button className="cart-remove" onClick={() => onRemove(line.key)}>Remove</button>
                </div>
              </div>
            ))
          )}
        </div>

        {!empty && (
          <div className="cart-footer">
            {/* Falls back to the locally-computed subtotal while the server quote is in flight. */}
            <div className="bill-rows">
              <div className="bill-row">
                <span>Subtotal</span>
                <span>{formatCurrency(quote?.subtotal ?? totals.subtotal, currencySymbol)}</span>
              </div>
              {quote?.discountAmount > 0 && (
                <div className="bill-row discount">
                  <span>Discount {quote.couponCode && <em>({quote.couponCode})</em>}</span>
                  <span>−{formatCurrency(quote.discountAmount, currencySymbol)}</span>
                </div>
              )}
              {quote && !quote.taxInclusive && (
                <div className="bill-row muted">
                  <span>{quote.taxLabel} ({quote.taxPercent}%)</span>
                  <span>{formatCurrency(quote.taxAmount, currencySymbol)}</span>
                </div>
              )}
            </div>

            {quoteError && <p className="cart-warning">{quoteError}</p>}

            <div className="cart-total">
              <span className="cart-total-label">
                Total · {totals.count} {totals.count === 1 ? 'item' : 'items'}
              </span>
              <span className="cart-total-value">
                {formatCurrency(quote?.totalAmount ?? totals.subtotal, currencySymbol)}
              </span>
            </div>

            {isAcceptingOrders ? (
              <button className="btn-place-order" onClick={onCheckout}>
                Continue to details →
              </button>
            ) : (
              <div className="cart-closed-note">{closedMessage}</div>
            )}
            <p className="cart-pay-note">💵 Pay at the counter — no online payment needed.</p>
          </div>
        )}
      </aside>
    </>
  );
}
