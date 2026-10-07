import { useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { api } from '../api';
import { useAuth } from '../context/AuthContext';
import { useData } from '../context/DataContext';
import { useToast } from '../context/ToastContext';
import { can } from '../lib/permissions';
import { downloadCsv } from '../lib/csv';
import { APPOINTMENT_CSV } from '../lib/exports';
import { effectiveStatus, refId } from '../lib/appointments';
import { fmtDate, fmtDateTime } from '../lib/dates';
import { errorMessage } from '../api/errors';
import Icon from '../ui/Icon';
import { ConfirmDialog } from '../ui/Modal';
import { EmptyState, ErrorState, PageHeader, SkeletonList } from '../ui/Common';
import { Reveal } from '../ui/Motion';
import { AppointmentFormModal, PatientFormModal } from '../ui/Forms';
import StatusControl from '../ui/StatusControl';

export default function PatientDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { role } = useAuth();
  const { patients, appointments, state, error, reload, mutate } = useData();
  const toast = useToast();
  const [edit, setEdit] = useState(false);
  const [booking, setBooking] = useState(false);
  const [confirm, setConfirm] = useState(false);

  const patient = patients.find((p) => p._id === id);
  const history = useMemo(
    () => appointments.filter((a) => refId(a.patient) === id).sort((a, b) => new Date(b.date) - new Date(a.date)),
    [appointments, id]
  );

  if (state === 'loading') return <SkeletonList rows={5} label="Loading patient" />;
  if (state === 'error') return <ErrorState message={error} onRetry={reload} />;
  if (!patient) {
    return (
      <EmptyState
        title="Patient not found"
        text="This record may have been deleted."
        action={
          <Link className="btn btn-primary" to="/patients">
            Back to patients
          </Link>
        }
      />
    );
  }

  const visits = history.filter((a) => effectiveStatus(a) === 'completed');
  const upcoming = history.filter((a) => effectiveStatus(a) === 'scheduled' && new Date(a.date) >= new Date());
  const doctorsSeen = new Set(visits.map((a) => a.doctor?._id)).size;

  const remove = async () => {
    try {
      await mutate(() => api.patients.remove(patient._id));
      toast.success(`${patient.name} was deleted.`);
      navigate('/patients');
    } catch (err) {
      toast.error(errorMessage(err));
      setConfirm(false);
    }
  };

  const facts = [
    ['Age', `${patient.age} years`],
    ['Gender', patient.gender],
    ...(patient.bloodGroup ? [['Blood group', patient.bloodGroup]] : []),
    ...(patient.phone ? [['Phone', patient.phone]] : []),
    ...(patient.email ? [['Email', patient.email]] : []),
    ...(patient.conditions ? [['Known conditions', patient.conditions]] : []),
  ];

  return (
    <div className="print-area">
      <Link to="/patients" className="back-link no-print">
        <Icon name="back" size={16} /> All patients
      </Link>
      <PageHeader title={patient.name} subtitle={`Patient summary, printed ${fmtDate(new Date())}`}>
        <button type="button" className="btn btn-ghost" onClick={() => window.print()}>
          <Icon name="print" /> Print summary
        </button>
        <button
          type="button"
          className="btn btn-ghost"
          disabled={!history.length}
          onClick={() => downloadCsv(`${patient.name.replace(/\s+/g, '-').toLowerCase()}-history.csv`, APPOINTMENT_CSV, history)}
        >
          <Icon name="download" /> Export history
        </button>
        {can(role, 'appointments', 'create') && (
          <button type="button" className="btn btn-primary" onClick={() => setBooking(true)}>
            <Icon name="plus" /> Book appointment
          </button>
        )}
        {can(role, 'patients', 'update') && (
          <button type="button" className="btn btn-ghost" onClick={() => setEdit(true)}>
            <Icon name="edit" /> Edit
          </button>
        )}
        {can(role, 'patients', 'remove') && (
          <button type="button" className="btn btn-ghost danger" onClick={() => setConfirm(true)}>
            <Icon name="trash" /> Delete
          </button>
        )}
      </PageHeader>

      <div className="detail-grid">
        <Reveal className="card">
          <h2>Details</h2>
          <dl className="facts">
            {facts.map(([k, v]) => (
              <div key={k}>
                <dt>{k}</dt>
                <dd>{v}</dd>
              </div>
            ))}
          </dl>
          <div className="mini-stats">
            <div>
              <strong>{visits.length}</strong>
              <span className="muted">completed visits</span>
            </div>
            <div>
              <strong>{upcoming.length}</strong>
              <span className="muted">upcoming</span>
            </div>
            <div>
              <strong>{doctorsSeen}</strong>
              <span className="muted">doctors seen</span>
            </div>
          </div>
        </Reveal>

        <Reveal className="card">
          <h2>Medical history</h2>
          {history.length === 0 ? (
            <p className="muted">No appointments on record yet.</p>
          ) : (
            <ol className="timeline">
              {history.map((a) => (
                <li key={a._id} className={`tl-${effectiveStatus(a)}`}>
                  <div className="tl-head">
                    <strong>{fmtDateTime(a.date)}</strong>
                    <StatusControl appointment={a} />
                  </div>
                  <div>
                    {a.doctor?.name} <span className="muted">({a.doctor?.specialty})</span>
                  </div>
                  {a.notes && <p className="tl-note">{a.notes}</p>}
                </li>
              ))}
            </ol>
          )}
        </Reveal>
      </div>

      {edit && <PatientFormModal patient={patient} onClose={() => setEdit(false)} />}
      {booking && <AppointmentFormModal preset={{ patient: patient._id }} onClose={() => setBooking(false)} />}
      {confirm && (
        <ConfirmDialog
          title="Delete patient?"
          message={`${patient.name} and all of their appointments will be removed. This cannot be undone.`}
          onConfirm={remove}
          onCancel={() => setConfirm(false)}
        />
      )}
    </div>
  );
}
