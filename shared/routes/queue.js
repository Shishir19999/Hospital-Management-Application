import { schema, str, oneOf, id } from '../validate.js';
import { PRIORITIES, QUEUE_ACTIVE, averageWait, dayKey, queueOrder, tokenLabel, waitMinutes } from '../domain.js';
import { can } from '../policy.js';
import { bad, conflict, doctorFilter, forbidden, getOr404, join, notFound, idOf, PATIENT_BRIEF, DOCTOR_BRIEF } from './util.js';
import { createVisit, presentVisit } from './visits.js';

export const QUEUE_STATUSES = ['waiting', 'called', 'in_consult', 'done', 'skipped', 'cancelled'];
// allowed moves
const FLOW = {
  waiting: ['called', 'skipped', 'cancelled'],
  called: ['in_consult', 'waiting', 'skipped', 'cancelled'],
  in_consult: ['done'],
  skipped: ['waiting', 'cancelled'],
  done: [],
  cancelled: [],
};

const JOIN = { patient: ['patients', PATIENT_BRIEF], doctor: ['doctors', DOCTOR_BRIEF] };
const RANK = { in_consult: 0, called: 1, waiting: 2, skipped: 3, done: 4, cancelled: 5 };

const issueBody = schema({
  patient: id(),
  doctor: id({ optional: true, nullable: true }),
  appointment: id({ optional: true, nullable: true }),
  priority: oneOf(PRIORITIES, { optional: true }),
  reason: str({ max: 200, empty: true, optional: true }),
});

export async function issueToken(ctx, { patient, doctor, appointment, priority = 'routine', reason = '' }) {
  const { store, now, tz } = ctx;
  const day = dayKey(now, tz);
  const p = await store.get('patients', patient);
  if (!p) throw notFound('Patient not found');
  if (doctor && !(await store.get('doctors', doctor))) throw notFound('Doctor not found');
  const active = await store.count('queue', { day, patient, status: { $in: QUEUE_ACTIVE } });
  if (active) throw conflict(`${p.name} already has an active token today`);
  const seq = await store.nextSeq(`queue:${day}`);
  return store.insert('queue', {
    day, seq, number: tokenLabel(seq), patient, doctor: doctor || null, appointment: appointment || null,
    priority, status: 'waiting', reason, issuedAt: now.toISOString(), calledAt: null, startedAt: null, completedAt: null, visit: null, room: '',
  });
}

function present(t, now) {
  return { ...t, waitMinutes: waitMinutes(t, now) };
}

export function register(add) {
  add('GET', '/queue', { perm: 'queue.read' }, async ({ store, query, user, now, tz }) => {
    const day = /^\d{4}-\d{2}-\d{2}$/.test(query.day || '') ? query.day : dayKey(now, tz);
    const filter = { day };
    const doc = doctorFilter(query.doctor, user);
    if (doc) filter.doctor = doc;
    if (QUEUE_STATUSES.includes(query.status)) filter.status = query.status;
    const rows = await store.find('queue', filter, { sort: { seq: 1 } });
    const waiting = queueOrder(rows.filter((t) => t.status === 'waiting'));
    const rest = rows.filter((t) => t.status !== 'waiting').sort((a, b) => RANK[a.status] - RANK[b.status] || a.seq - b.seq);
    const ordered = [...rest.filter((t) => RANK[t.status] < 2), ...waiting, ...rest.filter((t) => RANK[t.status] >= 2)];
    const tokens = (await join(store, ordered, JOIN)).map((t) => present(t, now));
    waiting.forEach((w) => {
      const t = tokens.find((x) => x._id === w._id);
      t.position = waiting.indexOf(w) + 1;
    });
    const count = (s) => rows.filter((t) => t.status === s).length;
    return {
      day, tokens,
      stats: { waiting: count('waiting'), called: count('called'), inConsult: count('in_consult'), done: count('done'), skipped: count('skipped'), total: rows.length, avgWaitMin: averageWait(rows) },
    };
  });

  add('POST', '/queue/issue', { perm: 'queue.issue', body: issueBody, name: 'queue.issue', entity: 'Queue', status: 201 }, async (ctx) => {
    const rec = await issueToken(ctx, ctx.body);
    if (ctx.body.appointment) {
      const appt = await ctx.store.get('appointments', ctx.body.appointment);
      if (appt) await ctx.store.update('appointments', appt._id, { status: 'checked_in' });
    }
    ctx.note = `Token ${rec.number}`;
    return (await join(ctx.store, [rec], JOIN)).map((t) => present(t, ctx.now))[0];
  });

  // check a booked patient in: sets the appointment status and issues a token
  add('POST', '/appointments/:id/check-in', { perm: 'queue.issue', name: 'appointments.checkin', entity: 'Appointment', status: 201 }, async (ctx) => {
    const { store, params } = ctx;
    const a = await getOr404(store, 'appointments', params.id, 'Appointment');
    if (a.status === 'cancelled' || a.status === 'no_show' || a.status === 'completed') throw conflict(`This appointment is ${a.status.replace('_', ' ')}`);
    const rec = await issueToken(ctx, { patient: idOf(a.patient), doctor: idOf(a.doctor), appointment: String(a._id), reason: a.reason || '' });
    await store.update('appointments', a._id, { status: 'checked_in' });
    ctx.note = `Check-in, token ${rec.number}`;
    return (await join(store, [rec], JOIN)).map((t) => present(t, ctx.now))[0];
  });

  async function move(ctx, to, extra = {}) {
    const { store, params } = ctx;
    const t = await getOr404(store, 'queue', params.id, 'Token');
    if (!FLOW[t.status].includes(to)) throw conflict(`Token ${t.number} is ${t.status.replace('_', ' ')} and cannot move to ${to.replace('_', ' ')}`);
    const rec = await store.update('queue', t._id, { status: to, ...extra });
    ctx.note = `${rec.number} -> ${to.replace('_', ' ')}`;
    return rec;
  }
  const out = async (ctx, rec) => present((await join(ctx.store, [rec], JOIN))[0], ctx.now);

  const callBody = schema({ doctor: id({ optional: true, nullable: true }), room: str({ max: 30, empty: true, optional: true }) });
  add('POST', '/queue/:id/call', { perm: 'queue.update', body: callBody, name: 'queue.call', entity: 'Queue' }, async (ctx) => {
    const t = await getOr404(ctx.store, 'queue', ctx.params.id, 'Token');
    const mine = ctx.user.role === 'doctor' ? ctx.user.doctor : null;
    if (mine && t.doctor && t.doctor !== mine) throw conflict('This token is assigned to another doctor');
    const doctor = ctx.body.doctor || t.doctor || mine || null;
    if (ctx.body.doctor && !(await ctx.store.get('doctors', ctx.body.doctor))) throw notFound('Doctor not found');
    return out(ctx, await move(ctx, 'called', { calledAt: ctx.now.toISOString(), doctor, room: ctx.body.room || t.room || '' }));
  });

  add('POST', '/queue/:id/start', { perm: 'queue.update', body: callBody, name: 'queue.start', entity: 'Queue' }, async (ctx) => {
    const { store, params, user, now } = ctx;
    const t = await getOr404(store, 'queue', params.id, 'Token');
    if (t.status !== 'called') throw conflict('Call the token before starting the consultation');
    const doctor = ctx.body.doctor || t.doctor || (user.role === 'doctor' ? user.doctor : null);
    if (!doctor) throw bad('Choose the doctor for this consultation');
    let visit = t.visit ? await store.get('visits', t.visit) : null;
    if (!visit) {
      if (!can(user.role, 'visits.create')) throw forbidden('A nurse or doctor needs to open the visit first');
      visit = await createVisit(ctx, { patient: idOf(t.patient), doctor, token: String(t._id), appointment: t.appointment || undefined, status: 'in_consult' });
    } else {
      visit = await store.update('visits', visit._id, { status: 'in_consult', doctor, consultStartedAt: visit.consultStartedAt || now.toISOString() });
    }
    const rec = await move(ctx, 'in_consult', { startedAt: now.toISOString(), doctor, visit: visit._id });
    const res = await out(ctx, rec);
    return { ...res, visitRecord: presentVisit(visit) };
  });

  for (const [action, to] of [['skip', 'skipped'], ['requeue', 'waiting'], ['cancel', 'cancelled']]) {
    add('POST', `/queue/:id/${action}`, { perm: 'queue.update', name: `queue.${action}`, entity: 'Queue' }, async (ctx) => out(ctx, await move(ctx, to)));
  }

  add('PATCH', '/queue/:id', { perm: 'queue.update', body: schema({ priority: oneOf(PRIORITIES) }), name: 'queue.priority', entity: 'Queue' }, async (ctx) => {
    const t = await getOr404(ctx.store, 'queue', ctx.params.id, 'Token');
    if (t.status === 'done' || t.status === 'cancelled') throw conflict('This token is closed');
    const rec = await ctx.store.update('queue', t._id, { priority: ctx.body.priority });
    ctx.note = `${rec.number} priority ${rec.priority}`;
    return out(ctx, rec);
  });

}
