// The same clinical scenario runs against the real Express + MongoDB API and the in-browser preview
// engine. Every status code must match, which proves the preview mirrors the server.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { runScenario } from '../../shared/test/scenario.js';

process.env.JWT_SECRET = 'test-secret';
const BASE = process.env.TEST_MONGO_URI || 'mongodb://127.0.0.1:27017';
const DB = `hospital_flow_${process.pid}`;

const { default: mongoose } = await import('mongoose');
const { default: request } = await import('supertest');
const { createApp } = await import('../app.js');
const { default: User } = await import('../models/User.js');
const { createDemoServer } = await import('../../shared/demoServer.js');

const app = createApp({ rateLimit: false });
let realLog;
let demoLog;

before(async () => {
  await mongoose.connect(`${BASE}/${DB}`);
  await mongoose.connection.dropDatabase();
  await User.syncIndexes();
});
after(async () => {
  await mongoose.connection.dropDatabase();
  await mongoose.disconnect();
});

test('clinical flow on the real API', async () => {
  const first = await request(app).post('/auth/register').send({ name: 'Root', email: 'root@flow.test', password: 'secret12' });
  assert.equal(first.status, 201);
  const call = async (method, path, { token, body, query } = {}) => {
    let r = request(app)[method.toLowerCase()](path);
    if (token) r = r.set('Authorization', `Bearer ${token}`);
    if (query) r = r.query(query);
    if (body !== undefined && method !== 'GET') r = r.send(body);
    const res = await r;
    return { status: res.status, body: res.body };
  };
  realLog = await runScenario(call, first.body.token, 'a1');
  assert.ok(realLog.length > 100);
});

test('the same flow in the browser preview engine', async () => {
  const server = createDemoServer({ dataset: { patients: 60 } });
  const call = (method, path, { token, body, query } = {}) => server.request(method, path, { token, body, query });
  const login = await call('POST', '/auth/login', { body: { email: 'admin@example.com', password: 'Admin@123' } });
  assert.equal(login.status, 200);
  demoLog = await runScenario(call, login.body.token, 'a1');
});

test('preview and server answer every step the same way', () => {
  assert.deepEqual(demoLog, realLog);
});
