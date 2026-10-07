import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useData } from '../context/DataContext';
import { BarChart, DonutChart, HBars } from '../ui/Charts';
import { ErrorState, SkeletonCards, SkeletonList, StatusBadge } from '../ui/Common';
import { Parallax, Reveal } from '../ui/Motion';
import { addDays, dayKey, fmtDate, fmtTime, fmtWeekday, startOfDay } from '../lib/dates';
import { effectiveStatus } from '../lib/appointments';
import {
  ageBuckets,
  appointmentsPerDay,
  appointmentsPerWeek,
  dashboardStats,
  doctorsBySpecialty,
  genderMix,
} from '../lib/stats';

export default function Dashboard() {
  const { user } = useAuth();
  const { patients, doctors, appointments, state, error, reload } = useData();
  const [range, setRange] = useState('day');
  const now = useMemo(() => new Date(), []);

  const view = useMemo(() => {
    const stats = dashboardStats({ patients, doctors, appointments }, now);
    const days = appointmentsPerDay(appointments, addDays(startOfDay(now), -6), 14).map((d) => ({
      ...d,
      label: `${fmtWeekday(d.date).slice(0, 2)} ${d.date.getDate()}`,
    }));
    const weeks = appointmentsPerWeek(appointments, addDays(now, 21), 8).map((d) => ({
      ...d,
      label: `${d.date.getDate()}/${d.date.getMonth() + 1}`,
    }));
    const today = appointments
      .filter((a) => dayKey(a.date) === dayKey(now) && effectiveStatus(a) !== 'cancelled')
      .sort((a, b) => new Date(a.date) - new Date(b.date));
    return {
      stats,
      days,
      weeks,
      today,
      specialties: doctorsBySpecialty(doctors).slice(0, 8),
      ages: ageBuckets(patients),
      gender: genderMix(patients),
    };
  }, [patients, doctors, appointments, now]);

  if (state === 'error') return <ErrorState message={error} onRetry={reload} />;

  const loading = state === 'loading';
  const s = view.stats;
  const tiles = [
    ['Patients', s.patients, '/patients'],
    ['Doctors', s.doctors, '/doctors'],
    ['Today', s.today, '/appointments'],
    ['Upcoming', s.upcoming, '/appointments'],
    ['Completed', s.completed, '/appointments'],
    ['Cancelled', s.cancelled, '/appointments'],
  ];

  return (
    <>
      <section className="banner">
        <Parallax speed={0.22} className="banner-shape banner-shape-a" />
        <Parallax speed={-0.12} className="banner-shape banner-shape-b" />
        <div className="banner-copy">
          <h1>Welcome back, {user?.name?.split(' ')[0]}</h1>
          <p>
            {fmtDate(now)}.{' '}
            {loading ? 'Loading today\'s schedule...' : `${s.today} appointment${s.today === 1 ? '' : 's'} on today's agenda.`}
          </p>
        </div>
      </section>

      {loading ? (
        <>
          <SkeletonCards count={6} />
          <SkeletonList rows={4} label="Loading charts" />
        </>
      ) : (
        <>
          <div className="stat-grid">
            {tiles.map(([label, value, to], i) => (
              <Reveal key={label} delay={i * 40} className="card stat">
                <Link to={to} className="stat-link">
                  <span className="muted">{label}</span>
                  <strong>{value}</strong>
                </Link>
              </Reveal>
            ))}
          </div>

          <div className="dash-grid">
            <Reveal className="card span-2">
              <div className="card-head">
                <h2>Appointments</h2>
                <div className="seg" role="group" aria-label="Chart range">
                  <button type="button" aria-pressed={range === 'day'} onClick={() => setRange('day')}>
                    Per day
                  </button>
                  <button type="button" aria-pressed={range === 'week'} onClick={() => setRange('week')}>
                    Per week
                  </button>
                </div>
              </div>
              {range === 'day' ? (
                <BarChart items={view.days} title="Appointments per day, last 6 days and next 7" labelEvery={2} />
              ) : (
                <BarChart items={view.weeks} title="Appointments per week" />
              )}
            </Reveal>

            <Reveal className="card">
              <div className="card-head">
                <h2>Today</h2>
              </div>
              {view.today.length === 0 ? (
                <p className="muted">Nothing scheduled for today.</p>
              ) : (
                <ul className="agenda-list">
                  {view.today.slice(0, 8).map((a) => (
                    <li key={a._id}>
                      <time>{fmtTime(a.date)}</time>
                      <span>
                        {a.patient?.name}
                        <small className="muted"> with {a.doctor?.name}</small>
                      </span>
                      <StatusBadge appointment={a} />
                    </li>
                  ))}
                </ul>
              )}
            </Reveal>

            <Reveal className="card">
              <div className="card-head">
                <h2>Doctors by specialty</h2>
              </div>
              <HBars items={view.specialties} title="Doctors by specialty" />
            </Reveal>

            <Reveal className="card">
              <div className="card-head">
                <h2>Patient age groups</h2>
              </div>
              <BarChart items={view.ages} title="Patients by age group" height={170} />
            </Reveal>

            <Reveal className="card">
              <div className="card-head">
                <h2>Gender mix</h2>
              </div>
              <DonutChart items={view.gender} title="Patients by gender" center="patients" />
            </Reveal>
          </div>
        </>
      )}
    </>
  );
}
