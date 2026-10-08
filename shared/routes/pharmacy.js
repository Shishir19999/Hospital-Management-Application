import { schema, str, num, oneOf, arr, id, date, shape, bool } from '../validate.js';
import { FREQUENCIES, expiryStatus, planDispense, receiveBatch, stockOf, stockStatus, suggestQty } from '../domain.js';
import { bad, conflict, getOr404, join, notFound, numberOf, paged, paging, rx, idOf, PATIENT_FULL, DOCTOR_BRIEF, PATIENT_BRIEF } from './util.js';

export const RX_STATUSES = ['issued', 'partial', 'dispensed', 'cancelled'];
const itemRule = shape({
  drug: str({ max: 120 }),
  inventoryItem: id({ optional: true, nullable: true }),
  dose: str({ max: 60 }),
  frequency: oneOf(Object.keys(FREQUENCIES)),
  durationDays: num({ int: true, min: 1, max: 365 }),
  instructions: str({ max: 200, empty: true, optional: true }),
  qty: num({ int: true, min: 1, max: 5000, optional: true }),
});
const rxBody = schema({ visit: id(), items: arr(itemRule, { min: 1, max: 20 }), notes: str({ max: 500, empty: true, optional: true }), overrideAllergy: bool({ optional: true }) });

export const presentItem = (it, now) => ({
  ...it,
  stock: stockOf(it, now),
  stockStatus: stockStatus(it, now),
  expiryStatus: expiryStatus(it, now),
  nextExpiry: (it.batches || []).filter((b) => b.qty > 0).map((b) => b.expiry).sort()[0] || null,
});

const RX_JOIN = { patient: ['patients', PATIENT_FULL], doctor: ['doctors', DOCTOR_BRIEF] };

function allergyHits(patient, items, inventoryById) {
  const list = (patient.allergies || []).map((a) => a.toLowerCase()).filter(Boolean);
  const hits = [];
  for (const it of items) {
    const inv = inventoryById.get(it.inventoryItem);
    const text = `${it.drug} ${inv?.genericName || ''}`.toLowerCase();
    for (const a of list) if (text.includes(a)) hits.push(`${it.drug} (${a})`);
  }
  return hits;
}

const itemBody = schema({
  name: str({ max: 120 }),
  genericName: str({ max: 120, empty: true, optional: true }),
  category: str({ max: 60, empty: true, optional: true }),
  unit: str({ max: 20 }),
  price: num({ min: 0, max: 100000 }),
  reorderLevel: num({ int: true, min: 0, max: 100000 }),
  sku: str({ max: 40, empty: true, optional: true }),
  lot: str({ max: 40, optional: true }),
  qty: num({ int: true, min: 1, max: 1000000, optional: true }),
  expiry: date({ optional: true }),
});

export function register(add) {
  // ----------------------------------------------------------- prescriptions
  add('GET', '/prescriptions', { perm: 'prescriptions.read' }, async ({ store, query }) => {
    const p = paging(query);
    const filter = {};
    if (query.patient) filter.patient = query.patient;
    if (query.visit) filter.visit = query.visit;
    if (query.status === 'pending') filter.status = { $in: ['issued', 'partial'] };
    else if (RX_STATUSES.includes(query.status)) filter.status = query.status;
    if (p.search) {
      const pids = (await store.find('patients', { $or: [{ name: rx(p.search) }, { mrn: rx(p.search) }] })).map((x) => x._id);
      filter.$or = [{ patient: { $in: pids } }, { rxNo: rx(p.search) }];
    }
    return paged(store, 'prescriptions', filter, p, { sort: { issuedAt: -1, _id: -1 }, map: (rows) => join(store, rows, { patient: ['patients', PATIENT_BRIEF], doctor: ['doctors', DOCTOR_BRIEF] }) });
  });

  add('GET', '/prescriptions/:id', { perm: 'prescriptions.read' }, async ({ store, params, now }) => {
    const r = await getOr404(store, 'prescriptions', params.id, 'Prescription');
    await join(store, r, RX_JOIN);
    const ids = r.items.map((i) => i.inventoryItem).filter(Boolean);
    const inv = ids.length ? await store.find('inventory', { _id: { $in: ids } }) : [];
    r.items = r.items.map((i) => ({ ...i, stock: i.inventoryItem ? stockOf(inv.find((x) => x._id === i.inventoryItem) || {}, now) : 0 }));
    return r;
  });

  add('POST', '/prescriptions', { perm: 'prescriptions.write', body: rxBody, name: 'prescriptions.create', entity: 'Prescription', status: 201 }, async (ctx) => {
    const { store, body, user, now } = ctx;
    const visit = await getOr404(store, 'visits', body.visit, 'Visit');
    if (visit.status === 'completed' || visit.status === 'cancelled') throw conflict(`This visit is already ${visit.status}`);
    const patient = await store.get('patients', visit.patient);
    const doctor = user.doctor || visit.doctor;
    if (!doctor) throw bad('Assign a doctor to this visit before prescribing');
    const all = await store.find('inventory', {});
    const byId = new Map(all.map((i) => [i._id, i]));
    const items = body.items.map((it) => {
      const match = it.inventoryItem && byId.has(it.inventoryItem) ? byId.get(it.inventoryItem) : all.find((i) => i.name.toLowerCase() === it.drug.toLowerCase());
      return {
        drug: it.drug, inventoryItem: match ? match._id : null, dose: it.dose, frequency: it.frequency, durationDays: it.durationDays,
        instructions: it.instructions || '', qty: it.qty || suggestQty(it.frequency, it.durationDays), dispensedQty: 0,
      };
    });
    const hits = allergyHits(patient, items, byId);
    if (hits.length && !body.overrideAllergy) throw conflict(`Allergy alert: ${patient.name} is allergic to ${hits.join(', ')}. Confirm to prescribe anyway.`);
    const rec = await store.insert('prescriptions', {
      rxNo: numberOf('RX', await store.nextSeq('rx')), patient: visit.patient, doctor, visit: String(visit._id), items, notes: body.notes || '',
      status: 'issued', issuedAt: now.toISOString(), allergyOverride: hits.length > 0,
    });
    ctx.note = `${rec.rxNo} for ${patient.name}`;
    return join(store, rec, RX_JOIN);
  });

  add('POST', '/prescriptions/:id/cancel', { perm: 'prescriptions.write', name: 'prescriptions.cancel', entity: 'Prescription' }, async (ctx) => {
    const r = await getOr404(ctx.store, 'prescriptions', ctx.params.id, 'Prescription');
    if (r.status === 'cancelled') return r;
    if (r.items.some((i) => i.dispensedQty > 0)) throw conflict('Part of this prescription was already dispensed');
    ctx.note = r.rxNo;
    return ctx.store.update('prescriptions', r._id, { status: 'cancelled' });
  });

  const dispenseBody = schema({ items: arr(shape({ index: num({ int: true, min: 0, max: 50 }), qty: num({ int: true, min: 1, max: 5000, optional: true }), inventoryItem: id({ optional: true, nullable: true }) }), { optional: true, max: 20 }) });
  add('POST', '/prescriptions/:id/dispense', { perm: 'pharmacy.dispense', body: dispenseBody, name: 'pharmacy.dispense', entity: 'Prescription' }, async (ctx) => {
    const { store, params, body, now, user } = ctx;
    const r = await getOr404(store, 'prescriptions', params.id, 'Prescription');
    if (r.status === 'cancelled') throw conflict('This prescription was cancelled');
    if (r.status === 'dispensed') throw conflict('This prescription is already fully dispensed');
    const wanted = body.items?.length ? body.items : r.items.map((_, index) => ({ index }));
    const items = r.items.map((i) => ({ ...i }));
    const invCache = new Map();
    const movements = [];
    for (const w of wanted) {
      const it = items[w.index];
      if (!it) throw bad(`Item ${w.index + 1} does not exist`);
      const remaining = it.qty - it.dispensedQty;
      if (remaining <= 0) continue;
      const qty = w.qty || remaining;
      if (qty > remaining) throw bad(`Only ${remaining} of ${it.drug} remain to dispense`);
      const invId = w.inventoryItem || it.inventoryItem;
      if (!invId) throw bad(`${it.drug} is not linked to a stock item; choose one to dispense`);
      let inv = invCache.get(invId) || (await store.get('inventory', invId));
      if (!inv) throw notFound(`Stock item for ${it.drug} not found`);
      let plan;
      try {
        plan = planDispense(inv, qty, now);
      } catch (e) {
        throw conflict(e.message);
      }
      inv = { ...inv, batches: plan.batches };
      invCache.set(invId, inv);
      it.inventoryItem = invId;
      it.dispensedQty += qty;
      it.unitPrice = inv.price;
      for (const u of plan.used) movements.push({ item: invId, itemName: inv.name, type: 'dispense', qty: -u.qty, lot: u.lot, reason: `${r.rxNo}`, ref: String(r._id), by: user.name, at: now.toISOString() });
    }
    if (!movements.length) throw bad('Nothing left to dispense');
    for (const [invId, inv] of invCache) await store.update('inventory', invId, { batches: inv.batches });
    for (const m of movements) await store.insert('movements', m);
    const done = items.every((i) => i.dispensedQty >= i.qty);
    const rec = await store.update('prescriptions', r._id, { items, status: done ? 'dispensed' : 'partial', dispensedAt: done ? now.toISOString() : null, dispensedBy: user.name });
    ctx.note = `${r.rxNo} ${done ? 'dispensed' : 'part-dispensed'}`;
    return join(store, rec, RX_JOIN);
  });

  // --------------------------------------------------------------- inventory
  add('GET', '/inventory', { perm: 'inventory.read' }, async ({ store, query, now }) => {
    const p = paging(query);
    const filter = p.search ? { $or: [{ name: rx(p.search) }, { genericName: rx(p.search) }, { category: rx(p.search) }] } : {};
    let rows = (await store.find('inventory', filter, { sort: { name: 1 } })).map((i) => presentItem(i, now));
    const f = query.status;
    if (f === 'low') rows = rows.filter((i) => i.stockStatus === 'low' || i.stockStatus === 'out');
    else if (f === 'out') rows = rows.filter((i) => i.stockStatus === 'out');
    else if (f === 'expiring') rows = rows.filter((i) => i.expiryStatus !== 'ok');
    else if (f === 'ok') rows = rows.filter((i) => i.stockStatus === 'ok' && i.expiryStatus === 'ok');
    const total = rows.length;
    const data = rows.slice((p.page - 1) * p.limit, p.page * p.limit);
    return { data, page: p.page, limit: p.limit, total, pages: Math.max(1, Math.ceil(total / p.limit)) };
  });

  add('GET', '/inventory/:id', { perm: 'inventory.read' }, async ({ store, params, now }) => presentItem(await getOr404(store, 'inventory', params.id, 'Stock item'), now));

  add('POST', '/inventory', { perm: 'inventory.manage', body: itemBody, name: 'inventory.create', entity: 'Inventory', status: 201 }, async (ctx) => {
    const { store, body, now, user } = ctx;
    if (await store.count('inventory', { name: body.name })) throw conflict('A stock item with this name already exists');
    const batches = [];
    if (body.qty) {
      if (!body.expiry || !body.lot) throw bad('A lot number and expiry are needed for the opening stock');
      batches.push({ lot: body.lot, qty: body.qty, expiry: body.expiry });
    }
    const { lot, qty, expiry, ...fields } = body;
    void lot; void qty; void expiry;
    const rec = await store.insert('inventory', { genericName: '', category: '', sku: '', ...fields, batches });
    if (batches.length) await store.insert('movements', { item: rec._id, itemName: rec.name, type: 'receive', qty: batches[0].qty, lot: batches[0].lot, reason: 'Opening stock', ref: '', by: user.name, at: now.toISOString() });
    ctx.note = rec.name;
    return presentItem(rec, now);
  });

  add(['PUT', 'PATCH'], '/inventory/:id', { perm: 'inventory.manage', body: itemBody, partial: true, name: 'inventory.update', entity: 'Inventory' }, async (ctx) => {
    await getOr404(ctx.store, 'inventory', ctx.params.id, 'Stock item');
    const { lot, qty, expiry, ...fields } = ctx.body;
    void lot; void qty; void expiry;
    const rec = await ctx.store.update('inventory', ctx.params.id, fields);
    ctx.note = rec.name;
    return presentItem(rec, ctx.now);
  });

  add('DELETE', '/inventory/:id', { perm: 'inventory.manage', name: 'inventory.remove', entity: 'Inventory' }, async (ctx) => {
    const it = await getOr404(ctx.store, 'inventory', ctx.params.id, 'Stock item');
    if (stockOf(it, new Date(0)) > 0) throw conflict('Remove or adjust the remaining stock before deleting this item');
    await ctx.store.remove('inventory', it._id);
    ctx.note = it.name;
    return { ok: true };
  });

  const receiveBody = schema({ lot: str({ max: 40 }), qty: num({ int: true, min: 1, max: 1000000 }), expiry: date() });
  add('POST', '/inventory/:id/receive', { perm: 'inventory.manage', body: receiveBody, name: 'inventory.receive', entity: 'Inventory' }, async (ctx) => {
    const { store, params, body, now, user } = ctx;
    const it = await getOr404(store, 'inventory', params.id, 'Stock item');
    if (new Date(body.expiry) <= now) throw bad('Expiry date must be in the future');
    const rec = await store.update('inventory', it._id, { batches: receiveBatch(it, body) });
    await store.insert('movements', { item: it._id, itemName: it.name, type: 'receive', qty: body.qty, lot: body.lot, reason: 'Stock received', ref: '', by: user.name, at: now.toISOString() });
    ctx.note = `${it.name} +${body.qty}`;
    return presentItem(rec, now);
  });

  const adjustBody = schema({ lot: str({ max: 40 }), delta: num({ int: true, min: -1000000, max: 1000000 }), reason: str({ max: 120 }) });
  add('POST', '/inventory/:id/adjust', { perm: 'inventory.manage', body: adjustBody, name: 'inventory.adjust', entity: 'Inventory' }, async (ctx) => {
    const { store, params, body, now, user } = ctx;
    if (!body.delta) throw bad('Adjustment cannot be zero');
    const it = await getOr404(store, 'inventory', params.id, 'Stock item');
    const batches = (it.batches || []).map((b) => ({ ...b }));
    const b = batches.find((x) => x.lot === body.lot);
    if (!b) throw notFound(`Lot ${body.lot} not found`);
    if (b.qty + body.delta < 0) throw conflict(`Lot ${body.lot} only has ${b.qty} units`);
    b.qty += body.delta;
    const rec = await store.update('inventory', it._id, { batches: batches.filter((x) => x.qty > 0) });
    await store.insert('movements', { item: it._id, itemName: it.name, type: 'adjust', qty: body.delta, lot: body.lot, reason: body.reason, ref: '', by: user.name, at: now.toISOString() });
    ctx.note = `${it.name} ${body.delta > 0 ? '+' : ''}${body.delta}`;
    return presentItem(rec, now);
  });

  add('GET', '/inventory/:id/movements', { perm: 'inventory.read' }, async ({ store, params }) => {
    await getOr404(store, 'inventory', params.id, 'Stock item');
    return store.find('movements', { item: params.id }, { sort: { at: -1, _id: -1 }, limit: 50 });
  });

  void idOf;
}
