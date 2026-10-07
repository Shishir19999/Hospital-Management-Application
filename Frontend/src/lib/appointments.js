export const STATUSES = ['scheduled', 'completed', 'cancelled'];
export const DEFAULT_DURATION = 30;

export const refId = (x) => (x && typeof x === 'object' ? x._id : x);

export const startMs = (a) => new Date(a.date).getTime();
export const endMs = (a) => startMs(a) + (a.duration || DEFAULT_DURATION) * 60000;

// The backend may not store a status; fall back to a time-based one.
export function effectiveStatus(a, now = new Date()) {
  if (a.status && STATUSES.includes(a.status)) return a.status;
  return startMs(a) < new Date(now).getTime() ? 'completed' : 'scheduled';
}

export const overlaps = (a, b) => startMs(a) < endMs(b) && endMs(a) > startMs(b);

// Active appointments of the same doctor that overlap the candidate.
export function findConflicts(appts, candidate) {
  const cand = { date: candidate.date, duration: Number(candidate.duration) || DEFAULT_DURATION };
  if (Number.isNaN(startMs(cand))) return [];
  return appts.filter(
    (a) =>
      a._id !== candidate.id &&
      refId(a.doctor) === candidate.doctor &&
      effectiveStatus(a) !== 'cancelled' &&
      overlaps(a, cand)
  );
}

// Ids of appointments that overlap another active appointment of the same doctor.
export function conflictIds(appts) {
  const byDoctor = new Map();
  for (const a of appts) {
    if (effectiveStatus(a) === 'cancelled') continue;
    const k = refId(a.doctor);
    if (!byDoctor.has(k)) byDoctor.set(k, []);
    byDoctor.get(k).push(a);
  }
  const ids = new Set();
  for (const list of byDoctor.values()) {
    list.sort((x, y) => startMs(x) - startMs(y));
    let reach = null;
    for (const a of list) {
      if (reach && startMs(a) < endMs(reach)) {
        ids.add(a._id);
        ids.add(reach._id);
      }
      if (!reach || endMs(a) > endMs(reach)) reach = a;
    }
  }
  return ids;
}
