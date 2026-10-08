import { useMemo, useState } from 'react';
import { Modal } from './Modal';
import { Field } from './Common';
import { FormActions, ServerError } from './FormParts';
import { PatientPicker } from './Kit';
import Icon from './Icon';
import { api } from '../api';
import { useData } from '../context/DataContext';
import { useToast } from '../context/ToastContext';
import { useFetch } from '../hooks/useFetch';
import { useFormSubmit } from '../hooks/useFormSubmit';
import { SPECIALTIES } from '../lib/constants';
import { findConflicts } from '../lib/appointments';
import { fmtDateTime, fmtTime, toLocalInput } from '../lib/dates';
import { GENDERS, validateAppointment, validateDoctor, validatePatient } from '../lib/validate';
import { availabilityIssue, scheduleOf } from '../../../shared/domain.js';

const BLOOD = ['', 'A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'];
const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export function PatientFormModal({ patient, onClose, onSaved }) {
  const { refresh } = useData();
  const toast = useToast();
  const [v, setV] = useState({
    name: patient?.name || '',
    age: patient?.age ?? '',
    gender: patient?.gender || '',
    phone: patient?.phone || '',
    email: patient?.email || '',
    bloodGroup: patient?.bloodGroup || '',
    allergies: (patient?.allergies || []).join(', '),
    conditions: patient?.conditions || '',
    address: patient?.address || '',
    emergencyContact: patient?.emergencyContact || '',
  });
  const set = (k) => (e) => setV((x) => ({ ...x, [k]: e.target.value }));
  const { errors, serverError, busy, submit } = useFormSubmit({
    validate: () => validatePatient(v),
    save: async () => {
      const body = {
        ...v,
        name: v.name.trim(),
        age: Number(v.age),
        allergies: v.allergies.split(',').map((s) => s.trim()).filter(Boolean),
      };
      const saved = patient ? await api.put(`/patients/${patient._id}`, body) : await api.post('/patients/add', body);
      await refresh();
      return saved;
    },
    onDone: (saved) => {
      toast.success(patient ? 'Patient updated.' : `Patient registered (${saved.mrn}).`);
      onSaved?.(saved);
      onClose();
    },
  });
  return (
    <Modal title={patient ? 'Edit patient' : 'Register patient'} onClose={onClose}>
      <form onSubmit={submit} noValidate>
        <ServerError message={serverError} />
        <Field label="Full name" id="pf-name" error={errors.name}>
          <input id="pf-name" value={v.name} onChange={set('name')} autoFocus aria-invalid={!!errors.name} autoComplete="off" />
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
        <div className="field-row">
          <Field label="Phone" id="pf-phone">
            <input id="pf-phone" type="tel" value={v.phone} onChange={set('phone')} autoComplete="off" />
          </Field>
          <Field label="Email" id="pf-email" error={errors.email}>
            <input id="pf-email" type="email" value={v.email} onChange={set('email')} placeholder="you@example.com" autoComplete="off" />
          </Field>
        </div>
        <div className="field-row">
          <Field label="Blood group" id="pf-blood">
            <select id="pf-blood" value={v.bloodGroup} onChange={set('bloodGroup')}>
              {BLOOD.map((b) => (
                <option key={b} value={b}>
                  {b || 'Unknown'}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Allergies" id="pf-allergy" hint="Separate with commas. Checked when prescribing.">
            <input id="pf-allergy" value={v.allergies} onChange={set('allergies')} placeholder="Penicillin, Latex" />
          </Field>
        </div>
        <Field label="Known conditions" id="pf-cond">
          <input id="pf-cond" value={v.conditions} onChange={set('conditions')} />
        </Field>
        <div className="field-row">
          <Field label="Address" id="pf-addr">
            <input id="pf-addr" value={v.address} onChange={set('address')} autoComplete="off" />
          </Field>
          <Field label="Emergency contact" id="pf-emg">
            <input id="pf-emg" value={v.emergencyContact} onChange={set('emergencyContact')} autoComplete="off" />
          </Field>
        </div>
        <FormActions busy={busy} onClose={onClose} label={patient ? 'Save changes' : 'Register patient'} />
      </form>
    </Modal>
  );
}

export function DoctorFormModal({ doctor, onClose }) {
  const { refresh } = useData();
  const toast = useToast();
  const sch = scheduleOf(doctor);
  const [v, setV] = useState({
    name: doctor?.name || '',
    specialty: doctor?.specialty || '',
    fee: doctor?.fee ?? 30,
    room: doctor?.room || '',
    workingDays: sch.workingDays,
    startTime: sch.startTime,
    endTime: sch.endTime,
    slotMinutes: sch.slotMinutes,
    breakStart: sch.breakStart,
    breakEnd: sch.breakEnd,
  });
  const set = (k) => (e) => setV((x) => ({ ...x, [k]: e.target.value }));
  const toggleDay = (d) => setV((x) => ({ ...x, workingDays: x.workingDays.includes(d) ? x.workingDays.filter((n) => n !== d) : [...x.workingDays, d].sort() }));
  const { errors, serverError, busy, submit } = useFormSubmit({
    validate: () => {
      const e = validateDoctor(v, SPECIALTIES);
      if (v.endTime <= v.startTime) e.endTime = 'End time must be after the start time.';
      if (!v.workingDays.length) e.workingDays = 'Pick at least one working day.';
      return e;
    },
    save: async () => {
      const body = { ...v, name: v.name.trim(), fee: Number(v.fee), slotMinutes: Number(v.slotMinutes) };
      if (doctor) await api.put(`/doctors/${doctor._id}`, body);
      else await api.post('/doctors/add', body);
      await refresh();
    },
    onDone: () => {
      toast.success(doctor ? 'Doctor updated.' : 'Doctor added.');
      onClose();
    },
  });
  return (
    <Modal title={doctor ? 'Edit doctor' : 'Add doctor'} onClose={onClose} wide>
      <form onSubmit={submit} noValidate>
        <ServerError message={serverError} />
        <div className="field-row">
          <Field label="Full name" id="df-name" error={errors.name}>
            <input id="df-name" value={v.name} onChange={set('name')} autoFocus aria-invalid={!!errors.name} />
          </Field>
          <Field label="Specialty" id="df-spec" error={errors.specialty}>
            <select id="df-spec" value={v.specialty} onChange={set('specialty')} aria-invalid={!!errors.specialty}>
              <option value="">Select...</option>
              {[...new Set([...SPECIALTIES, v.specialty].filter(Boolean))].map((s) => (
                <option key={s}>{s}</option>
              ))}
            </select>
          </Field>
        </div>
        <div className="field-row">
          <Field label="Consultation fee (USD)" id="df-fee">
            <input id="df-fee" type="number" min="0" step="1" value={v.fee} onChange={set('fee')} />
          </Field>
          <Field label="Room" id="df-room">
            <input id="df-room" value={v.room} onChange={set('room')} placeholder="R-101" />
          </Field>
        </div>
        <fieldset className="fieldset">
          <legend>Weekly schedule</legend>
          <div className="day-pick" role="group" aria-label="Working days">
            {DAYS.map((d, i) => (
              <label key={d} className={v.workingDays.includes(i) ? 'on' : ''}>
                <input type="checkbox" checked={v.workingDays.includes(i)} onChange={() => toggleDay(i)} /> {d}
              </label>
            ))}
          </div>
          {errors.workingDays && <small className="field-error" role="alert">{errors.workingDays}</small>}
          <div className="field-row">
            <Field label="Starts" id="df-start">
              <input id="df-start" type="time" value={v.startTime} onChange={set('startTime')} />
            </Field>
            <Field label="Ends" id="df-end" error={errors.endTime}>
              <input id="df-end" type="time" value={v.endTime} onChange={set('endTime')} aria-invalid={!!errors.endTime} />
            </Field>
          </div>
          <div className="field-row">
            <Field label="Break from" id="df-bs">
              <input id="df-bs" type="time" value={v.breakStart} onChange={set('breakStart')} />
            </Field>
            <Field label="Break until" id="df-be">
              <input id="df-be" type="time" value={v.breakEnd} onChange={set('breakEnd')} />
            </Field>
          </div>
          <Field label="Appointment length (minutes)" id="df-slot">
            <select id="df-slot" value={v.slotMinutes} onChange={set('slotMinutes')}>
              {[10, 15, 20, 30, 45, 60].map((m) => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))}
            </select>
          </Field>
        </fieldset>
        <FormActions busy={busy} onClose={onClose} label={doctor ? 'Save changes' : 'Add doctor'} />
      </form>
    </Modal>
  );
}

const DURATIONS = [15, 20, 30, 45, 60, 90];

export function AppointmentFormModal({ appointment, preset, onClose, onSaved }) {
  const { patients, doctors } = useData();
  const toast = useToast();
  const initialDate = appointment ? toLocalInput(appointment.date) : preset?.date || '';
  const [v, setV] = useState({
    patient: appointment?.patient?._id || preset?.patient || '',
    doctor: appointment?.doctor?._id || preset?.doctor || '',
    date: initialDate,
    duration: appointment?.duration || 30,
    reason: appointment?.reason || '',
    notes: appointment?.notes || '',
  });
  const set = (k) => (e) => setV((x) => ({ ...x, [k]: e.target.value }));
  const doctor = doctors.find((d) => d._id === v.doctor);

  const dayStart = v.date ? new Date(`${v.date.slice(0, 10)}T00:00`) : null;
  const sameDay = useFetch(
    '/appointments',
    dayStart ? { doctor: v.doctor, from: dayStart.toISOString(), to: new Date(dayStart.getTime() + 86400000).toISOString(), limit: 100 } : {},
    { enabled: !!(v.doctor && dayStart) }
  );
  const slots = useFetch(`/doctors/${v.doctor}/slots`, { duration: v.duration, days: 7, limit: 8 }, { enabled: !!v.doctor });

  const conflicts = useMemo(
    () => (v.doctor && v.date ? findConflicts(sameDay.data?.data || [], { id: appointment?._id, doctor: v.doctor, date: v.date, duration: v.duration }) : []),
    [sameDay.data, appointment, v.doctor, v.date, v.duration]
  );
  const availability = useMemo(() => {
    if (!doctor || !v.date) return '';
    const t = new Date(v.date).getTime();
    return Number.isNaN(t) ? '' : availabilityIssue(doctor, t, Number(v.duration) || 30, new Date().getTimezoneOffset());
  }, [doctor, v.date, v.duration]);

  const { errors, serverError, busy, submit } = useFormSubmit({
    validate: () => {
      const e = validateAppointment(v, new Date(), { requireFuture: !appointment || v.date !== initialDate });
      if (!e.date && conflicts.length) e.date = 'This doctor is already booked at that time.';
      return e;
    },
    save: () => {
      const body = { ...v, date: new Date(v.date).toISOString(), duration: Number(v.duration) };
      return appointment ? api.put(`/appointments/${appointment._id}`, body) : api.post('/appointments/add', body);
    },
    onDone: (saved) => {
      toast.success(appointment ? 'Appointment updated.' : 'Appointment booked.');
      if (saved?.warnings?.length) toast.info(saved.warnings[0]);
      onSaved?.();
      onClose();
    },
  });

  return (
    <Modal title={appointment ? 'Edit appointment' : 'New appointment'} onClose={onClose} wide>
      <form onSubmit={submit} noValidate>
        <ServerError message={serverError} />
        <PatientPicker patients={patients} value={v.patient} onChange={(id) => setV((x) => ({ ...x, patient: id }))} error={errors.patient} id="af-patient" />
        <div className="field-row">
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
        <Field label="Date and time" id="af-date" error={errors.date}>
          <input id="af-date" type="datetime-local" step="300" value={v.date} onChange={set('date')} aria-invalid={!!errors.date} />
        </Field>
        {v.doctor && slots.data?.slots?.length > 0 && (
          <div className="slot-suggest" role="group" aria-label="Suggested free times">
            <span className="muted">Next free times:</span>
            {slots.data.slots.map((s) => (
              <button key={s.start} type="button" className="chip" onClick={() => setV((x) => ({ ...x, date: toLocalInput(s.start) }))}>
                {new Date(s.start).toLocaleDateString(undefined, { weekday: 'short', day: 'numeric' })} {fmtTime(s.start)}
              </button>
            ))}
          </div>
        )}
        {conflicts.length > 0 && (
          <p className="warn-box" role="alert">
            <Icon name="warn" /> Conflict: {conflicts[0].patient?.name} is already booked with this doctor at {fmtDateTime(conflicts[0].date)}.
          </p>
        )}
        {!conflicts.length && availability && (
          <p className="warn-box" role="status">
            <Icon name="warn" /> {availability}. You can still book it.
          </p>
        )}
        <Field label="Reason for visit" id="af-reason">
          <input id="af-reason" maxLength="200" value={v.reason} onChange={set('reason')} />
        </Field>
        <Field label="Notes" id="af-notes" hint="Optional">
          <textarea id="af-notes" rows="2" maxLength="500" value={v.notes} onChange={set('notes')} />
        </Field>
        <FormActions busy={busy} onClose={onClose} label={appointment ? 'Save changes' : 'Book appointment'} />
      </form>
    </Modal>
  );
}
