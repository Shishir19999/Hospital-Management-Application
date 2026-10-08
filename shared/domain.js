// Pure hospital rules: vitals, lab flags, billing maths, stock, queue, beds, slots and reports.
// No framework, no I/O: the same code runs on the server and in the browser-only preview.

export const MIN = 60000;
export const DAY = 86400000;

export const refId = (x) => (x && typeof x === 'object' ? String(x._id ?? x.id ?? '') : x == null ? '' : String(x));
const round2 = (n) => Math.round((n + Number.EPSILON) * 100) / 100;
const cents = (n) => Math.round((Number(n) || 0) * 100);

// ---------- Dates (timezone offset follows Date#getTimezoneOffset: UTC minus local, in minutes) ----------
export function dayKey(date, tz = 0) {
  return new Date(new Date(date).getTime() - tz * MIN).toISOString().slice(0, 10);
}
// Start of the local day (as a UTC instant) for a YYYY-MM-DD key.
export function dayStart(key, tz = 0) {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d) + tz * MIN);
}
export function addDaysKey(key, n) {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
}
export const weekday = (key) => new Date(`${key}T00:00:00Z`).getUTCDay();
const parseHm = (hm) => {
  const [h, m] = String(hm).split(':').map(Number);
  return h * 60 + (m || 0);
};

// ---------- Vitals ----------
export function bmi(weightKg, heightCm) {
  const w = Number(weightKg);
  const h = Number(heightCm) / 100;
  if (!(w > 0) || !(h > 0)) return null;
  return Math.round((w / (h * h)) * 10) / 10;
}
export function bmiCategory(value) {
  if (value == null) return null;
  if (value < 18.5) return 'underweight';
  if (value < 25) return 'normal';
  if (value < 30) return 'overweight';
  return 'obese';
}

// flag: normal | low | high | critical
export function vitalFlags(v = {}) {
  const f = {};
  const { systolic: s, diastolic: d, pulse, tempC, spo2, respRate } = v;
  if (s != null && d != null) {
    f.bp = s >= 180 || d >= 120 || s < 80 ? 'critical' : s >= 140 || d >= 90 ? 'high' : s < 90 || d < 60 ? 'low' : 'normal';
  }
  if (pulse != null) f.pulse = pulse < 40 || pulse > 130 ? 'critical' : pulse > 100 ? 'high' : pulse < 60 ? 'low' : 'normal';
  if (tempC != null) f.tempC = tempC >= 40 || tempC < 34 ? 'critical' : tempC >= 38 ? 'high' : tempC < 36 ? 'low' : 'normal';
  if (spo2 != null) f.spo2 = spo2 < 90 ? 'critical' : spo2 < 95 ? 'low' : 'normal';
  if (respRate != null) f.respRate = respRate < 8 || respRate > 30 ? 'critical' : respRate > 20 ? 'high' : respRate < 12 ? 'low' : 'normal';
  return f;
}

export const PRIORITIES = ['routine', 'urgent', 'emergency'];
const RANK = { emergency: 0, urgent: 1, routine: 2 };
export const priorityRank = (p) => RANK[p] ?? 2;

// Suggested triage priority from the recorded vitals.
export function suggestPriority(v = {}) {
  const flags = Object.values(vitalFlags(v));
  if (flags.includes('critical')) return 'emergency';
  if (flags.some((x) => x === 'high' || x === 'low')) return 'urgent';
  return 'routine';
}

// Fill the derived BMI from weight and height.
export function withBmi(v = {}) {
  return { ...v, bmi: bmi(v.weightKg, v.heightCm) };
}

// ---------- Lab results ----------
// range: { low, high, critLow, critHigh } -> { flag, abnormal, critical }
export function labFlag(value, range = {}) {
  const n = Number(value);
  if (value === '' || value == null || !Number.isFinite(n)) return { flag: 'normal', abnormal: false, critical: false };
  const { low, high, critLow, critHigh } = range;
  if (critLow != null && n < critLow) return { flag: 'critical_low', abnormal: true, critical: true };
  if (critHigh != null && n > critHigh) return { flag: 'critical_high', abnormal: true, critical: true };
  if (low != null && n < low) return { flag: 'low', abnormal: true, critical: false };
  if (high != null && n > high) return { flag: 'high', abnormal: true, critical: false };
  return { flag: 'normal', abnormal: false, critical: false };
}

// ---------- Billing ----------
export function lineAmount(line) {
  return fromCents(Math.round((Number(line.qty) || 0) * cents(line.unitPrice)));
}
const fromCents = (c) => c / 100;

// lines: [{qty, unitPrice}], discount: {type: 'percent'|'amount', value}, taxRate in percent.
export function computeTotals({ lines = [], discount, taxRate = 0 } = {}) {
  const sub = lines.reduce((s, l) => s + Math.round((Number(l.qty) || 0) * cents(l.unitPrice)), 0);
  let disc = 0;
  if (discount && Number(discount.value) > 0) {
    disc = discount.type === 'percent' ? Math.round((sub * Math.min(100, Number(discount.value))) / 100) : Math.min(sub, cents(discount.value));
  }
  const taxable = sub - disc;
  const tax = Math.round((taxable * (Number(taxRate) || 0)) / 100);
  return {
    subtotal: fromCents(sub),
    discountAmount: fromCents(disc),
    taxable: fromCents(taxable),
    tax: fromCents(tax),
    total: fromCents(taxable + tax),
  };
}

export const INVOICE_STATUSES = ['unpaid', 'partial', 'paid', 'overdue', 'void'];
export const PAYMENT_METHODS = ['cash', 'card', 'upi', 'insurance', 'bank'];

// Stored status never says "overdue" (that depends on today's date); see displayStatus.
export function baseStatus({ total, paid, voided }) {
  if (voided) return 'void';
  const t = cents(total);
  const p = cents(paid);
  if (t > 0 && p >= t) return 'paid';
  if (t === 0 && p === 0) return 'paid';
  return p > 0 ? 'partial' : 'unpaid';
}
export function displayStatus(inv, now = new Date()) {
  const s = inv.status || baseStatus({ total: inv.total, paid: inv.paid, voided: false });
  if ((s === 'unpaid' || s === 'partial') && inv.dueDate && new Date(inv.dueDate).getTime() < new Date(now).getTime()) return 'overdue';
  return s;
}
// Returns the invoice figures after taking a payment; throws on invalid or excess amounts.
export function applyPayment(inv, amount) {
  const a = cents(amount);
  if (!(a > 0)) throw new RangeError('Payment must be greater than zero');
  const balance = cents(inv.total) - cents(inv.paid);
  if (a > balance) throw new RangeError('Payment is more than the balance due');
  const paid = fromCents(cents(inv.paid) + a);
  return { paid, balance: fromCents(balance - a), status: baseStatus({ total: inv.total, paid }) };
}

// ---------- Stock (batches with expiry, first-expiry-first-out) ----------
export const EXPIRY_WARN_DAYS = 60;
const live = (b, now) => b.qty > 0 && new Date(b.expiry).getTime() >= new Date(now).getTime();

export function stockOf(item, now = new Date()) {
  return (item.batches || []).filter((b) => live(b, now)).reduce((s, b) => s + b.qty, 0);
}
export function stockStatus(item, now = new Date()) {
  const n = stockOf(item, now);
  return n <= 0 ? 'out' : n <= (item.reorderLevel ?? 0) ? 'low' : 'ok';
}
export function expiryStatus(item, now = new Date()) {
  const t = new Date(now).getTime();
  const left = (item.batches || []).filter((b) => b.qty > 0);
  if (left.some((b) => new Date(b.expiry).getTime() < t)) return 'expired';
  if (left.some((b) => new Date(b.expiry).getTime() < t + EXPIRY_WARN_DAYS * DAY)) return 'expiring';
  return 'ok';
}
// Take qty from the earliest-expiring valid batches; returns { batches, used } or throws.
export function planDispense(item, qty, now = new Date()) {
  const need = Number(qty);
  if (!Number.isInteger(need) || need <= 0) throw new RangeError('Quantity must be a positive whole number');
  if (stockOf(item, now) < need) throw new RangeError(`Not enough stock for ${item.name} (available ${stockOf(item, now)})`);
  const batches = (item.batches || []).map((b) => ({ ...b }));
  const order = batches.filter((b) => live(b, now)).sort((a, b) => new Date(a.expiry) - new Date(b.expiry));
  let left = need;
  const used = [];
  for (const b of order) {
    const take = Math.min(b.qty, left);
    b.qty -= take;
    left -= take;
    used.push({ lot: b.lot, qty: take });
    if (!left) break;
  }
  return { batches: batches.filter((b) => b.qty > 0), used };
}
export function receiveBatch(item, { lot, qty, expiry }) {
  const batches = (item.batches || []).map((b) => ({ ...b }));
  const hit = batches.find((b) => b.lot === lot && new Date(b.expiry).getTime() === new Date(expiry).getTime());
  if (hit) hit.qty += qty;
  else batches.push({ lot, qty, expiry: new Date(expiry).toISOString() });
  return batches;
}

// ---------- Prescriptions ----------
export const FREQUENCIES = {
  OD: { label: 'Once daily', perDay: 1 },
  BD: { label: 'Twice daily', perDay: 2 },
  TDS: { label: 'Three times daily', perDay: 3 },
  QID: { label: 'Four times daily', perDay: 4 },
  HS: { label: 'At bedtime', perDay: 1 },
  SOS: { label: 'When needed', perDay: 1 },
};
export function suggestQty(frequency, days, unitsPerDose = 1) {
  const f = FREQUENCIES[frequency];
  return f ? Math.max(1, Math.ceil(f.perDay * Number(days || 0) * unitsPerDose)) : 1;
}

// ---------- Queue ----------
export const QUEUE_ACTIVE = ['waiting', 'called', 'in_consult'];
export const tokenLabel = (seq) => `A${String(seq).padStart(3, '0')}`;

// Waiting tokens: emergency first, then urgent, then routine; earlier tokens first inside a priority.
export function queueOrder(tokens) {
  return [...tokens].sort((a, b) => priorityRank(a.priority) - priorityRank(b.priority) || a.seq - b.seq);
}
export function waitMinutes(token, now = new Date()) {
  const end = token.calledAt ? new Date(token.calledAt) : new Date(now);
  return Math.max(0, Math.floor((end.getTime() - new Date(token.issuedAt).getTime()) / MIN));
}
export function averageWait(tokens) {
  const done = tokens.filter((t) => t.calledAt);
  if (!done.length) return 0;
  return Math.round(done.reduce((s, t) => s + waitMinutes(t), 0) / done.length);
}

// ---------- Wards and beds ----------
export const BED_STATUSES = ['available', 'occupied', 'cleaning', 'maintenance'];
export function bedStats(beds = []) {
  const c = { total: beds.length, available: 0, occupied: 0, cleaning: 0, maintenance: 0 };
  for (const b of beds) c[b.status] = (c[b.status] || 0) + 1;
  const usable = c.total - c.maintenance;
  return { ...c, occupancyPct: usable > 0 ? Math.round((c.occupied / usable) * 100) : 0 };
}
export function wardOccupancy(wards = [], beds = []) {
  return wards.map((w) => ({
    ward: String(w._id),
    name: w.name,
    type: w.type,
    ...bedStats(beds.filter((b) => refId(b.ward) === String(w._id))),
  }));
}
// Whole days charged (a started day counts); at least one.
export function daysStayed(from, to = new Date()) {
  return Math.max(1, Math.ceil((new Date(to).getTime() - new Date(from).getTime()) / DAY));
}

// ---------- Doctor schedule and slot suggestion ----------
export const DEFAULT_SCHEDULE = {
  workingDays: [1, 2, 3, 4, 5],
  startTime: '09:00',
  endTime: '17:00',
  slotMinutes: 30,
  breakStart: '13:00',
  breakEnd: '14:00',
  daysOff: [],
};
export const scheduleOf = (doctor) => ({ ...DEFAULT_SCHEDULE, ...Object.fromEntries(Object.entries(doctor || {}).filter(([k, v]) => k in DEFAULT_SCHEDULE && v != null)) });

export const ACTIVE_APPOINTMENT = (a) => a.status !== 'cancelled' && a.status !== 'no_show';
export const overlaps = (aStart, aMin, bStart, bMin) => aStart < bStart + bMin * MIN && aStart + aMin * MIN > bStart;

export function findOverlap(appointments, startMs, durationMin, excludeId) {
  return appointments.find(
    (a) => String(a._id) !== String(excludeId) && ACTIVE_APPOINTMENT(a) && overlaps(new Date(a.date).getTime(), a.duration || 30, startMs, durationMin)
  );
}

// Is the doctor working at this time? Returns '' when yes, or a short reason.
export function availabilityIssue(doctor, startMs, durationMin, tz = 0) {
  const s = scheduleOf(doctor);
  const key = dayKey(new Date(startMs), tz);
  if (s.daysOff.includes(key)) return 'Doctor is on leave that day';
  if (!s.workingDays.includes(weekday(key))) return 'Doctor does not work that day';
  const base = dayStart(key, tz).getTime();
  const from = (startMs - base) / MIN;
  const to = from + durationMin;
  if (from < parseHm(s.startTime) || to > parseHm(s.endTime)) return `Outside working hours (${s.startTime}-${s.endTime})`;
  if (s.breakStart && s.breakEnd && from < parseHm(s.breakEnd) && to > parseHm(s.breakStart)) return 'During the doctor\'s break';
  return '';
}

// Free slots in the next `days` days, soonest first.
export function suggestSlots(doctor, appointments, { from = new Date(), days = 7, duration, limit = 12, tz = 0 } = {}) {
  const s = scheduleOf(doctor);
  const dur = duration || s.slotMinutes;
  const step = s.slotMinutes;
  const nowMs = new Date(from).getTime();
  const out = [];
  const mine = appointments.filter(ACTIVE_APPOINTMENT);
  const startKey = dayKey(nowMs, tz);
  for (let i = 0; i <= days && out.length < limit; i++) {
    const key = addDaysKey(startKey, i);
    if (s.daysOff.includes(key) || !s.workingDays.includes(weekday(key))) continue;
    const base = dayStart(key, tz).getTime();
    for (let m = parseHm(s.startTime); m + dur <= parseHm(s.endTime) && out.length < limit; m += step) {
      const t = base + m * MIN;
      if (t <= nowMs) continue;
      if (s.breakStart && s.breakEnd && m < parseHm(s.breakEnd) && m + dur > parseHm(s.breakStart)) continue;
      if (findOverlap(mine, t, dur)) continue;
      out.push({ start: new Date(t).toISOString(), end: new Date(t + dur * MIN).toISOString() });
    }
  }
  return out;
}

// ---------- Reports (plain arrays in, plain rows out) ----------
function lastDays(days, now, tz) {
  const end = dayKey(now, tz);
  return Array.from({ length: days }, (_, i) => addDaysKey(end, i - (days - 1)));
}

export function dailyVisits(visits, { days = 14, now = new Date(), tz = 0 } = {}) {
  const keys = lastDays(days, now, tz);
  const counts = Object.fromEntries(keys.map((k) => [k, 0]));
  for (const v of visits) {
    const k = dayKey(v.startedAt || v.createdAt, tz);
    if (k in counts) counts[k] += 1;
  }
  return keys.map((date) => ({ date, visits: counts[date] }));
}

export function revenueByDay(invoices, { days = 14, now = new Date(), tz = 0 } = {}) {
  const keys = lastDays(days, now, tz);
  const collected = Object.fromEntries(keys.map((k) => [k, 0]));
  const billed = Object.fromEntries(keys.map((k) => [k, 0]));
  for (const inv of invoices) {
    if (inv.status === 'void') continue;
    const bk = dayKey(inv.issuedAt, tz);
    if (bk in billed) billed[bk] = round2(billed[bk] + inv.total);
    for (const p of inv.payments || []) {
      const k = dayKey(p.at, tz);
      if (k in collected) collected[k] = round2(collected[k] + p.amount);
    }
  }
  return keys.map((date) => ({ date, collected: collected[date], billed: billed[date] }));
}

export function topDiagnoses(visits, { limit = 8, since } = {}) {
  const map = new Map();
  for (const v of visits) {
    if (since && new Date(v.startedAt) < new Date(since)) continue;
    for (const d of v.diagnoses || []) map.set(d.name, (map.get(d.name) || 0) + 1);
  }
  return [...map.entries()].map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count || a.name.localeCompare(b.name)).slice(0, limit);
}

export function doctorWorkload(doctors, visits, appointments, { since } = {}) {
  const from = since ? new Date(since).getTime() : 0;
  return doctors
    .map((d) => {
      const id = String(d._id);
      const vs = visits.filter((v) => refId(v.doctor) === id && new Date(v.startedAt).getTime() >= from);
      const ap = appointments.filter((a) => refId(a.doctor) === id && new Date(a.date).getTime() >= from && ACTIVE_APPOINTMENT(a));
      const timed = vs.filter((v) => v.completedAt && v.consultStartedAt);
      const avg = timed.length ? Math.round(timed.reduce((s, v) => s + (new Date(v.completedAt) - new Date(v.consultStartedAt)) / MIN, 0) / timed.length) : 0;
      return { doctor: id, name: d.name, specialty: d.specialty, visits: vs.length, appointments: ap.length, avgConsultMin: avg };
    })
    .sort((a, b) => b.visits - a.visits || a.name.localeCompare(b.name));
}

export function billingSummary(invoices, now = new Date()) {
  let billed = 0;
  let collected = 0;
  let outstanding = 0;
  let overdue = 0;
  for (const inv of invoices) {
    if (inv.status === 'void') continue;
    billed += inv.total;
    collected += inv.paid;
    outstanding += inv.total - inv.paid;
    if (displayStatus(inv, now) === 'overdue') overdue += 1;
  }
  return { billed: round2(billed), collected: round2(collected), outstanding: round2(outstanding), overdueCount: overdue };
}

// ---------- Small helpers ----------
export function ageBand(age) {
  if (age < 13) return '0-12';
  if (age < 20) return '13-19';
  if (age < 40) return '20-39';
  if (age < 60) return '40-59';
  return '60+';
}

export const money = (n, currency = 'USD') =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency }).format(Number(n) || 0);
