import { can } from '../policy.js';
import { schema, arr, str } from '../validate.js';
import {
  DAY, MIN, bedStats, billingSummary, dailyVisits, dayKey, displayStatus, doctorWorkload, expiryStatus, queueOrder, revenueByDay,
  stockOf, stockStatus, topDiagnoses, waitMinutes, wardOccupancy, averageWait, addDaysKey, dayStart, ACTIVE_APPOINTMENT,
} from '../domain.js';
import { doctorFilter, join, paged, paging, rx, PATIENT_BRIEF, DOCTOR_BRIEF } from './util.js';
import { presentItem } from './pharmacy.js';
import { presentInvoice } from './billing.js';
import { presentVisit } from './visits.js';

const clampDays = (q, d = 14) => Math.min(90, Math.max(1, parseInt(q.days, 10) || d));
const sinceOf = (days, now, tz) => dayStart(addDaysKey(dayKey(now, tz), -(days - 1)), tz);
const JOIN = { patient: ['patients', PATIENT_BRIEF], doctor: ['doctors', DOCTOR_BRIEF] };

async function todayRange({ now, tz }) {
  const key = dayKey(now, tz);
  return { key, from: dayStart(key, tz).toISOString(), to: dayStart(addDaysKey(key, 1), tz).toISOString() };
}

// ----- notifications (computed from current data; ids are stable so "read" can be remembered)
async function buildNotifications(ctx) {
  const { store, user, now } = ctx;
  const out = [];
  const push = (n) => out.push({ kind: 'info', at: now.toISOString(), ...n });
  const role = user.role;

  if (can(role, 'labs.review')) {
    const mine = role === 'doctor' ? { doctor: user.doctor || '000000000000000000000000' } : {};
    const labs = await store.find('labOrders', { ...mine, status: 'resulted', reviewed: false, abnormal: true }, { sort: { resultedAt: -1 }, limit: 8 });
    await join(store, labs, { patient: ['patients', 'name'] });
    for (const l of labs) {
      push({ id: `lab:${l._id}`, kind: l.critical ? 'critical' : 'warning', title: `${l.critical ? 'Critical' : 'Abnormal'} result: ${l.testName}`, body: `${l.patient?.name || 'Patient'} - ${l.value} ${l.unit}`, link: '/labs', at: l.resultedAt });
    }
  }
  if (can(role, 'appointments.read') && (role === 'doctor' || role === 'receptionist' || role === 'admin' || role === 'nurse')) {
    const filter = { date: { $gte: now.toISOString(), $lt: new Date(now.getTime() + DAY).toISOString() }, status: { $in: ['scheduled', 'checked_in'] } };
    if (role === 'doctor') filter.doctor = user.doctor || '000000000000000000000000';
    const appts = await store.find('appointments', filter, { sort: { date: 1 }, limit: 6 });
    await join(store, appts, { patient: ['patients', 'name'] });
    for (const a of appts) push({ id: `appt:${a._id}`, title: `Upcoming appointment: ${a.patient?.name || 'Patient'}`, body: 'Starts within 24 hours', link: '/appointments', at: a.date });
  }
  if (can(role, 'queue.read')) {
    const { key } = await todayRange(ctx);
    const waiting = await store.find('queue', { day: key, status: 'waiting' });
    await join(store, waiting, { patient: ['patients', 'name'] });
    for (const t of waiting) {
      const w = waitMinutes(t, now);
      if (t.priority === 'emergency' || w >= 30) push({ id: `wait:${t._id}`, kind: t.priority === 'emergency' ? 'critical' : 'warning', title: t.priority === 'emergency' ? `Emergency waiting: ${t.number}` : `Long wait: ${t.number}`, body: `${t.patient?.name || 'Patient'} has waited ${w} min`, link: '/queue', at: t.issuedAt });
    }
  }
  if (can(role, 'inventory.manage')) {
    for (const i of (await store.find('inventory', {})).map((x) => presentItem(x, now))) {
      if (i.stockStatus !== 'ok') push({ id: `stock:${i._id}:${i.stockStatus}`, kind: i.stockStatus === 'out' ? 'critical' : 'warning', title: i.stockStatus === 'out' ? `Out of stock: ${i.name}` : `Low stock: ${i.name}`, body: `${i.stock} left (reorder at ${i.reorderLevel})`, link: '/pharmacy/stock' });
      if (i.expiryStatus !== 'ok') push({ id: `exp:${i._id}:${i.expiryStatus}`, kind: i.expiryStatus === 'expired' ? 'critical' : 'warning', title: `${i.expiryStatus === 'expired' ? 'Expired' : 'Expiring soon'}: ${i.name}`, body: `Earliest expiry ${String(i.nextExpiry).slice(0, 10)}`, link: '/pharmacy/stock' });
    }
  }
  if (role === 'lab_tech' || role === 'admin') {
    const urgent = await store.find('labOrders', { status: { $in: ['ordered', 'collected'] }, priority: 'urgent' }, { limit: 6 });
    for (const o of urgent) push({ id: `urgent:${o._id}:${o.status}`, kind: 'warning', title: `Urgent test waiting: ${o.testName}`, body: o.status === 'ordered' ? 'Sample not collected yet' : 'Waiting for result', link: '/labs', at: o.orderedAt });
  }
  if (can(role, 'billing.read')) {
    const overdue = await store.find('invoices', { status: { $in: ['unpaid', 'partial'] }, dueDate: { $lt: now.toISOString() } }, { sort: { dueDate: 1 }, limit: 6 });
    for (const inv of overdue) push({ id: `inv:${inv._id}`, kind: 'warning', title: `Overdue invoice ${inv.invoiceNo}`, body: `${(inv.total - inv.paid).toFixed(2)} outstanding`, link: `/billing/${inv._id}`, at: inv.dueDate });
  }
  if (role === 'admin' || role === 'nurse') {
    const stats = bedStats(await store.find('beds', {}));
    if (stats.occupancyPct >= 85) push({ id: 'beds:high', kind: 'warning', title: 'Bed occupancy is high', body: `${stats.occupancyPct}% of usable beds are taken`, link: '/wards' });
  }
  const me = await store.get('users', user.id);
  const read = new Set(me?.readNotifications || []);
  return out.map((n) => ({ ...n, read: read.has(n.id) })).sort((a, b) => Number(a.read) - Number(b.read) || new Date(b.at) - new Date(a.at));
}

// ----- role dashboards
async function dashboard(ctx) {
  const { store, user, now, tz } = ctx;
  const { key, from, to } = await todayRange(ctx);
  const doctorId = user.doctor || '000000000000000000000000';
  const apptsToday = (filter = {}) => store.find('appointments', { date: { $gte: from, $lt: to }, ...filter }, { sort: { date: 1 } });
  const queueToday = (filter = {}) => store.find('queue', { day: key, ...filter }, { sort: { seq: 1 } });
  const out = { role: user.role, now: now.toISOString(), day: key };

  const queueBlock = async (rows) => {
    const waiting = queueOrder(rows.filter((t) => t.status === 'waiting'));
    const active = rows.filter((t) => t.status === 'called' || t.status === 'in_consult');
    const list = [...active, ...waiting].map((t) => ({ ...t, waitMinutes: waitMinutes(t, now) }));
    return { tokens: await join(store, list, JOIN), stats: { waiting: waiting.length, active: active.length, done: rows.filter((t) => t.status === 'done').length, avgWaitMin: averageWait(rows) } };
  };

  switch (user.role) {
    case 'doctor': {
      const [appts, q, open, labs, admitted] = await Promise.all([
        apptsToday({ doctor: doctorId }),
        queueToday(),
        store.find('visits', { doctor: doctorId, status: { $in: ['triage', 'in_consult'] } }, { sort: { startedAt: 1 } }),
        store.find('labOrders', { doctor: doctorId, status: 'resulted', reviewed: false }, { sort: { critical: -1, resultedAt: -1 }, limit: 8 }),
        store.find('admissions', { doctor: doctorId, status: 'admitted' }),
      ]);
      out.appointments = await join(store, appts, JOIN);
      out.queue = await queueBlock(q.filter((t) => !t.doctor || t.doctor === doctorId));
      out.openVisits = (await join(store, open, JOIN)).map(presentVisit);
      out.labsToReview = await join(store, labs, { patient: ['patients', PATIENT_BRIEF] });
      out.admitted = await join(store, admitted, { patient: ['patients', PATIENT_BRIEF], ward: ['wards', 'name'] });
      break;
    }
    case 'nurse': {
      const [q, open, adm, beds, toCollect] = await Promise.all([
        queueToday(),
        store.find('visits', { status: 'triage' }, { sort: { startedAt: 1 } }),
        store.find('admissions', { status: 'admitted' }, { sort: { admittedAt: 1 } }),
        store.find('beds', {}),
        store.count('labOrders', { status: 'ordered' }),
      ]);
      out.queue = await queueBlock(q);
      out.awaitingTriage = (await queueBlock(q.filter((t) => t.status === 'waiting' && !t.visit))).tokens;
      out.openVisits = (await join(store, open, JOIN)).map(presentVisit);
      out.inpatients = await join(store, adm, { patient: ['patients', PATIENT_BRIEF], doctor: ['doctors', DOCTOR_BRIEF], ward: ['wards', 'name'] });
      const bedMap = new Map(beds.map((b) => [b._id, b.label]));
      out.inpatients = out.inpatients.map((a) => ({ ...a, bedLabel: bedMap.get(a.bed) || '' }));
      out.beds = bedStats(beds);
      out.samplesToCollect = toCollect;
      break;
    }
    case 'receptionist': {
      const [appts, q, open] = await Promise.all([
        apptsToday(),
        queueToday(),
        store.find('invoices', { status: { $in: ['unpaid', 'partial'] } }, { sort: { issuedAt: -1 }, limit: 8 }),
      ]);
      out.appointments = await join(store, appts, JOIN);
      out.queue = await queueBlock(q);
      out.openInvoices = (await join(store, open, { patient: ['patients', PATIENT_BRIEF] })).map((i) => presentInvoice(i, now));
      out.beds = bedStats(await store.find('beds', {}));
      break;
    }
    case 'pharmacist': {
      const [rxs, inv, movements] = await Promise.all([
        store.find('prescriptions', { status: { $in: ['issued', 'partial'] } }, { sort: { issuedAt: 1 }, limit: 12 }),
        store.find('inventory', {}),
        store.find('movements', { type: 'dispense', at: { $gte: from, $lt: to } }),
      ]);
      out.pending = await join(store, rxs, { patient: ['patients', PATIENT_BRIEF], doctor: ['doctors', DOCTOR_BRIEF] });
      const items = inv.map((i) => presentItem(i, now));
      out.lowStock = items.filter((i) => i.stockStatus !== 'ok');
      out.expiring = items.filter((i) => i.expiryStatus !== 'ok');
      out.stats = { items: items.length, dispensedToday: movements.length, pending: await store.count('prescriptions', { status: { $in: ['issued', 'partial'] } }) };
      break;
    }
    case 'lab_tech': {
      const [open, done, crit] = await Promise.all([
        store.find('labOrders', { status: { $in: ['ordered', 'collected'] } }, { sort: { priority: -1, orderedAt: 1 }, limit: 12 }),
        store.count('labOrders', { status: 'resulted', resultedAt: { $gte: from, $lt: to } }),
        store.find('labOrders', { status: 'resulted', critical: true }, { sort: { resultedAt: -1 }, limit: 5 }),
      ]);
      out.worklist = await join(store, open, { patient: ['patients', PATIENT_BRIEF] });
      out.critical = await join(store, crit, { patient: ['patients', PATIENT_BRIEF] });
      out.stats = { toCollect: await store.count('labOrders', { status: 'ordered' }), toResult: await store.count('labOrders', { status: 'collected' }), resultedToday: done };
      break;
    }
    default: {
      const [patients, doctors, appts, visits, inv, q, beds, audit, pend] = await Promise.all([
        store.count('patients'), store.count('doctors'), apptsToday(), store.find('visits', { startedAt: { $gte: from, $lt: to } }),
        store.find('invoices', {}), queueToday(), store.find('beds', {}), store.find('audit', {}, { sort: { at: -1 }, limit: 6 }),
        store.count('labOrders', { status: { $in: ['ordered', 'collected'] } }),
      ]);
      const stock = (await store.find('inventory', {})).map((i) => presentItem(i, now));
      const billing = billingSummary(inv.filter((i) => i.status !== 'void'), now);
      const revToday = revenueByDay(inv, { days: 1, now, tz })[0]?.collected || 0;
      out.kpis = {
        patients, doctors, appointmentsToday: appts.length, visitsToday: visits.length, revenueToday: revToday, outstanding: billing.outstanding,
        overdue: billing.overdueCount, occupancyPct: bedStats(beds).occupancyPct, lowStock: stock.filter((i) => i.stockStatus !== 'ok').length, pendingLabs: pend,
      };
      out.queue = (await queueBlock(q)).stats;
      out.beds = bedStats(beds);
      out.recentActivity = audit;
      out.alerts = (await buildNotifications(ctx)).filter((n) => !n.read).slice(0, 5);
    }
  }
  return out;
}

export function register(add) {
  const reportDays = (ctx) => clampDays(ctx.query);

  add('GET', '/reports/summary', { perm: 'reports.read' }, async (ctx) => {
    const { store, now, tz } = ctx;
    const days = reportDays(ctx);
    const since = sinceOf(days, now, tz).toISOString();
    const [visits, invoices, appts, beds, patients] = await Promise.all([
      store.find('visits', { startedAt: { $gte: since } }), store.find('invoices', {}), store.find('appointments', { date: { $gte: since, $lte: now.toISOString() } }),
      store.find('beds', {}), store.count('patients'),
    ]);
    const rev = revenueByDay(invoices, { days, now, tz });
    return {
      days, patients, visits: visits.length, appointments: appts.filter(ACTIVE_APPOINTMENT).length,
      noShows: appts.filter((a) => a.status === 'no_show').length,
      collected: Math.round(rev.reduce((s, r) => s + r.collected, 0) * 100) / 100, billing: billingSummary(invoices.filter((i) => i.status !== 'void'), now), beds: bedStats(beds),
    };
  });

  add('GET', '/reports/daily-visits', { perm: 'reports.read' }, async (ctx) => {
    const days = reportDays(ctx);
    const visits = await ctx.store.find('visits', { startedAt: { $gte: sinceOf(days, ctx.now, ctx.tz).toISOString() } });
    return { days, rows: dailyVisits(visits, { days, now: ctx.now, tz: ctx.tz }) };
  });

  add('GET', '/reports/revenue', { perm: 'reports.read' }, async (ctx) => {
    const days = reportDays(ctx);
    const invoices = await ctx.store.find('invoices', {});
    const rows = revenueByDay(invoices, { days, now: ctx.now, tz: ctx.tz });
    return { days, rows, totals: { collected: rows.reduce((s, r) => s + r.collected, 0), billed: rows.reduce((s, r) => s + r.billed, 0) } };
  });

  add('GET', '/reports/bed-occupancy', { perm: 'reports.read' }, async ({ store }) => {
    const [wards, beds] = await Promise.all([store.find('wards', {}, { sort: { name: 1 } }), store.find('beds', {})]);
    return { totals: bedStats(beds), wards: wardOccupancy(wards, beds) };
  });

  add('GET', '/reports/top-diagnoses', { perm: 'reports.read' }, async (ctx) => {
    const days = clampDays(ctx.query, 90);
    const visits = await ctx.store.find('visits', { startedAt: { $gte: sinceOf(days, ctx.now, ctx.tz).toISOString() } });
    return { days, rows: topDiagnoses(visits, { limit: Math.min(20, parseInt(ctx.query.limit, 10) || 8) }) };
  });

  add('GET', '/reports/doctor-workload', { perm: 'reports.read' }, async (ctx) => {
    const days = clampDays(ctx.query, 30);
    const since = sinceOf(days, ctx.now, ctx.tz).toISOString();
    const [doctors, visits, appts] = await Promise.all([ctx.store.find('doctors', {}), ctx.store.find('visits', { startedAt: { $gte: since } }), ctx.store.find('appointments', { date: { $gte: since, $lte: new Date(ctx.now.getTime() + 7 * DAY).toISOString() } })]);
    return { days, rows: doctorWorkload(doctors, visits, appts, { since }) };
  });

  add('GET', '/audit', { perm: 'audit.read' }, async ({ store, query }) => {
    const p = paging(query, { defaultLimit: 25 });
    const filter = {};
    if (p.search) filter.$or = [{ userName: rx(p.search) }, { summary: rx(p.search) }, { action: rx(p.search) }];
    if (query.user) filter.user = query.user;
    if (query.entity) filter.entity = query.entity;
    const range = {};
    if (query.from) range.$gte = new Date(query.from).toISOString();
    if (query.to) range.$lt = new Date(query.to).toISOString();
    if (Object.keys(range).length) filter.at = range;
    return paged(store, 'audit', filter, p, { sort: { at: -1, _id: -1 } });
  });

  add('GET', '/notifications', { perm: 'notifications.read' }, async (ctx) => {
    const list = await buildNotifications(ctx);
    return { unread: list.filter((n) => !n.read).length, data: list.slice(0, 40) };
  });
  add('POST', '/notifications/read', { perm: 'notifications.read', body: schema({ ids: arr(str({ max: 80 }), { max: 100 }) }), audit: false }, async ({ store, user, body }) => {
    const me = await store.get('users', user.id);
    const merged = [...new Set([...(me?.readNotifications || []), ...body.ids])].slice(-300);
    await store.update('users', user.id, { readNotifications: merged });
    return { ok: true };
  });

  add('GET', '/search', { perm: 'search.read' }, async ({ store, query, user, now }) => {
    const q = String(query.q || '').trim().slice(0, 60);
    if (q.length < 2) return { patients: [], doctors: [], appointments: [], visits: [], invoices: [] };
    const [patients, doctors] = await Promise.all([
      store.find('patients', { $or: [{ name: rx(q) }, { mrn: rx(q) }, { phone: rx(q) }] }, { sort: { name: 1 }, limit: 6 }),
      store.find('doctors', { $or: [{ name: rx(q) }, { specialty: rx(q) }] }, { sort: { name: 1 }, limit: 5 }),
    ]);
    const pids = (await store.find('patients', { name: rx(q) }, { limit: 50 })).map((p) => p._id);
    const dids = doctors.map((d) => d._id);
    const appts = await store.find('appointments', { $or: [{ patient: { $in: pids } }, { doctor: { $in: dids } }] }, { sort: { date: -1 }, limit: 5 });
    const out = {
      patients: patients.map(({ _id, name, age, gender, mrn }) => ({ _id, name, age, gender, mrn })),
      doctors: doctors.map(({ _id, name, specialty }) => ({ _id, name, specialty })),
      appointments: await join(store, appts, JOIN),
      visits: [],
      invoices: [],
    };
    if (can(user.role, 'visits.read')) out.visits = await join(store, await store.find('visits', { visitNo: rx(q) }, { limit: 4 }), JOIN);
    if (can(user.role, 'billing.read')) out.invoices = (await join(store, await store.find('invoices', { invoiceNo: rx(q) }, { limit: 4 }), { patient: ['patients', 'name'] })).map((i) => presentInvoice(i, now));
    return out;
  });

  add('GET', '/dashboard', { perm: 'dashboard.read' }, dashboard);

  void [doctorFilter, displayStatus, expiryStatus, stockOf, stockStatus, MIN];
}
