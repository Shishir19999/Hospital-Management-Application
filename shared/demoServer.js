// The whole API running in the browser: same routes, permissions and rules as the server, with
// the sample data kept in storage (localStorage in the preview). Works in Node too (used by tests).
import { dispatch } from './engine.js';
import { ROUTES } from './routes/index.js';
import { buildDataset } from './seed.js';
import { createMemoryStore } from './memoryStore.js';
import { DAY, dayKey } from './domain.js';
import { publicUser } from './routes/auth.js';

export const DB_KEY = 'hms_preview_db_v2';
const ISO = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?Z$/;
const KEY = /^\d{4}-\d{2}-\d{2}$/;

// Move every timestamp (and day key) forward by whole days so the sample data always looks current.
export function shiftDb(db, days) {
  const addKey = (k) => new Date(Date.parse(`${k}T00:00:00Z`) + days * DAY).toISOString().slice(0, 10);
  const walk = (v) => {
    if (typeof v === 'string') return ISO.test(v) ? new Date(Date.parse(v) + days * DAY).toISOString() : KEY.test(v) ? addKey(v) : v;
    if (Array.isArray(v)) return v.map(walk);
    if (v && typeof v === 'object') return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, walk(x)]));
    return v;
  };
  const out = {};
  for (const [k, v] of Object.entries(db)) {
    if (k === 'counters') {
      out.counters = Object.fromEntries(Object.entries(v).map(([n, x]) => [n.startsWith('queue:') ? `queue:${addKey(n.slice(6))}` : n, x]));
    } else if (k === 'today') out.today = addKey(v);
    else if (Array.isArray(v)) out[k] = v.map(walk);
    else out[k] = v;
  }
  return out;
}

export function createDemoServer({ storage = null, key = DB_KEY, now = () => new Date(), tz = () => 0, dataset = {} } = {}) {
  let db = null;
  let saveTimer = null;

  const persist = () => {
    if (!storage) return;
    try {
      storage.setItem(key, JSON.stringify(db));
    } catch {
      /* storage full or blocked: keep working in memory */
    }
  };
  const scheduleSave = () => {
    if (!storage || saveTimer) return;
    saveTimer = setTimeout(() => {
      saveTimer = null;
      persist();
    }, 150);
  };

  const fresh = () => {
    const { collections, counters, today } = buildDataset({ now: now(), tz: tz(), ...dataset });
    return { ...collections, counters, today, version: 2 };
  };

  const load = () => {
    if (db) return db;
    try {
      const raw = storage?.getItem(key);
      if (raw) db = JSON.parse(raw);
    } catch {
      db = null;
    }
    if (!db || db.version !== 2 || !db.patients || !db.users) {
      db = fresh();
      persist();
    } else {
      const today = dayKey(now(), tz());
      const gap = Math.round((Date.parse(`${today}T00:00:00Z`) - Date.parse(`${db.today}T00:00:00Z`)) / DAY);
      if (gap > 0) {
        db = shiftDb(db, gap);
        persist();
      }
    }
    return db;
  };

  const helpers = {
    hashPassword: async (plain) => plain,
    verifyPassword: async (email, password) => load().users.find((u) => u.email === email && u.password === password) || null,
    signToken: (u) => `demo.${u._id}.${u.tokenVersion || 0}`,
  };

  const authenticate = (token) => {
    const [tag, id, tv] = String(token || '').split('.');
    if (tag !== 'demo' || !id) return { error: 'Invalid or expired token' };
    const u = load().users.find((x) => x._id === id);
    if (!u) return { error: 'User no longer exists' };
    if (Number(tv) !== (u.tokenVersion || 0)) return { error: 'Token has been revoked' };
    if (u.active === false) return { error: 'This account has been disabled' };
    return { user: { id: u._id, role: u.role, name: u.name, doctor: u.doctor || null } };
  };

  return {
    // request('GET', '/patients', { query, body, token }) -> { status, body }
    async request(method, path, { query = {}, body = {}, token = null } = {}) {
      const data = load();
      const store = createMemoryStore(data, scheduleSave);
      let user = null;
      if (token) {
        const r = authenticate(token);
        if (r.error) {
          const publicRoute = ROUTES.some((x) => x.public && x.method === method && x.path === path);
          if (!publicRoute) return { status: 401, body: { error: r.error } };
        } else user = r.user;
      }
      return dispatch(ROUTES, { method, path, query, body, user, store, helpers, now: now(), tz: query.tz }, { onError: (e) => console.error(e) });
    },
    // Replace everything with the original sample data.
    reset() {
      db = fresh();
      persist();
    },
    // the plain "this is who the token belongs to" lookup, used to restore sessions
    whoami(token) {
      const r = authenticate(token);
      if (r.error) return null;
      return publicUser(load().users.find((u) => u._id === r.user.id));
    },
    flush: persist,
  };
}
