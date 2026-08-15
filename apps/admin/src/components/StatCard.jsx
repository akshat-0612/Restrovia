import { formatCurrency, formatNumber } from '@shared';

/**
 * A stat tile is the right form when the story is one number — no chart needed.
 * The delta carries an arrow glyph and a word, so the meaning never rides on
 * colour alone.
 */
export default function StatCard({
  label, value, symbol, asCurrency = false, delta, deltaLabel = 'vs previous',
  sub, icon, tone = 'default', compact = false,
}) {
  const display = asCurrency
    ? formatCurrency(value, symbol, { compact })
    : typeof value === 'number' ? formatNumber(value) : value;

  const hasDelta = delta !== null && delta !== undefined && Number.isFinite(delta);
  const direction = hasDelta ? (delta > 0 ? 'up' : delta < 0 ? 'down' : 'flat') : null;

  return (
    <div className={`stat-card tone-${tone}`}>
      <div className="stat-head">
        <span className="stat-label">{label}</span>
        {icon && <span className="stat-icon">{icon}</span>}
      </div>
      <div className="stat-value">{display}</div>
      <div className="stat-foot">
        {hasDelta ? (
          <span className={`stat-delta ${direction}`}>
            <span aria-hidden>{direction === 'up' ? '▲' : direction === 'down' ? '▼' : '—'}</span>
            {Math.abs(delta).toFixed(1)}%
            <span className="stat-delta-label">{deltaLabel}</span>
          </span>
        ) : (
          sub && <span className="stat-sub">{sub}</span>
        )}
      </div>
    </div>
  );
}
