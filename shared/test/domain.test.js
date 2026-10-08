import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  bmi, bmiCategory, vitalFlags, suggestPriority, labFlag, computeTotals, applyPayment, baseStatus, displayStatus, bedStats, wardOccupancy,
  planDispense, receiveBatch, stockOf, stockStatus, expiryStatus, suggestSlots, availabilityIssue, findOverlap, queueOrder, tokenLabel, waitMinutes,
  dayKey, dayStart, suggestQty, topDiagnoses, revenueByDay, dailyVisits, daysStayed, lineAmount, doctorWorkload, billingSummary, DAY, MIN,
} from '../domain.js';

test('BMI and category', () => {
  assert.equal(bmi(70, 165), 25.7);
  assert.equal(bmi(0, 165), null);
  assert.equal(bmi(70, undefined), null);
  assert.equal(bmiCategory(17), 'underweight');
  assert.equal(bmiCategory(22), 'normal');
  assert.equal(bmiCategory(27), 'overweight');
  assert.equal(bmiCategory(31), 'obese');
});

test('vital sign flags and triage suggestion', () => {
  assert.deepEqual(vitalFlags({ systolic: 120, diastolic: 80, pulse: 72, tempC: 36.8, spo2: 98 }), { bp: 'normal', pulse: 'normal', tempC: 'normal', spo2: 'normal' });
  assert.equal(vitalFlags({ systolic: 150, diastolic: 95 }).bp, 'high');
  assert.equal(vitalFlags({ systolic: 190, diastolic: 100 }).bp, 'critical');
  assert.equal(vitalFlags({ systolic: 85, diastolic: 55 }).bp, 'low');
  assert.equal(vitalFlags({ pulse: 120 }).pulse, 'high');
  assert.equal(vitalFlags({ tempC: 38.4 }).tempC, 'high');
  assert.equal(vitalFlags({ spo2: 88 }).spo2, 'critical');
  assert.equal(vitalFlags({ spo2: 93 }).spo2, 'low');
  assert.equal(suggestPriority({ systolic: 120, diastolic: 80, spo2: 98 }), 'routine');
  assert.equal(suggestPriority({ systolic: 150, diastolic: 95 }), 'urgent');
  assert.equal(suggestPriority({ spo2: 85 }), 'emergency');
});

test('lab result flags use reference and critical ranges', () => {
  const r = { low: 10, high: 20, critLow: 5, critHigh: 40 };
  assert.deepEqual(labFlag(15, r), { flag: 'normal', abnormal: false, critical: false });
  assert.deepEqual(labFlag(10, r), { flag: 'normal', abnormal: false, critical: false });
  assert.deepEqual(labFlag(8, r), { flag: 'low', abnormal: true, critical: false });
  assert.deepEqual(labFlag(25, r), { flag: 'high', abnormal: true, critical: false });
  assert.deepEqual(labFlag(4, r), { flag: 'critical_low', abnormal: true, critical: true });
  assert.deepEqual(labFlag(41, r), { flag: 'critical_high', abnormal: true, critical: true });
  assert.equal(labFlag('abc', r).flag, 'normal');
  assert.equal(labFlag(3, { high: 5 }).flag, 'normal');
});

test('billing totals: discount, tax and cent rounding', () => {
  assert.deepEqual(computeTotals({ lines: [{ qty: 2, unitPrice: 10 }, { qty: 1, unitPrice: 5.5 }] }), { subtotal: 25.5, discountAmount: 0, taxable: 25.5, tax: 0, total: 25.5 });
  const pct = computeTotals({ lines: [{ qty: 1, unitPrice: 200 }], discount: { type: 'percent', value: 10 }, taxRate: 5 });
  assert.deepEqual(pct, { subtotal: 200, discountAmount: 20, taxable: 180, tax: 9, total: 189 });
  const amt = computeTotals({ lines: [{ qty: 3, unitPrice: 0.1 }], discount: { type: 'amount', value: 100 } });
  assert.equal(amt.discountAmount, 0.3, 'a flat discount cannot exceed the subtotal');
  assert.equal(amt.total, 0);
  assert.equal(computeTotals({ lines: [{ qty: 3, unitPrice: 0.1 }] }).subtotal, 0.3, 'no floating point drift');
  assert.equal(computeTotals({ lines: [{ qty: 1, unitPrice: 33.33 }], taxRate: 7.5 }).total, 35.83);
  assert.equal(lineAmount({ qty: 1.5, unitPrice: 19.99 }), 29.99);
  assert.equal(computeTotals({ lines: [{ qty: 1, unitPrice: 100 }], discount: { type: 'percent', value: 250 } }).total, 0, 'percent is capped at 100');
});

test('payments, partial/paid/overdue statuses', () => {
  const inv = { total: 100, paid: 0 };
  assert.deepEqual(applyPayment(inv, 40), { paid: 40, balance: 60, status: 'partial' });
  assert.deepEqual(applyPayment({ total: 100, paid: 40 }, 60), { paid: 100, balance: 0, status: 'paid' });
  assert.throws(() => applyPayment(inv, 0), RangeError);
  assert.throws(() => applyPayment(inv, -5), RangeError);
  assert.throws(() => applyPayment(inv, 100.01), /more than the balance/);
  assert.equal(baseStatus({ total: 50, paid: 0 }), 'unpaid');
  assert.equal(baseStatus({ total: 50, paid: 10 }), 'partial');
  assert.equal(baseStatus({ total: 50, paid: 50 }), 'paid');
  assert.equal(baseStatus({ total: 50, paid: 0, voided: true }), 'void');
  const now = new Date('2026-10-10T00:00:00Z');
  assert.equal(displayStatus({ status: 'unpaid', dueDate: '2026-10-01T00:00:00Z' }, now), 'overdue');
  assert.equal(displayStatus({ status: 'partial', dueDate: '2026-10-01T00:00:00Z' }, now), 'overdue');
  assert.equal(displayStatus({ status: 'paid', dueDate: '2026-10-01T00:00:00Z' }, now), 'paid');
  assert.equal(displayStatus({ status: 'unpaid', dueDate: '2026-10-20T00:00:00Z' }, now), 'unpaid');
  assert.equal(displayStatus({ status: 'void', dueDate: '2026-10-01T00:00:00Z' }, now), 'void');
  assert.deepEqual(billingSummary([{ status: 'unpaid', total: 100, paid: 0, dueDate: '2026-10-01T00:00:00Z' }, { status: 'paid', total: 50, paid: 50, dueDate: '2026-10-01T00:00:00Z' }], now), { billed: 150, collected: 50, outstanding: 100, overdueCount: 1 });
});

test('bed occupancy ignores beds under maintenance', () => {
  const beds = [{ status: 'occupied' }, { status: 'occupied' }, { status: 'available' }, { status: 'cleaning' }, { status: 'maintenance' }];
  assert.deepEqual(bedStats(beds), { total: 5, available: 1, occupied: 2, cleaning: 1, maintenance: 1, occupancyPct: 50 });
  assert.equal(bedStats([]).occupancyPct, 0);
  assert.equal(bedStats([{ status: 'maintenance' }]).occupancyPct, 0);
  const rows = wardOccupancy([{ _id: 'w1', name: 'A', type: 'general' }], [{ ward: 'w1', status: 'occupied' }, { ward: 'w2', status: 'available' }]);
  assert.equal(rows[0].total, 1);
  assert.equal(rows[0].occupancyPct, 100);
  assert.equal(daysStayed('2026-10-01T10:00:00Z', '2026-10-01T12:00:00Z'), 1);
  assert.equal(daysStayed('2026-10-01T10:00:00Z', '2026-10-03T09:00:00Z'), 2);
  assert.equal(daysStayed('2026-10-01T10:00:00Z', '2026-10-03T11:00:00Z'), 3);
});

test('stock: first-expiry-first-out dispensing, expiry and reorder status', () => {
  const now = new Date('2026-10-08T00:00:00Z');
  const item = { name: 'X', reorderLevel: 10, batches: [
    { lot: 'late', qty: 20, expiry: '2027-06-01T00:00:00Z' },
    { lot: 'soon', qty: 5, expiry: '2026-11-01T00:00:00Z' },
    { lot: 'dead', qty: 9, expiry: '2026-09-01T00:00:00Z' },
  ] };
  assert.equal(stockOf(item, now), 25, 'expired lots are not sellable');
  assert.equal(stockStatus(item, now), 'ok');
  assert.equal(expiryStatus(item, now), 'expired');
  const plan = planDispense(item, 8, now);
  assert.deepEqual(plan.used, [{ lot: 'soon', qty: 5 }, { lot: 'late', qty: 3 }]);
  assert.deepEqual(plan.batches.map((b) => [b.lot, b.qty]), [['late', 17], ['dead', 9]]);
  assert.throws(() => planDispense(item, 26, now), /Not enough stock/);
  assert.throws(() => planDispense(item, 0, now), RangeError);
  assert.throws(() => planDispense(item, 1.5, now), RangeError);
  assert.equal(stockStatus({ reorderLevel: 10, batches: [{ lot: 'a', qty: 10, expiry: '2027-01-01T00:00:00Z' }] }, now), 'low');
  assert.equal(stockStatus({ reorderLevel: 10, batches: [] }, now), 'out');
  assert.equal(expiryStatus({ batches: [{ lot: 'a', qty: 1, expiry: '2026-11-15T00:00:00Z' }] }, now), 'expiring');
  assert.equal(expiryStatus({ batches: [{ lot: 'a', qty: 1, expiry: '2027-11-15T00:00:00Z' }] }, now), 'ok');
  const merged = receiveBatch({ batches: [{ lot: 'a', qty: 2, expiry: '2027-01-01T00:00:00.000Z' }] }, { lot: 'a', qty: 3, expiry: '2027-01-01T00:00:00Z' });
  assert.equal(merged.length, 1);
  assert.equal(merged[0].qty, 5);
  assert.equal(suggestQty('BD', 5), 10);
  assert.equal(suggestQty('TDS', 7), 21);
  assert.equal(suggestQty('nope', 7), 1);
});

test('queue ordering, token labels and waiting time', () => {
  const t = (seq, priority) => ({ seq, priority, issuedAt: '2026-10-08T09:00:00Z' });
  assert.deepEqual(queueOrder([t(1, 'routine'), t(2, 'emergency'), t(3, 'urgent'), t(4, 'routine'), t(5, 'urgent')]).map((x) => x.seq), [2, 3, 5, 1, 4]);
  assert.equal(tokenLabel(7), 'A007');
  assert.equal(tokenLabel(123), 'A123');
  assert.equal(waitMinutes({ issuedAt: '2026-10-08T09:00:00Z' }, new Date('2026-10-08T09:42:30Z')), 42);
  assert.equal(waitMinutes({ issuedAt: '2026-10-08T09:00:00Z', calledAt: '2026-10-08T09:10:00Z' }, new Date('2026-10-08T10:00:00Z')), 10);
});

test('day keys follow the timezone offset', () => {
  const d = new Date('2026-10-08T01:30:00Z');
  assert.equal(dayKey(d, 0), '2026-10-08');
  assert.equal(dayKey(d, 300), '2026-10-07', 'UTC-5 is still the previous evening');
  assert.equal(dayKey(d, -330), '2026-10-08');
  assert.equal(dayStart('2026-10-08', 300).toISOString(), '2026-10-08T05:00:00.000Z');
});

test('slot suggestions skip breaks, leave, busy times and the past', () => {
  const doctor = { workingDays: [4], startTime: '09:00', endTime: '12:00', slotMinutes: 60, breakStart: '10:00', breakEnd: '11:00', daysOff: [] };
  // 2026-10-08 is a Thursday
  const from = new Date('2026-10-08T00:00:00Z');
  const busy = [{ _id: 'a', date: '2026-10-08T11:00:00Z', duration: 60, status: 'scheduled' }];
  const slots = suggestSlots(doctor, busy, { from, days: 0, tz: 0 });
  assert.deepEqual(slots.map((s) => s.start.slice(11, 16)), ['09:00']);
  const free = suggestSlots(doctor, [], { from, days: 0, tz: 0 });
  assert.deepEqual(free.map((s) => s.start.slice(11, 16)), ['09:00', '11:00']);
  const cancelled = suggestSlots(doctor, [{ ...busy[0], status: 'cancelled' }], { from, days: 0, tz: 0 });
  assert.equal(cancelled.length, 2, 'cancelled bookings free the slot');
  assert.equal(suggestSlots(doctor, [], { from: new Date('2026-10-08T09:30:00Z'), days: 0 }).length, 1, 'past slots are skipped');
  assert.equal(suggestSlots({ ...doctor, daysOff: ['2026-10-08'] }, [], { from, days: 0 }).length, 0);
  assert.equal(suggestSlots(doctor, [], { from, days: 7 }).length, 4, 'next Thursday is included');
  assert.match(availabilityIssue(doctor, Date.parse('2026-10-09T09:00:00Z'), 30), /does not work/);
  assert.match(availabilityIssue(doctor, Date.parse('2026-10-08T08:00:00Z'), 30), /Outside working hours/);
  assert.match(availabilityIssue(doctor, Date.parse('2026-10-08T10:15:00Z'), 30), /break/);
  assert.equal(availabilityIssue(doctor, Date.parse('2026-10-08T09:00:00Z'), 30), '');
  assert.equal(availabilityIssue({ ...doctor, daysOff: ['2026-10-08'] }, Date.parse('2026-10-08T09:00:00Z'), 30), 'Doctor is on leave that day');
});

test('overlap check treats back-to-back as free', () => {
  const list = [{ _id: '1', date: '2026-10-08T09:00:00Z', duration: 30, status: 'scheduled' }];
  const at = (m) => Date.parse('2026-10-08T09:00:00Z') + m * MIN;
  assert.ok(findOverlap(list, at(15), 30));
  assert.ok(findOverlap(list, at(-15), 30));
  assert.ok(findOverlap(list, at(-60), 120));
  assert.equal(findOverlap(list, at(30), 30), undefined);
  assert.equal(findOverlap(list, at(-30), 30), undefined);
  assert.equal(findOverlap(list, at(15), 30, '1'), undefined, 'ignores the appointment being edited');
});

test('report helpers aggregate by day, diagnosis and doctor', () => {
  const now = new Date('2026-10-08T12:00:00Z');
  const visits = [
    { startedAt: '2026-10-08T08:00:00Z', doctor: 'd1', diagnoses: [{ name: 'Flu' }], consultStartedAt: '2026-10-08T08:00:00Z', completedAt: '2026-10-08T08:20:00Z' },
    { startedAt: '2026-10-08T09:00:00Z', doctor: 'd1', diagnoses: [{ name: 'Flu' }, { name: 'Asthma' }] },
    { startedAt: '2026-10-06T09:00:00Z', doctor: 'd2', diagnoses: [{ name: 'Asthma' }] },
  ];
  assert.deepEqual(dailyVisits(visits, { days: 3, now }), [{ date: '2026-10-06', visits: 1 }, { date: '2026-10-07', visits: 0 }, { date: '2026-10-08', visits: 2 }]);
  assert.deepEqual(topDiagnoses(visits), [{ name: 'Asthma', count: 2 }, { name: 'Flu', count: 2 }]);
  const load = doctorWorkload([{ _id: 'd1', name: 'A', specialty: 'x' }, { _id: 'd2', name: 'B', specialty: 'y' }], visits, [{ doctor: 'd1', date: '2026-10-09T08:00:00Z', status: 'scheduled' }, { doctor: 'd1', date: '2026-10-09T09:00:00Z', status: 'cancelled' }]);
  assert.deepEqual(load.map((r) => [r.name, r.visits, r.appointments, r.avgConsultMin]), [['A', 2, 1, 20], ['B', 1, 0, 0]]);
  const rev = revenueByDay([
    { status: 'partial', total: 100, issuedAt: '2026-10-07T10:00:00Z', payments: [{ amount: 40, at: '2026-10-08T10:00:00Z' }] },
    { status: 'void', total: 999, issuedAt: '2026-10-08T10:00:00Z', payments: [] },
  ], { days: 2, now });
  assert.deepEqual(rev, [{ date: '2026-10-07', collected: 0, billed: 100 }, { date: '2026-10-08', collected: 40, billed: 0 }]);
  assert.equal(DAY, 86400000);
});
