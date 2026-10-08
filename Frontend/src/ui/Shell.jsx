import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import { Link, NavLink, Outlet, useNavigate } from 'react-router-dom';
import Icon from './Icon';
import { api } from '../api';
import { useAuth } from '../context/AuthContext';
import { useData } from '../context/DataContext';
import { useTheme } from '../context/ThemeContext';
import { useToast } from '../context/ToastContext';
import { useFetch } from '../hooks/useFetch';
import { Tag } from './Kit';
import { useDebounced } from '../hooks/useDebounced';
import { navFor } from '../lib/nav';
import { can, ROLE_LABELS } from '../lib/permissions';
import { errorMessage } from '../api/errors';
import { timeAgo } from '../lib/format';

export function ThemeToggle() {
  const { theme, toggle } = useTheme();
  return (
    <button
      type="button"
      className="btn btn-icon btn-ghost"
      onClick={toggle}
      aria-label={theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'}
      title={theme === 'dark' ? 'Light theme' : 'Dark theme'}
    >
      <Icon name={theme === 'dark' ? 'sun' : 'moon'} />
    </button>
  );
}

export const PREVIEW_BANNER = 'Live preview - runs in your browser with sample data. Changes stay on this device.';

export function DemoBanner() {
  const { reload } = useData() || {};
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const reset = async () => {
    setBusy(true);
    try {
      await api.reset();
      await reload?.();
      toast.success('Sample data was restored.');
      window.location.reload();
    } catch (err) {
      toast.error(errorMessage(err));
      setBusy(false);
    }
  };
  return (
    <div className="demo-banner" role="note">
      <span>{PREVIEW_BANNER}</span>
      <button type="button" className="btn btn-sm btn-outline-light" onClick={reset} disabled={busy}>
        {busy ? 'Resetting...' : 'Reset sample data'}
      </button>
    </div>
  );
}

// ------------------------------------------------------------------ command palette (Ctrl+K)
function CommandPalette({ onClose }) {
  const ref = useRef(null);
  const listId = useId();
  const navigate = useNavigate();
  const { role } = useAuth();
  const [q, setQ] = useState('');
  const [cursor, setCursor] = useState(0);
  const term = useDebounced(q.trim(), 200);
  const { data, loading } = useFetch('/search', { q: term }, { enabled: term.length >= 2 });

  const pages = useMemo(() => {
    const t = q.trim().toLowerCase();
    return navFor(role, can)
      .filter((n) => !t || n.label.toLowerCase().includes(t))
      .map((n) => ({ key: `nav:${n.to}`, group: 'Go to', text: n.label, to: n.to, icon: n.icon }));
  }, [q, role]);

  const results = useMemo(() => {
    const out = [...pages];
    if (data && term.length >= 2) {
      for (const p of data.patients || []) out.push({ key: `p:${p._id}`, group: 'Patients', text: p.name, sub: `${p.mrn || ''} ${p.age}y ${p.gender}`, to: `/patients/${p._id}`, icon: 'patients' });
      for (const d of data.doctors || []) out.push({ key: `d:${d._id}`, group: 'Doctors', text: d.name, sub: d.specialty, to: `/doctors/${d._id}`, icon: 'doctors' });
      for (const a of data.appointments || []) out.push({ key: `a:${a._id}`, group: 'Appointments', text: `${a.patient?.name || ''} with ${a.doctor?.name || ''}`, sub: new Date(a.date).toLocaleString(), to: '/appointments', icon: 'calendar' });
      for (const v of data.visits || []) out.push({ key: `v:${v._id}`, group: 'Visits', text: `${v.visitNo} ${v.patient?.name || ''}`, sub: v.chiefComplaint, to: `/visits/${v._id}`, icon: 'visit' });
      for (const i of data.invoices || []) out.push({ key: `i:${i._id}`, group: 'Invoices', text: `${i.invoiceNo} ${i.patient?.name || ''}`, sub: i.displayStatus, to: `/billing/${i._id}`, icon: 'bill' });
    }
    return out;
  }, [pages, data, term]);

  useEffect(() => {
    const dlg = ref.current;
    if (dlg && !dlg.open) dlg.showModal();
    document.body.classList.add('no-scroll');
    return () => {
      document.body.classList.remove('no-scroll');
      if (dlg?.open) dlg.close();
    };
  }, []);

  const go = (r) => {
    onClose();
    navigate(r.to);
  };
  const safeCursor = Math.min(cursor, Math.max(0, results.length - 1));
  const onKey = (e) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      onClose();
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      setCursor((safeCursor + 1) % Math.max(1, results.length));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setCursor((safeCursor - 1 + results.length) % Math.max(1, results.length));
    } else if (e.key === 'Enter' && results[safeCursor]) {
      e.preventDefault();
      go(results[safeCursor]);
    }
  };

  let lastGroup = '';
  return (
    <dialog
      ref={ref}
      className="modal palette"
      aria-label="Search and jump to"
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
      onMouseDown={(e) => e.target === ref.current && onClose()}
    >
      <div className="modal-card">
        <div className="palette-head">
          <Icon name="search" />
          <input
            autoFocus
            type="search"
            role="combobox"
            aria-expanded="true"
            aria-controls={listId}
            aria-activedescendant={results[safeCursor] ? `${listId}-${safeCursor}` : undefined}
            aria-label="Search patients, doctors, visits, invoices or pages"
            placeholder="Search patients, doctors, visits, invoices or pages"
            value={q}
            autoComplete="off"
            onChange={(e) => {
              setQ(e.target.value);
              setCursor(0);
            }}
            onKeyDown={onKey}
          />
          <button type="button" className="btn btn-icon btn-ghost" aria-label="Close search" onClick={onClose}>
            <Icon name="x" />
          </button>
        </div>
        <ul id={listId} role="listbox" className="palette-list" aria-label="Results">
          {results.map((r, i) => {
            const head = r.group !== lastGroup;
            lastGroup = r.group;
            return (
              <li key={r.key} role="presentation">
                {head && <span className="palette-group" aria-hidden="true">{r.group}</span>}
                <button
                  type="button"
                  role="option"
                  id={`${listId}-${i}`}
                  aria-selected={i === safeCursor}
                  className={i === safeCursor ? 'is-active' : ''}
                  onMouseEnter={() => setCursor(i)}
                  onClick={() => go(r)}
                >
                  <Icon name={r.icon} size={16} />
                  <span>
                    {r.text}
                    {r.sub && <small className="muted"> {r.sub}</small>}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
        {term.length >= 2 && !loading && results.length === 0 && <p className="muted pad">Nothing matches &quot;{term}&quot;.</p>}
        <p className="muted palette-hint">Up and down to move, Enter to open, Esc to close.</p>
      </div>
    </dialog>
  );
}

// ------------------------------------------------------------------ notifications
function Bell() {
  const { data, reload } = useFetch('/notifications', {}, { interval: 30000 });
  const [open, setOpen] = useState(false);
  const box = useRef(null);
  const toast = useToast();
  const unread = data?.unread || 0;

  useEffect(() => {
    if (!open) return undefined;
    const onDown = (e) => !box.current?.contains(e.target) && setOpen(false);
    const onKey = (e) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const markAll = async () => {
    try {
      await api.post('/notifications/read', { ids: (data?.data || []).map((n) => n.id) });
      reload();
    } catch (err) {
      toast.error(errorMessage(err));
    }
  };
  return (
    <div className="bell" ref={box}>
      <button type="button" className="btn btn-icon btn-ghost" aria-label={`Notifications, ${unread} unread`} aria-expanded={open} aria-haspopup="true" onClick={() => { setOpen(!open); if (!open) reload(); }}>
        <Icon name="bell" />
        {unread > 0 && <span className="bell-count" aria-hidden="true">{unread > 9 ? '9+' : unread}</span>}
      </button>
      {open && (
        <div className="bell-pop" role="region" aria-label="Notifications">
          <div className="bell-head">
            <strong>Notifications</strong>
            <button type="button" className="btn btn-ghost btn-sm" onClick={markAll} disabled={!unread}>Mark all read</button>
          </div>
          {!data?.data?.length && <p className="muted pad">You are all caught up.</p>}
          <ul>
            {(data?.data || []).slice(0, 8).map((n) => (
              <li key={n.id} className={n.read ? 'is-read' : ''}>
                <Link to={n.link || '/notifications'} onClick={() => setOpen(false)}>
                  <span className="bell-title">
                    {n.kind !== 'info' && <Tag tone={n.kind === 'critical' ? 'bad' : 'warn'}>{n.kind}</Tag>} {n.title}
                  </span>
                  <small className="muted">{n.body} {n.at ? `- ${timeAgo(n.at)}` : ''}</small>
                </Link>
              </li>
            ))}
          </ul>
          <Link className="bell-all" to="/notifications" onClick={() => setOpen(false)}>See all notifications</Link>
        </div>
      )}
    </div>
  );
}

// ------------------------------------------------------------------ app frame
export function AppShell() {
  const { user, role, logout } = useAuth();
  const [menu, setMenu] = useState(false);
  const [palette, setPalette] = useState(false);
  const closeRef = useRef(null);
  const items = useMemo(() => navFor(role, can), [role]);


  useEffect(() => {
    if (menu) closeRef.current?.focus();
  }, [menu]);

  const openPalette = useCallback(() => setPalette(true), []);
  useEffect(() => {
    const onKey = (e) => {
      const typing = /INPUT|TEXTAREA|SELECT/.test(document.activeElement?.tagName || '') || document.activeElement?.isContentEditable;
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setPalette(true);
      } else if (e.key === '/' && !typing && !document.querySelector('dialog[open]')) {
        e.preventDefault();
        setPalette(true);
      } else if (e.key === 'Escape') setMenu(false);
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, []);

  return (
    <div className={`shell${menu ? ' nav-open' : ''}`}>
      <header className="app-header">
        <div className="app-header-row">
          <button type="button" className="btn btn-icon btn-ghost menu-btn" aria-label={menu ? 'Close menu' : 'Open menu'} aria-expanded={menu} aria-controls="side-nav" onClick={() => setMenu(!menu)}>
            <Icon name={menu ? 'x' : 'menu'} />
          </button>
          <Link to="/" className="brand" aria-label="MediCare HMS home">
            <span className="brand-mark" aria-hidden="true">+</span>
            <span className="brand-name">MediCare HMS</span>
          </Link>
          <button type="button" className="gsearch-btn" onClick={openPalette} aria-label="Search (Ctrl+K)">
            <Icon name="search" />
            <span className="hide-sm">Search patients, visits, invoices</span>
            <kbd className="hide-sm">Ctrl K</kbd>
          </button>
          <div className="header-tools">
            <Bell />
            <ThemeToggle />
            <span className="user-chip" title={user?.email}>
              {user?.name} <em>{ROLE_LABELS[role] || role}</em>
            </span>
            <button type="button" className="btn btn-ghost btn-sm" aria-label="Sign out" onClick={logout}>
              <Icon name="logout" size={16} /> <span className="hide-sm">Sign out</span>
            </button>
          </div>
        </div>
      </header>
      <div className="shell-body">
        <nav id="side-nav" className="side-nav" aria-label="Main">
          <div className="drawer-head">
            <strong>Menu</strong>
            <button type="button" ref={closeRef} className="btn btn-icon btn-ghost" aria-label="Close menu" onClick={() => setMenu(false)}>
              <Icon name="x" />
            </button>
          </div>
          <ul className="nav" onClick={() => setMenu(false)}>
            {items.map((i) => (
              <li key={i.to}>
                <NavLink to={i.to} end={i.end || i.to === '/pharmacy'} className={({ isActive }) => (isActive ? 'active' : '')}>
                  <Icon name={i.icon} size={18} /> {i.label}
                </NavLink>
              </li>
            ))}
          </ul>
        </nav>
        {menu && <div className="nav-backdrop" aria-hidden="true" onClick={() => setMenu(false)} />}
        <main id="main" className="container" tabIndex={-1}>
          <Outlet />
        </main>
      </div>
      {palette && <CommandPalette onClose={() => setPalette(false)} />}
    </div>
  );
}
