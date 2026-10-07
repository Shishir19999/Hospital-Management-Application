import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, NavLink, useNavigate } from 'react-router-dom';
import Icon from './Icon';
import { api } from '../api';
import { useAuth } from '../context/AuthContext';
import { useData } from '../context/DataContext';
import { useTheme } from '../context/ThemeContext';
import { useToast } from '../context/ToastContext';
import { globalSearch } from '../lib/search';
import { fmtDateTime } from '../lib/dates';
import { errorMessage } from '../api/errors';

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

export function DemoBanner() {
  const { reload } = useData();
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const reset = async () => {
    setBusy(true);
    try {
      await api.reset();
      await reload();
      toast.success('Demo data was reset to the original sample records.');
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="demo-banner" role="note">
      <span>
        <strong>Demo mode.</strong> All data is stored only in your browser (localStorage) and never leaves your device.
      </span>
      <button type="button" className="btn btn-sm btn-outline-light" onClick={reset} disabled={busy}>
        {busy ? 'Resetting...' : 'Reset demo data'}
      </button>
    </div>
  );
}

export function GlobalSearch() {
  const { patients, doctors, appointments } = useData();
  const navigate = useNavigate();
  const [q, setQ] = useState('');
  const [open, setOpen] = useState(false);
  const box = useRef(null);
  const input = useRef(null);
  const res = useMemo(() => globalSearch(q, { patients, doctors, appointments }), [q, patients, doctors, appointments]);
  const total = res.patients.length + res.doctors.length + res.appointments.length;

  useEffect(() => {
    const onKey = (e) => {
      if (e.key === '/' && !/INPUT|TEXTAREA|SELECT/.test(document.activeElement?.tagName)) {
        e.preventDefault();
        input.current?.focus();
      }
    };
    const onClick = (e) => !box.current?.contains(e.target) && setOpen(false);
    document.addEventListener('keydown', onKey);
    document.addEventListener('mousedown', onClick);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('mousedown', onClick);
    };
  }, []);

  const go = () => {
    setOpen(false);
    setQ('');
  };

  return (
    <div className="gsearch" ref={box}>
      <Icon name="search" />
      <input
        ref={input}
        type="search"
        aria-label="Search patients, doctors and appointments"
        placeholder="Search everything  ( / )"
        value={q}
        autoComplete="off"
        onChange={(e) => {
          setQ(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onKeyDown={(e) => {
          if (e.key === 'Escape') setOpen(false);
          if (e.key === 'Enter') {
            const first = res.patients[0] && `/patients/${res.patients[0]._id}`;
            const firstDoc = res.doctors[0] && `/doctors/${res.doctors[0]._id}`;
            const target = first || firstDoc || (res.appointments[0] && '/appointments');
            if (target) {
              navigate(target);
              go();
            }
          }
        }}
      />
      {open && q.trim() && (
        <div className="gsearch-pop" role="region" aria-label="Search results">
          {total === 0 && <p className="muted pad">No matches for &quot;{q.trim()}&quot;.</p>}
          {res.patients.length > 0 && (
            <>
              <h4>Patients</h4>
              {res.patients.map((p) => (
                <Link key={p._id} to={`/patients/${p._id}`} onClick={go}>
                  {p.name} <span className="muted">{p.age}y, {p.gender}</span>
                </Link>
              ))}
            </>
          )}
          {res.doctors.length > 0 && (
            <>
              <h4>Doctors</h4>
              {res.doctors.map((d) => (
                <Link key={d._id} to={`/doctors/${d._id}`} onClick={go}>
                  {d.name} <span className="muted">{d.specialty}</span>
                </Link>
              ))}
            </>
          )}
          {res.appointments.length > 0 && (
            <>
              <h4>Appointments</h4>
              {res.appointments.map((a) => (
                <Link key={a._id} to={`/appointments?focus=${a._id}`} onClick={go}>
                  {a.patient?.name} with {a.doctor?.name} <span className="muted">{fmtDateTime(a.date)}</span>
                </Link>
              ))}
            </>
          )}
        </div>
      )}
    </div>
  );
}

const NAV = [
  ['/', 'Dashboard', 'dashboard'],
  ['/appointments', 'Appointments', 'calendar'],
  ['/patients', 'Patients', 'patients'],
  ['/doctors', 'Doctors', 'doctors'],
];

export function AppHeader() {
  const { user, logout } = useAuth();
  return (
    <header className="app-header">
      <div className="app-header-row">
        <Link to="/" className="brand" aria-label="Hospital Management home">
          <span className="brand-mark" aria-hidden="true">+</span>
          <span>MediCare HMS</span>
        </Link>
        <GlobalSearch />
        <div className="header-tools">
          <ThemeToggle />
          <span className="user-chip" title={user?.email}>
            {user?.name} <em>{user?.role}</em>
          </span>
          <button type="button" className="btn btn-ghost btn-sm" onClick={logout}>
            <Icon name="logout" size={16} /> <span className="hide-sm">Sign out</span>
          </button>
        </div>
      </div>
      <nav aria-label="Main">
        <ul className="nav">
          {NAV.map(([to, label, icon]) => (
            <li key={to}>
              <NavLink to={to} end={to === '/'} className={({ isActive }) => (isActive ? 'active' : '')}>
                <Icon name={icon} size={16} /> {label}
              </NavLink>
            </li>
          ))}
        </ul>
      </nav>
    </header>
  );
}
