import { useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useData } from '../context/DataContext';
import { useFetch } from '../hooks/useFetch';
import { can } from '../lib/permissions';
import { addDays, fmtDate, fmtTime, startOfWeek } from '../lib/dates';
import { conflictIds } from '../lib/appointments';
import { daysText } from '../lib/schedule';
import { money } from '../lib/format';
import { scheduleOf } from '../../../shared/domain.js';
import Icon from '../ui/Icon';
import { EmptyState, ErrorState, PageHeader, SkeletonList } from '../ui/Common';
import { Dl, Section } from '../ui/Kit';
import WeekAgenda from '../ui/WeekAgenda';
import { AppointmentFormModal, DoctorFormModal } from '../ui/Forms';

export default function DoctorDetail() {
  const { id } = useParams();
  const { role } = useAuth();
  const { doctors, state, error, reload } = useData();
  const [week, setWeek] = useState(() => startOfWeek(new Date()));
  const [booking, setBooking] = useState(null);
  const [edit, setEdit] = useState(false);

  const doctor = doctors.find((d) => d._id === id);
  const range = { doctor: id, from: week.toISOString(), to: addDays(week, 7).toISOString(), limit: 100 };
  const agenda = useFetch('/appointments', range, { enabled: !!doctor });
  const slots = useFetch(`/doctors/${id}/slots`, { days: 7, limit: 8 }, { enabled: !!doctor });
  const history = useFetch(`/doctors/${id}/patient-history`, {}, { enabled: !!doctor });

  const conflicts = useMemo(() => conflictIds(agenda.data?.data || []), [agenda.data]);
  const mine = agenda.data?.data || [];
  const patientsSeen = useMemo(() => {
    const m = new Map();
    for (const a of history.data || []) {
      if (a.status !== 'completed' || !a.patient) continue;
      const cur = m.get(a.patient._id);
      if (!cur || new Date(a.date) > new Date(cur.date)) m.set(a.patient._id, a);
    }
    return [...m.values()].sort((a, b) => new Date(b.date) - new Date(a.date));
  }, [history.data]);

  if (state === 'loading') return <SkeletonList rows={5} label="Loading doctor" />;
  if (state === 'error') return <ErrorState message={error} onRetry={reload} />;
  if (!doctor) {
    return <EmptyState title="Doctor not found" text="This record may have been removed." action={<Link className="btn btn-primary" to="/doctors">Back to doctors</Link>} />;
  }
  const s = scheduleOf(doctor);
  const weekEnd = addDays(week, 6);

  return (
    <>
      <Link to="/doctors" className="back-link">
        <Icon name="back" size={16} /> All doctors
      </Link>
      <PageHeader title={doctor.name} subtitle={doctor.specialty}>
        {can(role, 'appointments.write') && (
          <button type="button" className="btn btn-primary" onClick={() => setBooking({ doctor: doctor._id })}>
            <Icon name="plus" /> Book appointment
          </button>
        )}
        {can(role, 'doctors.manage') && (
          <button type="button" className="btn btn-ghost" onClick={() => setEdit(true)}>
            <Icon name="edit" /> Edit
          </button>
        )}
      </PageHeader>

      <div className="detail-grid">
        <Section title="Schedule" id="dd-sched">
          <Dl items={[['Works', daysText(doctor)], ['Hours', `${s.startTime} - ${s.endTime}`], ['Break', s.breakStart ? `${s.breakStart} - ${s.breakEnd}` : 'None'], ['Appointment length', `${s.slotMinutes} min`], ['Room', doctor.room], ['Fee', money(doctor.fee)], ['Leave', s.daysOff.length ? s.daysOff.join(', ') : 'None planned']]} />
        </Section>
        <Section title="Next free times" id="dd-slots">
          {slots.loading && <p className="muted">Looking for free times...</p>}
          {slots.data?.slots?.length === 0 && <p className="muted">No free times in the next week.</p>}
          <ul className="chip-list">
            {(slots.data?.slots || []).map((sl) => (
              <li key={sl.start}>
                {can(role, 'appointments.write') ? (
                  <button type="button" className="chip" onClick={() => setBooking({ doctor: doctor._id, date: sl.start.slice(0, 16) })}>
                    {new Date(sl.start).toLocaleDateString(undefined, { weekday: 'short', day: 'numeric' })} {fmtTime(sl.start)}
                  </button>
                ) : (
                  <span className="chip">{new Date(sl.start).toLocaleDateString(undefined, { weekday: 'short', day: 'numeric' })} {fmtTime(sl.start)}</span>
                )}
              </li>
            ))}
          </ul>
        </Section>
      </div>

      <Section
        title={`Agenda: ${fmtDate(week)} - ${fmtDate(weekEnd)}`}
        id="dd-agenda"
        actions={
          <>
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => setWeek(addDays(week, -7))}>
              <Icon name="chevL" size={14} /> Previous
            </button>
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => setWeek(startOfWeek(new Date()))}>This week</button>
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => setWeek(addDays(week, 7))}>
              Next <Icon name="chevR" size={14} />
            </button>
          </>
        }
      >
        {agenda.error ? <ErrorState message={agenda.error} onRetry={agenda.reload} /> : <WeekAgenda weekStart={week} appointments={mine} conflicts={conflicts} showDoctor={false} />}
      </Section>

      <Section title="Patient history" id="dd-history">
        {history.loading ? (
          <p className="muted">Loading...</p>
        ) : patientsSeen.length === 0 ? (
          <p className="muted">No completed consultations yet.</p>
        ) : (
          <ul className="plain-list cols">
            {patientsSeen.slice(0, 24).map((a) => (
              <li key={a.patient._id}>
                <Link to={`/patients/${a.patient._id}`}>{a.patient.name}</Link> <span className="muted">last seen {fmtDate(a.date)}</span>
              </li>
            ))}
          </ul>
        )}
      </Section>

      {booking && <AppointmentFormModal preset={booking} onClose={() => setBooking(null)} onSaved={() => { agenda.reload(); slots.reload(); }} />}
      {edit && <DoctorFormModal doctor={doctor} onClose={() => setEdit(false)} />}
    </>
  );
}
