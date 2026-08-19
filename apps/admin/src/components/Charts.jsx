import {
  Area, AreaChart, Bar, BarChart, CartesianGrid, Cell,
  ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts';
import { formatCurrency, formatNumber } from '@shared';
import { chartInk, SERIES, niceTicks } from '../lib/viz';
import { useTheme } from '../context/theme-context';

/**
 * Shared axis chrome: hairline, solid, recessive — the data is the loud part.
 *
 * Built per render rather than at module load, because the portal's theme can
 * change while a chart is on screen and recharts takes these as plain props.
 */
function chromeFor(theme) {
  const ink = chartInk(theme);
  return {
    AXIS: {
      stroke: ink.axis,
      tick: { fill: ink.muted, fontSize: 11 },
      tickLine: false,
      axisLine: { stroke: ink.axis },
    },
    GRID: {
      stroke: ink.grid,
      strokeDasharray: '0',   // never dashed
      vertical: false,
    },
    ink,
  };
}

function Tip({ active, payload, label, formatter }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="chart-tooltip">
      <div className="chart-tooltip-label">{label}</div>
      {payload.map((entry) => (
        <div key={entry.dataKey} className="chart-tooltip-row">
          <span className="chart-tooltip-swatch" style={{ background: entry.color }} />
          <span className="chart-tooltip-name">{entry.name}</span>
          <span className="chart-tooltip-value">{formatter ? formatter(entry.value) : formatNumber(entry.value)}</span>
        </div>
      ))}
    </div>
  );
}

/**
 * Revenue (or any single measure) over time. One series, so no legend box —
 * the card title already names what is plotted.
 */
export function TrendChart({ data, xKey, yKey, name, symbol, height = 240, asCurrency = true }) {
  const { theme } = useTheme();
  const { AXIS, GRID, ink } = chromeFor(theme);
  const format = (v) => (asCurrency ? formatCurrency(v, symbol) : formatNumber(v));
  const max = Math.max(0, ...data.map((d) => d[yKey]));

  return (
    <ResponsiveContainer width="100%" height={height}>
      <AreaChart data={data} margin={{ top: 8, right: 8, left: -12, bottom: 0 }}>
        <defs>
          {/* Area is a ~10% wash, never a saturated block. */}
          <linearGradient id={`fill-${yKey}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={SERIES[0]} stopOpacity={0.18} />
            <stop offset="100%" stopColor={SERIES[0]} stopOpacity={0.02} />
          </linearGradient>
        </defs>
        <CartesianGrid {...GRID} />
        <XAxis dataKey={xKey} {...AXIS} interval="preserveStartEnd" minTickGap={28} />
        <YAxis
          {...AXIS}
          ticks={niceTicks(max)}
          tickFormatter={(v) => (asCurrency ? formatCurrency(v, symbol, { compact: true }) : formatNumber(v))}
          width={58}
        />
        <Tooltip
          content={<Tip formatter={format} />}
          cursor={{ stroke: ink.muted, strokeWidth: 1 }}
        />
        <Area
          type="monotone" dataKey={yKey} name={name}
          stroke={SERIES[0]} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round"
          fill={`url(#fill-${yKey})`}
          activeDot={{ r: 4, fill: SERIES[0], stroke: ink.surface, strokeWidth: 2 }}
          dot={false}
        />
      </AreaChart>
    </ResponsiveContainer>
  );
}

/**
 * Columns for one measure across ordered categories (hours, weekdays).
 * A single series gets a single colour; `highlightKey` emphasises the peak
 * rather than ramping colour by value.
 */
export function ColumnChart({
  data, xKey, yKey, name, symbol, height = 220, asCurrency = false, highlightPeak = true,
}) {
  const { theme } = useTheme();
  const { AXIS, GRID } = chromeFor(theme);
  const format = (v) => (asCurrency ? formatCurrency(v, symbol) : formatNumber(v));
  const max = Math.max(0, ...data.map((d) => d[yKey]));
  const peak = data.reduce((best, d) => (d[yKey] > (best?.[yKey] ?? -1) ? d : best), null);

  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={data} margin={{ top: 8, right: 8, left: -12, bottom: 0 }} barCategoryGap="18%">
        <CartesianGrid {...GRID} />
        <XAxis dataKey={xKey} {...AXIS} interval="preserveStartEnd" minTickGap={4} />
        <YAxis
          {...AXIS} ticks={niceTicks(max)} width={52}
          tickFormatter={(v) => (asCurrency ? formatCurrency(v, symbol, { compact: true }) : formatNumber(v))}
        />
        <Tooltip content={<Tip formatter={format} />} cursor={{ fill: 'rgba(255,255,255,0.04)' }} />
        <Bar dataKey={yKey} name={name} radius={[4, 4, 0, 0]} maxBarSize={24}>
          {data.map((entry) => (
            <Cell
              key={entry[xKey]}
              fill={SERIES[0]}
              // Emphasis, not a value ramp: the peak stays saturated, the rest recede.
              fillOpacity={highlightPeak && peak && entry[xKey] !== peak[xKey] ? 0.45 : 1}
            />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

/**
 * Ranked horizontal bars with the value labelled at the tip. Used wherever the
 * question is "which of these is biggest" — top items, categories, tables.
 */
export function RankedBars({ rows, labelKey, valueKey, symbol, asCurrency = true, subLabel }) {
  const max = Math.max(1, ...rows.map((r) => r[valueKey]));
  const format = (v) => (asCurrency ? formatCurrency(v, symbol) : formatNumber(v));

  return (
    <div className="ranked-bars">
      {rows.map((row, index) => (
        <div key={row[labelKey] + index} className="ranked-row">
          <div className="ranked-head">
            <span className="ranked-label" title={row[labelKey]}>
              <span className="ranked-index">{index + 1}</span>
              {row[labelKey]}
            </span>
            <span className="ranked-value">{format(row[valueKey])}</span>
          </div>
          <div className="ranked-track">
            <div
              className="ranked-fill"
              style={{ width: `${(row[valueKey] / max) * 100}%`, background: SERIES[0] }}
            />
          </div>
          {subLabel && <span className="ranked-sub">{subLabel(row)}</span>}
        </div>
      ))}
      {rows.length === 0 && <p className="chart-empty">No data for this period.</p>}
    </div>
  );
}

/**
 * Part-to-whole across a handful of categories, as a segmented bar. Segments are
 * separated by a 2px surface gap rather than a stroke, and every segment is
 * named in the legend so identity is never colour-alone.
 */
export function ShareBar({ rows, labelKey, valueKey, symbol }) {
  const { theme } = useTheme();
  const { ink } = chromeFor(theme);
  const total = rows.reduce((s, r) => s + r[valueKey], 0) || 1;
  const shown = rows.slice(0, 6);
  const rest = rows.slice(6);
  const segments = rest.length
    ? [...shown, { [labelKey]: 'Other', [valueKey]: rest.reduce((s, r) => s + r[valueKey], 0) }]
    : shown;

  return (
    <div className="share-bar-wrap">
      <div className="share-bar">
        {segments.map((seg, i) => (
          <div
            key={seg[labelKey]}
            className="share-segment"
            style={{
              width: `${(seg[valueKey] / total) * 100}%`,
              background: i < SERIES.length ? SERIES[i] : ink.muted,
            }}
            title={`${seg[labelKey]} — ${formatCurrency(seg[valueKey], symbol)}`}
          />
        ))}
      </div>
      <ul className="share-legend">
        {segments.map((seg, i) => (
          <li key={seg[labelKey]}>
            <span className="share-swatch" style={{ background: i < SERIES.length ? SERIES[i] : ink.muted }} />
            <span className="share-name">{seg[labelKey]}</span>
            <span className="share-pct">{Math.round((seg[valueKey] / total) * 100)}%</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
