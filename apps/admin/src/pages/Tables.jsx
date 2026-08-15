import { useState } from 'react';
import { api } from '../lib/api';
import { useApi } from '../lib/hooks';
import { useAuth } from '../context/auth-context';
import { useToast } from '../components/toast-context';
import Modal, { ConfirmModal } from '../components/Modal';
import { EmptyState, ErrorState, Spinner } from '../components/States';

const CUSTOMER_URL = (import.meta.env.VITE_CUSTOMER_URL || 'http://localhost:5173').replace(/\/$/, '');

/** The URL printed into a table's QR code — scanning it pre-fills the table. */
const qrUrlFor = (table) => `${CUSTOMER_URL}/?t=${table.qrToken}`;

/**
 * QR images come from a public renderer so no client-side QR library ships in the
 * bundle. The token in the URL is not a secret — it only names a table.
 */
const qrImageFor = (table, size = 220) =>
  `https://api.qrserver.com/v1/create-qr-code/?size=${size}x${size}&margin=8&data=${encodeURIComponent(qrUrlFor(table))}`;

export default function Tables() {
  const { can } = useAuth();
  const toast = useToast();
  const editable = can('PLATFORM_ADMIN', 'OWNER', 'MANAGER');

  const { data, loading, error, reload } = useApi((signal) => api.tables(signal), []);
  const [modal, setModal] = useState(null);
  const [qrTable, setQrTable] = useState(null);
  const [deleting, setDeleting] = useState(null);
  const [busy, setBusy] = useState(false);

  async function handleDelete() {
    setBusy(true);
    try {
      const result = await api.deleteTable(deleting.id);
      toast.success(result.deactivated ? result.message : 'Table removed');
      setDeleting(null);
      reload();
    } catch (err) { toast.error(err.message); }
    finally { setBusy(false); }
  }

  async function regenerate(table) {
    try {
      const { table: updated } = await api.regenerateQr(table.id);
      toast.success(`New QR code for ${table.label} — reprint it`);
      setQrTable(updated);
      reload();
    } catch (err) { toast.error(err.message); }
  }

  if (loading && !data) return <Spinner label="Loading your floor plan…" />;
  if (error) return <ErrorState message={error} onRetry={reload} />;

  // "T2" must come before "T10" — plain string sort puts them the other way round.
  const tables = [...data.tables].sort((a, b) =>
    a.label.localeCompare(b.label, undefined, { numeric: true, sensitivity: 'base' })
  );
  const occupied = tables.filter((t) => t.isOccupied).length;

  return (
    <>
      <header className="page-head">
        <div>
          <h1>Tables</h1>
          <p className="page-sub">
            {tables.length} tables · {occupied} currently occupied.
            Print each table&apos;s QR code so customers can order without typing.
          </p>
        </div>
        {editable && (
          <div className="page-actions">
            <button className="btn btn-ghost" onClick={() => setModal({ mode: 'bulk' })}>Add several</button>
            <button className="btn btn-primary" onClick={() => setModal({ mode: 'create' })}>+ Add table</button>
          </div>
        )}
      </header>

      {tables.length === 0 ? (
        <EmptyState icon="🪑" title="No tables yet"
          message="Add your tables so customers can tell the kitchen where they're sitting."
          action={editable && <button className="btn btn-primary" onClick={() => setModal({ mode: 'bulk' })}>Add tables</button>} />
      ) : (
        <div className="table-grid">
          {tables.map((table) => (
            <article key={table.id} className={`table-tile ${table.isOccupied ? 'occupied' : ''} ${table.isActive ? '' : 'inactive'}`}>
              <div className="table-tile-head">
                <strong>{table.label}</strong>
                <span className="table-seats">{table.seats} seats</span>
              </div>

              <div className="table-tile-status">
                {!table.isActive ? <span className="pill-muted">Inactive</span>
                  : table.isOccupied ? <span className="pill-alert">{table.activeOrders.length} live order{table.activeOrders.length > 1 ? 's' : ''}</span>
                  : <span className="pill-good">Free</span>}
              </div>

              <div className="table-tile-meta">{table.lifetimeOrders} orders all-time</div>

              <div className="table-tile-actions">
                <button className="link-btn" onClick={() => setQrTable(table)}>QR code</button>
                {editable && (
                  <>
                    <button className="link-btn" onClick={() => setModal({ mode: 'edit', table })}>Edit</button>
                    <button className="link-btn danger" onClick={() => setDeleting(table)}>Remove</button>
                  </>
                )}
              </div>
            </article>
          ))}
        </div>
      )}

      {modal && (
        <TableModal
          mode={modal.mode}
          initial={modal.table}
          onClose={() => setModal(null)}
          onSaved={() => { setModal(null); reload(); }}
        />
      )}

      {qrTable && (
        <Modal
          title={`Table ${qrTable.label}`}
          subtitle="Print this and place it on the table"
          onClose={() => setQrTable(null)}
          width={380}
          footer={
            <>
              {can('PLATFORM_ADMIN', 'OWNER', 'MANAGER') && (
                <button className="btn btn-ghost" onClick={() => regenerate(qrTable)}>Regenerate</button>
              )}
              <button className="btn btn-primary" onClick={() => window.print()}>Print</button>
            </>
          }
        >
          <div className="qr-block">
            <img src={qrImageFor(qrTable)} alt={`QR code for table ${qrTable.label}`} width={220} height={220} />
            <p className="qr-caption">Scan to order · Table {qrTable.label}</p>
            <code className="qr-url">{qrUrlFor(qrTable)}</code>
            <button className="link-btn" onClick={() => {
              navigator.clipboard?.writeText(qrUrlFor(qrTable));
              toast.success('Link copied');
            }}>Copy link</button>
          </div>
        </Modal>
      )}

      {deleting && (
        <ConfirmModal
          title={`Remove table ${deleting.label}?`}
          message={deleting.lifetimeOrders > 0
            ? `This table has ${deleting.lifetimeOrders} orders in its history, so it will be deactivated rather than deleted — past orders stay intact.`
            : 'This table has no order history and will be deleted permanently.'}
          confirmLabel="Remove"
          busy={busy}
          onConfirm={handleDelete}
          onClose={() => setDeleting(null)}
        />
      )}
    </>
  );
}

function TableModal({ mode, initial, onClose, onSaved }) {
  const toast = useToast();
  const [form, setForm] = useState({
    label: initial?.label ?? '',
    seats: initial?.seats ?? 4,
    isActive: initial?.isActive ?? true,
    prefix: 'T',
    count: 10,
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const set = (field) => (e) => setForm((f) => ({ ...f, [field]: e.target.value }));

  async function handleSubmit(e) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      if (mode === 'bulk') {
        const { created } = await api.bulkTables({
          prefix: form.prefix.trim(), count: Number(form.count), seats: Number(form.seats),
        });
        toast.success(`${created} tables added`);
      } else if (mode === 'create') {
        await api.createTable({ label: form.label.trim(), seats: Number(form.seats) });
        toast.success('Table added');
      } else {
        await api.updateTable(initial.id, {
          label: form.label.trim(), seats: Number(form.seats), isActive: form.isActive,
        });
        toast.success('Table updated');
      }
      onSaved();
    } catch (err) { setError(err.message); }
    finally { setBusy(false); }
  }

  const title = mode === 'bulk' ? 'Add several tables'
    : mode === 'create' ? 'Add a table' : `Edit table ${initial.label}`;

  return (
    <Modal title={title} onClose={onClose} width={420}
      footer={
        <>
          <button className="btn btn-ghost" onClick={onClose} disabled={busy}>Cancel</button>
          <button className="btn btn-primary" onClick={handleSubmit} disabled={busy}>
            {busy ? 'Saving…' : 'Save'}
          </button>
        </>
      }
    >
      <form onSubmit={handleSubmit} className="form">
        {mode === 'bulk' ? (
          <>
            <div className="field-row">
              <div className="field">
                <label>Label prefix</label>
                <input value={form.prefix} onChange={set('prefix')} maxLength={10} placeholder="T" />
              </div>
              <div className="field">
                <label>How many</label>
                <input type="number" min="1" max="60" value={form.count} onChange={set('count')} />
              </div>
            </div>
            <div className="field">
              <label>Seats per table</label>
              <input type="number" min="1" max="50" value={form.seats} onChange={set('seats')} />
            </div>
            <p className="field-hint">
              Creates {form.prefix}1 … {form.prefix}{form.count}, skipping any label you already use.
            </p>
          </>
        ) : (
          <>
            <div className="field">
              <label>Label <span className="req">*</span></label>
              <input value={form.label} onChange={set('label')} placeholder="e.g. T7 or Terrace 2" autoFocus maxLength={30} />
            </div>
            <div className="field">
              <label>Seats</label>
              <input type="number" min="1" max="50" value={form.seats} onChange={set('seats')} />
            </div>
            {mode === 'edit' && (
              <label className="checkbox">
                <input type="checkbox" checked={form.isActive}
                  onChange={(e) => setForm((f) => ({ ...f, isActive: e.target.checked }))} />
                Available for orders
              </label>
            )}
          </>
        )}
        {error && <p className="form-error">{error}</p>}
      </form>
    </Modal>
  );
}
