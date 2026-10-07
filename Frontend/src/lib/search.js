import { effectiveStatus } from './appointments';

const has = (v, q) => String(v ?? '').toLowerCase().includes(q);

// Search across patients, doctors and appointments; each group is capped.
export function globalSearch(query, { patients, doctors, appointments }, limit = 5) {
  const q = query.trim().toLowerCase();
  if (!q) return { patients: [], doctors: [], appointments: [] };
  return {
    patients: patients.filter((p) => has(p.name, q) || has(p.email, q) || has(p.phone, q)).slice(0, limit),
    doctors: doctors.filter((d) => has(d.name, q) || has(d.specialty, q)).slice(0, limit),
    appointments: appointments
      .filter((a) => has(a.patient?.name, q) || has(a.doctor?.name, q) || has(effectiveStatus(a), q))
      .sort((a, b) => new Date(b.date) - new Date(a.date))
      .slice(0, limit),
  };
}
