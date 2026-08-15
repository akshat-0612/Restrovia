import { formatCurrency, formatDateTime, minutesSince, ORDER_STATUS } from '@shared';
import { isTerminal } from '../hooks/useMyOrders';

/**
 * Every order this device has placed, newest first. A customer who ordered food
 * and then dessert has two live orders — both stay reachable from here.
 */
export default function MyOrders({ orders, restaurant, onOpen, onBack, onClearFinished }) {
  const symbol = restaurant.currencySymbol;
  const live = orders.filter((o) => !isTerminal(o));
  const past = orders.filter(isTerminal);

  return (
    <div className="orders-screen">
      <header className="orders-head">
        <button className="orders-back" onClick={onBack} aria-label="Back to menu">←</button>
        <div>
          <h1>Your orders</h1>
          <p>
            {live.length > 0
              ? `${live.length} in progress${past.length ? ` · ${past.length} completed` : ''}`
              : `${orders.length} order${orders.length === 1 ? '' : 's'}`}
          </p>
        </div>
      </header>

      {orders.length === 0 ? (
        <div className="orders-empty">
          <span className="empty-icon">🧾</span>
          <p>No orders yet</p>
          <button className="btn-continue" onClick={onBack}>Browse the menu</button>
        </div>
      ) : (
        <div className="orders-list">
          {live.length > 0 && <h2 className="orders-group">In progress</h2>}
          {live.map((order) => (
            <OrderRow key={order.id} order={order} symbol={symbol} onOpen={onOpen} restaurant={restaurant} />
          ))}

          {past.length > 0 && (
            <div className="orders-group-row">
              <h2 className="orders-group">Earlier</h2>
              <button className="orders-clear" onClick={onClearFinished}>Clear</button>
            </div>
          )}
          {past.map((order) => (
            <OrderRow key={order.id} order={order} symbol={symbol} onOpen={onOpen} restaurant={restaurant} />
          ))}
        </div>
      )}
    </div>
  );
}

function OrderRow({ order, symbol, onOpen, restaurant }) {
  const meta = ORDER_STATUS[order.status];
  const done = isTerminal(order);
  const elapsed = minutesSince(order.placedAt);
  const eta = Math.max(0, (restaurant.avgPrepTimeMins || 15) - elapsed);

  // Two or three names is enough to recognise the order; the rest is a count.
  const preview = order.items.slice(0, 3).map((i) => i.nameSnapshot).join(', ');
  const extra = order.items.length - 3;

  return (
    <button className={`order-row ${done ? 'done' : 'live'}`} onClick={() => onOpen(order)}>
      <div className="order-row-top">
        <span className="order-row-num">#{order.orderNumber}</span>
        <span className={`order-row-status status-${order.status.toLowerCase()}`}>
          {meta.icon} {meta.customerLabel}
        </span>
        <span className="order-row-total">{formatCurrency(order.totalAmount, symbol)}</span>
      </div>

      <p className="order-row-items">
        {preview}{extra > 0 && ` +${extra} more`}
      </p>

      <div className="order-row-foot">
        <span>Table {order.tableLabel} · {formatDateTime(order.placedAt)}</span>
        {!done && (
          <span className="order-row-eta">
            {order.status === 'READY' ? 'Ready to collect' : eta > 0 ? `~${eta} min` : 'Any moment'}
          </span>
        )}
      </div>
    </button>
  );
}
