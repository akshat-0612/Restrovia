import { useEffect, useMemo, useRef, useState } from 'react';
import { formatCurrency, formatElapsed, formatTime, minutesSince, ORDER_STATUS } from '@shared';
import { api } from '../lib/api';
import { usePolling, useOrderChime, useMediaQuery } from '../lib/hooks';
import { useAuth } from '../context/auth-context';
import { useToast } from '../components/toast-context';
import { EmptyState, ErrorState, Spinner } from '../components/States';
import Modal from '../components/Modal';
import PushToggle from '../components/PushToggle';

/** The board's columns, in kitchen order. Each names the action that advances it. */
const COLUMNS = [
  { status: 'PLACED',    title: 'New',       action: 'ACCEPTED',  actionLabel: 'Accept' },
  { status: 'ACCEPTED',  title: 'Accepted',  action: 'PREPARING', actionLabel: 'Start cooking' },
  { status: 'PREPARING', title: 'Preparing', action: 'READY',     actionLabel: 'Mark ready' },
  { status: 'READY',     title: 'Ready',     action: 'COMPLETED', actionLabel: 'Served' },
];

/** An order older than this in a pre-ready state gets flagged on the board. */
const LATE_AFTER_MINS = 25;

/**
 * Below this the board is one column wide, so all four stages stack and a busy
 * "New" queue buries everything under it.
 *
 * The stage switcher is offered at every width — it is just as useful for
 * concentrating on one queue during a rush on a large screen — but it is what a
 * phone *opens* on, because there the alternative is scrolling past every new
 * order to reach the ready ones.
 *
 * Must stay in step with the `.kanban` single-column rule in index.css.
 */
const NARROW = '(max-width: 860px)';

export default function LiveOrders() {
  const { user } = useAuth();
  const toast = useToast();
  const chime = useOrderChime();
  const symbol = user.restaurant?.currencySymbol || '₹';

  const { data, error, loading, refresh } = usePolling((signal) => api.liveOrders(signal), 10000);
  const [soundOn, setSoundOn] = useState(() => localStorage.getItem('restrovia:sound') !== 'off');
  const [busyId, setBusyId] = useState(null);
  const narrow = useMediaQuery(NARROW);
  // Read once, at mount: a phone opens on the queue that needs attention, a wide
  // screen on the whole board. After that it is whatever the user last chose,
  // which must survive a resize rather than being reset by one.
  const [stage, setStage] = useState(
    () => (typeof window !== 'undefined' && window.matchMedia(NARROW).matches ? 'PLACED' : 'ALL')
  );
  const [cancelTarget, setCancelTarget] = useState(null);
  const [cancelReason, setCancelReason] = useState('');
  // Ticks once a minute so the "x min ago" labels stay honest between polls.
  const [, setClock] = useState(0);

  const seenIds = useRef(null);
  const orders = useMemo(() => data?.orders ?? [], [data]);

  useEffect(() => {
    const id = setInterval(() => setClock((n) => n + 1), 30000);
    return () => clearInterval(id);
  }, []);

  // Chime only for orders that appeared since the last poll — never on first load,
  // which would fire on every page visit.
  useEffect(() => {
    if (!data) return;
    const ids = new Set(orders.map((o) => o.id));
    if (seenIds.current) {
      const arrived = orders.filter((o) => o.status === 'PLACED' && !seenIds.current.has(o.id));
      if (arrived.length > 0) {
        if (soundOn) chime();
        toast.info(`${arrived.length} new order${arrived.length > 1 ? 's' : ''} came in`);
      }
    }
    seenIds.current = ids;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data]);

  function toggleSound() {
    setSoundOn((on) => {
      localStorage.setItem('restrovia:sound', on ? 'off' : 'on');
      if (on === false) chime();
      return !on;
    });
  }

  async function move(order, status, note) {
    setBusyId(order.id);
    try {
      await api.setStatus(order.id, status, note);
      toast.success(`Order #${order.orderNumber} → ${ORDER_STATUS[status].label}`);
      refresh();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setBusyId(null);
    }
  }

  async function confirmCancel() {
    if (!cancelReason.trim()) return;
    await move(cancelTarget, 'CANCELLED', cancelReason);
    setCancelTarget(null);
    setCancelReason('');
  }

  if (loading && !data) return <Spinner label="Loading the kitchen board…" />;
  if (error && !data) return <ErrorState message={error} onRetry={refresh} />;

  const grouped = COLUMNS.map((col) => ({
    ...col,
    orders: orders.filter((o) => o.status === col.status),
  }));

  const visible = stage === 'ALL' ? grouped : grouped.filter((col) => col.status === stage);

  return (
    <>
      <header className="page-head">
        <div>
          <h1>Live orders</h1>
          <p className="page-sub">
            {orders.length === 0 ? 'Nothing in the kitchen.' : `${orders.length} order${orders.length > 1 ? 's' : ''} in progress`}
            <span className="poll-hint"><span className="live-dot" /> auto-refreshing</span>
          </p>
        </div>
        <div className="page-actions">
          <PushToggle />
          <button className={`btn btn-ghost ${soundOn ? '' : 'muted'}`} onClick={toggleSound}>
            {soundOn ? '🔔 Sound on' : '🔕 Sound off'}
          </button>
          <button className="btn btn-ghost" onClick={refresh}>Refresh</button>
        </div>
      </header>

      {orders.length === 0 ? (
        <EmptyState icon="✨" title="All caught up"
          message="New orders will appear here the moment a customer places one." />
      ) : (
        <>
        <div className="board-filter" aria-label="Show one stage">
          <button
            type="button"
            className={`board-filter-btn ${stage === 'ALL' ? 'active' : ''}`}
            aria-pressed={stage === 'ALL'}
            onClick={() => setStage('ALL')}
          >
            All <span className="board-filter-count">{orders.length}</span>
          </button>
          {grouped.map((column) => (
            <button
              key={column.status}
              type="button"
              className={`board-filter-btn ${stage === column.status ? 'active' : ''}`}
              aria-pressed={stage === column.status}
              onClick={() => setStage(column.status)}
            >
              <span className={`kanban-dot status-${column.status.toLowerCase()}`} />
              {column.title} <span className="board-filter-count">{column.orders.length}</span>
            </button>
          ))}
        </div>

        <div className={`kanban ${stage === 'ALL' ? '' : 'focused'}`}>
          {visible.map((column) => (
            <section key={column.status} className="kanban-col">
              <header className="kanban-col-head">
                <span className={`kanban-dot status-${column.status.toLowerCase()}`} />
                <h2>{column.title}</h2>
                <span className="kanban-count">{column.orders.length}</span>
              </header>

              <div className="kanban-body">
                {column.orders.length === 0 && (
                  // A lone "—" reads as broken when it is the only thing on screen.
                  <p className="kanban-empty">{narrow ? 'Nothing at this stage.' : '—'}</p>
                )}
                {column.orders.map((order) => {
                  const elapsed = minutesSince(order.placedAt);
                  const late = elapsed > LATE_AFTER_MINS && order.status !== 'READY';
                  return (
                    <article key={order.id} className={`order-card ${late ? 'late' : ''}`}>
                      <div className="order-card-head">
                        <span className="order-num">#{order.orderNumber}</span>
                        <span className="order-table">Table {order.tableLabel}</span>
                        <span className={`order-age ${late ? 'late' : ''}`}>{formatElapsed(elapsed)}</span>
                      </div>

                      <div className="order-customer">
                        <strong>{order.customerName}</strong>
                        {order.customerPhone && <span>{order.customerPhone}</span>}
                      </div>

                      <ul className="order-items">
                        {order.items.map((item) => (
                          <li key={item.id}>
                            <span className="order-item-qty">{item.quantity}×</span>
                            <span className="order-item-name">
                              {item.nameSnapshot}
                              {item.variantLabel && <em> · {item.variantLabel}</em>}
                            </span>
                          </li>
                        ))}
                      </ul>

                      {order.notes && <p className="order-note">📝 {order.notes}</p>}

                      <div className="order-card-foot">
                        <span className="order-total">{formatCurrency(order.totalAmount, symbol)}</span>
                        <span className="order-placed">{formatTime(order.placedAt)}</span>
                      </div>

                      <div className="order-actions">
                        <button
                          className="btn btn-primary btn-sm btn-block"
                          disabled={busyId === order.id}
                          onClick={() => move(order, column.action)}
                        >
                          {busyId === order.id ? 'Saving…' : column.actionLabel}
                        </button>
                        <button
                          className="btn btn-ghost btn-sm"
                          disabled={busyId === order.id}
                          onClick={() => setCancelTarget(order)}
                        >
                          Cancel
                        </button>
                      </div>
                    </article>
                  );
                })}
              </div>
            </section>
          ))}
        </div>
        </>
      )}

      {cancelTarget && (
        <Modal
          title={`Cancel order #${cancelTarget.orderNumber}?`}
          subtitle={`${cancelTarget.customerName} · Table ${cancelTarget.tableLabel}`}
          onClose={() => { setCancelTarget(null); setCancelReason(''); }}
          width={420}
          footer={
            <>
              <button className="btn btn-ghost" onClick={() => { setCancelTarget(null); setCancelReason(''); }}>
                Keep order
              </button>
              <button className="btn btn-danger" onClick={confirmCancel} disabled={!cancelReason.trim()}>
                Cancel order
              </button>
            </>
          }
        >
          <div className="field">
            <label htmlFor="reason">Reason <span className="req">*</span></label>
            <input
              id="reason" value={cancelReason} onChange={(e) => setCancelReason(e.target.value)}
              placeholder="e.g. Item out of stock" autoFocus maxLength={200}
            />
            <span className="field-hint">Saved to the order&apos;s history so you can review cancellations later.</span>
          </div>
          <div className="quick-reasons">
            {['Item out of stock', 'Customer left', 'Duplicate order', 'Customer changed their mind'].map((r) => (
              <button key={r} type="button" className="chip-btn" onClick={() => setCancelReason(r)}>{r}</button>
            ))}
          </div>
        </Modal>
      )}
    </>
  );
}
