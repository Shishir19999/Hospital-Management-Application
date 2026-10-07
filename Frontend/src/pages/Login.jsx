import { useEffect, useState } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { api, IS_DEMO } from '../api';
import { useAuth } from '../context/AuthContext';
import { Field } from '../ui/Common';
import { Parallax, Reveal } from '../ui/Motion';
import { ThemeToggle } from '../ui/Shell';
import Icon from '../ui/Icon';
import { DEMO_USERS } from '../lib/constants';
import { errorMessage } from '../api/errors';

const FEATURES = [
  ['dashboard', 'Live dashboard', 'Appointment trends, doctors by specialty and the patient age and gender mix at a glance.'],
  ['calendar', 'Agenda and conflicts', 'A weekly agenda per doctor that flags double-booked time slots before they cause trouble.'],
  ['patients', 'Patient records', 'Searchable, sortable records with a medical history timeline and a printable summary.'],
  ['doctors', 'Doctor schedules', 'See who is working, how busy each day is and which patients each doctor has seen.'],
];

export default function Login() {
  const { token, login, registerFirstAdmin } = useAuth();
  const navigate = useNavigate();
  const [needsSetup, setNeedsSetup] = useState(false);
  const [form, setForm] = useState({ name: '', email: '', password: '' });
  const [errors, setErrors] = useState({});
  const [formError, setFormError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api.auth
      .status()
      .then((res) => setNeedsSetup(res.needsSetup))
      .catch(() => setNeedsSetup(false));
  }, []);

  if (token) return <Navigate to="/" replace />;

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  const submit = async (e) => {
    e.preventDefault();
    const errs = {};
    if (needsSetup && !form.name.trim()) errs.name = 'Enter your name.';
    if (!/^\S+@\S+\.\S+$/.test(form.email)) errs.email = 'Enter a valid email address.';
    if (form.password.length < 6) errs.password = 'Password must be at least 6 characters.';
    setErrors(errs);
    setFormError('');
    if (Object.keys(errs).length) return;
    setBusy(true);
    try {
      if (needsSetup) await registerFirstAdmin(form.name, form.email, form.password);
      else await login(form.email, form.password);
      navigate('/');
    } catch (err) {
      setFormError(errorMessage(err, 'Sign in failed.'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="landing">
      <div className="landing-top">
        <span className="brand">
          <span className="brand-mark" aria-hidden="true">+</span>
          <span>MediCare HMS</span>
        </span>
        <ThemeToggle />
      </div>
      <section className="hero">
        <Parallax speed={0.18} className="hero-blob hero-blob-a" />
        <Parallax speed={-0.1} className="hero-blob hero-blob-b" />
        <div className="hero-grid">
          <div className="hero-copy">
            <h1>Run the whole clinic from one calm screen.</h1>
            <p>
              Patients, doctors and appointments in a single place, with a live dashboard, conflict-free scheduling and
              role-aware access for admins, doctors and reception.
            </p>
          </div>
          <form className="card login-card" onSubmit={submit} noValidate>
            <h2>{needsSetup ? 'Create the first admin account' : 'Sign in'}</h2>
            {formError && (
              <p className="form-error" role="alert">
                {formError}
              </p>
            )}
            {needsSetup && (
              <Field label="Name" id="l-name" error={errors.name}>
                <input id="l-name" value={form.name} onChange={set('name')} autoComplete="name" aria-invalid={!!errors.name} />
              </Field>
            )}
            <Field label="Email" id="l-email" error={errors.email}>
              <input
                id="l-email"
                type="email"
                value={form.email}
                onChange={set('email')}
                autoComplete="username"
                placeholder="you@example.com"
                aria-invalid={!!errors.email}
              />
            </Field>
            <Field label="Password" id="l-pass" error={errors.password}>
              <input
                id="l-pass"
                type="password"
                value={form.password}
                onChange={set('password')}
                autoComplete={needsSetup ? 'new-password' : 'current-password'}
                aria-invalid={!!errors.password}
              />
            </Field>
            <button type="submit" className="btn btn-primary btn-block" disabled={busy}>
              {busy ? 'Please wait...' : needsSetup ? 'Create admin' : 'Sign in'}
            </button>
            {IS_DEMO && (
              <div className="demo-logins">
                <h3>Demo logins</h3>
                <p className="muted">Pick a role to fill in the form, then press Sign in.</p>
                <ul>
                  {DEMO_USERS.map((u) => (
                    <li key={u.role}>
                      <button
                        type="button"
                        className="btn btn-ghost btn-sm"
                        onClick={() => setForm((f) => ({ ...f, email: u.email, password: u.password }))}
                      >
                        {u.role}
                      </button>
                      <code>{u.email}</code> <code>{u.password}</code>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </form>
        </div>
      </section>
      <section className="features" aria-labelledby="feat-h">
        <h2 id="feat-h">Everything the front desk needs</h2>
        <div className="feature-grid">
          {FEATURES.map(([icon, title, text], i) => (
            <Reveal key={title} className="card feature" delay={i * 80}>
              <span className="feature-icon">
                <Icon name={icon} size={22} />
              </span>
              <h3>{title}</h3>
              <p>{text}</p>
            </Reveal>
          ))}
        </div>
      </section>
    </div>
  );
}
