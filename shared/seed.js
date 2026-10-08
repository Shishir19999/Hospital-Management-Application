// Deterministic sample data: staff, doctors, ~200 patients, a month and a half of appointments, visits,
// prescriptions, lab orders, invoices, wards and beds, stock and today's live queue.
// Used by the server seed script and the browser-only preview.
import { SPECIALTIES, LAB_TESTS, DRUGS, WARDS, DIAGNOSES } from './catalog.js';
import { SAMPLE_ACCOUNTS } from './accounts.js';
import {
  MIN, DAY, addDaysKey, bmi, computeTotals, dayKey, dayStart, labFlag, lineAmount, baseStatus, suggestPriority, suggestQty, tokenLabel, weekday, daysStayed,
} from './domain.js';

function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const FIRST = ['Aarav', 'Maya', 'Liam', 'Sofia', 'Noah', 'Priya', 'Ethan', 'Amara', 'Lucas', 'Hana', 'Omar', 'Elena', 'Daniel', 'Zara', 'Mateo', 'Isla', 'Kenji', 'Nora', 'Samir', 'Chloe', 'Arjun', 'Leila', 'Owen', 'Tara', 'Mia', 'Rohan', 'Grace', 'Yusuf', 'Anika', 'Felix', 'Ines', 'Dev', 'Alina', 'Jonas', 'Rania', 'Mateus', 'Sana', 'Victor', 'Ayaan', 'Lucia', 'Hugo', 'Meera', 'Tomas', 'Esme', 'Kabir', 'Nadia', 'Theo', 'Ivy'];
const LAST = ['Sharma', 'Okafor', 'Novak', 'Reyes', 'Lindqvist', 'Haddad', 'Moreau', 'Tanaka', 'Fischer', 'Mbeki', 'Costa', 'Petrov', 'Bianchi', 'Karimi', 'Dubois', 'Walsh', 'Nakamura', 'Silva', 'Rahman', 'Jensen', 'Patel', 'Kowalski', 'Hassan', 'Ortiz', 'Berg', 'Khan', 'Rossi', 'Abebe', 'Singh', 'Martin', 'Ivanov', 'Cohen', 'Nguyen', 'Larsen', 'Mehta', 'Santos', 'Weber', 'Adeyemi', 'Kim', 'Duarte'];
const BLOOD = ['A+', 'A-', 'B+', 'B-', 'AB+', 'O+', 'O-', 'O+', 'A+', 'B+'];
const ALLERGIES = ['Penicillin', 'Sulfa', 'Aspirin', 'Latex', 'Peanuts', 'Ibuprofen'];
const CONDITIONS = ['Hypertension', 'Type 2 diabetes', 'Asthma', 'Seasonal allergies', 'Migraine', 'Hypothyroidism', 'Lower back pain', 'Anxiety', '', '', ''];
const NOTES = [
  'Examined and counselled. Symptoms improving on current plan.',
  'Reviewed vitals and history. Medication started as prescribed.',
  'Discussed lifestyle changes and diet. Review as advised.',
  'Investigations ordered; patient advised rest and fluids.',
  'Follow-up of earlier complaint. Dose adjusted.',
];
const PAY_METHODS = ['cash', 'card', 'upi', 'card', 'insurance'];
const FREQ = ['OD', 'BD', 'TDS', 'BD', 'OD'];

const pad = (n, w = 24) => n.toString(16).padStart(w, '0');

export function buildDataset({ now = new Date(), tz = 0, patients: nPatients = 200, doctors: nDoctors = 20, days = 30, seed = 20261008 } = {}) {
  const rnd = mulberry32(seed);
  const pick = (a) => a[Math.floor(rnd() * a.length)];
  const between = (a, b) => a + rnd() * (b - a);
  const int = (a, b) => Math.floor(between(a, b + 1));
  const nowMs = now.getTime();
  const iso = (ms) => new Date(ms).toISOString();
  let idn = 0;
  const oid = () => pad(++idn);

  const todayKey = dayKey(now, tz);
  const at = (offset, minutes) => dayStart(addDaysKey(todayKey, offset), tz).getTime() + minutes * MIN;
  const c = { users: [], patients: [], doctors: [], appointments: [], queue: [], visits: [], prescriptions: [], inventory: [], movements: [], labTests: [], labOrders: [], invoices: [], wards: [], beds: [], admissions: [], audit: [] };
  const seq = { patient: 0, visit: 0, rx: 0, lab: 0, invoice: 0, receipt: 0, admission: 0 };
  const stamp = (doc, ms) => ({ ...doc, createdAt: iso(ms), updatedAt: iso(ms) });
  const push = (col, doc, ms = nowMs) => {
    const rec = stamp({ _id: oid(), ...doc }, ms);
    c[col].push(rec);
    return rec;
  };

  // ---- lab catalogue, inventory, wards
  const labTests = LAB_TESTS.map((t) => push('labTests', { ...t }));
  const inv = DRUGS.map((d, i) => {
    const batches = [];
    const mode = i % 9; // a few items are low, out or about to expire
    const mk = (lot, qty, expiryDays) => batches.push({ lot, qty, expiry: iso(nowMs + expiryDays * DAY) });
    if (mode === 3) mk('L-' + (100 + i), Math.floor(d.reorderLevel * 0.6), 220);
    else if (mode === 6) { mk('L-' + (100 + i), 0, 220); }
    else if (mode === 7) { mk('L-' + (200 + i), d.reorderLevel * 3, 25); mk('L-' + (100 + i), d.reorderLevel * 2, 300); }
    else if (mode === 8) { mk('L-' + (90 + i), 14, -12); mk('L-' + (100 + i), d.reorderLevel * 3, 400); }
    else { mk('L-' + (100 + i), d.reorderLevel * 2 + int(20, 200), 150 + int(0, 500)); mk('L-' + (300 + i), int(40, 200), 300 + int(0, 400)); }
    return push('inventory', { ...d, sku: `SKU-${1000 + i}`, batches: batches.filter((b) => b.qty > 0 || mode === 6) });
  });
  inv.forEach((it) => { it.batches = it.batches.filter((b) => b.qty > 0); });

  const wards = WARDS.map((w) => push('wards', { name: w.name, type: w.type, floor: w.floor, dailyRate: w.dailyRate }));
  const beds = [];
  WARDS.forEach((w, wi) => {
    const tag = w.name.replace(/[^A-Za-z0-9]/g, '').slice(0, 3).toUpperCase();
    for (let i = 1; i <= w.beds; i++) beds.push(push('beds', { ward: wards[wi]._id, label: `${tag}-${String(i).padStart(2, '0')}`, status: 'available', admission: null }));
  });

  // ---- staff and doctors
  const fixedDoctors = [['Dr. Priya Nair', 'Family Medicine'], ['Dr. Rahul Mehta', 'Cardiology'], ['Dr. Sara Khan', 'Dermatology']];
  const doctors = [];
  for (let i = 0; i < nDoctors; i++) {
    const [name, specialty] = fixedDoctors[i] || [`Dr. ${FIRST[(i * 5 + 3) % FIRST.length]} ${LAST[(i * 3 + 1) % LAST.length]}`, SPECIALTIES[(i * 7) % SPECIALTIES.length]];
    const sat = i % 5 === 4;
    doctors.push(push('doctors', {
      name, specialty, history: [], fee: 25 + ((i * 7) % 9) * 5, room: `R-${100 + i}`,
      workingDays: sat ? [1, 2, 3, 4, 5, 6] : i % 4 === 3 ? [1, 2, 3, 4] : [1, 2, 3, 4, 5],
      startTime: i % 3 === 0 ? '08:30' : '09:00', endTime: i % 3 === 2 ? '16:30' : '17:00', slotMinutes: i % 6 === 5 ? 20 : 30,
      breakStart: '13:00', breakEnd: '14:00', daysOff: [addDaysKey(todayKey, 6 + (i % 4))],
    }));
  }
  const userDoc = (a, extra = {}) => push('users', { name: a.name, email: a.email, password: a.password, role: a.role, doctor: null, active: true, tokenVersion: 0, readNotifications: [], ...extra });
  const staff = {};
  for (const a of SAMPLE_ACCOUNTS) staff[a.role] = userDoc(a, a.role === 'doctor' ? { doctor: doctors[0]._id } : {});
  userDoc({ name: 'Dr. Rahul Mehta', email: 'doctor2@example.com', password: 'Doctor@123', role: 'doctor' }, { doctor: doctors[1]._id });
  userDoc({ name: 'Nina Nurse', email: 'nurse2@example.com', password: 'Nurse@123', role: 'nurse' });
  userDoc({ name: 'Ravi Reception', email: 'receptionist2@example.com', password: 'Reception@123', role: 'receptionist' });

  // ---- patients
  const bodyOf = new Map();
  const patients = Array.from({ length: nPatients }, (_, i) => {
    const first = FIRST[i % FIRST.length];
    const last = LAST[(i * 7 + 2) % LAST.length];
    const age = Math.min(94, Math.round(2 + rnd() * rnd() * 60 + rnd() * 35));
    const gender = rnd() < 0.49 ? 'Female' : rnd() < 0.96 ? 'Male' : 'Other';
    const p = push('patients', {
      name: `${first} ${last}`, age, gender, mrn: `MRN-${String(++seq.patient).padStart(6, '0')}`,
      phone: `+1 555 01${String(10 + (i % 90)).padStart(2, '0')}`, email: `${first}.${last}${i + 1}@example.com`.toLowerCase(),
      bloodGroup: pick(BLOOD), allergies: rnd() < 0.18 ? [pick(ALLERGIES)] : [], conditions: pick(CONDITIONS),
      address: `${int(10, 990)} Maple Street`, emergencyContact: `${pick(FIRST)} ${last} +1 555 02${String(10 + (i % 90)).padStart(2, '0')}`, doctor: rnd() < 0.5 ? pick(doctors)._id : null,
    }, at(-days - int(0, 300), 600));
    const h = gender === 'Female' ? between(152, 175) : between(162, 190);
    bodyOf.set(p._id, { h: age < 14 ? 80 + age * 6 : h, w: age < 14 ? 10 + age * 2.6 : between(48, 105) });
    return p;
  });
  const popular = patients.slice(0, 30);
  const anyPatient = () => (rnd() < 0.35 ? pick(popular) : pick(patients));

  // ---- builders
  const makeVitals = (patient, diag) => {
    const b = bodyOf.get(patient._id);
    const fever = diag.code === 'B34' || diag.code === 'J06' || diag.code === 'A09';
    const htn = diag.code === 'I10';
    const v = {
      systolic: int(htn ? 135 : 104, htn ? 172 : 138), diastolic: int(htn ? 84 : 64, htn ? 104 : 88), pulse: int(58, fever ? 112 : 98),
      tempC: Math.round(between(fever ? 37.6 : 36.2, fever ? 39.4 : 37.2) * 10) / 10, spo2: int(diag.code === 'J45' ? 91 : 95, 99), respRate: int(13, fever ? 24 : 19),
      weightKg: Math.round(b.w * 10) / 10, heightCm: Math.round(b.h),
    };
    if (rnd() < 0.02) { v.spo2 = 88; v.pulse = 131; }
    return { ...v, bmi: bmi(v.weightKg, v.heightCm) };
  };

  const makeLabValue = (t) => {
    const r = rnd();
    const span = (t.high ?? 0) - (t.low ?? 0) || 1;
    if (r < 0.78) return Math.round(between(t.low ?? 0, t.high ?? span) * 10) / 10;
    if (r < 0.96 || (t.critHigh == null && t.critLow == null)) {
      return Math.round((t.low > 0 && rnd() < 0.4 ? t.low - span * between(0.05, 0.3) : (t.high ?? 0) + span * between(0.05, 0.4)) * 10) / 10;
    }
    return t.critHigh != null ? Math.round((t.critHigh + span * 0.1) * 10) / 10 : Math.round(((t.critLow ?? 0) - span * 0.1) * 10) / 10;
  };

  const makeInvoice = ({ patient, visit, admission, lines, issuedMs, forceStatus, taxRate = rnd() < 0.5 ? 5 : 0, by }) => {
    const mapped = lines.map((l) => ({ ...l, amount: lineAmount(l) }));
    const discount = rnd() < 0.12 ? { type: 'percent', value: 10 } : null;
    const t = computeTotals({ lines: mapped, discount, taxRate });
    const r = forceStatus || (rnd() < 0.72 ? 'paid' : rnd() < 0.5 ? 'partial' : 'unpaid');
    const payments = [];
    let paid = 0;
    const payAt = Math.min(nowMs - MIN, issuedMs + int(0, 3 * 24 * 60) * MIN);
    if (r === 'paid' || r === 'partial') {
      const amount = r === 'paid' ? t.total : Math.round(t.total * between(0.3, 0.6) * 100) / 100;
      if (amount > 0) {
        payments.push({ receiptNo: `RCT-${String(++seq.receipt).padStart(6, '0')}`, amount, method: pick(PAY_METHODS), reference: '', at: iso(payAt), by: staff.receptionist.name });
        paid = amount;
      }
    }
    return push('invoices', {
      invoiceNo: `INV-${String(++seq.invoice).padStart(6, '0')}`, patient, visit: visit || null, admission: admission || null,
      lines: mapped, discount, taxRate, subtotal: t.subtotal, discountAmount: t.discountAmount, tax: t.tax, total: t.total,
      payments, paid, status: baseStatus({ total: t.total, paid }), issuedAt: iso(issuedMs), dueDate: iso(issuedMs + 14 * DAY), notes: '', createdBy: by || staff.receptionist.name,
    }, issuedMs);
  };

  // A full clinical encounter. `state` controls how far it has progressed: done | triage | consult
  const makeVisit = ({ patient, doctor, startMs, appointment = null, token = null, state = 'done', recent = false }) => {
    const diag = pick(DIAGNOSES);
    const vitals = makeVitals(patient, diag);
    const consultStart = startMs + int(8, 20) * MIN;
    const completedMs = state === "done" ? Math.min(consultStart + int(12, 35) * MIN, nowMs - MIN) : null;
    const visit = push('visits', {
      visitNo: `V-${String(++seq.visit).padStart(6, '0')}`, patient: patient._id, doctor: doctor._id, appointment, token,
      status: state === 'done' ? 'completed' : state === 'triage' ? 'triage' : 'in_consult',
      chiefComplaint: diag.complaint, vitals, triagePriority: suggestPriority(vitals), triageNotes: '', triageBy: staff.nurse.name, triageAt: iso(startMs + 3 * MIN),
      notes: state === 'done' ? pick(NOTES) : '', plan: state === 'done' ? 'Medication as prescribed. Return if symptoms worsen.' : '',
      diagnoses: state === 'done' ? [{ code: diag.code, name: diag.name }] : [], followUpDate: state === 'done' && rnd() < 0.3 ? iso(startMs + int(7, 30) * DAY) : null,
      startedAt: iso(startMs), consultStartedAt: state === 'triage' ? null : iso(consultStart), completedAt: completedMs ? iso(completedMs) : null, createdBy: staff.nurse.name,
    }, startMs);
    if (!doctor.history.includes(patient._id)) doctor.history.push(patient._id);
    if (state === 'triage') return { visit, diag };

    const lines = [];
    if (doctor.fee > 0) lines.push({ type: 'consultation', description: `Consultation - ${doctor.name}`, qty: 1, unitPrice: doctor.fee });
    const issuedAt = (completedMs || consultStart) + 5 * MIN;

    // labs
    if (diag.tests.length && rnd() < 0.45) {
      const picks = diag.tests.slice(0, int(1, Math.min(3, diag.tests.length)));
      for (const code of picks) {
        const t = labTests.find((x) => x.code === code);
        const stage = state === 'done' ? (recent && rnd() < 0.3 ? pick(['ordered', 'collected', 'resulted']) : 'resulted') : pick(['ordered', 'collected']);
        const range = { low: t.low, high: t.high, critLow: t.critLow, critHigh: t.critHigh };
        const value = stage === 'resulted' ? makeLabValue(t) : null;
        const f = value === null ? { flag: null, abnormal: false, critical: false } : labFlag(value, range);
        const orderedMs = consultStart + 4 * MIN;
        push('labOrders', {
          orderNo: `LAB-${String(++seq.lab).padStart(6, '0')}`, patient: patient._id, doctor: doctor._id, visit: visit._id, test: t._id, testCode: t.code, testName: t.name, unit: t.unit, price: t.price, range,
          priority: rnd() < 0.12 ? 'urgent' : 'routine', note: '', status: stage, orderedAt: iso(orderedMs), orderedBy: doctor.name,
          collectedAt: stage === 'ordered' ? null : iso(orderedMs + 20 * MIN), collectedBy: stage === 'ordered' ? '' : staff.lab_tech.name,
          resultedAt: stage === 'resulted' ? iso(orderedMs + 90 * MIN) : null, resultedBy: stage === 'resulted' ? staff.lab_tech.name : '', value, ...f, comment: '',
          reviewed: stage === 'resulted' && !recent, reviewedAt: stage === 'resulted' && !recent ? iso(orderedMs + 6 * 60 * MIN) : null, reviewedBy: stage === 'resulted' && !recent ? doctor.name : '',
        }, orderedMs);
        lines.push({ type: 'lab', description: t.name, qty: 1, unitPrice: t.price });
      }
    }

    // prescription
    if (rnd() < 0.72) {
      const picks = diag.drugs.slice(0, int(1, 2));
      const status = state !== 'done' ? 'issued' : recent && rnd() < 0.5 ? 'issued' : rnd() < 0.08 ? 'partial' : 'dispensed';
      const items = picks.map((di) => {
        const drug = DRUGS[di];
        const stock = inv[di];
        const frequency = pick(FREQ);
        const durationDays = pick([3, 5, 7, 7, 10, 14, 30]);
        const qty = drug.unit === 'inhaler' || drug.unit === 'tube' ? 1 : suggestQty(frequency, durationDays);
        const dispensedQty = status === 'dispensed' ? qty : status === 'partial' ? Math.floor(qty / 2) : 0;
        if (dispensedQty) lines.push({ type: 'pharmacy', description: `${drug.name} x ${dispensedQty}`, qty: dispensedQty, unitPrice: drug.price });
        return { drug: drug.name, inventoryItem: stock._id, dose: drug.unit === 'tablet' || drug.unit === 'capsule' ? '1 ' + drug.unit : '1 ' + drug.unit, frequency, durationDays, instructions: pick(['After food', 'Before food', 'With water', '']), qty, dispensedQty, ...(dispensedQty ? { unitPrice: drug.price } : {}) };
      });
      push('prescriptions', {
        rxNo: `RX-${String(++seq.rx).padStart(6, '0')}`, patient: patient._id, doctor: doctor._id, visit: visit._id, items, notes: '', status,
        issuedAt: iso(consultStart + 10 * MIN), dispensedAt: status === 'dispensed' ? iso(consultStart + 40 * MIN) : null, dispensedBy: status === 'issued' ? '' : staff.pharmacist.name, allergyOverride: false,
      }, consultStart);
    }

    if (state === 'done' && rnd() < 0.9) makeInvoice({ patient: patient._id, visit: visit._id, lines, issuedMs: issuedAt, by: staff.receptionist.name });
    return { visit, diag };
  };

  // ---- the past days and today
  const ordered = [...doctors];
  for (let off = -days; off <= 14; off++) {
    const key = addDaysKey(todayKey, off);
    const dow = weekday(key);
    for (let di = 0; di < ordered.length; di++) {
      const doc = ordered[di];
      if (!doc.workingDays.includes(dow) || doc.daysOff.includes(key)) continue;
      const busy = di === 0 ? 3 : di === 1 ? 2 : 1;
      const top = di < 2;
      const count = off < 0 ? (top ? int(busy - 1, busy) : rnd() < 0.35 ? 1 : 0) : off === 0 ? (top ? busy : rnd() < 0.5 ? 1 : 0) : int(0, top ? 3 : 1);
      const startMin = Number(doc.startTime.slice(0, 2)) * 60 + Number(doc.startTime.slice(3));
      const used = new Set();
      for (let k = 0; k < count; k++) {
        const slot = int(0, 11);
        const m = startMin + slot * doc.slotMinutes;
        if (m >= 13 * 60 - 0 && m < 14 * 60) continue;
        if (m + doc.slotMinutes > Number(doc.endTime.slice(0, 2)) * 60) continue;
        if (used.has(slot)) continue;
        used.add(slot);
        const startMs = at(off, m);
        const patient = anyPatient();
        const past = startMs < nowMs - 30 * MIN;
        let status = 'scheduled';
        if (past) status = rnd() < 0.86 ? 'completed' : rnd() < 0.5 ? 'cancelled' : 'no_show';
        else if (startMs < nowMs + 30 * MIN && off === 0) status = 'checked_in';
        else if (rnd() < 0.05) status = 'cancelled';
        const appt = push('appointments', { patient: patient._id, doctor: doc._id, date: iso(startMs), duration: doc.slotMinutes, status, reason: pick(DIAGNOSES).complaint, notes: '' }, Math.min(nowMs, startMs - 2 * DAY));
        if (status === 'completed') makeVisit({ patient, doctor: doc, startMs: startMs + 2 * MIN, appointment: appt._id, state: 'done', recent: off >= -1 });
      }
      // walk-ins on past days
      if (off < 0 && di < 3 && rnd() < 0.5) {
        const m = startMin + int(0, 9) * 30;
        makeVisit({ patient: anyPatient(), doctor: doc, startMs: at(off, m + 10), state: 'done', recent: off >= -1 });
      }
    }
  }

  // ---- today's live queue (tokens issued in the last couple of hours)
  const q = [];
  const mkToken = (patient, doctor, minutesAgo, priority, status, reason) => {
    const issuedMs = nowMs - minutesAgo * MIN;
    const seqNo = q.length + 1;
    const tok = push('queue', {
      day: todayKey, seq: seqNo, number: tokenLabel(seqNo), patient: patient._id, doctor: doctor ? doctor._id : null, appointment: null, priority, status, reason,
      issuedAt: iso(issuedMs), calledAt: null, startedAt: null, completedAt: null, visit: null, room: doctor ? doctor.room : '',
    }, issuedMs);
    q.push(tok);
    return tok;
  };
  const used = new Set();
  const freshPatient = () => {
    let p;
    let guard = 0;
    do p = pick(patients); while (used.has(p._id) && ++guard < 200);
    used.add(p._id);
    return p;
  };
  const drA = doctors[0];
  const drB = doctors[1];
  // done earlier today
  for (const [doc, ago] of [[drA, 190], [drB, 170], [drA, 150]]) {
    const p = freshPatient();
    const tok = mkToken(p, doc, ago, 'routine', 'done', pick(DIAGNOSES).complaint);
    const { visit } = makeVisit({ patient: p, doctor: doc, startMs: nowMs - (ago - 10) * MIN, token: tok._id, state: 'done', recent: true });
    Object.assign(tok, { calledAt: iso(nowMs - (ago - 8) * MIN), startedAt: iso(nowMs - (ago - 10) * MIN), completedAt: visit.completedAt, visit: visit._id });
  }
  // in consultation now
  {
    const p = freshPatient();
    const tok = mkToken(p, drA, 55, 'routine', 'in_consult', 'Fever and body ache');
    const { visit } = makeVisit({ patient: p, doctor: drA, startMs: nowMs - 40 * MIN, token: tok._id, state: 'consult' });
    Object.assign(tok, { calledAt: iso(nowMs - 22 * MIN), startedAt: iso(nowMs - 20 * MIN), visit: visit._id });
  }
  // called, waiting for them to walk in
  {
    const p = freshPatient();
    const tok = mkToken(p, drB, 35, 'urgent', 'called', 'Chest tightness on climbing stairs');
    tok.calledAt = iso(nowMs - 2 * MIN);
  }
  // waiting: one with vitals taken, a few without
  {
    const p = freshPatient();
    const tok = mkToken(p, drA, 30, 'routine', 'waiting', 'Follow-up visit');
    const { visit } = makeVisit({ patient: p, doctor: drA, startMs: nowMs - 24 * MIN, token: tok._id, state: 'triage' });
    tok.visit = visit._id;
  }
  mkToken(freshPatient(), drA, 24, 'emergency', 'waiting', 'Severe breathlessness');
  mkToken(freshPatient(), drB, 17, 'routine', 'waiting', 'Skin rash for a week');
  mkToken(freshPatient(), null, 12, 'urgent', 'waiting', 'High fever since last night');
  mkToken(freshPatient(), drA, 6, 'routine', 'waiting', 'Blood pressure check');
  mkToken(freshPatient(), doctors[2], 3, 'routine', 'waiting', 'Itchy skin');
  mkToken(freshPatient(), null, 20, 'routine', 'skipped', 'Not at the desk when called');
  if (q.length) c.queue.sort((a, b) => a.seq - b.seq);

  // ---- admissions: current inpatients and recent discharges
  const beds0 = beds.filter((b) => !['ICU'].includes(b.label.slice(0, 3)));
  const occupy = (wardIdx, count, dischargedOnly = false) => {
    const wardBeds = beds.filter((b) => b.ward === wards[wardIdx]._id);
    void beds0;
    for (let i = 0; i < count && i < wardBeds.length; i++) {
      const bed = wardBeds[i];
      const p = freshPatient();
      const doc = pick(doctors.slice(0, 8));
      const diag = pick(DIAGNOSES);
      const admitMs = nowMs - int(2, 6 * 24) * 60 * MIN;
      const adm = push('admissions', {
        admissionNo: `ADM-${String(++seq.admission).padStart(6, '0')}`, patient: p._id, doctor: doc._id, ward: wards[wardIdx]._id, bed: bed._id,
        reason: diag.complaint, diagnosis: diag.name, status: dischargedOnly ? 'discharged' : 'admitted', admittedAt: iso(admitMs), dischargedAt: null,
        transfers: [], dischargeSummary: '', admittedBy: staff.nurse.name,
      }, admitMs);
      if (!dischargedOnly) { bed.status = 'occupied'; bed.admission = adm._id; }
    }
  };
  occupy(0, 7); occupy(1, 5); occupy(2, 4); occupy(3, 5); occupy(4, 4); occupy(5, 2);
  beds.find((b) => b.ward === wards[0]._id && b.status === 'available').status = 'cleaning';
  beds.filter((b) => b.ward === wards[1]._id && b.status === 'available').slice(0, 1).forEach((b) => { b.status = 'maintenance'; });
  // discharged stays (with bed-charge invoices)
  for (let i = 0; i < 12; i++) {
    const p = freshPatient();
    const doc = pick(doctors.slice(0, 8));
    const wi = i % 4;
    const bed = beds.find((b) => b.ward === wards[wi]._id);
    const stay = int(2, 7);
    const dischargeMs = nowMs - int(1, 38) * DAY;
    const admitMs = dischargeMs - stay * DAY;
    const diag = pick(DIAGNOSES);
    const adm = push('admissions', {
      admissionNo: `ADM-${String(++seq.admission).padStart(6, '0')}`, patient: p._id, doctor: doc._id, ward: wards[wi]._id, bed: bed._id, reason: diag.complaint, diagnosis: diag.name,
      status: 'discharged', admittedAt: iso(admitMs), dischargedAt: iso(dischargeMs), transfers: [], dischargeSummary: 'Recovered well. Medication and follow-up advice given.', dischargeType: 'routine', admittedBy: staff.nurse.name,
    }, admitMs);
    const d = daysStayed(admitMs, dischargeMs);
    makeInvoice({ patient: p._id, admission: adm._id, lines: [{ type: 'bed', description: `Bed charges - ${wards[wi].name} (${d} days)`, qty: d, unitPrice: wards[wi].dailyRate }], issuedMs: dischargeMs, taxRate: 0, by: staff.receptionist.name });
  }

  // ---- stock movements (opening stock) and a short audit trail
  inv.forEach((it) => it.batches.forEach((b) => push('movements', { item: it._id, itemName: it.name, type: 'receive', qty: b.qty, lot: b.lot, reason: 'Opening stock', ref: '', by: staff.pharmacist.name, at: iso(nowMs - 30 * DAY) }, nowMs - 30 * DAY)));
  const auditRows = [];
  const actors = { visits: staff.doctor, billing: staff.receptionist, labs: staff.lab_tech, pharmacy: staff.pharmacist, patients: staff.receptionist };
  const sample = (col, n, action, entity, role, text) => {
    const rows = [...c[col]].sort(() => rnd() - 0.5).slice(0, n);
    for (const r of rows) {
      const a = actors[role] || staff.admin;
      auditRows.push({ at: r.completedAt || r.resultedAt || r.issuedAt || r.createdAt, user: a._id, userName: a.name, role: a.role, action, entity, entityId: r._id, summary: text(r) });
    }
  };
  sample('visits', 25, 'visits.complete', 'Visit', 'visits', (r) => `Completed ${r.visitNo}`);
  sample('invoices', 25, 'billing.create', 'Invoice', 'billing', (r) => `${r.invoiceNo} (${r.total})`);
  sample('labOrders', 15, 'labs.result', 'LabOrder', 'labs', (r) => `${r.orderNo} resulted`);
  sample('prescriptions', 15, 'pharmacy.dispense', 'Prescription', 'pharmacy', (r) => `${r.rxNo} dispensed`);
  sample('patients', 12, 'patients.create', 'Patient', 'patients', (r) => `Registered ${r.name} (${r.mrn})`);
  auditRows.sort((a, b) => new Date(a.at) - new Date(b.at)).forEach((r) => push('audit', r, new Date(r.at).getTime()));

  const counters = { ...seq, [`queue:${todayKey}`]: q.length };
  return { collections: c, counters, today: todayKey };
}
