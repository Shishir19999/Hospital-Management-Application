import { ACTIVE_APPOINTMENT, overlaps } from '../../../shared/domain.js';

export const STATUSES = ['scheduled', 'checked_in', 'completed', 'cancelled', 'no_show'];
export const DEFAULT_DURATION = 30;

export const refId = (x) => (x && typeof x === 'object' ? x._id : x);
export const startMs = (a) => new Date(a.date).getTime();
export const endMs = (a) => startMs(a) + (a.duration || DEFAULT_DURATION) * 60000;
export const effectiveStatus = (a) => a.status || 'scheduled';

// Ids of appointments that overlap another active appointment of the same doctor.
export function conflictIds(appts) {
  const byDoctor = new Map();
  for (const a of appts) {
    if (!ACTIVE_APPOINTMENT(a)) continue;
    const k = refId(a.doctor);
    if (!byDoctor.has(k)) byDoctor.set(k, []);
    byDoctor.get(k).push(a);
  }
  const ids = new Set();
  for (const list of byDoctor.values()) {
    list.sort((x, y) => startMs(x) - startMs(y));
    for (let i = 0; i < list.length; i++) {
      for (let j = i + 1; j < list.length && startMs(list[j]) < endMs(list[i]); j++) {
        if (overlaps(startMs(list[i]), list[i].duration || DEFAULT_DURATION, startMs(list[j]), list[j].duration || DEFAULT_DURATION)) {
          ids.add(list[i]._id);
          ids.add(list[j]._id);
        }
      }
    }
  }
  return ids;
}

// Active bookings of one doctor that overlap a candidate slot.
export function findConflicts(appts, { id, doctor, date, duration }) {
  const s = new Date(date).getTime();
  if (Number.isNaN(s)) return [];
  return appts.filter(
    (a) => a._id !== id && refId(a.doctor) === doctor && ACTIVE_APPOINTMENT(a) && overlaps(startMs(a), a.duration || DEFAULT_DURATION, s, Number(duration) || DEFAULT_DURATION)
  );
}
