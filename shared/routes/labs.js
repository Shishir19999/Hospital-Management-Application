import { schema, str, num, oneOf, arr, id } from '../validate.js';
import { labFlag } from '../domain.js';
import { bad, conflict, doctorFilter, getOr404, join, notFound, numberOf, paged, paging, rx, PATIENT_BRIEF, DOCTOR_BRIEF } from './util.js';

export const LAB_STATUSES = ['ordered', 'collected', 'resulted', 'cancelled'];
const opt = (r) => ({ ...r, opts: { ...r.opts, optional: true, nullable: true } });
const testBody = schema({
  code: str({ max: 12 }),
  name: str({ max: 80 }),
  category: str({ max: 40 }),
  unit: str({ max: 20, empty: true, optional: true }),
  low: opt(num()),
  high: opt(num()),
  critLow: opt(num()),
  critHigh: opt(num()),
  price: num({ min: 0, max: 100000 }),
});
const orderBody = schema({
  patient: id(),
  visit: id({ optional: true, nullable: true }),
  tests: arr(id(), { min: 1, max: 20 }),
  priority: oneOf(['routine', 'urgent'], { optional: true }),
  note: str({ max: 200, empty: true, optional: true }),
});

const JOIN = { patient: ['patients', PATIENT_BRIEF], doctor: ['doctors', DOCTOR_BRIEF] };

export function register(add) {
  add('GET', '/labs/tests', { perm: 'labs.catalog.read' }, async ({ store }) => store.find('labTests', {}, { sort: { category: 1, name: 1 } }));

  add('POST', '/labs/tests', { perm: 'labs.catalog.manage', body: testBody, name: 'labs.test.create', entity: 'LabTest', status: 201 }, async (ctx) => {
    const code = ctx.body.code.toUpperCase();
    if (await ctx.store.count('labTests', { code })) throw conflict('A test with this code already exists');
    const rec = await ctx.store.insert('labTests', { unit: '', ...ctx.body, code });
    ctx.note = rec.name;
    return rec;
  });

  add(['PUT', 'PATCH'], '/labs/tests/:id', { perm: 'labs.catalog.manage', body: testBody, partial: true, name: 'labs.test.update', entity: 'LabTest' }, async (ctx) => {
    await getOr404(ctx.store, 'labTests', ctx.params.id, 'Test');
    const patch = { ...ctx.body };
    if (patch.code) patch.code = patch.code.toUpperCase();
    const rec = await ctx.store.update('labTests', ctx.params.id, patch);
    ctx.note = rec.name;
    return rec;
  });

  add('DELETE', '/labs/tests/:id', { perm: 'labs.catalog.manage', name: 'labs.test.remove', entity: 'LabTest' }, async (ctx) => {
    const t = await getOr404(ctx.store, 'labTests', ctx.params.id, 'Test');
    await ctx.store.remove('labTests', t._id);
    ctx.note = t.name;
    return { ok: true };
  });

  add('GET', '/labs/orders', { perm: 'labs.read' }, async ({ store, query, user }) => {
    const p = paging(query);
    const filter = {};
    const doc = doctorFilter(query.doctor, user);
    if (doc) filter.doctor = doc;
    for (const k of ['patient', 'visit']) if (query[k]) filter[k] = query[k];
    if (query.status === 'open') filter.status = { $in: ['ordered', 'collected'] };
    else if (LAB_STATUSES.includes(query.status)) filter.status = query.status;
    if (query.abnormal === '1') filter.abnormal = true;
    if (query.critical === '1') filter.critical = true;
    if (query.unreviewed === '1') {
      filter.status = 'resulted';
      filter.reviewed = false;
    }
    if (p.search) {
      const pids = (await store.find('patients', { $or: [{ name: rx(p.search) }, { mrn: rx(p.search) }] })).map((x) => x._id);
      filter.$or = [{ patient: { $in: pids } }, { testName: rx(p.search) }, { orderNo: rx(p.search) }, { testCode: rx(p.search) }];
    }
    const urgentFirst = query.status === 'open';
    return paged(store, 'labOrders', filter, p, {
      sort: urgentFirst ? { priority: -1, orderedAt: 1, _id: 1 } : { orderedAt: -1, _id: -1 },
      map: (rows) => join(store, rows, JOIN),
    });
  });

  add('GET', '/labs/orders/:id', { perm: 'labs.read' }, async ({ store, params }) => join(store, await getOr404(store, 'labOrders', params.id, 'Lab order'), JOIN));

  add('POST', '/labs/orders', { perm: 'labs.order', body: orderBody, name: 'labs.order', entity: 'LabOrder', status: 201 }, async (ctx) => {
    const { store, body, user, now } = ctx;
    const patient = await store.get('patients', body.patient);
    if (!patient) throw notFound('Patient not found');
    let doctor = user.doctor || null;
    if (body.visit) {
      const v = await store.get('visits', body.visit);
      if (!v) throw notFound('Visit not found');
      if (String(v.patient) !== String(patient._id)) throw bad('Visit belongs to a different patient');
      doctor = doctor || v.doctor;
    }
    const tests = await store.find('labTests', { _id: { $in: [...new Set(body.tests)] } });
    if (tests.length !== new Set(body.tests).size) throw notFound('One of the selected tests does not exist');
    const out = [];
    for (const t of tests) {
      out.push(await store.insert('labOrders', {
        orderNo: numberOf('LAB', await store.nextSeq('lab')), patient: String(patient._id), doctor, visit: body.visit || null,
        test: String(t._id), testCode: t.code, testName: t.name, unit: t.unit, price: t.price,
        range: { low: t.low ?? null, high: t.high ?? null, critLow: t.critLow ?? null, critHigh: t.critHigh ?? null },
        priority: body.priority || 'routine', note: body.note || '', status: 'ordered', orderedAt: now.toISOString(), orderedBy: user.name,
        collectedAt: null, collectedBy: '', resultedAt: null, resultedBy: '', value: null, flag: null, abnormal: false, critical: false, comment: '',
        reviewed: false, reviewedAt: null, reviewedBy: '',
      }));
    }
    ctx.note = `${out.length} test(s) for ${patient.name}`;
    return join(store, out, JOIN);
  });

  async function step(ctx, from, to, patch) {
    const o = await getOr404(ctx.store, 'labOrders', ctx.params.id, 'Lab order');
    if (!from.includes(o.status)) throw conflict(`Order ${o.orderNo} is ${o.status}`);
    const rec = await ctx.store.update('labOrders', o._id, { status: to, ...patch(o) });
    ctx.note = `${rec.orderNo} ${to}`;
    return join(ctx.store, rec, JOIN);
  }

  add('POST', '/labs/orders/:id/collect', { perm: 'labs.collect', name: 'labs.collect', entity: 'LabOrder' }, (ctx) =>
    step(ctx, ['ordered'], 'collected', () => ({ collectedAt: ctx.now.toISOString(), collectedBy: ctx.user.name })));

  add('POST', '/labs/orders/:id/cancel', { perm: 'labs.order', name: 'labs.cancel', entity: 'LabOrder' }, (ctx) =>
    step(ctx, ['ordered'], 'cancelled', () => ({})));

  const resultBody = schema({ value: num(), comment: str({ max: 300, empty: true, optional: true }) });
  add('POST', '/labs/orders/:id/result', { perm: 'labs.result', body: resultBody, name: 'labs.result', entity: 'LabOrder' }, async (ctx) => {
    const o = await getOr404(ctx.store, 'labOrders', ctx.params.id, 'Lab order');
    if (o.status === 'ordered') throw conflict('Collect the sample before entering a result');
    const f = labFlag(ctx.body.value, o.range);
    return step(ctx, ['collected', 'resulted'], 'resulted', () => ({
      value: ctx.body.value, flag: f.flag, abnormal: f.abnormal, critical: f.critical, comment: ctx.body.comment || '',
      resultedAt: ctx.now.toISOString(), resultedBy: ctx.user.name, reviewed: false, reviewedAt: null, reviewedBy: '',
    }));
  });

  add('POST', '/labs/orders/:id/review', { perm: 'labs.review', body: schema({ comment: str({ max: 300, empty: true, optional: true }) }), name: 'labs.review', entity: 'LabOrder' }, async (ctx) => {
    return step(ctx, ['resulted'], 'resulted', () => ({ reviewed: true, reviewedAt: ctx.now.toISOString(), reviewedBy: ctx.user.name, ...(ctx.body.comment ? { comment: ctx.body.comment } : {}) }));
  });
}
