import { beforeEach, describe, expect, it } from 'vitest';
import { createDemoApi, DEMO_DB_KEY } from './demoApi';
import { buildSeed } from './demoSeed';
import { conflictIds } from '../lib/appointments';

const memoryStorage = () => {
  const m = new Map();
  return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k) };
};
const NOW = new Date('2026-10-07T10:00:00');

let storage;
let api;
beforeEach(() => {
  storage = memoryStorage();
  api = createDemoApi({ storage, latency: 0, now: () => NOW });
});

describe('seed data', () => {
  it('is deterministic, spans past and future and has no overlapping bookings', () => {
    const a = buildSeed(NOW);
    const b = buildSeed(NOW);
    expect(a).toEqual(b);
    expect(a.doctors.length).toBeGreaterThanOrEqual(10);
    expect(a.patients.length).toBeGreaterThanOrEqual(50);
    const times = a.appointments.map((x) => new Date(x.date).getTime());
    expect(Math.min(...times)).toBeLessThan(NOW.getTime());
    expect(Math.max(...times)).toBeGreaterThan(NOW.getTime());
    const populated = a.appointments.map((x) => ({ ...x, doctor: { _id: x.doctor } }));
    expect(conflictIds(populated).size).toBe(0);
  });
});

describe('demo api', () => {
  it('authenticates only the documented demo users', async () => {
    const s = await api.auth.login('Admin@Example.com', 'Admin@123');
    expect(s.user.role).toBe('admin');
    await expect(api.auth.login('admin@example.com', 'wrong')).rejects.toMatchObject({ status: 401 });
  });

  it('persists changes to storage and survives a new instance', async () => {
    const before = (await api.patients.list()).length;
    await api.patients.create({ name: 'Test Person', age: 33, gender: 'Female' });
    expect(storage.getItem(DEMO_DB_KEY)).toContain('Test Person');
    const again = createDemoApi({ storage, latency: 0, now: () => NOW });
    expect((await again.patients.list()).length).toBe(before + 1);
  });

  it('validates patients', async () => {
    await expect(api.patients.create({ name: '', age: 3, gender: 'Male' })).rejects.toMatchObject({ status: 400 });
    await expect(api.patients.create({ name: 'X', age: 200, gender: 'Male' })).rejects.toMatchObject({ status: 400 });
  });

  it('rejects past dates and overlapping bookings, then accepts a free slot', async () => {
    const [p] = await api.patients.list();
    const [d] = await api.doctors.list();
    const day = '2026-12-14';
    await expect(api.appointments.create({ patient: p._id, doctor: d._id, date: '2026-01-01T09:00:00' })).rejects.toMatchObject({ status: 400 });
    const first = await api.appointments.create({ patient: p._id, doctor: d._id, date: new Date(`${day}T04:00:00`).toISOString(), duration: 60 });
    expect(first.status).toBe('scheduled');
    expect(first.patient.name).toBe(p.name);
    await expect(
      api.appointments.create({ patient: p._id, doctor: d._id, date: new Date(`${day}T04:30:00`).toISOString() })
    ).rejects.toMatchObject({ status: 409 });
    await api.appointments.create({ patient: p._id, doctor: d._id, date: new Date(`${day}T05:00:00`).toISOString() });
  });

  it('changes status and cascades deletes', async () => {
    const list = await api.appointments.list();
    const target = list.find((a) => a.status === 'scheduled');
    const updated = await api.appointments.update(target._id, { status: 'cancelled' });
    expect(updated.status).toBe('cancelled');
    await expect(api.appointments.update(target._id, { status: 'bogus' })).rejects.toMatchObject({ status: 400 });
    const pid = target.patient._id;
    await api.patients.remove(pid);
    const after = await api.appointments.list();
    expect(after.some((a) => a.patient?._id === pid)).toBe(false);
  });

  it('resets to the seed', async () => {
    const [p] = await api.patients.list();
    await api.patients.remove(p._id);
    await api.reset();
    expect((await api.patients.list()).length).toBe(buildSeed(NOW).patients.length);
  });
});
