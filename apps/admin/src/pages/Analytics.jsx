import { useState } from 'react';
import { ANALYTICS_RANGES, formatCurrency, formatHour, formatNumber, ORDER_STATUS } from '@shared';
import { api } from '../lib/api';
import { useApi } from '../lib/hooks';
import { useAuth } from '../context/auth-context';
import StatCard from '../components/StatCard';
import { Card, ErrorState, Spinner } from '../components/States';
import { ColumnChart, RankedBars, ShareBar, TrendChart } from '../components/Charts';
import { formatBucket } from '../lib/format';
import { STATUS_COLORS } from '../lib/viz';

export default function Analytics() {
  const { user } = useAuth();
  const symbol = user.restaurant?.currencySymbol || '₹';
  const [range, setRange] = useState('month');
  const [tableView, setTableView] = useState(false);

  const { data, loading, error, reload } = useApi(
    (signal) => api.overview({ range }, signal),
    [range]
  );

  if (loading && !data) return <Spinner label="Building your report…" />;
  if (error) return <ErrorState message={error} onRetry={reload} />;

  const { kpis, timeseries, topItems, categoryMix, hourlyPattern, weekdayPattern,
          tablePerformance, statusBreakdown, customers, underperformers } = data;

  const trend = timeseries.points.map((p) => ({ ...p, label: formatBucket(p.bucket, timeseries.grain) }));
  const hourly = hourlyPattern.filter((h) => h.orders > 0 || (h.hour >= 8 && h.hour <= 23))
    .map((h) => ({ ...h, label: formatHour(h.hour) }));
  const statusTotal = statusBreakdown.reduce((s, r) => s + r.orders, 0) || 1;

  return (
    <>
      <header className="page-head">
        <div>
          <h1>Analytics</h1>
          <p className="page-sub">{data.range.label} · times shown in {data.range.timezone}</p>
        </div>
        <div className="page-actions">
          <div className="range-picker">
            {ANALYTICS_RANGES.map((r) => (
              <button
                key={r.key}
                className={`range-btn ${range === r.key ? 'active' : ''}`}
                onClick={() => setRange(r.key)}
              >
                {r.label}
              </button>
            ))}
          </div>
        </div>
      </header>

      <div className="stat-grid">
        <StatCard label="Revenue" value={kpis.revenue} symbol={symbol} asCurrency compact
          delta={kpis.deltas?.revenue} icon="💰" tone="brand" />
        <StatCard label="Orders" value={kpis.orders} delta={kpis.deltas?.orders} icon="🧾" />
        <StatCard label="Average order value" value={kpis.avgOrderValue} symbol={symbol} asCurrency
          delta={kpis.deltas?.avgOrderValue} icon="📊" />
        <StatCard label="Items sold" value={kpis.itemsSold} delta={kpis.deltas?.itemsSold} icon="🍽️" />
      </div>

      <div className="stat-grid secondary">
        <StatCard label="Net sales (pre-tax)" value={kpis.netSales} symbol={symbol} asCurrency compact
          sub={`${formatCurrency(kpis.taxCollected, symbol, { compact: true })} tax collected`} />
        <StatCard label="Unique customers" value={kpis.customers}
          delta={kpis.deltas?.customers} />
        <StatCard label="Cancellation rate" value={`${kpis.cancellationRate}%`}
          sub={`${kpis.cancelled} cancelled`} tone={kpis.cancellationRate > 8 ? 'alert' : 'default'} />
        <StatCard label="Median prep time" value={kpis.medianPrepMins ? `${kpis.medianPrepMins} min` : '—'}
          sub={kpis.p90PrepMins ? `slowest 10%: ${kpis.p90PrepMins} min` : null} />
      </div>

      <Card
        title={`Revenue by ${timeseries.grain}`}
        subtitle="Non-cancelled orders"
        action={
          <button className="card-link" onClick={() => setTableView((v) => !v)}>
            {tableView ? 'Show chart' : 'Show table'}
          </button>
        }
      >
        {trend.length === 0 ? <p className="chart-empty">No orders in this period.</p>
          : tableView ? (
            <div className="table-scroll">
              <table className="data-table compact">
                <thead><tr><th>Period</th><th className="num">Orders</th><th className="num">Revenue</th></tr></thead>
                <tbody>
                  {trend.map((p) => (
                    <tr key={p.bucket}>
                      <td>{p.label}</td>
                      <td className="num">{formatNumber(p.orders)}</td>
                      <td className="num strong">{formatCurrency(p.revenue, symbol)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <TrendChart data={trend} xKey="label" yKey="revenue" name="Revenue" symbol={symbol} height={280} />
          )}
      </Card>

      <div className="grid-2">
        <Card title="When your customers order" subtitle="Orders by hour of day — the peak hour is highlighted">
          <ColumnChart data={hourly} xKey="label" yKey="orders" name="Orders" height={240} />
        </Card>

        <Card title="Your week" subtitle="Orders by day of week">
          <ColumnChart data={weekdayPattern} xKey="day" yKey="orders" name="Orders" height={240} />
        </Card>
      </div>

      <div className="grid-2">
        <Card title="Best sellers" subtitle="Ranked by revenue in this period">
          <RankedBars rows={topItems} labelKey="name" valueKey="revenue" symbol={symbol}
            subLabel={(r) => `${r.quantity} sold across ${r.orderCount} orders · ${r.category}`} />
        </Card>

        <Card title="Revenue by category" subtitle="Where the money comes from">
          <ShareBar rows={categoryMix} labelKey="category" valueKey="revenue" symbol={symbol} />
          <div className="table-scroll" style={{ marginTop: '1rem' }}>
            <table className="data-table compact">
              <thead><tr><th>Category</th><th className="num">Sold</th><th className="num">Revenue</th><th className="num">Share</th></tr></thead>
              <tbody>
                {categoryMix.map((c) => (
                  <tr key={c.category}>
                    <td>{c.category}</td>
                    <td className="num">{c.quantity}</td>
                    <td className="num strong">{formatCurrency(c.revenue, symbol)}</td>
                    <td className="num muted">{c.share}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      </div>

      <div className="grid-2">
        <Card title="Table performance" subtitle="Which tables earn the most">
          <RankedBars rows={tablePerformance} labelKey="label" valueKey="revenue" symbol={symbol}
            subLabel={(r) => `${r.orders} orders · ${formatCurrency(r.avgValue, symbol)} average`} />
        </Card>

        <Card title="Your regulars" subtitle={`${customers.repeatRate}% of customers came back in this period`}>
          {customers.topCustomers.length === 0 ? <p className="chart-empty">No customers yet.</p> : (
            <table className="data-table compact">
              <thead><tr><th>Customer</th><th className="num">Orders</th><th className="num">Spent</th></tr></thead>
              <tbody>
                {customers.topCustomers.map((c, i) => (
                  <tr key={c.name + i}>
                    <td>{c.name}</td>
                    <td className="num">{c.orders}</td>
                    <td className="num strong">{formatCurrency(c.spend, symbol)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Card>
      </div>

      <div className="grid-2">
        <Card title="Order outcomes" subtitle="How orders in this period ended up">
          <div className="outcome-rows">
            {statusBreakdown.map((row) => (
              <div key={row.status} className="outcome-row">
                <span className="outcome-label">
                  <span className="outcome-dot" style={{ background: STATUS_COLORS[row.status] }} />
                  {ORDER_STATUS[row.status].label}
                </span>
                <div className="outcome-track">
                  <div className="outcome-fill"
                    style={{ width: `${(row.orders / statusTotal) * 100}%`, background: STATUS_COLORS[row.status] }} />
                </div>
                <span className="outcome-count">{formatNumber(row.orders)}</span>
              </div>
            ))}
            {statusBreakdown.length === 0 && <p className="chart-empty">No orders in this period.</p>}
          </div>
        </Card>

        <Card title="Nobody ordered these" subtitle="Available items with no sales in this period — candidates to cut or promote">
          {underperformers.length === 0 ? (
            <p className="chart-empty">Every item on your menu sold at least once. 🎉</p>
          ) : (
            <ul className="dormant-list">
              {underperformers.map((item) => (
                <li key={item.id}>
                  <span className="dormant-name">{item.name}</span>
                  <span className="dormant-cat">{item.category}</span>
                  <span className="dormant-lifetime">{item.lifetimeOrders} all-time</span>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </>
  );
}
