import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';

process.env.JWT_SECRET = 'test-secret';
process.env.LOGIN_MAX_FAILURES = '3';
const BASE = process.env.TEST_MONGO_URI || 'mongodb://127.0.0.1:27017';
const DB = `hospital_extras_${process.pid}`;

const { default: mongoose } = await import('mongoose');
const { default: request } = await import('supertest');
const { createApp } = await import('../app.js');
const { default: User } = await import('../models/User.js');
const { buildDataset } = await import('../../shared/seed.js');

const app = createApp();
let admin;
const h = (t) => ({ Authorization: `Bearer ${t}` });

before(async () => {
  await mongoose.connect(`${BASE}/${DB}`);
  await mongoose.connection.dropDatabase();
  await User.syncIndexes();
  admin = (await request(app).post('/auth/register').send({ name: 'Root', email: 'root@x.test', password: 'secret12' })).body.token;
});
after(async () => {
  await mongoose.connection.dropDatabase();
  await mongoose.disconnect();
});

test('repeated failed sign-ins are rate limited, success is not counted', async () => {
  for (let i = 0; i < 3; i++) assert.equal((await request(app).post('/auth/login').send({ email: 'root@x.test', password: 'wrong' })).status, 401);
  const blocked = await request(app).post('/auth/login').send({ email: 'root@x.test', password: 'wrong' });
  assert.equal(blocked.status, 429);
  assert.ok(blocked.headers['retry-after']);
  // another address (email) is unaffected
  assert.equal((await request(app).post('/auth/login').send({ email: 'other@x.test', password: 'wrong' })).status, 401);
});

test('admin manages staff: role change, disable revokes access, safeguards', async () => {
  const c = await request(app).post('/auth/register').set(h(admin)).send({ name: 'Nia', email: 'nia@x.test', password: 'secret12', role: 'nurse' });
  assert.equal(c.status, 201);
  const nurse = (await request(app).post('/auth/login').send({ email: 'nia@x.test', password: 'secret12' })).body.token;
  assert.equal((await request(app).get('/users').set(h(nurse))).status, 403);
  const list = await request(app).get('/users?search=nia').set(h(admin));
  assert.equal(list.body.total, 1);
  assert.equal(list.body.data[0].password, undefined);
  const id = list.body.data[0].id;
  assert.equal((await request(app).patch(`/users/${id}`).set(h(admin)).send({ role: 'pharmacist' })).body.role, 'pharmacist');
  assert.equal((await request(app).patch(`/users/${id}`).set(h(admin)).send({ role: 'wizard' })).status, 400);
  assert.equal((await request(app).patch(`/users/${id}`).set(h(admin)).send({ active: false })).status, 200);
  assert.equal((await request(app).get('/patients').set(h(nurse))).status, 401, 'disabled users lose access immediately');
  assert.equal((await request(app).post('/auth/login').send({ email: 'nia@x.test', password: 'secret12' })).status, 403);
  const me = (await request(app).get('/auth/me').set(h(admin))).body.user;
  assert.equal((await request(app).patch(`/users/${me.id}`).set(h(admin)).send({ role: 'nurse' })).status, 409);
  assert.equal((await request(app).delete(`/users/${me.id}`).set(h(admin))).status, 409);
  assert.equal((await request(app).delete(`/users/${id}`).set(h(admin))).status, 200);
});

test('validation errors are friendly and nothing is stored on failure', async () => {
  const r = await request(app).post('/patients/add').set(h(admin)).send({ name: '', age: 200, gender: 'x' });
  assert.equal(r.status, 400);
  assert.match(r.body.error, /Name is required/);
  assert.match(r.body.error, /Age must be/);
  assert.equal((await request(app).get('/patients').set(h(admin))).body.total, 0);
  assert.equal((await request(app).get('/patients/not-an-id').set(h(admin))).status, 400);
  assert.equal((await request(app).get('/nothing-here').set(h(admin))).status, 404);
  const bad = await request(app).post('/patients/add').set(h(admin)).set('Content-Type', 'application/json').send('{oops');
  assert.equal(bad.status, 400);
  assert.equal((await request(app).get('/health')).body.ok, true);
});

test('the seed dataset is consistent and sized as promised', () => {
  const { collections: c } = buildDataset({ now: new Date('2026-10-08T09:00:00Z'), tz: 0 });
  assert.equal(c.patients.length, 200);
  assert.equal(c.doctors.length, 20);
  assert.ok(c.appointments.length > 150 && c.visits.length > 100 && c.labOrders.length > 50 && c.invoices.length > 100);
  assert.ok(c.wards.length >= 5 && c.beds.length >= 40 && c.inventory.length >= 15);
  const ids = new Set();
  for (const docs of Object.values(c)) for (const d of docs) { assert.ok(!ids.has(d._id), 'unique ids'); ids.add(d._id); }
  const patientIds = new Set(c.patients.map((p) => p._id));
  for (const v of c.visits) assert.ok(patientIds.has(v.patient));
  for (const b of c.beds.filter((x) => x.status === 'occupied')) assert.ok(c.admissions.some((a) => a._id === b.admission && a.status === 'admitted'));
  for (const i of c.invoices) assert.equal(Math.round((i.total - i.paid) * 100) >= 0, true);
  assert.ok(c.queue.some((t) => t.status === 'waiting') && c.queue.some((t) => t.status === 'in_consult'));
});
