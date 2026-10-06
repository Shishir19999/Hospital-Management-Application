// Runs against a throwaway database (hospital_test_<pid>) that is dropped afterwards.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';

process.env.JWT_SECRET = 'test-secret';
const BASE = process.env.TEST_MONGO_URI || 'mongodb://127.0.0.1:27017';
const DB = `hospital_test_${process.pid}`;

const { default: mongoose } = await import('mongoose');
const { default: request } = await import('supertest');
const { createApp } = await import('../app.js');
const { default: User } = await import('../models/User.js');
const { default: Doctor } = await import('../models/Doctor.js');
const { default: Patient } = await import('../models/Patient.js');

const app = createApp();
const tokens = {};
const future = (mins) => new Date(Date.now() + mins * 60000 + 7 * 86400000).toISOString();

before(async () => {
  await mongoose.connect(`${BASE}/${DB}`);
  await mongoose.connection.dropDatabase();
  await User.syncIndexes();
});
after(async () => {
  await mongoose.connection.dropDatabase();
  await mongoose.disconnect();
});

const auth = (role) => ({ Authorization: `Bearer ${tokens[role]}` });

test('first registration becomes admin, later ones need admin', async () => {
  assert.equal((await request(app).get('/auth/status')).body.needsSetup, true);
  const r = await request(app).post('/auth/register').send({ name: 'Root', email: 'Root@x.com', password: 'secret1' });
  assert.equal(r.status, 201);
  assert.equal(r.body.user.role, 'admin');
  assert.ok(r.body.token);
  tokens.admin = r.body.token;
  assert.equal((await request(app).get('/auth/status')).body.needsSetup, false);
  // anonymous cannot register once a user exists
  assert.equal((await request(app).post('/auth/register').send({ name: 'a', email: 'a@x.com', password: 'secret1' })).status, 401);
  for (const role of ['receptionist', 'doctor']) {
    const c = await request(app).post('/auth/register').set(auth('admin'))
      .send({ name: role, email: `${role}@x.com`, password: 'secret1', role });
    assert.equal(c.status, 201);
    const l = await request(app).post('/auth/login').send({ email: `${role}@x.com`, password: 'secret1' });
    assert.equal(l.status, 200);
    tokens[role] = l.body.token;
  }
  // non-admin cannot register
  const f = await request(app).post('/auth/register').set(auth('receptionist'))
    .send({ name: 'z', email: 'z@x.com', password: 'secret1' });
  assert.equal(f.status, 403);
  // duplicate email / validation
  assert.equal((await request(app).post('/auth/register').set(auth('admin')).send({ name: 'd', email: 'doctor@x.com', password: 'secret1' })).status, 409);
  assert.equal((await request(app).post('/auth/register').set(auth('admin')).send({ name: 'd', email: 'bad', password: 'secret1' })).status, 400);
});

test('login rejects bad credentials; /me works; unauthenticated is 401', async () => {
  assert.equal((await request(app).post('/auth/login').send({ email: 'root@x.com', password: 'nope' })).status, 401);
  assert.equal((await request(app).post('/auth/login').send({ email: 'root@x.com' })).status, 400);
  assert.equal((await request(app).get('/patients')).status, 401);
  assert.equal((await request(app).get('/patients').set('Authorization', 'Bearer garbage')).status, 401);
  const me = await request(app).get('/auth/me').set(auth('admin'));
  assert.equal(me.body.user.email, 'root@x.com');
});

test('role matrix', async () => {
  const p = { name: 'Pat One', age: 30, gender: 'Male' };
  const d = { name: 'Dr One', specialty: 'Cardiology' };
  assert.equal((await request(app).post('/patients/add').set(auth('doctor')).send(p)).status, 403);
  const pr = await request(app).post('/patients/add').set(auth('receptionist')).send(p);
  assert.equal(pr.status, 200);
  const pid = pr.body._id;
  assert.equal((await request(app).put(`/patients/${pid}`).set(auth('doctor')).send({ age: 31 })).status, 403);
  assert.equal((await request(app).put(`/patients/${pid}`).set(auth('receptionist')).send({ age: 31 })).status, 200);
  assert.equal((await request(app).delete(`/patients/delete/${pid}`).set(auth('receptionist'))).status, 403);
  assert.equal((await request(app).post('/doctors/add').set(auth('receptionist')).send(d)).status, 403);
  assert.equal((await request(app).post('/doctors/add').set(auth('doctor')).send(d)).status, 403);
  const dr = await request(app).post('/doctors/add').set(auth('admin')).send(d);
  assert.equal(dr.status, 200);
  for (const role of ['admin', 'receptionist', 'doctor']) {
    assert.equal((await request(app).get('/doctors').set(auth(role))).status, 200);
    assert.equal((await request(app).get('/appointments').set(auth(role))).status, 200);
  }
  const body = { patient: pid, doctor: dr.body._id, date: future(0) };
  assert.equal((await request(app).post('/appointments/add').set(auth('doctor')).send(body)).status, 403);
  assert.equal((await request(app).post('/appointments/add').set(auth('receptionist')).send(body)).status, 200);
  assert.equal((await request(app).delete(`/doctors/delete/${dr.body._id}`).set(auth('receptionist'))).status, 403);
  assert.equal((await request(app).delete(`/patients/delete/${pid}`).set(auth('admin'))).status, 200);
  assert.equal((await request(app).delete(`/doctors/delete/${dr.body._id}`).set(auth('admin'))).status, 200);
});

test('pagination, search and lookup for patients/doctors', async () => {
  await Patient.deleteMany({});
  await Doctor.deleteMany({});
  await Patient.insertMany(Array.from({ length: 25 }, (_, i) => ({ name: `Patient ${String(i).padStart(2, '0')}`, age: 20 + i, gender: 'Other' })));
  await Doctor.insertMany(Array.from({ length: 12 }, (_, i) => ({ name: `Doc ${String(i).padStart(2, '0')}`, specialty: i % 2 ? 'ENT' : 'Cardiology' })));

  let r = await request(app).get('/patients?page=1&limit=10').set(auth('admin'));
  assert.equal(r.status, 200);
  assert.deepEqual([r.body.page, r.body.limit, r.body.total, r.body.pages, r.body.data.length], [1, 10, 25, 3, 10]);
  r = await request(app).get('/patients?page=3&limit=10').set(auth('admin'));
  assert.equal(r.body.data.length, 5);
  assert.equal(r.body.data[0].name, 'Patient 20');
  r = await request(app).get('/patients?search=patient 07').set(auth('admin'));
  assert.equal(r.body.total, 1);
  r = await request(app).get('/patients?search=' + encodeURIComponent('.*')).set(auth('admin'));
  assert.equal(r.body.total, 0, 'search text is regex-escaped');
  r = await request(app).get('/patients?page=-4&limit=100000').set(auth('admin'));
  assert.equal(r.body.page, 1);
  assert.equal(r.body.limit, 100);

  r = await request(app).get('/doctors?limit=5&page=3').set(auth('doctor'));
  assert.deepEqual([r.body.total, r.body.pages, r.body.data.length], [12, 3, 2]);
  r = await request(app).get('/doctors?search=ent').set(auth('doctor'));
  assert.equal(r.body.total, 6);

  r = await request(app).get('/patients/lookup').set(auth('admin'));
  assert.equal(r.body.length, 25, 'lookup is unpaginated');
  assert.deepEqual(Object.keys(r.body[0]).sort(), ['_id', 'name']);
  r = await request(app).get('/doctors/lookup').set(auth('admin'));
  assert.equal(r.body.length, 12);
});

test('appointments: pagination, search and overlap check', async () => {
  const doc = await Doctor.findOne({ name: 'Doc 00' });
  const doc2 = await Doctor.findOne({ name: 'Doc 01' });
  const pats = await Patient.find().sort({ name: 1 }).limit(12);
  const base = Date.now() + 30 * 86400000;
  const at = (min) => new Date(base + min * 60000).toISOString();
  const add = (patient, doctor, min, duration) =>
    request(app).post('/appointments/add').set(auth('receptionist')).send({ patient: patient._id, doctor: doctor._id, date: at(min), duration });

  assert.equal((await add(pats[0], doc, 0, 30)).status, 200);
  assert.equal((await add(pats[1], doc, 15, 30)).status, 409, 'starts inside existing');
  assert.equal((await add(pats[1], doc, -15, 30)).status, 409, 'ends inside existing');
  assert.equal((await add(pats[1], doc, -60, 120)).status, 409, 'encloses existing');
  assert.equal((await add(pats[1], doc, 30, 30)).status, 200, 'back-to-back is allowed');
  assert.equal((await add(pats[2], doc2, 0, 30)).status, 200, 'other doctor is free');
  assert.equal((await add(pats[2], doc2, 0, 2)).status, 400, 'duration too short');
  const past = await request(app).post('/appointments/add').set(auth('admin'))
    .send({ patient: pats[0]._id, doctor: doc._id, date: new Date(Date.now() - 86400000).toISOString() });
  assert.equal(past.status, 400);

  const list = await request(app).get('/appointments?limit=50').set(auth('admin'));
  const first = list.body.data.find((a) => a.patient.name === pats[0].name);
  assert.equal((await request(app).put(`/appointments/${first._id}`).set(auth('admin')).send({ date: at(30) })).status, 409);
  assert.equal((await request(app).put(`/appointments/${first._id}`).set(auth('admin')).send({ duration: 20 })).status, 200);

  for (let i = 3; i < 12; i++) assert.equal((await add(pats[i], doc2, 60 + i * 30, 30)).status, 200);
  let r = await request(app).get('/appointments?page=1&limit=5').set(auth('admin'));
  assert.deepEqual([r.body.total, r.body.pages, r.body.data.length], [12, 3, 5]);
  assert.ok(r.body.data[0].patient.name && r.body.data[0].doctor.name, 'populated');
  r = await request(app).get('/appointments?page=3&limit=5').set(auth('admin'));
  assert.equal(r.body.data.length, 2);
  r = await request(app).get(`/appointments?search=${encodeURIComponent(pats[0].name)}`).set(auth('admin'));
  assert.equal(r.body.total, 1);
  r = await request(app).get('/appointments?search=Doc 00').set(auth('admin'));
  assert.equal(r.body.total, 2);
});

test('logout revokes all earlier tokens of that user only', async () => {
  const login = () => request(app).post('/auth/login').send({ email: 'receptionist@x.com', password: 'secret1' });
  const t1 = (await login()).body.token;
  const t2 = (await login()).body.token;
  const h = (t) => ({ Authorization: `Bearer ${t}` });
  assert.equal((await request(app).get('/patients').set(h(t1))).status, 200);
  assert.equal((await request(app).post('/auth/logout').set(h(t1))).status, 200);
  assert.equal((await request(app).get('/patients').set(h(t1))).status, 401);
  assert.equal((await request(app).get('/patients').set(h(t2))).status, 401, 'all earlier tokens revoked');
  assert.equal((await request(app).get('/auth/me').set(h(t1))).status, 401);
  assert.equal((await request(app).get('/patients').set(auth('admin'))).status, 200, 'other users unaffected');
  const t3 = (await login()).body.token;
  assert.equal((await request(app).get('/patients').set(h(t3))).status, 200, 'fresh login works');
  assert.equal((await request(app).post('/auth/logout')).status, 401);
});

test('token of a deleted user is rejected', async () => {
  const u = await User.create({ name: 'Temp', email: 'temp@x.com', password: 'secret1', role: 'receptionist' });
  const t = (await request(app).post('/auth/login').send({ email: 'temp@x.com', password: 'secret1' })).body.token;
  assert.equal((await request(app).get('/patients').set({ Authorization: `Bearer ${t}` })).status, 200);
  await User.deleteOne({ _id: u._id });
  assert.equal((await request(app).get('/patients').set({ Authorization: `Bearer ${t}` })).status, 401);
});
