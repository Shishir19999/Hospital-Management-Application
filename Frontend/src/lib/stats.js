import { addDays, dayKey, startOfDay, startOfWeek } from './dates';
import { effectiveStatus } from './appointments';

const active = (a) => effectiveStatus(a) !== 'cancelled';

export function appointmentsPerDay(appts, from, days) {
  const start = startOfDay(from);
  const out = Array.from({ length: days }, (_, i) => {
    const d = addDays(start, i);
    return { key: dayKey(d), date: d, value: 0 };
  });
  const idx = new Map(out.map((o, i) => [o.key, i]));
  for (const a of appts) {
    if (!active(a)) continue;
    const i = idx.get(dayKey(a.date));
    if (i !== undefined) out[i].value += 1;
  }
  return out;
}

export function appointmentsPerWeek(appts, endDate, weeks) {
  const lastStart = startOfWeek(endDate);
  const out = Array.from({ length: weeks }, (_, i) => {
    const d = addDays(lastStart, (i - weeks + 1) * 7);
    return { key: dayKey(d), date: d, value: 0 };
  });
  const idx = new Map(out.map((o, i) => [o.key, i]));
  for (const a of appts) {
    if (!active(a)) continue;
    const i = idx.get(dayKey(startOfWeek(a.date)));
    if (i !== undefined) out[i].value += 1;
  }
  return out;
}

const countBy = (items, fn) => {
  const m = new Map();
  for (const it of items) m.set(fn(it), (m.get(fn(it)) || 0) + 1);
  return [...m.entries()].map(([label, value]) => ({ label, value }));
};

export const doctorsBySpecialty = (doctors) =>
  countBy(doctors, (d) => d.specialty || 'Other').sort(
    (a, b) => b.value - a.value || a.label.localeCompare(b.label)
  );

export const genderMix = (patients) =>
  ['Female', 'Male', 'Other']
    .map((label) => ({ label, value: patients.filter((p) => p.gender === label).length }))
    .filter((x) => x.value > 0);

const BUCKETS = [
  ['0-17', 0, 17],
  ['18-34', 18, 34],
  ['35-49', 35, 49],
  ['50-64', 50, 64],
  ['65+', 65, 200],
];
export const ageBuckets = (patients) =>
  BUCKETS.map(([label, lo, hi]) => ({
    label,
    value: patients.filter((p) => Number(p.age) >= lo && Number(p.age) <= hi).length,
  }));

export function dashboardStats({ patients, doctors, appointments }, now = new Date()) {
  const today = dayKey(now);
  const counts = { scheduled: 0, completed: 0, cancelled: 0 };
  let todayCount = 0;
  let upcoming = 0;
  for (const a of appointments) {
    const s = effectiveStatus(a, now);
    counts[s] += 1;
    if (s === 'cancelled') continue;
    if (dayKey(a.date) === today) todayCount += 1;
    if (s === 'scheduled' && new Date(a.date) >= now) upcoming += 1;
  }
  return {
    patients: patients.length,
    doctors: doctors.length,
    today: todayCount,
    upcoming,
    completed: counts.completed,
    cancelled: counts.cancelled,
  };
}
