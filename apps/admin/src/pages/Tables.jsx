import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { api } from '../lib/api';
import { useApi } from '../lib/hooks';
import { useAuth } from '../context/auth-context';
import { useToast } from '../components/toast-context';
import Modal, { ConfirmModal } from '../components/Modal';
import TableTent from '../components/TableTent';
import { TENT_THEMES, HEAVY_INK } from '../components/tent-themes';
import { EmptyState, ErrorState, Spinner } from '../components/States';

/** Two across, two down — as many as fit on A4 with room to cut them out. */
const TENTS_PER_PAGE = 4;

const chunk = (items, size) =>
  items.reduce((pages, item, i) => {
    if (i % size === 0) pages.push([]);
    pages[pages.length - 1].push(item);
    return pages;
  }, []);

/** Last resort only: local development, before any storefront URL is configured. */
const DEV_FALLBACK = (import.meta.env.VITE_CUSTOMER_URL || 'http://localhost:5173').replace(/\/+$/, '');

/**
 * Where this restaurant's customers order.
 *
 * This cannot be a build-time constant: one admin portal serves every restaurant,
 * so a single baked-in URL would print another restaurant's storefront onto these
 * QR codes. Prefer what the owner configured, then the primary registered domain.
 */
function storefrontBase(restaurant) {
  if (restaurant?.storefrontUrl) return restaurant.storefrontUrl.replace(/\/+$/, '');
  const primary = restaurant?.domains?.find((d) => d.isPrimary) ?? restaurant?.domains?.[0];
  if (primary) return `https://${primary.hostname}`;
  return DEV_FALLBACK;
}

/** The URL printed into a table's QR code — scanning it pre-fills the table. */
const qrUrlFor = (base, table) => `${base}/?t=${table.qrToken}`;

/** The design chooser, shared by the single-table and whole-set dialogs. */
function ThemePicker({ theme, onChange, restaurant }) {
  return (
    <>
      <span className="block-label">Design</span>
      <div className="theme-picker">
        {TENT_THEMES.map((t) => (
          <button key={t.id} type="button"
            className={`theme-option ${theme === t.id ? 'active' : ''}`}
            onClick={() => onChange(t.id)}>
            <span className="theme-swatch" aria-hidden>
              <i style={{ background: restaurant?.primaryColor || '#c4451f' }} />
              <i style={{ background: restaurant?.accentColor || '#f5b301' }} />
            </span>
            <strong>{t.name}</strong>
            <span>{t.note}</span>
          </button>
        ))}
      </div>
      {HEAVY_INK.includes(theme) && (
        <p className="field-hint" style={{ marginTop: '0.6rem' }}>
          This design covers the whole card in colour. Printing a full set uses a lot of
          ink — Classic or Banner is kinder to a desk printer.
        </p>
      )}
    </>
  );
}

export default function Tables() {
  const { can } = useAuth();
  const toast = useToast();
  const editable = can('PLATFORM_ADMIN', 'OWNER', 'MANAGER');

  const { data, loading, error, reload } = useApi((signal) => api.tables(signal), []);
  const settings = useApi((signal) => api.settings(signal), []);
  const base = storefrontBase(settings.data?.restaurant);
  const restaurant = settings.data?.restaurant;
  const storefrontConfigured = Boolean(restaurant?.storefrontUrl || restaurant?.domains?.length);

  // Adopt the saved theme once settings arrive, without stomping a live choice.
  useEffect(() => {
    if (restaurant?.qrTheme) setTheme(restaurant.qrTheme);
  }, [restaurant?.qrTheme]);

  /** Persist the choice so every table prints alike, then hand off to the browser. */
  async function printTents(which) {
    setPrinting(which);
    if (restaurant && theme !== restaurant.qrTheme) {
      try { await api.updateSettings({ qrTheme: theme }); settings.reload(); }
      catch { /* printing matters more than remembering the choice */ }
    }
    // Let the sheets mount before the dialog snapshots the page. They stay mounted
    // until afterprint fires — clearing straight after window.print() races the
    // browser and can hand it an empty page.
    requestAnimationFrame(() => requestAnimationFrame(() => window.print()));
  }

  useEffect(() => {
    const done = () => setPrinting(null);
    window.addEventListener('afterprint', done);
    return () => window.removeEventListener('afterprint', done);
  }, []);
  const [modal, setModal] = useState(null);
  const [qrTable, setQrTable] = useState(null);
  /** null = print one table; 'all' = every active table, one per page. */
  const [printing, setPrinting] = useState(null);
  const [theme, setTheme] = useState('classic');
  const [printAll, setPrintAll] = useState(false);
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
            {tables.length > 0 && (
              <button className="btn btn-ghost" onClick={() => setPrintAll(true)}>
                Print all QR codes
              </button>
            )}
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
          subtitle="Pick a design, then print and stand it on the table"
          onClose={() => setQrTable(null)}
          width={620}
          footer={
            <>
              {can('PLATFORM_ADMIN', 'OWNER', 'MANAGER') && (
                <button className="btn btn-ghost" onClick={() => regenerate(qrTable)}>Regenerate code</button>
              )}
              <button className="btn btn-primary" onClick={() => printTents(qrTable)}>
                Print this table
              </button>
            </>
          }
        >
          {!storefrontConfigured && (
            <p className="qr-warning">
              No storefront URL is set for this restaurant, so this code points at
              <code> {base}</code>. Set it under Settings → Storefront before printing.
            </p>
          )}

          <div className="qr-layout">
            <div className="qr-preview-pane">
              <TableTent restaurant={restaurant} table={qrTable}
                url={qrUrlFor(base, qrTable)} theme={theme} preview />
            </div>

            <div className="qr-choices">
              <ThemePicker theme={theme} onChange={setTheme} restaurant={restaurant} />

              <span className="block-label" style={{ marginTop: '1rem' }}>Link in this code</span>
              <code className="qr-url">{qrUrlFor(base, qrTable)}</code>
              <button className="link-btn" onClick={() => {
                navigator.clipboard?.writeText(qrUrlFor(base, qrTable));
                toast.success('Link copied');
              }}>Copy link</button>
            </div>
          </div>
        </Modal>
      )}

      {printAll && (
        <Modal
          title="Print every table"
          subtitle={`${tables.filter((t) => t.isActive).length} tables · four per sheet, with cut lines`}
          onClose={() => setPrintAll(false)}
          width={560}
          footer={
            <>
              <button className="btn btn-ghost" onClick={() => setPrintAll(false)}>Cancel</button>
              <button className="btn btn-primary" onClick={() => { setPrintAll(false); printTents('all'); }}>
                Print {tables.filter((t) => t.isActive).length} tables
              </button>
            </>
          }
        >
          {!storefrontConfigured && (
            <p className="qr-warning">
              No storefront URL is set for this restaurant, so every code will point at
              <code> {base}</code>. Set it under Settings → Storefront before printing a
              whole set.
            </p>
          )}

          <div className="qr-layout">
            <div className="qr-preview-pane">
              {tables[0] && (
                <TableTent restaurant={restaurant} table={tables[0]}
                  url={qrUrlFor(base, tables[0])} theme={theme} preview />
              )}
            </div>
            <div className="qr-choices">
              <ThemePicker theme={theme} onChange={setTheme} restaurant={restaurant} />
              <p className="field-hint" style={{ marginTop: '0.9rem' }}>
                Inactive tables are left out. Every table prints in the design you pick here,
                and the choice is saved for next time.
              </p>
            </div>
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

      {/* Portalled to <body> deliberately: the print stylesheet hides the whole app
          shell, and a sheet nested inside it would be hidden along with its
          ancestor no matter what display value it carries. */}
      {printing && createPortal(
        <div className={`print-sheets ${printing === 'all' ? 'multi' : 'single'}`}>
          {/* Chunked into pages of four explicitly rather than leaning on
              break-inside, which browsers apply unreliably to flex items — left
              to itself the bottom row comes out sliced across the page edge. */}
          {chunk(printing === 'all' ? tables.filter((t) => t.isActive) : [printing], TENTS_PER_PAGE)
            .map((group, page) => (
              <div className="print-page" key={page}>
                {group.map((t) => (
                  <div className="print-sheet" key={t.id}>
                    <TableTent restaurant={restaurant} table={t}
                      url={qrUrlFor(base, t)} theme={theme} />
                  </div>
                ))}
              </div>
            ))}
        </div>,
        document.body
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
