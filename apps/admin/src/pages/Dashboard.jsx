import { Link } from 'react-router-dom';
import { formatCurrency, formatHour, formatNumber, minutesSince, ORDER_STATUS, timeAgo } from '@shared';
import { api } from '../lib/api';
import { useApi, usePolling } from '../lib/hooks';
import { useAuth } from '../context/auth-context';
import StatCard from '../components/StatCard';
import { Card, ErrorState, Spinner, StatusPill } from '../components/States';
import { ColumnChart, RankedBars, ShareBar, TrendChart } from '../components/Charts';
import { formatBucket } from '../lib/format';

export default function Dashboard() {
  const { user } = useAuth();
  const quick = useApi((signal) => api.quickStats(signal), []);
  const today = useApi((signal) => api.overview({ range: 'today' }, signal), []);
  const month = useApi((signal) => api.overview({ range: 'month' }, signal), []);
  const live = usePolling((signal) => api.liveOrders(signal), 15000);

  if (quick.loading || today.loading) return <Spinner label="Crunching your numbers…" />;
  if (quick.error) return <ErrorState message={quick.error} onRetry={quick.reload} />;

  const symbol = user.restaurant?.currencySymbol || '₹';
  const stats = quick.data;
  const liveOrders = live.data?.orders ?? [];
  const newOrders = liveOrders.filter((o) => o.status === 'PLACED');

  const hourly = today.data.hourlyPattern
    .filter((h) => h.hour >= 7 && h.hour <= 23)
    .map((h) => ({ ...h, hourLabel: formatHour(h.hour) }));
  const trend = (month.data?.timeseries.points ?? []).map((p) => ({
    ...p, label: formatBucket(p.bucket, month.data.timeseries.grain),
  }));

  return (
    <>
      <header className="page-head">
        <div>
          <h1>Good to see you, {user.name.split(' ')[0]}</h1>
          <p className="page-sub">Here&apos;s how {user.restaurant?.name || 'your restaurant'} is doing right now.</p>
        </div>
        <Link to="/live" className="btn btn-primary">
          Live orders {newOrders.length > 0 && <span className="btn-badge">{newOrders.length}</span>}
        </Link>
      </header>

      {/* Today's headline numbers — a stat tile is the right form for one number. */}
      <div className="stat-grid">
        <StatCard label="Today's revenue" value={stats.today.revenue} symbol={symbol} asCurrency
          delta={stats.today.deltas.revenue} deltaLabel="vs yesterday" icon="💰" tone="brand" />
        <StatCard label="Today's orders" value={stats.today.orders}
          delta={stats.today.deltas.orders} deltaLabel="vs yesterday" icon="🧾" />
        <StatCard label="Average order" value={stats.today.avgOrderValue} symbol={symbol} asCurrency
          sub={`${stats.today.itemsSold} items sold`} icon="📈" />
        <StatCard label="In the kitchen" value={stats.liveOrders}
          sub={newOrders.length > 0 ? `${newOrders.length} awaiting acceptance` : 'All caught up'}
          icon="🍳" tone={newOrders.length > 0 ? 'alert' : 'default'} />
      </div>

      <div className="stat-grid secondary">
        <StatCard label="This month" value={stats.month.revenue} symbol={symbol} asCurrency compact
          delta={stats.month.deltas.revenue} deltaLabel="vs last month" />
        <StatCard label="Orders this month" value={stats.month.orders}
          delta={stats.month.deltas.orders} deltaLabel="vs last month" />
        <StatCard label="Lifetime revenue" value={stats.lifetime.revenue} symbol={symbol} asCurrency compact
          sub={`${formatNumber(stats.lifetime.orders)} orders all-time`} />
        <StatCard label="Customers served" value={stats.lifetime.customers}
          sub="unique, by phone number" />
      </div>

      <div className="grid-2">
        <Card title="Revenue, last 30 days" subtitle="Non-cancelled orders, by day">
          {trend.length ? (
            <TrendChart data={trend} xKey="label" yKey="revenue" name="Revenue" symbol={symbol} />
          ) : <p className="chart-empty">No orders yet.</p>}
        </Card>

        <Card title="Live orders" subtitle="Updated every 15 seconds"
          action={<Link to="/live" className="card-link">Open board →</Link>}>
          {liveOrders.length === 0 ? (
            <p className="chart-empty">Nothing in the kitchen right now.</p>
          ) : (
            <ul className="live-list">
              {liveOrders.slice(0, 6).map((order) => {
                const late = minutesSince(order.placedAt) > 25 && order.status !== 'READY';
                return (
                  <li key={order.id} className={`live-list-item ${late ? 'late' : ''}`}>
                    <span className="live-num">#{order.orderNumber}</span>
                    <div className="live-meta">
                      <strong>{order.customerName}</strong>
                      <span>Table {order.tableLabel} · {order.itemCount} items · {timeAgo(order.placedAt)}</span>
                    </div>
                    <StatusPill status={order.status} label={ORDER_STATUS[order.status].label} />
                    <span className="live-amount">{formatCurrency(order.totalAmount, symbol)}</span>
                  </li>
                );
              })}
            </ul>
          )}
        </Card>
      </div>

      <div className="grid-2">
        <Card title="Today by the hour" subtitle="Orders placed, 7am – 11pm">
          {hourly.some((h) => h.orders > 0)
            ? <ColumnChart data={hourly} xKey="hourLabel" yKey="orders" name="Orders" />
            : <p className="chart-empty">No orders yet today — this fills in as the day goes.</p>}
        </Card>

        <Card title="Best sellers this month" subtitle="Ranked by revenue">
          <RankedBars
            rows={(month.data?.topItems ?? []).slice(0, 6)}
            labelKey="name" valueKey="revenue" symbol={symbol}
            subLabel={(r) => `${r.quantity} sold · ${r.category}`}
          />
        </Card>
      </div>

      <div className="grid-2">
        <Card title="Where the money comes from" subtitle="Revenue share by category, last 30 days">
          <ShareBar rows={month.data?.categoryMix ?? []} labelKey="category" valueKey="revenue" symbol={symbol} />
        </Card>

        <Card title="Kitchen performance" subtitle="Last 30 days">
          <div className="metric-rows">
            <div className="metric-row">
              <span>Median time to ready</span>
              <strong>{month.data?.kpis.medianPrepMins ?? '—'} min</strong>
            </div>
            <div className="metric-row">
              <span>Slowest 10% of orders</span>
              <strong>{month.data?.kpis.p90PrepMins ?? '—'} min</strong>
            </div>
            <div className="metric-row">
              <span>Average time to accept</span>
              <strong>{month.data?.kpis.avgAcceptMins ?? '—'} min</strong>
            </div>
            <div className="metric-row">
              <span>Cancellation rate</span>
              <strong className={month.data?.kpis.cancellationRate > 8 ? 'text-critical' : ''}>
                {month.data?.kpis.cancellationRate ?? 0}%
              </strong>
            </div>
            <div className="metric-row">
              <span>Repeat customer rate</span>
              <strong>{month.data?.customers.repeatRate ?? 0}%</strong>
            </div>
            <div className="metric-row">
              <span>Items per order</span>
              <strong>{month.data?.kpis.avgItemsPerOrder ?? 0}</strong>
            </div>
          </div>
        </Card>
      </div>
    </>
  );
}
