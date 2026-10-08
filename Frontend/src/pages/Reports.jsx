import { useState } from 'react';
import { useFetch } from '../hooks/useFetch';
import { downloadCsv } from '../lib/csv';
import { fmtWeekday } from '../lib/dates';
import { money } from '../lib/format';
import Icon from '../ui/Icon';
import { BarChart, HBars, PairBars } from '../ui/Charts';
import { ErrorState, PageHeader, SkeletonCards } from '../ui/Common';
import { PrintButton, Section, Stat } from '../ui/Kit';

const short = (key) => {
  const d = new Date(`${key}T00:00:00`);
  return `${fmtWeekday(d).slice(0, 2)} ${d.getDate()}`;
};

export default function Reports() {
  const [days, setDays] = useState(14);
  const summary = useFetch('/reports/summary', { days });
  const visits = useFetch('/reports/daily-visits', { days });
  const revenue = useFetch('/reports/revenue', { days });
  const beds = useFetch('/reports/bed-occupancy');
  const dx = useFetch('/reports/top-diagnoses', { days: Math.max(days, 30), limit: 8 });
  const load = useFetch('/reports/doctor-workload', { days: Math.max(days, 30) });
  const s = summary.data;

  return (
    <div className="print-area">
      <PageHeader title="Reports" subtitle="Visits, revenue, beds, diagnoses and doctor workload">
        <div className="field inline-field">
          <label htmlFor="rp-days">Period</label>
          <select id="rp-days" value={days} onChange={(e) => setDays(Number(e.target.value))}>
            {[7, 14, 30, 60, 90].map((d) => (<option key={d} value={d}>Last {d} days</option>))}
          </select>
        </div>
        <PrintButton label="Print report" className="btn btn-ghost" />
      </PageHeader>
      {summary.error && <ErrorState message={summary.error} onRetry={summary.reload} />}
      {summary.loading && <SkeletonCards count={6} />}
      {s && (
        <div className="stat-grid">
          <Stat label="Visits" value={s.visits} hint={`last ${s.days} days`} />
          <Stat label="Appointments" value={s.appointments} hint={`${s.noShows} no-shows`} />
          <Stat label="Collected" value={money(s.collected)} hint="payments received" />
          <Stat label="Outstanding" value={money(s.billing.outstanding)} hint={`${s.billing.overdueCount} overdue`} tone={s.billing.overdueCount ? 'bad' : undefined} />
          <Stat label="Bed occupancy" value={`${s.beds.occupancyPct}%`} hint={`${s.beds.occupied} occupied`} />
          <Stat label="Patients" value={s.patients} hint="registered" />
        </div>
      )}
      <div className="dash-grid">
        <Section title="Daily visits" id="rp-visits">
          {visits.error ? <ErrorState message={visits.error} onRetry={visits.reload} /> : visits.data ? (
            <BarChart title={`Visits per day, last ${days} days`} items={visits.data.rows.map((r) => ({ key: r.date, label: short(r.date), value: r.visits }))} labelEvery={Math.ceil(days / 8)} />
          ) : <p className="muted">Loading...</p>}
        </Section>
        <Section title="Revenue" id="rp-rev">
          {revenue.error ? <ErrorState message={revenue.error} onRetry={revenue.reload} /> : revenue.data ? (
            <>
              <PairBars title={`Billed and collected per day, last ${days} days`} a={{ key: 'billed', name: 'Billed' }} b={{ key: 'collected', name: 'Collected' }} items={revenue.data.rows.map((r) => ({ ...r, label: short(r.date) }))} />
              <p className="muted">Billed {money(revenue.data.totals.billed)}, collected {money(revenue.data.totals.collected)}.</p>
            </>
          ) : <p className="muted">Loading...</p>}
        </Section>
        <Section title="Bed occupancy by ward" id="rp-beds">
          {beds.data ? (
            <ul className="hbars" aria-label="Occupancy by ward">
              {beds.data.wards.map((w) => (
                <li key={w.ward}>
                  <span className="hbar-label">{w.name}</span>
                  <span className="hbar-track"><span className="hbar-fill" style={{ width: `${w.occupancyPct}%` }} /></span>
                  <strong>{w.occupancyPct}%</strong>
                </li>
              ))}
            </ul>
          ) : <p className="muted">Loading...</p>}
        </Section>
        <Section title="Top diagnoses" id="rp-dx">
          {dx.data ? (dx.data.rows.length ? <HBars title="Top diagnoses" items={dx.data.rows.map((r) => ({ label: r.name, value: r.count }))} /> : <p className="muted">No diagnoses recorded in this period.</p>) : <p className="muted">Loading...</p>}
        </Section>
      </div>
      <Section
        title="Doctor workload"
        id="rp-load"
        actions={load.data && (
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => downloadCsv('doctor-workload.csv', [
            { label: 'Doctor', value: (r) => r.name }, { label: 'Specialty', value: (r) => r.specialty }, { label: 'Visits', value: (r) => r.visits }, { label: 'Appointments', value: (r) => r.appointments }, { label: 'Average consult (min)', value: (r) => r.avgConsultMin },
          ], load.data.rows)}><Icon name="download" size={14} /> Export CSV</button>
        )}
      >
        {load.data ? (
          <div className="table-scroll" tabIndex={0} role="region" aria-label="Doctor workload">
            <table className="table">
              <caption className="sr-only">Doctor workload, last {load.data.days} days</caption>
              <thead><tr><th scope="col">Doctor</th><th scope="col">Specialty</th><th scope="col" className="num">Visits</th><th scope="col" className="num">Appointments</th><th scope="col" className="num">Avg consult</th></tr></thead>
              <tbody>
                {load.data.rows.slice(0, 12).map((r) => (
                  <tr key={r.doctor}><td data-label="Doctor">{r.name}</td><td data-label="Specialty">{r.specialty}</td><td data-label="Visits" className="num">{r.visits}</td><td data-label="Appointments" className="num">{r.appointments}</td><td data-label="Avg consult" className="num">{r.avgConsultMin ? `${r.avgConsultMin} min` : '-'}</td></tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : <p className="muted">Loading...</p>}
      </Section>
    </div>
  );
}
