import { can } from '../policy.js';
import { schema, str, num, oneOf, arr, id, date } from '../validate.js';
import { availabilityIssue, scheduleOf, suggestSlots, findOverlap } from '../domain.js';
import {
  bad, conflict, doctorFilter, getOr404, join, needId, notFound, numberOf, paged, paging, rx, PATIENT_BRIEF, DOCTOR_BRIEF, idOf,
} from './util.js';
import { isId } from '../validate.js';

export const GENDERS = ['Male', 'Female', 'Other'];
export const BLOOD_GROUPS = ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'];
export const APPOINTMENT_STATUSES = ['scheduled', 'checked_in', 'completed', 'cancelled', 'no_show'];
const HM = /^([01]\d|2[0-3]):[0-5]\d$/;

const patientFields = {
  name: str({ max: 120 }),
  age: num({ min: 0, max: 150, message: 'Age must be a number between 0 and 150' }),
  gender: oneOf(GENDERS),
  phone: str({ max: 30, empty: true, optional: true }),
  email: str({ pattern: /^\S+@\S+\.\S+$/, message: 'Email is not valid', max: 120, empty: true, optional: true }),
  bloodGroup: oneOf([...BLOOD_GROUPS, ''], { optional: true }),
  allergies: arr(str({ max: 60 }), { max: 20, optional: true }),
  conditions: str({ max: 300, empty: true, optional: true }),
  address: str({ max: 200, empty: true, optional: true }),
  emergencyContact: str({ max: 120, empty: true, optional: true }),
  doctor: id({ optional: true, nullable: true }),
};
const patientBody = schema(patientFields);

const scheduleFields = {
  workingDays: arr(num({ int: true, min: 0, max: 6 }), { max: 7 }),
  startTime: str({ pattern: HM, message: 'Start time must be HH:MM' }),
  endTime: str({ pattern: HM, message: 'End time must be HH:MM' }),
  slotMinutes: num({ int: true, min: 5, max: 120 }),
  breakStart: str({ pattern: HM, empty: true, message: 'Break start must be HH:MM' }),
  breakEnd: str({ pattern: HM, empty: true, message: 'Break end must be HH:MM' }),
  daysOff: arr(str({ pattern: /^\d{4}-\d{2}-\d{2}$/, message: 'Days off must be YYYY-MM-DD' }), { max: 120 }),
};
const doctorBody = schema({
  name: str({ max: 120 }),
  specialty: str({ max: 80 }),
  fee: num({ min: 0, max: 100000, optional: true }),
  room: str({ max: 30, empty: true, optional: true }),
  ...Object.fromEntries(Object.entries(scheduleFields).map(([k, v]) => [k, { ...v, opts: { ...v.opts, optional: true } }])),
});

const appointmentBody = schema({
  patient: { ...id(), check: (v, l) => (isId(v) ? [null, v] : [`A valid ${l.toLowerCase()} is required`]) },
  doctor: { ...id(), check: (v, l) => (isId(v) ? [null, v] : [`A valid ${l.toLowerCase()} is required`]) },
  date: date({ label: 'A valid appointment date' }),
  duration: num({ optional: true }),
  reason: str({ max: 200, empty: true, optional: true }),
  notes: str({ max: 500, empty: true, optional: true }),
  status: oneOf(APPOINTMENT_STATUSES, { optional: true }),
});

export function register(add) {
  // ---------------------------------------------------------------- patients
  add('GET', '/patients/lookup', { perm: 'patients.read' }, async ({ store }) => {
    const rows = await store.find('patients', {}, { sort: { name: 1 }, limit: 5000 });
    return rows.map((p) => ({ _id: p._id, name: p.name }));
  });

  add('GET', '/patients', { perm: 'patients.read' }, async ({ store, query }) => {
    const p = paging(query);
    const filter = {};
    if (p.search) filter.$or = [{ name: rx(p.search) }, { mrn: rx(p.search) }, { phone: rx(p.search) }];
    if (GENDERS.includes(query.gender)) filter.gender = query.gender;
    return paged(store, 'patients', filter, p, { sort: { name: 1, _id: 1 } });
  });

  add('POST', '/patients/add', { perm: 'patients.create', body: patientBody, name: 'patients.create', entity: 'Patient' }, async (ctx) => {
    const { store, body } = ctx;
    if (body.doctor && !(await store.get('doctors', body.doctor))) throw notFound('Doctor not found');
    const mrn = numberOf('MRN', await store.nextSeq('patient'));
    const rec = await store.insert('patients', { allergies: [], ...body, mrn });
    ctx.note = `Registered ${rec.name} (${mrn})`;
    return rec;
  });

  add(['PUT', 'PATCH'], '/patients/:id', { perm: 'patients.update', body: patientBody, partial: true, name: 'patients.update', entity: 'Patient' }, async (ctx) => {
    await getOr404(ctx.store, 'patients', ctx.params.id, 'Patient');
    const rec = await ctx.store.update('patients', ctx.params.id, ctx.body);
    ctx.note = `Updated ${rec.name}`;
    return rec;
  });

  add('DELETE', '/patients/delete/:id', { perm: 'patients.remove', name: 'patients.remove', entity: 'Patient' }, async (ctx) => {
    const { store, params } = ctx;
    const p = await getOr404(store, 'patients', params.id, 'Patient');
    for (const col of ['visits', 'invoices', 'admissions', 'labOrders', 'prescriptions']) {
      if (await store.count(col, { patient: p._id })) throw conflict('This patient has clinical or billing records and cannot be deleted');
    }
    await store.removeMany('appointments', { patient: p._id });
    await store.removeMany('queue', { patient: p._id });
    await store.remove('patients', p._id);
    ctx.note = `Deleted ${p.name}`;
    return 'Patient deleted!';
  });

  add('GET', '/patients/:id', { perm: 'patients.read' }, async ({ store, params }) => {
    const p = await getOr404(store, 'patients', params.id, 'Patient');
    return join(store, p, { doctor: ['doctors', DOCTOR_BRIEF] });
  });

  // legacy name: appointment history of a patient
  add('GET', '/patients/:id/history', { perm: 'appointments.read' }, async ({ store, params }) => {
    await getOr404(store, 'patients', params.id, 'Patient');
    const rows = await store.find('appointments', { patient: params.id }, { sort: { date: -1 } });
    return join(store, rows, { doctor: ['doctors', DOCTOR_BRIEF] });
  });

  // everything the signed-in role may see about one patient
  add('GET', '/patients/:id/summary', { perm: 'patients.read' }, async ({ store, params, user }) => {
    const patient = await getOr404(store, 'patients', params.id, 'Patient');
    await join(store, patient, { doctor: ['doctors', DOCTOR_BRIEF] });
    const out = { patient };
    const by = { patient: params.id };
    if (can(user.role, 'appointments.read')) {
      out.appointments = await join(store, await store.find('appointments', by, { sort: { date: -1 } }), { doctor: ['doctors', DOCTOR_BRIEF] });
    }
    if (can(user.role, 'visits.read')) {
      out.visits = await join(store, await store.find('visits', by, { sort: { startedAt: -1 } }), { doctor: ['doctors', DOCTOR_BRIEF] });
    }
    if (can(user.role, 'prescriptions.read')) {
      out.prescriptions = await join(store, await store.find('prescriptions', by, { sort: { issuedAt: -1 } }), { doctor: ['doctors', DOCTOR_BRIEF] });
    }
    if (can(user.role, 'labs.read')) out.labs = await store.find('labOrders', by, { sort: { orderedAt: -1 } });
    if (can(user.role, 'billing.read')) out.invoices = await store.find('invoices', by, { sort: { issuedAt: -1 } });
    if (can(user.role, 'wards.read')) {
      out.admissions = await join(store, await store.find('admissions', by, { sort: { admittedAt: -1 } }), { ward: ['wards', 'name type'], doctor: ['doctors', DOCTOR_BRIEF] });
    }
    return out;
  });

  // ----------------------------------------------------------------- doctors
  add('GET', '/doctors/lookup', { perm: 'doctors.read' }, async ({ store }) => {
    const rows = await store.find('doctors', {}, { sort: { name: 1 }, limit: 5000 });
    return rows.map((d) => ({ _id: d._id, name: d.name, specialty: d.specialty }));
  });

  add('GET', '/doctors', { perm: 'doctors.read' }, async ({ store, query }) => {
    const p = paging(query);
    const filter = p.search ? { $or: [{ name: rx(p.search) }, { specialty: rx(p.search) }] } : {};
    return paged(store, 'doctors', filter, p, { sort: { name: 1, _id: 1 } });
  });

  add('POST', '/doctors/add', { perm: 'doctors.manage', body: doctorBody, name: 'doctors.create', entity: 'Doctor' }, async (ctx) => {
    const rec = await ctx.store.insert('doctors', { history: [], fee: 30, ...ctx.body });
    ctx.note = `Added ${rec.name}`;
    return rec;
  });

  add(['PUT', 'PATCH'], '/doctors/:id', { perm: 'doctors.manage', body: doctorBody, partial: true, name: 'doctors.update', entity: 'Doctor' }, async (ctx) => {
    await getOr404(ctx.store, 'doctors', ctx.params.id, 'Doctor');
    const rec = await ctx.store.update('doctors', ctx.params.id, ctx.body);
    ctx.note = `Updated ${rec.name}`;
    return rec;
  });

  add('DELETE', '/doctors/delete/:id', { perm: 'doctors.manage', name: 'doctors.remove', entity: 'Doctor' }, async (ctx) => {
    const { store, params } = ctx;
    const d = await getOr404(store, 'doctors', params.id, 'Doctor');
    if ((await store.count('visits', { doctor: d._id })) || (await store.count('admissions', { doctor: d._id, status: 'admitted' }))) {
      throw conflict('This doctor has visit or admission records and cannot be deleted');
    }
    await store.updateMany('patients', { doctor: d._id }, { doctor: null });
    await store.updateMany('users', { doctor: d._id }, { doctor: null });
    await store.removeMany('appointments', { doctor: d._id });
    await store.remove('doctors', d._id);
    ctx.note = `Deleted ${d.name}`;
    return 'Doctor deleted!';
  });

  add('GET', '/doctors/:id', { perm: 'doctors.read' }, async ({ store, params }) => getOr404(store, 'doctors', params.id, 'Doctor'));

  // legacy name: the doctor's patient history (appointments with their patients)
  add('GET', '/doctors/:id/patient-history', { perm: 'appointments.read' }, async ({ store, params }) => {
    await getOr404(store, 'doctors', params.id, 'Doctor');
    const rows = await store.find('appointments', { doctor: params.id }, { sort: { date: -1 } });
    return join(store, rows, { patient: ['patients', PATIENT_BRIEF] });
  });

  add('PUT', '/doctors/:id/schedule', { perm: 'doctors.schedule', body: schema(scheduleFields), partial: true, name: 'doctors.schedule', entity: 'Doctor' }, async (ctx) => {
    const d = await getOr404(ctx.store, 'doctors', ctx.params.id, 'Doctor');
    const next = { ...scheduleOf(d), ...ctx.body };
    if (next.endTime <= next.startTime) throw bad('End time must be after start time');
    if ((next.breakStart || next.breakEnd) && !(next.breakStart && next.breakEnd && next.breakStart < next.breakEnd)) throw bad('Break needs a start before its end');
    const rec = await ctx.store.update('doctors', d._id, ctx.body);
    ctx.note = `Schedule of ${rec.name}`;
    return rec;
  });

  // free slots: ?from=ISO&days=7&duration=30
  add('GET', '/doctors/:id/slots', { perm: 'appointments.read' }, async ({ store, params, query, now, tz }) => {
    const d = await getOr404(store, 'doctors', params.id, 'Doctor');
    const days = Math.min(30, Math.max(1, parseInt(query.days, 10) || 7));
    const duration = Math.min(240, Math.max(5, parseInt(query.duration, 10) || scheduleOf(d).slotMinutes));
    const from = query.from && !Number.isNaN(new Date(query.from).getTime()) && new Date(query.from) > now ? new Date(query.from) : now;
    const appts = await store.find('appointments', { doctor: d._id, date: { $gte: new Date(from.getTime() - 86400000).toISOString() } });
    return { doctor: d._id, duration, slots: suggestSlots(d, appts, { from, days, duration, tz, limit: Math.min(60, parseInt(query.limit, 10) || 12) }) };
  });

  // ------------------------------------------------------------ appointments
  const APPT_JOIN = { patient: ['patients', 'name age gender mrn'], doctor: ['doctors', DOCTOR_BRIEF] };

  async function validateAppointment(ctx, { patient, doctor, date: when, duration }, excludeId, { requireFuture }) {
    const { store, now, tz } = ctx;
    const start = new Date(when);
    if (requireFuture && start <= now) throw bad('Appointment date must be in the future');
    const mins = duration === undefined || duration === null || duration === '' ? 30 : Number(duration);
    if (!Number.isFinite(mins) || mins < 5 || mins > 480) throw bad('Duration must be between 5 and 480 minutes');
    if (!(await store.get('patients', patient))) throw notFound('Patient not found');
    const doc = await store.get('doctors', doctor);
    if (!doc) throw notFound('Doctor not found');
    const near = await store.find('appointments', {
      doctor,
      date: { $lt: new Date(start.getTime() + mins * 60000).toISOString(), $gt: new Date(start.getTime() - 480 * 60000).toISOString() },
    });
    if (findOverlap(near, start.getTime(), mins, excludeId)) throw conflict('Doctor already has an appointment that overlaps this time');
    const warn = availabilityIssue(doc, start.getTime(), mins, tz);
    return { start, mins, doc, warnings: warn ? [warn] : [] };
  }

  async function addHistory(store, doc, patient) {
    if (!(doc.history || []).some((p) => String(p) === String(patient))) {
      await store.update('doctors', doc._id, { history: [...(doc.history || []), patient] });
    }
  }

  add('GET', '/appointments', { perm: 'appointments.read' }, async ({ store, query, user }) => {
    const p = paging(query, { defaultLimit: 10 });
    const filter = {};
    if (p.search) {
      const [pids, dids] = await Promise.all([
        store.find('patients', { name: rx(p.search) }).then((r) => r.map((x) => x._id)),
        store.find('doctors', { $or: [{ name: rx(p.search) }, { specialty: rx(p.search) }] }).then((r) => r.map((x) => x._id)),
      ]);
      filter.$or = [{ patient: { $in: pids } }, { doctor: { $in: dids } }];
    }
    const doc = doctorFilter(query.doctor, user);
    if (doc) filter.doctor = doc;
    if (query.patient) filter.patient = query.patient;
    if (APPOINTMENT_STATUSES.includes(query.status)) filter.status = query.status;
    const range = {};
    if (query.from) range.$gte = new Date(query.from).toISOString();
    if (query.to) range.$lt = new Date(query.to).toISOString();
    if (Object.keys(range).length) filter.date = range;
    return paged(store, 'appointments', filter, p, { sort: query.order === 'desc' ? { date: -1, _id: -1 } : { date: 1, _id: 1 }, map: (rows) => join(store, rows, APPT_JOIN) });
  });

  add('POST', '/appointments/add', { perm: 'appointments.write', body: appointmentBody, name: 'appointments.create', entity: 'Appointment' }, async (ctx) => {
    const { store, body } = ctx;
    const { start, mins, doc, warnings } = await validateAppointment(ctx, body, null, { requireFuture: true });
    const rec = await store.insert('appointments', {
      patient: body.patient, doctor: body.doctor, date: start.toISOString(), duration: mins,
      status: 'scheduled', reason: body.reason || '', notes: body.notes || '',
    });
    await addHistory(store, doc, body.patient);
    ctx.note = `Booked ${start.toISOString()}`;
    return { ...(await join(store, rec, APPT_JOIN)), warnings };
  });

  const updateAppointment = async (ctx) => {
    const { store, params, body } = ctx;
    const cur = await getOr404(store, 'appointments', params.id, 'Appointment');
    const merged = {
      patient: body.patient ?? idOf(cur.patient),
      doctor: body.doctor ?? idOf(cur.doctor),
      date: body.date ?? cur.date,
      duration: body.duration ?? cur.duration,
    };
    const moved = body.date !== undefined && new Date(body.date).getTime() !== new Date(cur.date).getTime();
    const { start, mins, doc, warnings } = await validateAppointment(ctx, merged, cur._id, { requireFuture: moved });
    const rec = await store.update('appointments', cur._id, {
      patient: merged.patient, doctor: merged.doctor, date: start.toISOString(), duration: mins,
      status: body.status ?? cur.status ?? 'scheduled', reason: body.reason ?? cur.reason ?? '', notes: body.notes ?? cur.notes ?? '',
    });
    await addHistory(store, doc, merged.patient);
    ctx.note = `Updated ${start.toISOString()}`;
    return { ...(await join(store, rec, APPT_JOIN)), warnings };
  };
  add(['PUT', 'PATCH'], '/appointments/:id', { perm: 'appointments.write', body: appointmentBody, partial: true, name: 'appointments.update', entity: 'Appointment' }, updateAppointment);

  add('PATCH', '/appointments/:id/status', { perm: 'appointments.status', body: schema({ status: oneOf(APPOINTMENT_STATUSES) }), name: 'appointments.status', entity: 'Appointment' }, async (ctx) => {
    await getOr404(ctx.store, 'appointments', ctx.params.id, 'Appointment');
    const rec = await ctx.store.update('appointments', ctx.params.id, { status: ctx.body.status });
    ctx.note = `Status ${rec.status}`;
    return join(ctx.store, rec, APPT_JOIN);
  });

  add('DELETE', '/appointments/delete/:id', { perm: 'appointments.write', name: 'appointments.remove', entity: 'Appointment' }, async (ctx) => {
    needId(ctx.params.id);
    const gone = await ctx.store.remove('appointments', ctx.params.id);
    if (!gone) throw notFound('Appointment not found');
    return 'Appointment deleted.';
  });
}
