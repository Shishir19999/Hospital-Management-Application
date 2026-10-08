import { schema, str, num, oneOf, arr, id, date, shape } from '../validate.js';
import { INVOICE_STATUSES, PAYMENT_METHODS, applyPayment, baseStatus, computeTotals, daysStayed, displayStatus, lineAmount, DAY } from '../domain.js';
import { bad, conflict, getOr404, join, notFound, numberOf, paged, paging, rx, PATIENT_BRIEF, PATIENT_FULL, DOCTOR_BRIEF } from './util.js';

export const LINE_TYPES = ['consultation', 'procedure', 'lab', 'pharmacy', 'bed', 'other'];
const lineRule = shape({
  type: oneOf(LINE_TYPES),
  description: str({ max: 160 }),
  qty: num({ min: 0.01, max: 100000 }),
  unitPrice: num({ min: 0, max: 10000000 }),
});
const discountRule = shape({ type: oneOf(['percent', 'amount']), value: num({ min: 0, max: 100000000 }) }, { optional: true });

const invoiceBody = schema({
  patient: id(),
  visit: id({ optional: true, nullable: true }),
  admission: id({ optional: true, nullable: true }),
  lines: arr(lineRule, { min: 1, max: 60 }),
  discount: { ...discountRule, opts: { ...discountRule.opts, nullable: true } },
  taxRate: num({ min: 0, max: 100, optional: true }),
  dueDate: date({ optional: true }),
  notes: str({ max: 300, empty: true, optional: true }),
});

const JOIN = { patient: ['patients', PATIENT_BRIEF] };

function figures(lines, discount, taxRate) {
  const mapped = lines.map((l) => ({ ...l, amount: lineAmount(l) }));
  const t = computeTotals({ lines: mapped, discount, taxRate });
  return { lines: mapped, discount: discount || null, taxRate: taxRate || 0, subtotal: t.subtotal, discountAmount: t.discountAmount, tax: t.tax, total: t.total };
}

export const presentInvoice = (inv, now) => ({ ...inv, balance: Math.round((inv.total - inv.paid) * 100) / 100, displayStatus: displayStatus(inv, now) });

async function createInvoice(ctx, input) {
  const { store, now, user } = ctx;
  const f = figures(input.lines, input.discount, input.taxRate);
  const paid = 0;
  return store.insert('invoices', {
    invoiceNo: numberOf('INV', await store.nextSeq('invoice')), patient: input.patient, visit: input.visit || null, admission: input.admission || null,
    ...f, payments: [], paid, status: baseStatus({ total: f.total, paid }), issuedAt: now.toISOString(),
    dueDate: input.dueDate || new Date(now.getTime() + 14 * DAY).toISOString(), notes: input.notes || '', createdBy: user.name,
  });
}

export function register(add) {
  add('GET', '/invoices', { perm: 'billing.read' }, async ({ store, query, now }) => {
    const p = paging(query);
    const filter = {};
    const st = query.status;
    if (st === 'overdue') {
      filter.status = { $in: ['unpaid', 'partial'] };
      filter.dueDate = { $lt: now.toISOString() };
    } else if (st === 'open') filter.status = { $in: ['unpaid', 'partial'] };
    else if (INVOICE_STATUSES.includes(st)) filter.status = st;
    if (query.patient) filter.patient = query.patient;
    const range = {};
    if (query.from) range.$gte = new Date(query.from).toISOString();
    if (query.to) range.$lt = new Date(query.to).toISOString();
    if (Object.keys(range).length) filter.issuedAt = range;
    if (p.search) {
      const pids = (await store.find('patients', { $or: [{ name: rx(p.search) }, { mrn: rx(p.search) }] })).map((x) => x._id);
      filter.$or = [{ patient: { $in: pids } }, { invoiceNo: rx(p.search) }];
    }
    return paged(store, 'invoices', filter, p, {
      sort: { issuedAt: -1, _id: -1 },
      map: async (rows) => (await join(store, rows, JOIN)).map((i) => presentInvoice(i, now)),
    });
  });

  add('GET', '/invoices/:id', { perm: 'billing.read' }, async ({ store, params, now }) => {
    const inv = await getOr404(store, 'invoices', params.id, 'Invoice');
    await join(store, inv, { patient: ['patients', PATIENT_FULL] });
    const out = presentInvoice(inv, now);
    if (out.visit) {
      const v = await store.get('visits', out.visit);
      if (v) out.visitInfo = { _id: v._id, visitNo: v.visitNo, startedAt: v.startedAt, doctor: (await join(store, { doctor: v.doctor }, { doctor: ['doctors', DOCTOR_BRIEF] })).doctor };
    }
    return out;
  });

  add('POST', '/invoices', { perm: 'billing.write', body: invoiceBody, name: 'billing.create', entity: 'Invoice', status: 201 }, async (ctx) => {
    if (!(await ctx.store.get('patients', ctx.body.patient))) throw notFound('Patient not found');
    const rec = await createInvoice(ctx, ctx.body);
    ctx.note = `${rec.invoiceNo} (${rec.total})`;
    return presentInvoice(await join(ctx.store, rec, JOIN), ctx.now);
  });

  // finished visits and discharged stays that have no invoice yet (the billing counter's to-do list)
  add('GET', '/billing/unbilled', { perm: 'billing.write' }, async ({ store }) => {
    const [visits, stays] = await Promise.all([
      store.find('visits', { status: 'completed' }, { sort: { completedAt: -1 }, limit: 150 }),
      store.find('admissions', { status: 'discharged' }, { sort: { dischargedAt: -1 }, limit: 60 }),
    ]);
    const billed = (await store.find('invoices', { status: { $ne: 'void' } }, { limit: 5000 })).reduce((s, i) => {
      if (i.visit) s.visits.add(i.visit);
      if (i.admission) s.admissions.add(i.admission);
      return s;
    }, { visits: new Set(), admissions: new Set() });
    const pending = visits.filter((v) => !billed.visits.has(v._id)).slice(0, 12);
    const open = stays.filter((a) => !billed.admissions.has(a._id)).slice(0, 12);
    return {
      visits: await join(store, pending, { patient: ['patients', PATIENT_BRIEF], doctor: ['doctors', DOCTOR_BRIEF] }),
      admissions: await join(store, open, { patient: ['patients', PATIENT_BRIEF], ward: ['wards', 'name'] }),
    };
  });

  add('POST', '/invoices/from-visit/:visitId', { perm: 'billing.write', name: 'billing.fromVisit', entity: 'Invoice', status: 201 }, async (ctx) => {
    const { store, params, now } = ctx;
    const v = await getOr404(store, 'visits', params.visitId, 'Visit');
    const existing = (await store.find('invoices', { visit: v._id })).find((i) => i.status !== 'void');
    if (existing) throw conflict(`${existing.invoiceNo} already covers this visit`);
    const lines = [];
    const doc = v.doctor ? await store.get('doctors', v.doctor) : null;
    if (doc && doc.fee > 0) lines.push({ type: 'consultation', description: `Consultation - ${doc.name}`, qty: 1, unitPrice: doc.fee });
    for (const o of await store.find('labOrders', { visit: v._id }, { sort: { orderedAt: 1 } })) {
      if (o.status !== 'cancelled') lines.push({ type: 'lab', description: o.testName, qty: 1, unitPrice: o.price });
    }
    for (const r of await store.find('prescriptions', { visit: v._id }, { sort: { issuedAt: 1 } })) {
      for (const it of r.items) if (it.dispensedQty > 0) lines.push({ type: 'pharmacy', description: `${it.drug} x ${it.dispensedQty}`, qty: it.dispensedQty, unitPrice: it.unitPrice || 0 });
    }
    if (!lines.length) throw bad('There is nothing to bill for this visit yet');
    const rec = await createInvoice(ctx, { patient: v.patient, visit: String(v._id), lines, taxRate: Number(ctx.query.taxRate) || 0 });
    ctx.note = `${rec.invoiceNo} for ${v.visitNo}`;
    return presentInvoice(await join(store, rec, JOIN), now);
  });

  add('POST', '/invoices/from-admission/:admissionId', { perm: 'billing.write', name: 'billing.fromAdmission', entity: 'Invoice', status: 201 }, async (ctx) => {
    const { store, params, now } = ctx;
    const a = await getOr404(store, 'admissions', params.admissionId, 'Admission');
    const existing = (await store.find('invoices', { admission: a._id })).find((i) => i.status !== 'void');
    if (existing) throw conflict(`${existing.invoiceNo} already covers this admission`);
    const ward = await store.get('wards', a.ward);
    const days = daysStayed(a.admittedAt, a.dischargedAt || now);
    const rec = await createInvoice(ctx, {
      patient: a.patient, admission: String(a._id),
      lines: [{ type: 'bed', description: `Bed charges - ${ward?.name || 'Ward'} (${days} day${days > 1 ? 's' : ''})`, qty: days, unitPrice: ward?.dailyRate || 0 }],
    });
    ctx.note = `${rec.invoiceNo} for ${a.admissionNo}`;
    return presentInvoice(await join(store, rec, JOIN), now);
  });

  add(['PUT', 'PATCH'], '/invoices/:id', { perm: 'billing.write', body: invoiceBody, partial: true, name: 'billing.update', entity: 'Invoice' }, async (ctx) => {
    const { store, params, body, now } = ctx;
    const inv = await getOr404(store, 'invoices', params.id, 'Invoice');
    if (inv.status === 'void') throw conflict('A void invoice cannot be edited');
    if (inv.payments.length) throw conflict('Invoices with payments cannot be edited');
    const f = figures(body.lines || inv.lines, body.discount === undefined ? inv.discount : body.discount, body.taxRate ?? inv.taxRate);
    const patch = { ...f, notes: body.notes ?? inv.notes, dueDate: body.dueDate ?? inv.dueDate };
    patch.status = baseStatus({ total: f.total, paid: inv.paid });
    const rec = await store.update('invoices', inv._id, patch);
    ctx.note = rec.invoiceNo;
    return presentInvoice(await join(store, rec, JOIN), now);
  });

  const payBody = schema({ amount: num({ min: 0.01, max: 100000000 }), method: oneOf(PAYMENT_METHODS), reference: str({ max: 60, empty: true, optional: true }) });
  add('POST', '/invoices/:id/payments', { perm: 'billing.pay', body: payBody, name: 'billing.pay', entity: 'Invoice' }, async (ctx) => {
    const { store, params, body, now, user } = ctx;
    const inv = await getOr404(store, 'invoices', params.id, 'Invoice');
    if (inv.status === 'void') throw conflict('This invoice is void');
    if (inv.status === 'paid') throw conflict('This invoice is already paid');
    const next = applyPayment(inv, body.amount);
    const payment = { receiptNo: numberOf('RCT', await store.nextSeq('receipt')), amount: body.amount, method: body.method, reference: body.reference || '', at: now.toISOString(), by: user.name };
    const rec = await store.update('invoices', inv._id, { payments: [...inv.payments, payment], paid: next.paid, status: next.status });
    ctx.note = `${inv.invoiceNo} paid ${body.amount} (${payment.receiptNo})`;
    return presentInvoice(await join(store, rec, JOIN), now);
  });

  add('POST', '/invoices/:id/void', { perm: 'billing.void', body: schema({ reason: str({ max: 200 }) }), name: 'billing.void', entity: 'Invoice' }, async (ctx) => {
    const { store, params, body, now, user } = ctx;
    const inv = await getOr404(store, 'invoices', params.id, 'Invoice');
    if (inv.status === 'void') throw conflict('This invoice is already void');
    if (inv.payments.length) throw conflict('Invoices with payments cannot be voided');
    const rec = await store.update('invoices', inv._id, { status: 'void', voidReason: body.reason, voidedBy: user.name, voidedAt: now.toISOString() });
    ctx.note = `${inv.invoiceNo}: ${body.reason}`;
    return presentInvoice(await join(store, rec, JOIN), now);
  });
}
