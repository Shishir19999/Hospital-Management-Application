import { useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useData } from '../context/DataContext';
import { can } from '../lib/permissions';
import { addDays, fmtDate, startOfWeek } from '../lib/dates';
import { conflictIds, effectiveStatus, refId } from '../lib/appointments';
import Icon from '../ui/Icon';
import { EmptyState, ErrorState, PageHeader, SkeletonList } from '../ui/Common';
import { Reveal } from '../ui/Motion';
import WeekAgenda from '../ui/WeekAgenda';
import { AppointmentFormModal, DoctorFormModal } from '../ui/Forms';

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export default function DoctorDetail() {
  const { id } = useParams();
  const { role } = useAuth();
  const { doctors, appointments, state, error, reload } = useData();
  const [week, setWeek] = useState(() => startOfWeek(new Date()));
  const [booking, setBooking] = useState(false);
  const [edit, setEdit] = useState(false);

  const doctor = doctors.find((d) => d._id === id);
  const mine = useMemo(() => appointments.filter((a) => refId(a.doctor) === id), [appointments, id]);
  const conflicts = useMemo(() => conflictIds(mine), [mine]);
  const patientsSeen = useMemo(() => {
    const m = new Map();
    for (const a of mine) {
      if (effectiveStatus(a) !== 'completed' || !a.patient) continue;
      const cur = m.get(a.patient._id);
      if (!cur || new Date(a.date) > new Date(cur.date)) m.set(a.patient._id, a);
    }
    return [...m.values()].sort((a, b) => new Date(b.date) - new Date(a.date));
  }, [mine]);

  if (state === 'loading') return <SkeletonList rows={5} label="Loading doctor" />;
  if (state === 'error') return <ErrorState message={error} onRetry={reload} />;
  if (!doctor) {
    return (
      <EmptyState
        title="Doctor not found"
        text="This record may have been removed."
        action={
          <Link className="btn btn-primary" to="/doctors">
            Back to doctors
          </Link>
        }
      />
    );
  }

  const weekEnd = addDays(week, 6);
  const inWeek = mine.filter((a) => new Date(a.date) >= week && new Date(a.date) < addDays(week, 7));
  const days = doctor.workingDays ? doctor.workingDays.map((d) => DAYS[d]).join(', ') : null;

  return (
    <>
      <Link to="/doctors" className="back-link">
        <Icon name="back" size={16} /> All doctors
      </Link>
      <PageHeader
        title={doctor.name}
        subtitle={`${doctor.specialty}${days ? `. Works ${days}, ${doctor.hours}` : ''}`}
      >
        {can(role, 'appointments', 'create') && (
          <button type="button" className="btn btn-primary" onClick={() => setBooking(true)}>
            <Icon name="plus" /> Book appointment
          </button>
        )}
        {can(role, 'doctors', 'update') && (
          <button type="button" className="btn btn-ghost" onClick={() => setEdit(true)}>
            <Icon name="edit" /> Edit
          </button>
        )}
      </PageHeader>

      <Reveal className="card">
        <div className="card-head">
          <h2>
            Week of {fmtDate(week)} - {fmtDate(weekEnd)}
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
        <WeekAgenda weekStart={week} appointments={inWeek} conflicts={conflicts} showDoctor={false} />
      </Reveal>

      <Reveal className="card">
        <h2>Patients seen</h2>
        {patientsSeen.length === 0 ? (
          <p className="muted">No completed visits yet.</p>
        ) : (
          <ul className="plain-list">
            {patientsSeen.slice(0, 12).map((a) => (
              <li key={a._id}>
                <Link to={`/patients/${a.patient._id}`}>{a.patient.name}</Link>
                <span className="muted">
                  {a.patient.age}y, {a.patient.gender}. Last visit {fmtDate(a.date)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </Reveal>

      {booking && <AppointmentFormModal preset={{ doctor: doctor._id }} onClose={() => setBooking(false)} />}
      {edit && <DoctorFormModal doctor={doctor} onClose={() => setEdit(false)} />}
    </>
  );
}
