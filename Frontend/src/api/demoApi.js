import { ApiError } from './errors';
import { buildSeed } from './demoSeed';
import { DEMO_USERS } from '../lib/constants';
import { DEFAULT_DURATION, STATUSES, findConflicts } from '../lib/appointments';
import { GENDERS } from '../lib/validate';

export const DEMO_DB_KEY = 'hms_demo_db_v1';

const clone = (x) => JSON.parse(JSON.stringify(x));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let counter = 0;
const newId = (prefix) => `${prefix}${Date.now().toString(36)}${(counter++).toString(36)}`;

// In-browser stand-in for the REST backend. Same interface as realApi.
export function createDemoApi({ storage = globalThis.localStorage, latency = [120, 380], now = () => new Date() } = {}) {
  let db = null;

  const save = () => {
    try {
      storage.setItem(DEMO_DB_KEY, JSON.stringify(db));
    } catch {
      /* storage full or unavailable: keep working in memory */
    }
  };
  const load = () => {
    if (db) return db;
    try {
      const raw = storage.getItem(DEMO_DB_KEY);
      if (raw) db = JSON.parse(raw);
    } catch {
      db = null;
    }
    if (!db || !db.patients || !db.doctors || !db.appointments) {
      db = buildSeed(now());
      save();
    }
    return db;
  };

  const delay = async () => {
    const [min, max] = Array.isArray(latency) ? latency : [latency, latency];
    if (max > 0) await sleep(min + Math.random() * (max - min));
  };
  // Run a handler after simulated latency; always returns copies.
  const call = async (fn) => {
    await delay();
    return clone(fn(load()));
  };

  const populate = (d, a) => {
    const p = d.patients.find((x) => x._id === a.patient);
    const doc = d.doctors.find((x) => x._id === a.doctor);
    return {
      ...a,
      patient: p ? { _id: p._id, name: p.name, age: p.age, gender: p.gender } : null,
      doctor: doc ? { _id: doc._id, name: doc.name, specialty: doc.specialty } : null,
    };
  };

  const patientRules = (v) => {
    const name = String(v.name ?? '').trim();
    const age = Number(v.age);
    if (!name) throw new ApiError('Name is required', 400);
    if (v.age === '' || !Number.isFinite(age) || age < 0 || age > 150) throw new ApiError('Age must be a number between 0 and 150', 400);
    if (!GENDERS.includes(v.gender)) throw new ApiError(`Gender must be one of: ${GENDERS.join(', ')}`, 400);
    return { name, age, gender: v.gender };
  };

  const checkAppointment = (d, v, excludeId) => {
    if (!d.patients.some((p) => p._id === v.patient)) throw new ApiError('Patient not found', 404);
    if (!d.doctors.some((p) => p._id === v.doctor)) throw new ApiError('Doctor not found', 404);
    const start = new Date(v.date);
    if (!v.date || Number.isNaN(start.getTime())) throw new ApiError('A valid appointment date is required', 400);
    const duration = v.duration == null || v.duration === '' ? DEFAULT_DURATION : Number(v.duration);
    if (!Number.isFinite(duration) || duration < 5 || duration > 480) throw new ApiError('Duration must be between 5 and 480 minutes', 400);
    return { start, duration, excludeId };
  };
  const clash = (d, v, start, duration, excludeId) =>
    findConflicts(d.appointments, { id: excludeId, doctor: v.doctor, date: start.toISOString(), duration }).length > 0;

  const crud = (key, prefix, rules) => ({
    list: () => call((d) => d[key]),
    create: (v) =>
      call((d) => {
        const rec = { _id: newId(prefix), ...rules(v, d) };
        d[key].push(rec);
        save();
        return rec;
      }),
    update: (id, v) =>
      call((d) => {
        const i = d[key].findIndex((x) => x._id === id);
        if (i < 0) throw new ApiError('Not found', 404);
        d[key][i] = { ...d[key][i], ...rules({ ...d[key][i], ...v }, d) };
        save();
        return d[key][i];
      }),
  });

  const patients = {
    ...crud('patients', 'p', (v) => ({ ...patientRules(v), ...pickExtras(v) })),
    remove: (id) =>
      call((d) => {
        if (!d.patients.some((p) => p._id === id)) throw new ApiError('Patient not found', 404);
        d.patients = d.patients.filter((p) => p._id !== id);
        d.appointments = d.appointments.filter((a) => a.patient !== id);
        save();
        return { ok: true };
      }),
  };
  function pickExtras(v) {
    const out = {};
    for (const k of ['email', 'phone', 'bloodGroup', 'conditions']) if (v[k] !== undefined) out[k] = String(v[k]).slice(0, 120);
    return out;
  }

  const doctors = {
    ...crud('doctors', 'd', (v) => {
      if (!String(v.name ?? '').trim()) throw new ApiError('Name is required', 400);
      if (!String(v.specialty ?? '').trim()) throw new ApiError('Specialty is required', 400);
      return {
        name: String(v.name).trim(),
        specialty: v.specialty,
        workingDays: v.workingDays || [1, 2, 3, 4, 5],
        hours: v.hours || '09:00-17:00',
      };
    }),
    remove: (id) =>
      call((d) => {
        if (!d.doctors.some((p) => p._id === id)) throw new ApiError('Doctor not found', 404);
        d.doctors = d.doctors.filter((p) => p._id !== id);
        d.appointments = d.appointments.filter((a) => a.doctor !== id);
        save();
        return { ok: true };
      }),
  };

  const appointments = {
    list: () => call((d) => d.appointments.map((a) => populate(d, a))),
    create: (v) =>
      call((d) => {
        const { start, duration } = checkAppointment(d, v);
        if (start <= now()) throw new ApiError('Appointment date must be in the future', 400);
        if (clash(d, v, start, duration)) throw new ApiError('Doctor already has an appointment that overlaps this time', 409);
        const rec = {
          _id: newId('a'),
          patient: v.patient,
          doctor: v.doctor,
          date: start.toISOString(),
          duration,
          status: 'scheduled',
          notes: String(v.notes || '').slice(0, 500),
        };
        d.appointments.push(rec);
        save();
        return populate(d, rec);
      }),
    update: (id, v) =>
      call((d) => {
        const cur = d.appointments.find((a) => a._id === id);
        if (!cur) throw new ApiError('Appointment not found', 404);
        const merged = { ...cur, ...v };
        if (merged.status && !STATUSES.includes(merged.status)) throw new ApiError('Invalid status', 400);
        const { start, duration } = checkAppointment(d, merged);
        const moved = v.date !== undefined || v.doctor !== undefined || v.duration !== undefined;
        if (moved && merged.status !== 'cancelled') {
          if (new Date(v.date ?? cur.date).getTime() !== new Date(cur.date).getTime() && start <= now()) {
            throw new ApiError('Appointment date must be in the future', 400);
          }
          if (clash(d, merged, start, duration, id)) throw new ApiError('Doctor already has an appointment that overlaps this time', 409);
        }
        Object.assign(cur, {
          patient: merged.patient,
          doctor: merged.doctor,
          date: start.toISOString(),
          duration,
          status: merged.status || 'scheduled',
          notes: String(merged.notes || '').slice(0, 500),
        });
        save();
        return populate(d, cur);
      }),
    remove: (id) =>
      call((d) => {
        if (!d.appointments.some((a) => a._id === id)) throw new ApiError('Appointment not found', 404);
        d.appointments = d.appointments.filter((a) => a._id !== id);
        save();
        return { ok: true };
      }),
  };

  const makeSession = (u) => ({
    token: `demo.${u.role}.${Date.now().toString(36)}`,
    user: { id: `u-${u.role}`, name: u.role[0].toUpperCase() + u.role.slice(1) + ' (demo)', email: u.email, role: u.role },
  });

  const auth = {
    status: async () => {
      await delay();
      return { needsSetup: false };
    },
    login: async (email, password) => {
      await delay();
      const u = DEMO_USERS.find((x) => x.email === String(email).trim().toLowerCase() && x.password === password);
      if (!u) throw new ApiError('Invalid email or password', 401);
      return makeSession(u);
    },
    register: async () => {
      await delay();
      throw new ApiError('Account creation is disabled in the demo. Use one of the demo logins.', 403);
    },
    logout: async () => {},
  };

  return {
    isDemo: true,
    capabilities: { status: true, notes: true, extras: true },
    auth,
    patients,
    doctors,
    appointments,
    reset: async () => {
      await delay();
      db = buildSeed(now());
      save();
    },
  };
}
