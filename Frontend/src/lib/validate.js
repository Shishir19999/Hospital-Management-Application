export const GENDERS = ['Male', 'Female', 'Other'];

export function validatePatient(v) {
  const e = {};
  if (!String(v.name || '').trim()) e.name = 'Enter the patient name.';
  const age = Number(v.age);
  if (v.age === '' || v.age == null || !Number.isFinite(age) || age < 0 || age > 150) {
    e.age = 'Age must be a number between 0 and 150.';
  }
  if (!GENDERS.includes(v.gender)) e.gender = 'Select a gender.';
  return e;
}

export function validateDoctor(v, specialties) {
  const e = {};
  if (!String(v.name || '').trim()) e.name = 'Enter the doctor name.';
  if (!specialties.includes(v.specialty)) e.specialty = 'Select a specialty.';
  return e;
}

export function validateAppointment(v, now = new Date(), { requireFuture = true } = {}) {
  const e = {};
  if (!v.patient) e.patient = 'Select a patient.';
  if (!v.doctor) e.doctor = 'Select a doctor.';
  const d = new Date(v.date);
  if (!v.date || Number.isNaN(d.getTime())) e.date = 'Choose a date and time.';
  else if (requireFuture && d <= now) e.date = 'The appointment must be in the future.';
  const dur = Number(v.duration || 30);
  if (!Number.isFinite(dur) || dur < 5 || dur > 480) e.duration = 'Duration must be 5-480 minutes.';
  return e;
}
