import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api';
import { useAuth } from '../context/AuthContext';
import { useData } from '../context/DataContext';
import { useToast } from '../context/ToastContext';
import { useFetch } from '../hooks/useFetch';
import { can } from '../lib/permissions';
import { downloadCsv } from '../lib/csv';
import { APPOINTMENT_CSV } from '../lib/exports';
import { addDays, fmtDate, fmtDateTime, startOfWeek } from '../lib/dates';
import { STATUSES, conflictIds } from '../lib/appointments';
import { label } from '../lib/format';
import { errorMessage } from '../api/errors';
import Icon from '../ui/Icon';
import { ConfirmDialog } from '../ui/Modal';
import { EmptyState, ErrorState, PageHeader, SkeletonList } from '../ui/Common';
import { AppointmentFormModal } from '../ui/Forms';
import { IssueTokenModal } from '../ui/ClinicalForms';
import { ServerPager, Tag } from '../ui/Kit';
import { useDebounced } from '../hooks/useDebounced';
import WeekAgenda from '../ui/WeekAgenda';

export default function Appointments() {
  const { role } = useAuth();
  const { doctors } = useData();
  const toast = useToast();
  const [view, setView] = useState('agenda');
  const [week, setWeek] = useState(() => startOfWeek(new Date()));
  const [doctor, setDoctor] = useState('');
  const [status, setStatus] = useState('');
  const [when, setWhen] = useState('upcoming');
  const [q, setQ] = useState('');
  const [page, setPage] = useState(1);
  const [form, setForm] = useState(null);
  const [checkin, setCheckin] = useState(null);
  const [toDelete, setToDelete] = useState(null);
  const search = useDebounced(q.trim());

  const weekQ = useFetch('/appointments', { doctor, status, from: week.toISOString(), to: addDays(week, 7).toISOString() }, { all: true, enabled: view === 'agenda' });
  const nowIso = useMemo(() => new Date().toISOString(), []);
  const listQ = useFetch(
    '/appointments',
    { doctor, status, search, page, limit: 12, order: when === 'past' ? 'desc' : 'asc', ...(when === 'past' ? { to: nowIso } : { from: nowIso }) },
    { enabled: view === 'list' }
  );

  const reloadAll = () => {
    weekQ.reload();
    listQ.reload();
  };
  const conflicts = useMemo(() => conflictIds(weekQ.data || []), [weekQ.data]);
  const weekEnd = addDays(week, 6);

  const setApptStatus = async (a, s) => {
    try {
      await api.patch(`/appointments/${a._id}/status`, { status: s });
      toast.success(`Appointment marked ${label(s)}.`);
      reloadAll();
    } catch (err) {
      toast.error(errorMessage(err));
    }
  };
  const remove = async () => {
    try {
      await api.del(`/appointments/delete/${toDelete._id}`);
      toast.success('Appointment deleted.');
      reloadAll();
    } catch (err) {
      toast.error(errorMessage(err));
    }
    setToDelete(null);
  };

  const rows = listQ.data?.data || [];
  const current = view === 'agenda' ? weekQ : listQ;

  return (
    <>
      <PageHeader title="Appointments" subtitle="Weekly agenda with overlap warnings, or a searchable list">
        <button
          type="button"
          className="btn btn-ghost"
          disabled={!(view === 'agenda' ? weekQ.data?.length : rows.length)}
          onClick={() => downloadCsv('appointments.csv', APPOINTMENT_CSV, view === 'agenda' ? weekQ.data : rows)}
        >
          <Icon name="download" /> Export CSV
        </button>
        {can(role, 'appointments.write') && (
          <button type="button" className="btn btn-primary" onClick={() => setForm('new')}>
            <Icon name="plus" /> New appointment
          </button>
        )}
      </PageHeader>

      <div className="toolbar">
        <div className="field">
          <label htmlFor="ap-view">View</label>
          <div className="seg" role="group" aria-label="View" id="ap-view">
            <button type="button" aria-pressed={view === 'agenda'} onClick={() => setView('agenda')}>Week</button>
            <button type="button" aria-pressed={view === 'list'} onClick={() => setView('list')}>List</button>
          </div>
        </div>
        <div className="field">
          <label htmlFor="ap-doc">Doctor</label>
          <select id="ap-doc" value={doctor} onChange={(e) => { setDoctor(e.target.value); setPage(1); }}>
            <option value="">All doctors</option>
            {doctors.map((d) => (
              <option key={d._id} value={d._id}>{d.name}</option>
            ))}
          </select>
        </div>
        <div className="field">
          <label htmlFor="ap-st">Status</label>
          <select id="ap-st" value={status} onChange={(e) => { setStatus(e.target.value); setPage(1); }}>
            <option value="">Any</option>
            {STATUSES.map((s) => (
              <option key={s} value={s}>{label(s)}</option>
            ))}
          </select>
        </div>
        {view === 'list' && (
          <>
            <div className="field">
              <label htmlFor="ap-when">Show</label>
              <select id="ap-when" value={when} onChange={(e) => { setWhen(e.target.value); setPage(1); }}>
                <option value="upcoming">Upcoming</option>
                <option value="past">Past</option>
              </select>
            </div>
            <div className="field">
              <label htmlFor="ap-q">Search</label>
              <input id="ap-q" type="search" placeholder="Patient or doctor" value={q} onChange={(e) => { setQ(e.target.value); setPage(1); }} />
            </div>
          </>
        )}
      </div>

      {current.loading && <SkeletonList label="Loading appointments" />}
      {current.error && <ErrorState message={current.error} onRetry={current.reload} />}

      {view === 'agenda' && !weekQ.loading && !weekQ.error && (
        <section className="card section" aria-label="Week agenda">
          <div className="card-head">
            <h2>{fmtDate(week)} - {fmtDate(weekEnd)}</h2>
            <div className="card-actions">
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => setWeek(addDays(week, -7))}><Icon name="chevL" size={14} /> Previous</button>
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => setWeek(startOfWeek(new Date()))}>This week</button>
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => setWeek(addDays(week, 7))}>Next <Icon name="chevR" size={14} /></button>
            </div>
          </div>
          {conflicts.size > 0 && (
            <p className="warn-box" role="status">
              <Icon name="warn" /> {conflicts.size} bookings overlap another booking of the same doctor this week. They are marked.
            </p>
          )}
          <WeekAgenda weekStart={week} appointments={weekQ.data || []} conflicts={conflicts} onSelect={(a) => (can(role, 'appointments.write') ? setForm(a) : null)} />
        </section>
      )}

      {view === 'list' && !listQ.loading && !listQ.error && (
        <>
          {rows.length === 0 ? (
            <EmptyState title="No appointments found" text="Change the filters or book a new appointment." />
          ) : (
            <div className="card table-card">
              <div className="table-scroll" tabIndex={0} role="region" aria-label="Appointments">
                <table className="table">
                  <caption className="sr-only">Appointments</caption>
                  <thead>
                    <tr>
                      <th scope="col">When</th><th scope="col">Patient</th><th scope="col">Doctor</th><th scope="col">Reason</th><th scope="col">Status</th><th scope="col">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((a) => (
                      <tr key={a._id}>
                        <td data-label="When">{fmtDateTime(a.date)} <span className="muted">({a.duration} min)</span></td>
                        <td data-label="Patient"><Link to={`/patients/${a.patient?._id}`}>{a.patient?.name}</Link></td>
                        <td data-label="Doctor">{a.doctor?.name}</td>
                        <td data-label="Reason">{a.reason || '-'}</td>
                        <td data-label="Status">
                          {can(role, 'appointments.status') ? (
                            <select className="status-select" aria-label={`Status for ${a.patient?.name}`} value={a.status} onChange={(e) => setApptStatus(a, e.target.value)}>
                              {STATUSES.map((s) => (<option key={s} value={s}>{label(s)}</option>))}
                            </select>
                          ) : (
                            <Tag value={a.status} />
                          )}
                        </td>
                        <td data-label="Actions" className="actions">
                          <div className="row-actions">
                            {can(role, 'queue.issue') && a.status === 'scheduled' && (
                              <button type="button" className="btn btn-ghost btn-sm" onClick={() => setCheckin(a)}>Check in</button>
                            )}
                            {can(role, 'appointments.write') && (
                              <>
                                <button type="button" className="btn btn-icon btn-ghost" aria-label={`Edit appointment of ${a.patient?.name}`} onClick={() => setForm(a)}><Icon name="edit" /></button>
                                <button type="button" className="btn btn-icon btn-ghost danger" aria-label={`Delete appointment of ${a.patient?.name}`} onClick={() => setToDelete(a)}><Icon name="trash" /></button>
                              </>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <ServerPager page={listQ.data.page} pages={listQ.data.pages} total={listQ.data.total} onPage={setPage} label="appointments" />
            </div>
          )}
        </>
      )}

      {form && <AppointmentFormModal appointment={form === 'new' ? null : form} onClose={() => setForm(null)} onSaved={reloadAll} />}
      {checkin && <IssueTokenModal appointment={checkin} onClose={() => setCheckin(null)} onDone={reloadAll} />}
      {toDelete && (
        <ConfirmDialog
          title="Delete appointment?"
          message={`The appointment of ${toDelete.patient?.name} on ${fmtDateTime(toDelete.date)} will be removed.`}
          onConfirm={remove}
          onCancel={() => setToDelete(null)}
        />
      )}
    </>
  );
}
