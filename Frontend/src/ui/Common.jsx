import Icon from './Icon';
import { effectiveStatus } from '../lib/appointments';

export const Skeleton = ({ h = 16, w = '100%', r = 8 }) => (
  <span className="skeleton" style={{ height: h, width: w, borderRadius: r }} aria-hidden="true" />
);

export function SkeletonList({ rows = 6, label = 'Loading' }) {
  return (
    <div className="card" role="status" aria-busy="true" aria-label={label}>
      {Array.from({ length: rows }, (_, i) => (
        <div className="skeleton-row" key={i}>
          <Skeleton w="30%" />
          <Skeleton w="20%" />
          <Skeleton w="25%" />
        </div>
      ))}
    </div>
  );
}

export function SkeletonCards({ count = 4 }) {
  return (
    <div className="stat-grid" role="status" aria-busy="true" aria-label="Loading">
      {Array.from({ length: count }, (_, i) => (
        <div className="card stat" key={i}>
          <Skeleton h={14} w="50%" />
          <Skeleton h={30} w="35%" />
        </div>
      ))}
    </div>
  );
}

export function EmptyState({ title, text, action }) {
  return (
    <div className="empty">
      <div className="empty-icon">
        <Icon name="info" size={26} />
      </div>
      <h3>{title}</h3>
      {text && <p>{text}</p>}
      {action}
    </div>
  );
}

export function ErrorState({ message, onRetry }) {
  return (
    <div className="empty empty-error" role="alert">
      <div className="empty-icon">
        <Icon name="warn" size={26} />
      </div>
      <h3>Could not load data</h3>
      <p>{message}</p>
      {onRetry && (
        <button type="button" className="btn btn-primary" onClick={onRetry}>
          <Icon name="refresh" /> Try again
        </button>
      )}
    </div>
  );
}

export function StatusBadge({ appointment }) {
  const s = effectiveStatus(appointment);
  return <span className={`badge badge-${s}`}>{s}</span>;
}

export function PageHeader({ title, subtitle, children }) {
  return (
    <div className="page-head">
      <div>
        <h1>{title}</h1>
        {subtitle && <p className="muted">{subtitle}</p>}
      </div>
      <div className="page-actions">{children}</div>
    </div>
  );
}

// Labelled form control with an inline error message.
export function Field({ label, error, hint, id, children }) {
  return (
    <div className={`field${error ? ' has-error' : ''}`}>
      <label htmlFor={id}>{label}</label>
      {children}
      {hint && !error && <small className="muted">{hint}</small>}
      {error && (
        <small className="field-error" id={`${id}-err`} role="alert">
          {error}
        </small>
      )}
    </div>
  );
}
