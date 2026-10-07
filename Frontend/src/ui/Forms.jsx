import { useMemo, useState } from 'react';
import { Modal } from './Modal';
import { Field } from './Common';
import Icon from './Icon';
import { api } from '../api';
import { useData } from '../context/DataContext';
import { errorMessage } from '../api/errors';
import { SPECIALTIES } from '../lib/constants';
import { findConflicts } from '../lib/appointments';
import { fmtDateTime, toLocalInput } from '../lib/dates';
import { GENDERS, validateAppointment, validateDoctor, validatePatient } from '../lib/validate';

// Shared wrapper: runs validation, shows inline + server errors, closes on success.
function useFormSubmit({ validate, save, onDone }) {
  const [errors, setErrors] = useState({});
  const [serverError, setServerError] = useState('');
  const [busy, setBusy] = useState(false);
  const submit = async (e) => {
    e.preventDefault();
    const errs = validate();
    setErrors(errs);
    setServerError('');
    if (Object.keys(errs).length) return;
    setBusy(true);
    try {
      await save();
      onDone();
    } catch (err) {
      setServerError(errorMessage(err));
      setBusy(false);
    }
  };
  return { errors, serverError, busy, submit };
}

function Actions({ busy, onClose, label }) {
  return (
    <div className="form-actions">
      <button type="button" className="btn btn-ghost" onClick={onClose}>
        Cancel
      </button>
      <button type="submit" className="btn btn-primary" disabled={busy}>
        {busy ? 'Saving...' : label}
      </button>
    </div>
  );
}

const ServerError = ({ message }) =>
  message ? (
    <p className="form-error" role="alert">
      {message}
    </p>
  ) : null;

export function PatientFormModal({ patient, onClose, onSaved }) {
  const { mutate } = useData();
  const [v, setV] = useState({
    name: patient?.name || '',
    age: patient?.age ?? '',
    gender: patient?.gender || '',
    email: patient?.email || '',
    phone: patient?.phone || '',
    bloodGroup: patient?.bloodGroup || '',
    conditions: patient?.conditions || '',
  });
  const set = (k) => (e) => setV((x) => ({ ...x, [k]: e.target.value }));
  const { errors, serverError, busy, submit } = useFormSubmit({
    validate: () => validatePatient(v),
    save: async () => {
      const body = { ...v, name: v.name.trim(), age: Number(v.age) };
      const saved = await mutate(() => (patient ? api.patients.update(patient._id, body) : api.patients.create(body)));
      onSaved?.(saved);
    },
    onDone: onClose,
  });
  return (
    <Modal title={patient ? 'Edit patient' : 'Add patient'} onClose={onClose}>
      <form onSubmit={submit} noValidate>
        <ServerError message={serverError} />
        <Field label="Full name" id="pf-name" error={errors.name}>
          <input id="pf-name" value={v.name} onChange={set('name')} autoFocus aria-invalid={!!errors.name} />
        </Field>
        <div className="field-row">
          <Field label="Age" id="pf-age" error={errors.age}>
            <input id="pf-age" type="number" min="0" max="150" value={v.age} onChange={set('age')} aria-invalid={!!errors.age} />
          </Field>
          <Field label="Gender" id="pf-gender" error={errors.gender}>
            <select id="pf-gender" value={v.gender} onChange={set('gender')} aria-invalid={!!errors.gender}>
              <option value="">Select...</option>
              {GENDERS.map((g) => (
                <option key={g}>{g}</option>
              ))}
            </select>
          </Field>
        </div>
        {api.capabilities.extras && (
          <>
            <div className="field-row">
              <Field label="Email" id="pf-email">
                <input id="pf-email" type="email" value={v.email} onChange={set('email')} placeholder="you@example.com" />
              </Field>
              <Field label="Phone" id="pf-phone">
                <input id="pf-phone" value={v.phone} onChange={set('phone')} />
              </Field>
            </div>
            <div className="field-row">
              <Field label="Blood group" id="pf-blood">
                <input id="pf-blood" value={v.bloodGroup} onChange={set('bloodGroup')} placeholder="O+" />
              </Field>
              <Field label="Known conditions" id="pf-cond">
                <input id="pf-cond" value={v.conditions} onChange={set('conditions')} />
              </Field>
            </div>
          </>
        )}
        <Actions busy={busy} onClose={onClose} label={patient ? 'Save changes' : 'Add patient'} />
      </form>
    </Modal>
  );
}

export function DoctorFormModal({ doctor, onClose }) {
  const { mutate } = useData();
  const [v, setV] = useState({ name: doctor?.name || '', specialty: doctor?.specialty || '' });
  const set = (k) => (e) => setV((x) => ({ ...x, [k]: e.target.value }));
  const { errors, serverError, busy, submit } = useFormSubmit({
    validate: () => validateDoctor(v, SPECIALTIES),
    save: () =>
      mutate(() =>
        doctor ? api.doctors.update(doctor._id, { ...v, name: v.name.trim() }) : api.doctors.create({ ...v, name: v.name.trim() })
      ),
    onDone: onClose,
  });
  return (
    <Modal title={doctor ? 'Edit doctor' : 'Add doctor'} onClose={onClose}>
      <form onSubmit={submit} noValidate>
        <ServerError message={serverError} />
        <Field label="Full name" id="df-name" error={errors.name}>
          <input id="df-name" value={v.name} onChange={set('name')} autoFocus aria-invalid={!!errors.name} />
        </Field>
        <Field label="Specialty" id="df-spec" error={errors.specialty}>
          <select id="df-spec" value={v.specialty} onChange={set('specialty')} aria-invalid={!!errors.specialty}>
            <option value="">Select...</option>
            {SPECIALTIES.map((s) => (
              <option key={s}>{s}</option>
            ))}
          </select>
        </Field>
        <Actions busy={busy} onClose={onClose} label={doctor ? 'Save changes' : 'Add doctor'} />
      </form>
    </Modal>
  );
}

const DURATIONS = [15, 30, 45, 60, 90];

export function AppointmentFormModal({ appointment, preset, onClose }) {
  const { patients, doctors, appointments, mutate } = useData();
  const initialDate = appointment ? toLocalInput(appointment.date) : preset?.date || '';
  const [v, setV] = useState({
    patient: appointment?.patient?._id || preset?.patient || '',
    doctor: appointment?.doctor?._id || preset?.doctor || '',
    date: initialDate,
    duration: appointment?.duration || 30,
    notes: appointment?.notes || '',
  });
  const set = (k) => (e) => setV((x) => ({ ...x, [k]: e.target.value }));

  const conflicts = useMemo(
    () => (v.doctor && v.date ? findConflicts(appointments, { id: appointment?._id, doctor: v.doctor, date: v.date, duration: v.duration }) : []),
    [appointments, appointment, v.doctor, v.date, v.duration]
  );

  const { errors, serverError, busy, submit } = useFormSubmit({
    validate: () => {
      const e = validateAppointment(v, new Date(), { requireFuture: !appointment || v.date !== initialDate });
      if (!e.date && conflicts.length) e.date = 'This doctor is already booked at that time.';
      return e;
    },
    save: () => {
      const body = { ...v, date: new Date(v.date).toISOString(), duration: Number(v.duration) };
      if (!api.capabilities.notes) delete body.notes;
      return mutate(() => (appointment ? api.appointments.update(appointment._id, body) : api.appointments.create(body)));
    },
    onDone: onClose,
  });

  return (
    <Modal title={appointment ? 'Edit appointment' : 'New appointment'} onClose={onClose}>
      <form onSubmit={submit} noValidate>
        <ServerError message={serverError} />
        <Field label="Patient" id="af-patient" error={errors.patient}>
          <select id="af-patient" value={v.patient} onChange={set('patient')} aria-invalid={!!errors.patient}>
            <option value="">Select a patient...</option>
            {[...patients]
              .sort((a, b) => a.name.localeCompare(b.name))
              .map((p) => (
                <option key={p._id} value={p._id}>
                  {p.name}
                </option>
              ))}
          </select>
        </Field>
        <Field label="Doctor" id="af-doctor" error={errors.doctor}>
          <select id="af-doctor" value={v.doctor} onChange={set('doctor')} aria-invalid={!!errors.doctor}>
            <option value="">Select a doctor...</option>
            {doctors.map((d) => (
              <option key={d._id} value={d._id}>
                {d.name} ({d.specialty})
              </option>
            ))}
          </select>
        </Field>
        <div className="field-row">
          <Field label="Date and time" id="af-date" error={errors.date}>
            <input id="af-date" type="datetime-local" step="900" value={v.date} onChange={set('date')} aria-invalid={!!errors.date} />
          </Field>
          <Field label="Duration" id="af-dur" error={errors.duration}>
            <select id="af-dur" value={v.duration} onChange={set('duration')}>
              {DURATIONS.map((m) => (
                <option key={m} value={m}>
                  {m} min
                </option>
              ))}
            </select>
          </Field>
        </div>
        {conflicts.length > 0 && (
          <p className="warn-box" role="alert">
            <Icon name="warn" /> Conflict: {conflicts[0].patient?.name} is already booked with this doctor at{' '}
            {fmtDateTime(conflicts[0].date)}.
          </p>
        )}
        {api.capabilities.notes && (
          <Field label="Notes" id="af-notes" hint="Optional visit notes">
            <textarea id="af-notes" rows="3" maxLength="500" value={v.notes} onChange={set('notes')} />
          </Field>
        )}
        <Actions busy={busy} onClose={onClose} label={appointment ? 'Save changes' : 'Book appointment'} />
      </form>
    </Modal>
  );
}
