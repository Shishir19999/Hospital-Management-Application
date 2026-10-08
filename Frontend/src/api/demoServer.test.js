import { beforeEach, describe, expect, it } from 'vitest';
import { createDemoServer, shiftDb, DB_KEY } from '../../../shared/demoServer.js';
import { SAMPLE_ACCOUNTS } from '../../../shared/accounts.js';
import { ROUTES } from '../../../shared/routes/index.js';
import { can, ROLES } from '../../../shared/policy.js';

const memoryStorage = () => {
  const m = new Map();
  return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k) };
};
const NOW = new Date('2026-10-07T10:00:00Z');
let storage;
let server;
const login = async (role) => {
  const a = SAMPLE_ACCOUNTS.find((x) => x.role === role);
  return (await server.request('POST', '/auth/login', { body: { email: a.email, password: a.password } })).body.token;
};
const get = (path, token, query) => server.request('GET', path, { token, query });

beforeEach(() => {
  storage = memoryStorage();
  server = createDemoServer({ storage, now: () => NOW, dataset: { patients: 60 } });
});

describe('live preview server', () => {
  it('ships a sign-in for every role and rejects wrong passwords', async () => {
    for (const r of ROLES) expect(await login(r)).toMatch(/^demo\./);
    const bad = await server.request('POST', '/auth/login', { body: { email: 'admin@example.com', password: 'nope' } });
    expect(bad.status).toBe(401);
  });

  it('seeds a believable hospital', async () => {
    const t = await login('admin');
    const s = (await get('/reports/summary', t)).body;
    expect(s.patients).toBe(60);
    expect((await get('/doctors', t)).body.total).toBe(20);
    expect((await get('/wards', t)).body.totals.occupied).toBeGreaterThan(10);
    expect((await get('/queue', t)).body.tokens.length).toBeGreaterThan(5);
    expect((await get('/inventory', t)).body.total).toBeGreaterThan(10);
  });

  it('answers 403 exactly where the shared matrix says so', async () => {
    const tokens = Object.fromEntries(await Promise.all(ROLES.map(async (r) => [r, await login(r)])));
    for (const route of ROUTES.filter((r) => r.perm && r.method === 'GET' && !r.path.includes(':'))) {
      for (const role of ROLES) {
        const res = await get(route.path, tokens[role]);
        expect(res.status === 403, `${role} ${route.path}`).toBe(!can(role, route.perm));
      }
    }
  });

  it('keeps changes in storage and survives a reload, reset restores the sample data', async () => {
    const t = await login('receptionist');
    const made = await server.request('POST', '/patients/add', { token: t, body: { name: 'Persisted Person', age: 33, gender: 'Other' } });
    expect(made.status).toBe(200);
    server.flush();
    expect(storage.getItem(DB_KEY)).toContain('Persisted Person');
    const again = createDemoServer({ storage, now: () => NOW, dataset: { patients: 60 } });
    const found = await again.request('GET', '/patients', { token: t, query: { search: 'Persisted' } });
    expect(found.body.total).toBe(1);
    again.reset();
    const gone = await again.request('GET', '/patients', { token: t, query: { search: 'Persisted' } });
    expect(gone.body.total).toBe(0);
  });

  it('logout revokes the token like the real server', async () => {
    const t = await login('doctor');
    expect((await get('/patients', t)).status).toBe(200);
    expect((await server.request('POST', '/auth/logout', { token: t })).status).toBe(200);
    expect((await get('/patients', t)).status).toBe(401);
  });

  it('moves sample timestamps forward when the preview is opened on a later day', async () => {
    const t = await login('admin');
    server.flush();
    const later = createDemoServer({ storage, now: () => new Date('2026-10-09T10:00:00Z'), dataset: { patients: 60 } });
    const q = await later.request('GET', '/queue', { token: t });
    expect(q.body.day).toBe('2026-10-09');
    expect(q.body.tokens.length).toBeGreaterThan(5);
  });

  it('shiftDb shifts dates, day keys and queue counters together', () => {
    const db = { counters: { 'queue:2026-10-07': 4, visit: 9 }, today: '2026-10-07', queue: [{ day: '2026-10-07', issuedAt: '2026-10-07T08:00:00.000Z', n: 1 }] };
    const out = shiftDb(db, 2);
    expect(out.today).toBe('2026-10-09');
    expect(out.counters).toEqual({ 'queue:2026-10-09': 4, visit: 9 });
    expect(out.queue[0]).toEqual({ day: '2026-10-09', issuedAt: '2026-10-09T08:00:00.000Z', n: 1 });
  });
});
