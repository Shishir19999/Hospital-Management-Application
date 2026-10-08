import { useId, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import Icon from './Icon';
import { Field } from './Common';
import { label as pretty, toneOf } from '../lib/format';

// Small coloured chip for any status. Colour is never the only signal: the text says it too.
export function Tag({ value, tone, children }) {
  return <span className={`tag tag-${tone || toneOf(value)}`}>{children ?? pretty(value)}</span>;
}

export function Stat({ label, value, hint, to, tone }) {
  const body = (
    <>
      <span className="muted">{label}</span>
      <strong className={tone ? `tone-${tone}` : undefined}>{value}</strong>
      {hint && <small className="muted">{hint}</small>}
    </>
  );
  return <div className="card stat">{to ? <Link to={to} className="stat-link">{body}</Link> : <div className="stat-link">{body}</div>}</div>;
}

export function Section({ title, actions, children, className = '', id }) {
  return (
    <section className={`card section ${className}`} aria-labelledby={id}>
      <div className="card-head">
        <h2 id={id}>{title}</h2>
        {actions && <div className="card-actions">{actions}</div>}
      </div>
      {children}
    </section>
  );
}

export function Tabs({ tabs, value, onChange, label = 'Sections' }) {
  const onKey = (e) => {
    const i = tabs.findIndex((t) => t.value === value);
    if (e.key === 'ArrowRight') onChange(tabs[(i + 1) % tabs.length].value);
    if (e.key === 'ArrowLeft') onChange(tabs[(i - 1 + tabs.length) % tabs.length].value);
  };
  return (
    <div className="tabs" role="tablist" aria-label={label} onKeyDown={onKey}>
      {tabs.map((t) => (
        <button key={t.value} type="button" role="tab" id={`tab-${t.value}`} aria-selected={t.value === value} tabIndex={t.value === value ? 0 : -1} onClick={() => onChange(t.value)}>
          {t.label}
          {t.count != null && <span className="tab-count">{t.count}</span>}
        </button>
      ))}
    </div>
  );
}

export function Dl({ items }) {
  return (
    <dl className="facts">
      {items
        .filter(Boolean)
        .map(([k, v]) => (
          <div key={k}>
            <dt>{k}</dt>
            <dd>{v === '' || v == null ? '-' : v}</dd>
          </div>
        ))}
    </dl>
  );
}

// Server-paginated list footer.
export function ServerPager({ page, pages, total, onPage, label = 'items' }) {
  if (!total) return null;
  return (
    <div className="pager">
      <span className="muted" aria-live="polite">
        {total} {label}
      </span>
      <div className="pager-nav">
        <button type="button" className="btn btn-ghost btn-sm" disabled={page <= 1} onClick={() => onPage(page - 1)}>
          <Icon name="chevL" size={14} /> Prev
        </button>
        <span>
          Page {page} of {pages}
        </span>
        <button type="button" className="btn btn-ghost btn-sm" disabled={page >= pages} onClick={() => onPage(page + 1)}>
          Next <Icon name="chevR" size={14} />
        </button>
      </div>
    </div>
  );
}

// Type-ahead patient selector built on a native datalist (keyboard and screen reader friendly).
export function PatientPicker({ patients, value, onChange, error, id: idProp, labelText = 'Patient' }) {
  const auto = useId();
  const id = idProp || auto;
  const labelOf = (p) => `${p.name} (${p.mrn || p._id.slice(-6)})`;
  const [text, setText] = useState(() => {
    const p = patients.find((x) => x._id === value);
    return p ? labelOf(p) : '';
  });
  const options = useMemo(() => patients.map((p) => ({ id: p._id, text: labelOf(p) })), [patients]);
  return (
    <Field label={labelText} id={id} error={error}>
      <input
        id={id}
        list={`${id}-list`}
        value={text}
        autoComplete="off"
        placeholder="Type a name or record number"
        aria-invalid={!!error}
        onChange={(e) => {
          setText(e.target.value);
          const hit = options.find((o) => o.text === e.target.value);
          onChange(hit ? hit.id : '');
        }}
      />
      <datalist id={`${id}-list`}>
        {options.map((o) => (
          <option key={o.id} value={o.text} />
        ))}
      </datalist>
    </Field>
  );
}

export function PrintButton({ label = 'Print', className = 'btn btn-ghost btn-sm' }) {
  return (
    <button type="button" className={className} onClick={() => window.print()}>
      <Icon name="print" size={16} /> {label}
    </button>
  );
}

export function LoadBoundary({ loading, error, onRetry, skeleton, children }) {
  // lazy import-free helper: pages pass their own skeleton node
  if (loading) return skeleton || null;
  if (error) {
    return (
      <div className="empty empty-error" role="alert">
        <div className="empty-icon">
          <Icon name="warn" size={26} />
        </div>
        <h3>Could not load data</h3>
        <p>{error}</p>
        {onRetry && (
          <button type="button" className="btn btn-primary" onClick={onRetry}>
            <Icon name="refresh" /> Try again
          </button>
        )}
      </div>
    );
  }
  return children;
}
