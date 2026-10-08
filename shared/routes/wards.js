import { schema, str, num, oneOf, id } from '../validate.js';
import { BED_STATUSES, bedStats, daysStayed, wardOccupancy } from '../domain.js';
import { WARD_TYPES } from '../catalog.js';
import { bad, conflict, getOr404, join, notFound, numberOf, paged, paging, rx, PATIENT_BRIEF, DOCTOR_BRIEF } from './util.js';

const wardBody = schema({
  name: str({ max: 60 }),
  type: oneOf(WARD_TYPES),
  floor: num({ int: true, min: 0, max: 100 }),
  dailyRate: num({ min: 0, max: 100000 }),
  beds: num({ int: true, min: 0, max: 60, optional: true }),
});
const bedBody = schema({ label: str({ max: 20 }), status: oneOf(BED_STATUSES) });

const ADM_JOIN = { patient: ['patients', PATIENT_BRIEF], doctor: ['doctors', DOCTOR_BRIEF], ward: ['wards', 'name type dailyRate'] };

export function register(add) {
  // wards with their beds and who occupies them
  add('GET', '/wards', { perm: 'wards.read' }, async ({ store }) => {
    const [wards, beds, adms] = await Promise.all([
      store.find('wards', {}, { sort: { name: 1 } }),
      store.find('beds', {}, { sort: { label: 1 } }),
      store.find('admissions', { status: 'admitted' }),
    ]);
    await join(store, adms, { patient: ['patients', PATIENT_BRIEF], doctor: ['doctors', DOCTOR_BRIEF] });
    const byBed = new Map(adms.map((a) => [a.bed, a]));
    const out = wards.map((w) => {
      const mine = beds.filter((b) => b.ward === w._id).map((b) => ({ ...b, admission: byBed.get(b._id) || null }));
      return { ...w, beds: mine, stats: bedStats(mine) };
    });
    return { wards: out, totals: bedStats(beds), occupancy: wardOccupancy(wards, beds) };
  });

  add('POST', '/wards', { perm: 'wards.manage', body: wardBody, name: 'wards.create', entity: 'Ward', status: 201 }, async (ctx) => {
    const { store, body } = ctx;
    if (await store.count('wards', { name: body.name })) throw conflict('A ward with this name already exists');
    const { beds, ...fields } = body;
    const rec = await store.insert('wards', fields);
    for (let i = 1; i <= (beds || 0); i++) await store.insert('beds', { ward: rec._id, label: `${rec.name.replace(/[^A-Za-z0-9]/g, '').slice(0, 3).toUpperCase()}-${String(i).padStart(2, '0')}`, status: 'available', admission: null });
    ctx.note = rec.name;
    return rec;
  });

  add(['PUT', 'PATCH'], '/wards/:id', { perm: 'wards.manage', body: wardBody, partial: true, name: 'wards.update', entity: 'Ward' }, async (ctx) => {
    await getOr404(ctx.store, 'wards', ctx.params.id, 'Ward');
    const { beds, ...fields } = ctx.body;
    void beds;
    const rec = await ctx.store.update('wards', ctx.params.id, fields);
    ctx.note = rec.name;
    return rec;
  });

  add('DELETE', '/wards/:id', { perm: 'wards.manage', name: 'wards.remove', entity: 'Ward' }, async (ctx) => {
    const { store, params } = ctx;
    const w = await getOr404(store, 'wards', params.id, 'Ward');
    if (await store.count('beds', { ward: w._id, status: 'occupied' })) throw conflict('Discharge or transfer the patients in this ward first');
    await store.removeMany('beds', { ward: w._id });
    await store.remove('wards', w._id);
    ctx.note = w.name;
    return { ok: true };
  });

  add('POST', '/wards/:id/beds', { perm: 'wards.manage', body: schema({ label: str({ max: 20 }) }), name: 'beds.create', entity: 'Bed', status: 201 }, async (ctx) => {
    const { store, params, body } = ctx;
    const w = await getOr404(store, 'wards', params.id, 'Ward');
    if (await store.count('beds', { ward: w._id, label: body.label })) throw conflict('That bed label is already used in this ward');
    const rec = await store.insert('beds', { ward: w._id, label: body.label, status: 'available', admission: null });
    ctx.note = `${w.name} ${rec.label}`;
    return rec;
  });

  add(['PUT', 'PATCH'], '/beds/:id', { perm: 'wards.manage', body: bedBody, partial: true, name: 'beds.update', entity: 'Bed' }, async (ctx) => {
    const b = await getOr404(ctx.store, 'beds', ctx.params.id, 'Bed');
    if (ctx.body.status === 'occupied') throw bad('Admit a patient to occupy a bed');
    if (b.status === 'occupied' && ctx.body.status) throw conflict('This bed is occupied');
    const rec = await ctx.store.update('beds', b._id, ctx.body);
    ctx.note = `${rec.label} ${rec.status}`;
    return rec;
  });

  // ward staff mark a bed cleaned, ready or out of service
  add('PATCH', '/beds/:id/status', { perm: 'beds.status', body: schema({ status: oneOf(['available', 'cleaning', 'maintenance']) }), name: 'beds.status', entity: 'Bed' }, async (ctx) => {
    const b = await getOr404(ctx.store, 'beds', ctx.params.id, 'Bed');
    if (b.status === 'occupied') throw conflict('This bed is occupied');
    const rec = await ctx.store.update('beds', b._id, { status: ctx.body.status });
    ctx.note = `${rec.label} ${rec.status}`;
    return rec;
  });

  add('DELETE', '/beds/:id', { perm: 'wards.manage', name: 'beds.remove', entity: 'Bed' }, async (ctx) => {
    const b = await getOr404(ctx.store, 'beds', ctx.params.id, 'Bed');
    if (b.status === 'occupied') throw conflict('This bed is occupied');
    await ctx.store.remove('beds', b._id);
    ctx.note = b.label;
    return { ok: true };
  });

  // ------------------------------------------------------------- admissions
  add('GET', '/admissions', { perm: 'wards.read' }, async ({ store, query }) => {
    const p = paging(query);
    const filter = {};
    if (query.status === 'admitted' || query.status === 'discharged') filter.status = query.status;
    for (const k of ['patient', 'ward', 'doctor']) if (query[k]) filter[k] = query[k];
    if (p.search) {
      const pids = (await store.find('patients', { $or: [{ name: rx(p.search) }, { mrn: rx(p.search) }] })).map((x) => x._id);
      filter.$or = [{ patient: { $in: pids } }, { admissionNo: rx(p.search) }];
    }
    return paged(store, 'admissions', filter, p, {
      sort: { admittedAt: -1, _id: -1 },
      map: async (rows) => {
        await join(store, rows, ADM_JOIN);
        const beds = await store.find('beds', { _id: { $in: [...new Set(rows.map((r) => r.bed))] } });
        return rows.map((r) => ({ ...r, bedLabel: beds.find((b) => b._id === r.bed)?.label || '' }));
      },
    });
  });

  const admitBody = schema({
    patient: id(), bed: id(), doctor: id(),
    reason: str({ max: 200 }),
    diagnosis: str({ max: 200, empty: true, optional: true }),
  });
  add('POST', '/admissions', { perm: 'admissions.admit', body: admitBody, name: 'admissions.admit', entity: 'Admission', status: 201 }, async (ctx) => {
    const { store, body, now } = ctx;
    const patient = await store.get('patients', body.patient);
    if (!patient) throw notFound('Patient not found');
    if (!(await store.get('doctors', body.doctor))) throw notFound('Doctor not found');
    const bed = await getOr404(store, 'beds', body.bed, 'Bed');
    if (bed.status !== 'available') throw conflict(`Bed ${bed.label} is ${bed.status}`);
    if (await store.count('admissions', { patient: body.patient, status: 'admitted' })) throw conflict(`${patient.name} is already admitted`);
    const rec = await store.insert('admissions', {
      admissionNo: numberOf('ADM', await store.nextSeq('admission')), patient: body.patient, doctor: body.doctor, ward: bed.ward, bed: String(bed._id),
      reason: body.reason, diagnosis: body.diagnosis || '', status: 'admitted', admittedAt: now.toISOString(), dischargedAt: null, transfers: [], dischargeSummary: '', admittedBy: ctx.user.name,
    });
    await store.update('beds', bed._id, { status: 'occupied', admission: String(rec._id) });
    ctx.note = `${patient.name} to ${bed.label}`;
    return join(store, rec, ADM_JOIN);
  });

  add('POST', '/admissions/:id/transfer', { perm: 'admissions.transfer', body: schema({ bed: id(), reason: str({ max: 200 }) }), name: 'admissions.transfer', entity: 'Admission' }, async (ctx) => {
    const { store, params, body, now, user } = ctx;
    const a = await getOr404(store, 'admissions', params.id, 'Admission');
    if (a.status !== 'admitted') throw conflict('This patient was already discharged');
    const to = await getOr404(store, 'beds', body.bed, 'Bed');
    if (String(to._id) === a.bed) throw bad('The patient is already in that bed');
    if (to.status !== 'available') throw conflict(`Bed ${to.label} is ${to.status}`);
    const from = await store.get('beds', a.bed);
    const rec = await store.update('admissions', a._id, {
      ward: to.ward, bed: String(to._id),
      transfers: [...a.transfers, { from: a.bed, fromLabel: from?.label || '', to: String(to._id), toLabel: to.label, at: now.toISOString(), by: user.name, reason: body.reason }],
    });
    if (from) await store.update('beds', from._id, { status: 'cleaning', admission: null });
    await store.update('beds', to._id, { status: 'occupied', admission: String(a._id) });
    ctx.note = `${from?.label || '?'} to ${to.label}`;
    return join(store, rec, ADM_JOIN);
  });

  const dischargeBody = schema({ summary: str({ max: 2000 }), type: oneOf(['routine', 'against_advice', 'referred', 'deceased'], { optional: true }) });
  add('POST', '/admissions/:id/discharge', { perm: 'admissions.discharge', body: dischargeBody, name: 'admissions.discharge', entity: 'Admission' }, async (ctx) => {
    const { store, params, body, now } = ctx;
    const a = await getOr404(store, 'admissions', params.id, 'Admission');
    if (a.status !== 'admitted') throw conflict('This patient was already discharged');
    const rec = await store.update('admissions', a._id, { status: 'discharged', dischargedAt: now.toISOString(), dischargeSummary: body.summary, dischargeType: body.type || 'routine' });
    await store.update('beds', a.bed, { status: 'cleaning', admission: null });
    const ward = await store.get('wards', a.ward);
    const days = daysStayed(a.admittedAt, now);
    ctx.note = `${a.admissionNo} after ${days} day(s)`;
    return { ...(await join(store, rec, ADM_JOIN)), charges: { days, dailyRate: ward?.dailyRate || 0, amount: Math.round(days * (ward?.dailyRate || 0) * 100) / 100 } };
  });
}
