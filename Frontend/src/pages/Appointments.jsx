import { useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { api } from '../api';
import { useAuth } from '../context/AuthContext';
import { useData } from '../context/DataContext';
import { useToast } from '../context/ToastContext';
import { can } from '../lib/permissions';
import { downloadCsv } from '../lib/csv';
import { APPOINTMENT_CSV } from '../lib/exports';
import { STATUSES, conflictIds, effectiveStatus, refId } from '../lib/appointments';
import { addDays, fmtDate, fmtDateTime, startOfWeek } from '../lib/dates';
import { errorMessage } from '../api/errors';
import DataTable from '../ui/DataTable';
import Icon from '../ui/Icon';
import { ConfirmDialog } from '../ui/Modal';
import { EmptyState, ErrorState, PageHeader, SkeletonList } from '../ui/Common';
import { AppointmentFormModal } from '../ui/Forms';
import StatusControl from '../ui/StatusControl';
import WeekAgenda from '../ui/WeekAgenda';

export default function Appointments() {
  const { role } = useAuth();
  const { appointments, doctors, state, error, reload, mutate } = useData();
  const toast = useToast();
  const [params] = useSearchParams();
  const focus = params.get('focus');
  const [showOnly, setShowOnly] = useState(!!focus);

  const [view, setView] = useState('list');
  const [q, setQ] = useState(() => '');
  const [status, setStatus] = useState('');
  const [doctor, setDoctor] = useState('');
  const [week, setWeek] = useState(() => startOfWeek(new Date()));
  const [form, setForm] = useState(null);
  const [toDelete, setToDelete] = useState(null);

  const conflicts = useMemo(() => conflictIds(appointments), [appointments]);

  const rows = useMemo(() => {
    const t = q.trim().toLowerCase();
    return appointments.filter(
      (a) =>
        (!showOnly || a._id === focus) &&
        (!doctor || refId(a.doctor) === doctor) &&
        (!status || effectiveStatus(a) === status) &&
        (!t || `${a.patient?.name} ${a.doctor?.name} ${a.doctor?.specialty}`.toLowerCase().includes(t))
    );
  }, [appointments, q, status, doctor, showOnly, focus]);

  const inWeek = rows.filter((a) => new Date(a.date) >= week && new Date(a.date) < addDays(week, 7));

  const columns = [
    {
      key: 'date',
      label: 'Date and time',
      sort: (a) => new Date(a.date).getTime(),
      render: (a) => (
        <span className={a._id === focus ? 'hl' : ''}>
          {fmtDateTime(a.date)}
          {conflicts.has(a._id) && (
            <span className="conflict-tag" title="Overlaps another booking of this doctor">
              <Icon name="warn" size={13} /> Overlap
            </span>
          )}
        </span>
      ),
    },
    {
      key: 'patient',
      label: 'Patient',
      sort: (a) => a.patient?.name,
      render: (a) => (a.patient ? <Link to={`/patients/${a.patient._id}`}>{a.patient.name}</Link> : 'Unknown'),
    },
    {
      key: 'doctor',
      label: 'Doctor',
      sort: (a) => a.doctor?.name,
      render: (a) => (a.doctor ? <Link to={`/doctors/${a.doctor._id}`}>{a.doctor.name}</Link> : 'Unknown'),
    },
    { key: 'spec', label: 'Specialty', sort: (a) => a.doctor?.specialty, render: (a) => a.doctor?.specialty },
    { key: 'dur', label: 'Min', className: 'num', sort: (a) => a.duration || 30, render: (a) => a.duration || 30 },
    { key: 'status', label: 'Status', sort: (a) => effectiveStatus(a), render: (a) => <StatusControl appointment={a} /> },
    {
      key: 'actions',
      label: 'Actions',
      className: 'actions',
      render: (a) => (
        <div className="row-actions">
          {can(role, 'appointments', 'update') && (
            <button type="button" className="btn btn-icon btn-ghost" aria-label={`Edit appointment of ${a.patient?.name}`} onClick={() => setForm(a)}>
              <Icon name="edit" />
            </button>
          )}
          {can(role, 'appointments', 'remove') && (
            <button type="button" className="btn btn-icon btn-ghost danger" aria-label={`Delete appointment of ${a.patient?.name}`} onClick={() => setToDelete(a)}>
              <Icon name="trash" />
            </button>
          )}
        </div>
      ),
    },
  ];

  const remove = async () => {
    try {
      await mutate(() => api.appointments.remove(toDelete._id));
      toast.success('Appointment deleted.');
    } catch (err) {
      toast.error(errorMessage(err));
    }
    setToDelete(null);
  };

  const pick = (a) =>
    can(role, 'appointments', 'update')
      ? setForm(a)
      : toast.info(`${a.patient?.name} with ${a.doctor?.name}, ${fmtDateTime(a.date)}`);

  return (
    <>
      <PageHeader title="Appointments" subtitle={`${appointments.length} bookings in total`}>
        <button
          type="button"
          className="btn btn-ghost"
          disabled={!rows.length}
          onClick={() => downloadCsv('appointments.csv', APPOINTMENT_CSV, rows)}
        >
          <Icon name="download" /> Export CSV
        </button>
        {can(role, 'appointments', 'create') && (
          <button type="button" className="btn btn-primary" onClick={() => setForm('new')}>
            <Icon name="plus" /> New appointment
          </button>
        )}
      </PageHeader>

      {state === 'ready' && conflicts.size > 0 && (
        <p className="warn-box" role="status">
          <Icon name="warn" /> {conflicts.size} bookings overlap another booking of the same doctor. They are marked in the list and
          the agenda.
        </p>
      )}

      {showOnly && (
        <p className="info-box" role="status">
          Showing the appointment you searched for.{' '}
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => setShowOnly(false)}>
            Show all appointments
          </button>
        </p>
      )}

      <div className="toolbar">
        <div className="field">
          <label htmlFor="ap-q">Search</label>
          <input
            id="ap-q"
            type="search"
            placeholder="Patient, doctor or specialty"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
        </div>
        <div className="field">
          <label htmlFor="ap-d">Doctor</label>
          <select id="ap-d" value={doctor} onChange={(e) => setDoctor(e.target.value)}>
            <option value="">All doctors</option>
            {doctors.map((d) => (
              <option key={d._id} value={d._id}>
                {d.name}
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <label htmlFor="ap-s">Status</label>
          <select id="ap-s" value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="">All</option>
            {STATUSES.map((s) => (
              <option key={s}>{s}</option>
            ))}
          </select>
        </div>
        <div className="seg" role="group" aria-label="View">
          <button type="button" aria-pressed={view === 'list'} onClick={() => setView('list')}>
            List
          </button>
          <button type="button" aria-pressed={view === 'agenda'} onClick={() => setView('agenda')}>
            Agenda
          </button>
        </div>
      </div>

      {state === 'loading' && <SkeletonList label="Loading appointments" />}
      {state === 'error' && <ErrorState message={error} onRetry={reload} />}
      {state === 'ready' && view === 'list' && (
        <DataTable
          caption="Appointments"
          columns={columns}
          rows={rows}
          initialSort={{ key: 'date', dir: 'desc' }}
          empty={
            <EmptyState
              title={appointments.length ? 'No appointments match your filters' : 'No appointments yet'}
              text={appointments.length ? 'Clear a filter or change the search.' : 'Book the first appointment to fill the agenda.'}
            />
          }
        />
      )}
      {state === 'ready' && view === 'agenda' && (
        <div className="card">
          <div className="card-head">
            <h2>
              {fmtDate(week)} - {fmtDate(addDays(week, 6))}
            </h2>
            <div className="row-actions">
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => setWeek(addDays(week, -7))}>
                <Icon name="chevL" size={14} /> Prev
              </button>
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => setWeek(startOfWeek(new Date()))}>
                This week
              </button>
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => setWeek(addDays(week, 7))}>
                Next <Icon name="chevR" size={14} />
              </button>
            </div>
          </div>
          <WeekAgenda weekStart={week} appointments={inWeek} conflicts={conflicts} onSelect={pick} />
        </div>
      )}

      {form && <AppointmentFormModal appointment={form === 'new' ? null : form} onClose={() => setForm(null)} />}
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
