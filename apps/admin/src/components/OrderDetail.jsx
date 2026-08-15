import { useState } from 'react';
import { formatCurrency, formatDateTime, ORDER_STATUS } from '@shared';
import { api } from '../lib/api';
import { useApi } from '../lib/hooks';
import { useAuth } from '../context/auth-context';
import { useToast } from './toast-context';
import { Spinner, StatusPill } from './States';

/** Read-only history view of one order, with the two actions still available on it. */
export default function OrderDetail({ orderId, symbol, onClose, onChanged }) {
  const { can } = useAuth();
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const { data, loading, error, reload } = useApi(() => api.order(orderId), [orderId]);

  const order = data?.order;

  async function togglePaid() {
    setBusy(true);
    try {
      await api.setPayment(order.id, !order.isPaid);
      toast.success(order.isPaid ? 'Marked unpaid' : 'Marked paid');
      reload();
      onChanged?.();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <div className="drawer-scrim" onClick={onClose} />
      <aside className="drawer" role="dialog" aria-label="Order detail">
        <header className="drawer-head">
          <div>
            <h2>{order ? `Order #${order.orderNumber}` : 'Order'}</h2>
            {order && <p>{formatDateTime(order.placedAt)}</p>}
          </div>
          <button className="icon-btn" onClick={onClose} aria-label="Close">✕</button>
        </header>

        <div className="drawer-body">
          {loading && <Spinner />}
          {error && <p className="form-error">{error}</p>}

          {order && (
            <>
              <div className="drawer-status">
                <StatusPill status={order.status} label={ORDER_STATUS[order.status].label} />
                {order.status === 'CANCELLED' && order.cancelReason && (
                  <p className="cancel-reason">Reason: {order.cancelReason}</p>
                )}
              </div>

              <dl className="detail-list">
                <div><dt>Customer</dt><dd>{order.customerName}</dd></div>
                {order.customerPhone && <div><dt>Phone</dt><dd>{order.customerPhone}</dd></div>}
                <div><dt>Table</dt><dd>{order.tableLabel || '—'}</dd></div>
                {order.notes && <div><dt>Notes</dt><dd>{order.notes}</dd></div>}
              </dl>

              <h3 className="drawer-section">Items</h3>
              <table className="mini-table">
                <tbody>
                  {order.items.map((item) => (
                    <tr key={item.id}>
                      <td className="qty">{item.quantity}×</td>
                      <td>
                        {item.nameSnapshot}
                        {item.variantLabel && <em> · {item.variantLabel}</em>}
                        <span className="mini-cat">{item.categorySnapshot}</span>
                      </td>
                      <td className="num">{formatCurrency(item.lineTotal, symbol)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>

              <div className="drawer-bill">
                <div className="bill-line"><span>Subtotal</span><span>{formatCurrency(order.subtotal, symbol)}</span></div>
                {Number(order.discountAmount) > 0 && (
                  <div className="bill-line discount">
                    <span>Discount {order.couponCode && `(${order.couponCode})`}</span>
                    <span>−{formatCurrency(order.discountAmount, symbol)}</span>
                  </div>
                )}
                <div className="bill-line"><span>Tax ({order.taxPercent}%)</span><span>{formatCurrency(order.taxAmount, symbol)}</span></div>
                <div className="bill-line total"><span>Total</span><span>{formatCurrency(order.totalAmount, symbol)}</span></div>
              </div>

              <h3 className="drawer-section">History</h3>
              <ol className="timeline">
                {order.events.map((event) => (
                  <li key={event.id}>
                    <span className={`timeline-dot status-${event.toStatus.toLowerCase()}`} />
                    <div>
                      <strong>{ORDER_STATUS[event.toStatus].label}</strong>
                      <span>{formatDateTime(event.createdAt)} · {event.byUser?.name || event.byName}</span>
                      {event.note && <em>{event.note}</em>}
                    </div>
                  </li>
                ))}
              </ol>
            </>
          )}
        </div>

        {order && can('PLATFORM_ADMIN', 'OWNER', 'MANAGER') && (
          <footer className="drawer-foot">
            <button className={`btn ${order.isPaid ? 'btn-ghost' : 'btn-primary'} btn-block`}
              onClick={togglePaid} disabled={busy}>
              {order.isPaid ? 'Mark as unpaid' : `Mark paid · ${formatCurrency(order.totalAmount, symbol)}`}
            </button>
          </footer>
        )}
      </aside>
    </>
  );
}
