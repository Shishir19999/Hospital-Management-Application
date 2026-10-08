// One end-to-end clinical story, written against a tiny `call` function so it can run on the real
// Express + MongoDB server and on the in-browser preview engine. Both must behave identically.
import assert from 'node:assert/strict';

export async function runScenario(call, adminToken, tag = 'x') {
  const log = [];
  const t = {};
  const step = async (label, token, method, path, opts = {}, expectStatus) => {
    const res = await call(method, path, { token, ...opts });
    log.push(`${label}: ${res.status}`);
    if (expectStatus !== undefined) assert.equal(res.status, expectStatus, `${label} -> ${res.status} ${JSON.stringify(res.body).slice(0, 300)}`);
    return res.body;
  };

  // --- staff
  const doc = await step('add doctor', adminToken, 'POST', '/doctors/add', {
    body: { name: `Dr. Flow ${tag}`, specialty: 'Cardiology', fee: 40, workingDays: [0, 1, 2, 3, 4, 5, 6], startTime: '00:00', endTime: '23:30', slotMinutes: 30, breakStart: '', breakEnd: '' },
  }, 200);
  const roles = { doctor: { doctor: doc._id }, nurse: {}, receptionist: {}, pharmacist: {}, lab_tech: {} };
  for (const [role, extra] of Object.entries(roles)) {
    await step(`create ${role}`, adminToken, 'POST', '/auth/register', { body: { name: `${role} ${tag}`, email: `${role}.${tag}@flow.test`, password: 'secret12', role, ...extra } }, 201);
    const l = await step(`login ${role}`, null, 'POST', '/auth/login', { body: { email: `${role}.${tag}@flow.test`, password: 'secret12' } }, 200);
    t[role] = l.token;
  }
  t.admin = adminToken;

  // --- reference data
  const ward = await step('add ward', t.admin, 'POST', '/wards', { body: { name: `Ward ${tag}`, type: 'general', floor: 1, dailyRate: 50, beds: 2 } }, 201);
  const wards = await step('list wards', t.nurse, 'GET', '/wards', {}, 200);
  const beds = wards.wards.find((w) => w._id === ward._id).beds;
  assert.equal(beds.length, 2);
  const drug = await step('add stock', t.pharmacist, 'POST', '/inventory', {
    body: { name: `Flowcillin ${tag} 500 mg`, genericName: 'Flowcillin', category: 'Antibiotic', unit: 'capsule', price: 0.5, reorderLevel: 10, lot: 'F-1', qty: 30, expiry: new Date(Date.now() + 200 * 864e5).toISOString() },
  }, 201);
  assert.equal(drug.stock, 30);
  const penicillin = await step('add allergen stock', t.pharmacist, 'POST', '/inventory', {
    body: { name: `Penicillin V ${tag}`, unit: 'tablet', price: 0.4, reorderLevel: 5, lot: 'P-1', qty: 20, expiry: new Date(Date.now() + 100 * 864e5).toISOString() },
  }, 201);
  const test = await step('add lab test', t.admin, 'POST', '/labs/tests', { body: { code: `FT${tag}`.slice(0, 12), name: `Flow marker ${tag}`, category: 'Chemistry', unit: 'mg/dL', low: 10, high: 20, critHigh: 40, price: 15 } }, 201);

  // --- front desk
  const patient = await step('register patient', t.receptionist, 'POST', '/patients/add', { body: { name: `Flow Patient ${tag}`, age: 52, gender: 'Female', allergies: ['Penicillin'], phone: '+1 555 0100' } }, 200);
  assert.match(patient.mrn, /^MRN-\d{6}$/);
  await step('nurse cannot delete patient', t.nurse, 'DELETE', `/patients/delete/${patient._id}`, {}, 403);
  const slots = await step('doctor slots', t.receptionist, 'GET', `/doctors/${doc._id}/slots`, { query: { days: '3', duration: '30', tz: '0' } }, 200);
  assert.ok(slots.slots.length >= 3);
  const slot = slots.slots[1];
  const appt = await step('book appointment', t.receptionist, 'POST', '/appointments/add', { body: { patient: patient._id, doctor: doc._id, date: slot.start, duration: 30, reason: 'Chest discomfort' } }, 200);
  await step('overlap rejected', t.receptionist, 'POST', '/appointments/add', { body: { patient: patient._id, doctor: doc._id, date: slot.start, duration: 30 } }, 409);
  await step('doctor cannot book', t.doctor, 'POST', '/appointments/add', { body: { patient: patient._id, doctor: doc._id, date: slots.slots[2].start } }, 403);
  const token = await step('check in', t.receptionist, 'POST', `/appointments/${appt._id}/check-in`, {}, 201);
  assert.match(token.number, /^A\d{3}$/);
  await step('second token rejected', t.receptionist, 'POST', '/queue/issue', { body: { patient: patient._id } }, 409);

  // --- nurse triage
  const visit = await step('open visit with vitals', t.nurse, 'POST', '/visits', {
    body: { patient: patient._id, token: token._id, chiefComplaint: 'Chest discomfort', vitals: { systolic: 152, diastolic: 96, pulse: 88, tempC: 36.8, spo2: 97, weightKg: 70, heightCm: 165 } },
  }, 201);
  assert.equal(visit.vitals.bmi, 25.7);
  assert.equal(visit.flags.bp, 'high');
  assert.equal(visit.triagePriority, 'urgent');
  await step('bad vitals rejected', t.nurse, 'PATCH', `/visits/${visit._id}/triage`, { body: { vitals: { systolic: 80, diastolic: 90 } } }, 400);
  await step('receptionist cannot read visits', t.receptionist, 'GET', '/visits', {}, 403);
  const q1 = await step('queue as doctor', t.doctor, 'GET', '/queue', { query: { tz: '0' } }, 200);
  const mine = q1.tokens.find((x) => x._id === token._id);
  assert.equal(mine.priority, 'urgent');

  // --- doctor consult
  await step('call token', t.doctor, 'POST', `/queue/${token._id}/call`, {}, 200);
  await step('start consult', t.doctor, 'POST', `/queue/${token._id}/start`, {}, 200);
  await step('complete needs diagnosis', t.doctor, 'POST', `/visits/${visit._id}/complete`, {}, 400);
  await step('consult notes', t.doctor, 'PATCH', `/visits/${visit._id}/consult`, { body: { notes: 'Stable.', diagnoses: [{ code: 'I10', name: 'Essential hypertension' }] } }, 200);
  await step('nurse cannot write consult', t.nurse, 'PATCH', `/visits/${visit._id}/consult`, { body: { notes: 'no' } }, 403);
  await step('allergy blocks prescription', t.doctor, 'POST', '/prescriptions', {
    body: { visit: visit._id, items: [{ drug: `Penicillin V ${tag}`, inventoryItem: penicillin._id, dose: '250 mg', frequency: 'TDS', durationDays: 5 }] },
  }, 409);
  const rx = await step('prescribe', t.doctor, 'POST', '/prescriptions', {
    body: { visit: visit._id, items: [{ drug: drug.name, inventoryItem: drug._id, dose: '500 mg', frequency: 'BD', durationDays: 5, instructions: 'After food' }] },
  }, 201);
  assert.equal(rx.items[0].qty, 10);
  const orders = await step('order lab', t.doctor, 'POST', '/labs/orders', { body: { patient: patient._id, visit: visit._id, tests: [test._id], priority: 'urgent' } }, 201);
  assert.equal(orders.length, 1);
  await step('nurse cannot order lab', t.nurse, 'POST', '/labs/orders', { body: { patient: patient._id, tests: [test._id] } }, 403);

  // --- lab
  await step('result before collection', t.lab_tech, 'POST', `/labs/orders/${orders[0]._id}/result`, { body: { value: 25 } }, 409);
  await step('collect', t.lab_tech, 'POST', `/labs/orders/${orders[0]._id}/collect`, {}, 200);
  const res = await step('result', t.lab_tech, 'POST', `/labs/orders/${orders[0]._id}/result`, { body: { value: 25, comment: 'Repeat advised' } }, 200);
  assert.equal(res.flag, 'high');
  assert.equal(res.abnormal, true);
  const crit = await step('critical result', t.lab_tech, 'POST', `/labs/orders/${orders[0]._id}/result`, { body: { value: 45 } }, 200);
  assert.equal(crit.flag, 'critical_high');
  await step('doctor cannot enter result', t.doctor, 'POST', `/labs/orders/${orders[0]._id}/result`, { body: { value: 12 } }, 403);
  await step('review result', t.doctor, 'POST', `/labs/orders/${orders[0]._id}/review`, { body: {} }, 200);

  // --- pharmacy
  const pend = await step('pending prescriptions', t.pharmacist, 'GET', '/prescriptions', { query: { status: 'pending', limit: '100' } }, 200);
  assert.ok(pend.data.some((r) => r._id === rx._id));
  await step('doctor cannot dispense', t.doctor, 'POST', `/prescriptions/${rx._id}/dispense`, { body: {} }, 403);
  const disp = await step('dispense', t.pharmacist, 'POST', `/prescriptions/${rx._id}/dispense`, { body: {} }, 200);
  assert.equal(disp.status, 'dispensed');
  const after = await step('stock after dispense', t.pharmacist, 'GET', `/inventory/${drug._id}`, {}, 200);
  assert.equal(after.stock, 20);
  await step('dispense twice rejected', t.pharmacist, 'POST', `/prescriptions/${rx._id}/dispense`, { body: {} }, 409);
  const big = await step('prescribe more than stock', t.doctor, 'POST', '/prescriptions', {
    body: { visit: visit._id, items: [{ drug: drug.name, inventoryItem: drug._id, dose: '500 mg', frequency: 'QID', durationDays: 30 }] },
  }, 201);
  await step('insufficient stock', t.pharmacist, 'POST', `/prescriptions/${big._id}/dispense`, { body: {} }, 409);
  await step('adjust stock', t.pharmacist, 'POST', `/inventory/${drug._id}/adjust`, { body: { lot: 'F-1', delta: -2, reason: 'Damaged' } }, 200);
  await step('cancel unneeded rx', t.doctor, 'POST', `/prescriptions/${big._id}/cancel`, {}, 200);

  // --- finish the visit
  const done = await step('complete visit', t.doctor, 'POST', `/visits/${visit._id}/complete`, {}, 200);
  assert.equal(done.status, 'completed');
  const q2 = await step('queue after', t.nurse, 'GET', '/queue', { query: { tz: '0' } }, 200);
  assert.equal(q2.tokens.find((x) => x._id === token._id).status, 'done');
  await step('edit completed visit rejected', t.doctor, 'PATCH', `/visits/${visit._id}/consult`, { body: { notes: 'late' } }, 409);

  // --- billing
  const todo = await step('unbilled list', t.receptionist, 'GET', '/billing/unbilled', {}, 200);
  assert.ok(todo.visits.some((v) => v._id === visit._id));
  await step('nurse cannot see unbilled', t.nurse, 'GET', '/billing/unbilled', {}, 403);
  await step('nurse cannot bill', t.nurse, 'POST', `/invoices/from-visit/${visit._id}`, {}, 403);
  const inv = await step('invoice from visit', t.receptionist, 'POST', `/invoices/from-visit/${visit._id}`, { query: { taxRate: '10' } }, 201);
  // consult 40 + lab 15 + drug 10 x 0.5 = 60 ; tax 10% = 6 ; total 66
  assert.equal(inv.subtotal, 60);
  assert.equal(inv.total, 66);
  assert.equal(inv.status, 'unpaid');
  await step('duplicate invoice rejected', t.receptionist, 'POST', `/invoices/from-visit/${visit._id}`, {}, 409);
  await step('overpay rejected', t.receptionist, 'POST', `/invoices/${inv._id}/payments`, { body: { amount: 100, method: 'cash' } }, 400);
  const p1 = await step('part payment', t.receptionist, 'POST', `/invoices/${inv._id}/payments`, { body: { amount: 26, method: 'card', reference: 'T-1' } }, 200);
  assert.equal(p1.status, 'partial');
  assert.equal(p1.balance, 40);
  await step('pharmacist cannot pay', t.pharmacist, 'POST', `/invoices/${inv._id}/payments`, { body: { amount: 1, method: 'cash' } }, 403);
  const p2 = await step('final payment', t.receptionist, 'POST', `/invoices/${inv._id}/payments`, { body: { amount: 40, method: 'cash' } }, 200);
  assert.equal(p2.status, 'paid');
  assert.equal(p2.payments.length, 2);
  await step('edit paid invoice rejected', t.receptionist, 'PUT', `/invoices/${inv._id}`, { body: { notes: 'x' } }, 409);
  await step('receptionist cannot void', t.receptionist, 'POST', `/invoices/${inv._id}/void`, { body: { reason: 'x' } }, 403);
  const manual = await step('manual invoice', t.receptionist, 'POST', '/invoices', {
    body: { patient: patient._id, lines: [{ type: 'procedure', description: 'ECG', qty: 1, unitPrice: 18 }, { type: 'other', description: 'Dressing', qty: 2, unitPrice: 7.5 }], discount: { type: 'percent', value: 10 }, taxRate: 5, dueDate: new Date(Date.now() - 864e5).toISOString() },
  }, 201);
  assert.equal(manual.total, 31.19);
  assert.equal(manual.displayStatus, 'overdue');
  await step('void unpaid invoice', t.admin, 'POST', `/invoices/${manual._id}/void`, { body: { reason: 'Entered by mistake' } }, 200);

  // --- admission, transfer, discharge
  const adm = await step('admit', t.receptionist, 'POST', '/admissions', { body: { patient: patient._id, bed: beds[0]._id, doctor: doc._id, reason: 'Observation' } }, 201);
  await step('occupied bed rejected', t.nurse, 'POST', '/admissions', { body: { patient: patient._id, bed: beds[0]._id, doctor: doc._id, reason: 'x' } }, 409);
  await step('transfer', t.nurse, 'POST', `/admissions/${adm._id}/transfer`, { body: { bed: beds[1]._id, reason: 'Closer to station' } }, 200);
  await step('nurse cannot discharge', t.nurse, 'POST', `/admissions/${adm._id}/discharge`, { body: { summary: 'x' } }, 403);
  const out = await step('discharge', t.doctor, 'POST', `/admissions/${adm._id}/discharge`, { body: { summary: 'Stable, follow-up in a week.' } }, 200);
  assert.equal(out.charges.days, 1);
  const wardsAfter = await step('wards after', t.nurse, 'GET', '/wards', {}, 200);
  const mineBeds = wardsAfter.wards.find((w) => w._id === ward._id).beds;
  assert.deepEqual(mineBeds.map((b) => b.status), ['cleaning', 'cleaning']);
  await step('bed cleaned', t.admin, 'PATCH', `/beds/${beds[1]._id}`, { body: { status: 'available' } }, 200);
  const binv = await step('admission invoice', t.receptionist, 'POST', `/invoices/from-admission/${adm._id}`, {}, 201);
  assert.equal(binv.total, 50);

  // --- patient summary respects roles
  const sumDoc = await step('summary as doctor', t.doctor, 'GET', `/patients/${patient._id}/summary`, {}, 200);
  assert.ok(sumDoc.visits.length >= 1 && sumDoc.labs.length === 1 && sumDoc.prescriptions.length >= 1);
  assert.equal(sumDoc.invoices, undefined);
  const sumRec = await step('summary as receptionist', t.receptionist, 'GET', `/patients/${patient._id}/summary`, {}, 200);
  assert.equal(sumRec.visits, undefined);
  assert.ok(sumRec.invoices.length >= 2);

  // --- insight
  for (const p of ['/reports/summary', '/reports/daily-visits', '/reports/revenue', '/reports/bed-occupancy', '/reports/top-diagnoses', '/reports/doctor-workload']) {
    await step(`admin ${p}`, t.admin, 'GET', p, { query: { tz: '0' } }, 200);
    await step(`doctor blocked ${p}`, t.doctor, 'GET', p, {}, 403);
  }
  const audit = await step('audit log', t.admin, 'GET', '/audit', { query: { search: 'flow', limit: '100' } }, 200);
  assert.ok(audit.total >= 10, `audit entries ${audit.total}`);
  await step('audit forbidden', t.nurse, 'GET', '/audit', {}, 403);
  for (const role of ['admin', 'doctor', 'nurse', 'receptionist', 'pharmacist', 'lab_tech']) {
    await step(`dashboard ${role}`, t[role], 'GET', '/dashboard', { query: { tz: '0' } }, 200);
    await step(`notifications ${role}`, t[role], 'GET', '/notifications', {}, 200);
    await step(`search ${role}`, t[role], 'GET', '/search', { query: { q: 'Flow' } }, 200);
  }
  const srch = await step('search finds patient', t.nurse, 'GET', '/search', { query: { q: `Flow Patient ${tag}` } }, 200);
  assert.equal(srch.patients.length, 1);

  // --- cleanup rules
  await step('patient with records cannot be deleted', t.admin, 'DELETE', `/patients/delete/${patient._id}`, {}, 409);
  await step('disable own account blocked', t.admin, 'GET', '/users', { query: { search: tag } }, 200);
  return log;
}
