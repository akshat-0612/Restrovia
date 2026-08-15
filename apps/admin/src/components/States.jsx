export function Spinner({ label = 'Loading…' }) {
  return (
    <div className="state-block">
      <div className="spinner" />
      <p>{label}</p>
    </div>
  );
}

export function ErrorState({ message, onRetry }) {
  return (
    <div className="state-block error">
      <span className="state-icon">⚠️</span>
      <p>{message}</p>
      {onRetry && <button className="btn btn-ghost" onClick={onRetry}>Try again</button>}
    </div>
  );
}

export function EmptyState({ icon = '📭', title, message, action }) {
  return (
    <div className="state-block">
      <span className="state-icon">{icon}</span>
      <h3>{title}</h3>
      {message && <p>{message}</p>}
      {action}
    </div>
  );
}

/** Card wrapper used by every panel, so headers and padding stay consistent. */
export function Card({ title, subtitle, action, children, className = '', bodyClass = '' }) {
  return (
    <section className={`card ${className}`}>
      {(title || action) && (
        <header className="card-header">
          <div>
            {title && <h2 className="card-title">{title}</h2>}
            {subtitle && <p className="card-subtitle">{subtitle}</p>}
          </div>
          {action}
        </header>
      )}
      <div className={`card-body ${bodyClass}`}>{children}</div>
    </section>
  );
}

export function StatusPill({ status, label }) {
  return <span className={`status-pill status-${status.toLowerCase()}`}>{label || status}</span>;
}
