import { CUSTOMER_JOURNEY, ORDER_STATUS, formatCurrency, formatTime, minutesSince } from '@shared';

/**
 * Confirmation and live tracking in one screen. Purely presentational — the
 * order is polled by useActiveOrder, so it keeps updating even when the customer
 * flips back to the menu.
 */
export default function OrderTracker({ order, restaurant, onDone }) {
  const symbol = restaurant.currencySymbol;
  const isActive = !['COMPLETED', 'CANCELLED'].includes(order.status);

  const currentIndex = CUSTOMER_JOURNEY.indexOf(order.status);
  const cancelled = order.status === 'CANCELLED';
  const elapsed = minutesSince(order.placedAt);
  const eta = Math.max(0, (restaurant.avgPrepTimeMins || 15) - elapsed);

  return (
    <div className="tracker-screen">
      <div className="tracker-card">
        <div className={`tracker-hero ${cancelled ? 'cancelled' : ''}`}>
          <div className="tracker-hero-icon">{cancelled ? '✖️' : order.status === 'READY' ? '🔔' : '✅'}</div>
          <h1>
            {cancelled ? 'Order cancelled'
              : order.status === 'READY' ? 'Your order is ready!'
              : order.status === 'COMPLETED' ? 'Enjoy your meal!'
              : 'Order placed'}
          </h1>
          <p className="tracker-order-id">
            Order #{order.orderNumber} · Table {order.tableLabel}
          </p>
          {cancelled && order.cancelReason && <p className="tracker-cancel-reason">{order.cancelReason}</p>}
          {isActive && (
            <p className="tracker-eta">
              {order.status === 'READY'
                ? 'Please collect it from the counter.'
                : eta > 0
                  ? `Ready in roughly ${eta} min`
                  : 'Any moment now…'}
            </p>
          )}
        </div>

        {!cancelled && (
          <ol className="tracker-steps">
            {CUSTOMER_JOURNEY.map((key, index) => {
              const meta = ORDER_STATUS[key];
              const state = index < currentIndex ? 'done' : index === currentIndex ? 'active' : 'todo';
              const event = order.events?.find((e) => e.toStatus === key);
              return (
                <li key={key} className={`tracker-step ${state}`}>
                  <span className="tracker-step-dot">{state === 'done' ? '✓' : meta.icon}</span>
                  <div className="tracker-step-body">
                    <span className="tracker-step-label">{meta.customerLabel}</span>
                    {event && <span className="tracker-step-time">{formatTime(event.createdAt)}</span>}
                  </div>
                </li>
              );
            })}
          </ol>
        )}

        <div className="tracker-items">
          <h3>Your items</h3>
          {order.items.map((item) => (
            <div key={item.id} className="tracker-item">
              <span className="tracker-item-qty">{item.quantity}×</span>
              <span className="tracker-item-name">
                {item.nameSnapshot}
                {item.variantLabel && <em> · {item.variantLabel}</em>}
              </span>
              <span className="tracker-item-price">{formatCurrency(item.lineTotal, symbol)}</span>
            </div>
          ))}
          {order.notes && <p className="tracker-note">📝 {order.notes}</p>}
        </div>

        <div className="tracker-bill">
          <div className="bill-row"><span>Subtotal</span><span>{formatCurrency(order.subtotal, symbol)}</span></div>
          {Number(order.discountAmount) > 0 && (
            <div className="bill-row discount">
              <span>Discount {order.couponCode && <em>({order.couponCode})</em>}</span>
              <span>−{formatCurrency(order.discountAmount, symbol)}</span>
            </div>
          )}
          <div className="bill-row muted">
            <span>{restaurant.taxLabel} ({order.taxPercent}%)</span>
            <span>{formatCurrency(order.taxAmount, symbol)}</span>
          </div>
          <div className="bill-row total">
            <span>{order.isPaid ? 'Paid' : 'Pay at counter'}</span>
            <span>{formatCurrency(order.totalAmount, symbol)}</span>
          </div>
        </div>

        {isActive && (
          <p className="tracker-live-hint">
            <span className="live-dot" /> Updating live — keep this screen open
          </p>
        )}

        <button className="btn-continue" onClick={onDone}>
          {isActive ? 'Order something else' : 'Back to menu'}
        </button>
      </div>
    </div>
  );
}
