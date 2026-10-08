import { can } from '../policy.js';
import { schema, str, num, oneOf, arr, id, date, shape } from '../validate.js';
import { PRIORITIES, bmi, bmiCategory, suggestPriority, vitalFlags, withBmi } from '../domain.js';
import {
  bad, conflict, doctorFilter, getOr404, join, notFound, numberOf, paged, paging, rx, idOf, PATIENT_BRIEF, PATIENT_FULL, DOCTOR_BRIEF,
} from './util.js';

export const VISIT_STATUSES = ['triage', 'in_consult', 'completed', 'cancelled'];

const opt = (r) => ({ ...r, opts: { ...r.opts, optional: true } });
export const vitalsShape = {
  systolic: opt(num({ min: 50, max: 300 })),
  diastolic: opt(num({ min: 30, max: 200 })),
  pulse: opt(num({ min: 20, max: 250 })),
  tempC: opt(num({ min: 30, max: 45 })),
  spo2: opt(num({ min: 50, max: 100 })),
  respRate: opt(num({ min: 4, max: 80 })),
  weightKg: opt(num({ min: 0.3, max: 500 })),
  heightCm: opt(num({ min: 20, max: 260 })),
};
const vitalsRule = shape(vitalsShape, { optional: true });

const diagnosisRule = shape({ code: str({ max: 12, empty: true, optional: true }), name: str({ max: 120 }) });

const createBody = schema({
  patient: id(),
  doctor: id({ optional: true, nullable: true }),
  appointment: id({ optional: true, nullable: true }),
  token: id({ optional: true, nullable: true }),
  chiefComplaint: str({ max: 300, empty: true, optional: true }),
  vitals: vitalsRule,
  priority: oneOf(PRIORITIES, { optional: true }),
  triageNotes: str({ max: 500, empty: true, optional: true }),
});
const triageBody = schema({
  chiefComplaint: str({ max: 300, empty: true, optional: true }),
  vitals: vitalsRule,
  priority: oneOf(PRIORITIES, { optional: true }),
  triageNotes: str({ max: 500, empty: true, optional: true }),
  doctor: id({ optional: true, nullable: true }),
});
const consultBody = schema({
  chiefComplaint: str({ max: 300, empty: true, optional: true }),
  notes: str({ max: 4000, empty: true, optional: true }),
  plan: str({ max: 1000, empty: true, optional: true }),
  diagnoses: arr(diagnosisRule, { max: 10, optional: true }),
  followUpDate: date({ optional: true, nullable: true }),
});

function cleanVitals(input) {
  const v = {};
  for (const [k, val] of Object.entries(input || {})) if (val !== undefined && val !== null && val !== '') v[k] = val;
  if (v.systolic != null && v.diastolic != null && v.systolic <= v.diastolic) throw bad('Systolic pressure must be higher than diastolic');
  if ((v.systolic != null) !== (v.diastolic != null)) throw bad('Enter both systolic and diastolic pressure');
  return withBmi(v);
}

export function presentVisit(v) {
  const vitals = v.vitals || {};
  return { ...v, flags: vitalFlags(vitals), bmiCategory: bmiCategory(vitals.bmi ?? bmi(vitals.weightKg, vitals.heightCm)) };
}

const JOIN = { patient: ['patients', PATIENT_BRIEF], doctor: ['doctors', DOCTOR_BRIEF] };

// Shared by POST /visits and the queue "start consult" action.
export async function createVisit(ctx, input) {
  const { store, now, user } = ctx;
  const patient = await store.get('patients', input.patient);
  if (!patient) throw notFound('Patient not found');
  let doctor = input.doctor || '';
  let token = null;
  if (input.token) {
    token = await store.get('queue', input.token);
    if (!token) throw notFound('Queue token not found');
    if (token.visit) throw conflict('This token already has a visit');
    if (idOf(token.patient) !== String(patient._id)) throw bad('Token belongs to a different patient');
    doctor = doctor || token.doctor || '';
  }
  doctor = doctor || (user.role === 'doctor' ? user.doctor || '' : '');
  if (doctor && !(await store.get('doctors', doctor))) throw notFound('Doctor not found');
  const vitals = cleanVitals(input.vitals);
  const status = input.status || 'triage';
  const rec = await store.insert('visits', {
    visitNo: numberOf('V', await store.nextSeq('visit')),
    patient: String(patient._id), doctor: doctor || null, appointment: input.appointment || token?.appointment || null, token: token ? String(token._id) : null,
    status, chiefComplaint: input.chiefComplaint || token?.reason || '', vitals,
    triagePriority: input.priority || (Object.keys(vitals).length ? suggestPriority(vitals) : token?.priority || 'routine'),
    triageNotes: input.triageNotes || '', triageBy: Object.keys(vitals).length ? user.name : '', triageAt: Object.keys(vitals).length ? now.toISOString() : null,
    notes: '', plan: '', diagnoses: [], followUpDate: null,
    startedAt: now.toISOString(), consultStartedAt: status === 'in_consult' ? now.toISOString() : null, completedAt: null, createdBy: user.name,
  });
  if (token) await store.update('queue', token._id, { visit: rec._id, priority: rec.triagePriority, doctor: rec.doctor || token.doctor || null });
  return rec;
}

export function register(add) {
  add('GET', '/visits', { perm: 'visits.read' }, async ({ store, query, user }) => {
    const p = paging(query);
    const filter = {};
    const doc = doctorFilter(query.doctor, user);
    if (doc) filter.doctor = doc;
    if (query.patient) filter.patient = query.patient;
    if (VISIT_STATUSES.includes(query.status)) filter.status = query.status;
    else if (query.status === 'open') filter.status = { $in: ['triage', 'in_consult'] };
    const range = {};
    if (query.from) range.$gte = new Date(query.from).toISOString();
    if (query.to) range.$lt = new Date(query.to).toISOString();
    if (Object.keys(range).length) filter.startedAt = range;
    if (p.search) {
      const pids = (await store.find('patients', { $or: [{ name: rx(p.search) }, { mrn: rx(p.search) }] })).map((x) => x._id);
      filter.$or = [{ patient: { $in: pids } }, { chiefComplaint: rx(p.search) }, { 'diagnoses.name': rx(p.search) }, { visitNo: rx(p.search) }];
    }
    return paged(store, 'visits', filter, p, {
      sort: { startedAt: -1, _id: -1 },
      map: async (rows) => (await join(store, rows, JOIN)).map(presentVisit),
    });
  });

  add('POST', '/visits', { perm: 'visits.create', body: createBody, name: 'visits.create', entity: 'Visit', status: 201 }, async (ctx) => {
    const rec = await createVisit(ctx, ctx.body);
    ctx.note = `Opened ${rec.visitNo}`;
    return presentVisit(await join(ctx.store, rec, JOIN));
  });

  add('GET', '/visits/:id', { perm: 'visits.read' }, async ({ store, params, user }) => {
    const v = await getOr404(store, 'visits', params.id, 'Visit');
    await join(store, v, { patient: ['patients', PATIENT_FULL], doctor: ['doctors', DOCTOR_BRIEF + ' fee'] });
    const out = presentVisit(v);
    if (can(user.role, 'prescriptions.read')) out.prescriptions = await store.find('prescriptions', { visit: v._id }, { sort: { issuedAt: 1 } });
    if (can(user.role, 'labs.read')) out.labs = await store.find('labOrders', { visit: v._id }, { sort: { orderedAt: 1 } });
    if (can(user.role, 'billing.read')) out.invoices = (await store.find('invoices', { visit: v._id })).filter((i) => i.status !== 'void');
    return out;
  });

  async function openVisit(store, idv) {
    const v = await getOr404(store, 'visits', idv, 'Visit');
    if (v.status === 'completed' || v.status === 'cancelled') throw conflict(`This visit is already ${v.status}`);
    return v;
  }

  add('PATCH', '/visits/:id/triage', { perm: 'visits.vitals', body: triageBody, name: 'visits.triage', entity: 'Visit' }, async (ctx) => {
    const { store, params, body, now, user } = ctx;
    const v = await openVisit(store, params.id);
    const patch = {};
    if (body.chiefComplaint !== undefined) patch.chiefComplaint = body.chiefComplaint;
    if (body.triageNotes !== undefined) patch.triageNotes = body.triageNotes;
    if (body.vitals) {
      patch.vitals = cleanVitals({ ...v.vitals, ...body.vitals });
      patch.triageBy = user.name;
      patch.triageAt = now.toISOString();
      patch.triagePriority = body.priority || suggestPriority(patch.vitals);
    } else if (body.priority) patch.triagePriority = body.priority;
    if (body.doctor) {
      if (!(await store.get('doctors', body.doctor))) throw notFound('Doctor not found');
      patch.doctor = body.doctor;
    }
    const rec = await store.update('visits', v._id, patch);
    if (rec.token) {
      const tp = { priority: rec.triagePriority };
      if (rec.doctor) tp.doctor = rec.doctor;
      await store.update('queue', rec.token, tp);
    }
    ctx.note = `Vitals for ${rec.visitNo}`;
    return presentVisit(await join(store, rec, JOIN));
  });

  add('PATCH', '/visits/:id/consult', { perm: 'visits.consult', body: consultBody, name: 'visits.consult', entity: 'Visit' }, async (ctx) => {
    const { store, params, body, now, user } = ctx;
    const v = await openVisit(store, params.id);
    const patch = { ...body };
    if (v.status === 'triage') {
      patch.status = 'in_consult';
      patch.consultStartedAt = now.toISOString();
    }
    if (!v.doctor && user.doctor) patch.doctor = user.doctor;
    const rec = await store.update('visits', v._id, patch);
    ctx.note = `Consultation notes ${rec.visitNo}`;
    return presentVisit(await join(store, rec, JOIN));
  });

  add('POST', '/visits/:id/complete', { perm: 'visits.consult', name: 'visits.complete', entity: 'Visit' }, async (ctx) => {
    const { store, params, now } = ctx;
    const v = await openVisit(store, params.id);
    if (!(v.diagnoses || []).length) throw bad('Add at least one diagnosis before completing the visit');
    const rec = await store.update('visits', v._id, { status: 'completed', completedAt: now.toISOString(), consultStartedAt: v.consultStartedAt || v.startedAt });
    if (rec.token) await store.update('queue', rec.token, { status: 'done', completedAt: now.toISOString() });
    if (rec.appointment) await store.update('appointments', rec.appointment, { status: 'completed' });
    ctx.note = `Completed ${rec.visitNo}`;
    return presentVisit(await join(store, rec, JOIN));
  });

  add('POST', '/visits/:id/cancel', { perm: 'visits.create', name: 'visits.cancel', entity: 'Visit' }, async (ctx) => {
    const { store, params } = ctx;
    const v = await openVisit(store, params.id);
    const rec = await store.update('visits', v._id, { status: 'cancelled' });
    if (rec.token) await store.update('queue', rec.token, { status: 'cancelled', visit: null });
    ctx.note = `Cancelled ${rec.visitNo}`;
    return presentVisit(await join(store, rec, JOIN));
  });

}
