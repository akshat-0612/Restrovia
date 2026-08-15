import { useState } from 'react';
import { ANALYTICS_RANGES, formatCurrency, formatDateTime, ORDER_STATUS } from '@shared';
import { api } from '../lib/api';
import { useApi, useDebounced } from '../lib/hooks';
import { useAuth } from '../context/auth-context';
import { useToast } from '../components/toast-context';
import { Card, EmptyState, ErrorState, Spinner, StatusPill } from '../components/States';
import { downloadBlob } from '../lib/format';
import OrderDetail from '../components/OrderDetail';

const STATUS_FILTERS = ['ALL', ...Object.keys(ORDER_STATUS)];

export default function Orders() {
  const { user, can } = useAuth();
  const toast = useToast();
  const symbol = user.restaurant?.currencySymbol || '₹';

  const [filters, setFilters] = useState({ status: 'ALL', range: 'month', sort: 'newest', page: 1 });
  const [search, setSearch] = useState('');
  const [selectedId, setSelectedId] = useState(null);
  const [exporting, setExporting] = useState(false);
  const debouncedSearch = useDebounced(search);

  const { data, loading, error, reload } = useApi(
    (signal) => api.orders({ ...filters, search: debouncedSearch }, signal),
    [filters.status, filters.range, filters.sort, filters.page, debouncedSearch]
  );

  const set = (patch) => setFilters((f) => ({ ...f, ...patch, page: patch.page ?? 1 }));

  async function handleExport(kind) {
    setExporting(true);
    try {
      const blob = kind === 'items'
        ? await api.exportItems({ range: filters.range })
        : await api.exportOrders({ range: filters.range });
      downloadBlob(blob, `${user.restaurant?.slug || 'restaurant'}-${kind}-${filters.range}.csv`);
      toast.success('Export downloaded');
    } catch (err) {
      toast.error(err.message);
    } finally {
      setExporting(false);
    }
  }

  return (
    <>
      <header className="page-head">
        <div>
          <h1>Orders</h1>
          <p className="page-sub">Every order, searchable and exportable.</p>
        </div>
        {can('PLATFORM_ADMIN', 'OWNER', 'MANAGER') && (
          <div className="page-actions">
            <button className="btn btn-ghost" onClick={() => handleExport('orders')} disabled={exporting}>
              ⬇ Orders CSV
            </button>
            <button className="btn btn-ghost" onClick={() => handleExport('items')} disabled={exporting}>
              ⬇ Item sales CSV
            </button>
          </div>
        )}
      </header>

      {/* Filters sit in one row above the table, never interleaved with results. */}
      <div className="filter-bar">
        <input
          className="filter-search"
          placeholder="Search order #, name, phone or table…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <select value={filters.range} onChange={(e) => set({ range: e.target.value })}>
          {ANALYTICS_RANGES.map((r) => <option key={r.key} value={r.key}>{r.label}</option>)}
        </select>
        <select value={filters.status} onChange={(e) => set({ status: e.target.value })}>
          {STATUS_FILTERS.map((s) => (
            <option key={s} value={s}>{s === 'ALL' ? 'All statuses' : ORDER_STATUS[s].label}</option>
          ))}
        </select>
        <select value={filters.sort} onChange={(e) => set({ sort: e.target.value })}>
          <option value="newest">Newest first</option>
          <option value="oldest">Oldest first</option>
          <option value="highest">Highest value</option>
          <option value="lowest">Lowest value</option>
        </select>
      </div>

      {data && (
        <div className="summary-strip">
          <span><strong>{data.pagination.total}</strong> orders</span>
          <span><strong>{formatCurrency(data.summary.totalRevenue, symbol)}</strong> revenue</span>
          <span><strong>{formatCurrency(data.summary.avgOrderValue, symbol)}</strong> average</span>
          <span className="summary-note">Revenue excludes cancelled orders</span>
        </div>
      )}

      {loading && !data ? <Spinner />
        : error ? <ErrorState message={error} onRetry={reload} />
        : data.orders.length === 0 ? (
          <EmptyState icon="🔍" title="No orders match" message="Try widening the date range or clearing the search." />
        ) : (
          <Card bodyClass="no-pad">
            <div className="table-scroll">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Order</th><th>Placed</th><th>Table</th><th>Customer</th>
                    <th>Items</th><th className="num">Total</th><th>Status</th><th>Paid</th>
                  </tr>
                </thead>
                <tbody>
                  {data.orders.map((order) => (
                    <tr key={order.id} onClick={() => setSelectedId(order.id)} className="row-clickable">
                      <td className="mono">#{order.orderNumber}</td>
                      <td className="muted">{formatDateTime(order.placedAt)}</td>
                      <td>{order.tableLabel || '—'}</td>
                      <td>
                        <div className="cell-stack">
                          <strong>{order.customerName}</strong>
                          {order.customerPhone && <span>{order.customerPhone}</span>}
                        </div>
                      </td>
                      <td className="muted">{order.itemCount}</td>
                      <td className="num strong">{formatCurrency(order.totalAmount, symbol)}</td>
                      <td><StatusPill status={order.status} label={ORDER_STATUS[order.status].label} /></td>
                      <td>{order.isPaid ? <span className="paid-yes">✓ {order.payMethod}</span> : <span className="paid-no">Unpaid</span>}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="pagination">
              <button className="btn btn-ghost btn-sm" disabled={filters.page <= 1}
                onClick={() => set({ page: filters.page - 1 })}>← Previous</button>
              <span>Page {data.pagination.page} of {Math.max(1, data.pagination.pages)}</span>
              <button className="btn btn-ghost btn-sm" disabled={filters.page >= data.pagination.pages}
                onClick={() => set({ page: filters.page + 1 })}>Next →</button>
            </div>
          </Card>
        )}

      {selectedId && (
        <OrderDetail
          orderId={selectedId}
          symbol={symbol}
          onClose={() => setSelectedId(null)}
          onChanged={reload}
        />
      )}
    </>
  );
}
