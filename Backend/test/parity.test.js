// Parity: the Express server and the browser preview must authorise every route identically,
// and both must follow the shared permission matrix. Fails if either side drifts.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { ROUTES } from '../../shared/routes/index.js';
import { ROLES, can } from '../../shared/policy.js';
import { SAMPLE_ACCOUNTS } from '../../shared/accounts.js';

process.env.JWT_SECRET = 'test-secret';
const BASE = process.env.TEST_MONGO_URI || 'mongodb://127.0.0.1:27017';
const DB = `hospital_parity_${process.pid}`;

const { default: mongoose } = await import('mongoose');
const { default: request } = await import('supertest');
const { createApp } = await import('../app.js');
const { default: User } = await import('../models/User.js');
const { createDemoServer } = await import('../../shared/demoServer.js');

const app = createApp({ rateLimit: false });
const demo = createDemoServer({ dataset: { patients: 20 } });
const real = {};
const preview = {};
const ID = 'ffffffffffffffffffffffff';

before(async () => {
  await mongoose.connect(`${BASE}/${DB}`);
  await mongoose.connection.dropDatabase();
  await User.syncIndexes();
  const first = await request(app).post('/auth/register').send({ name: 'Root', email: 'root@parity.test', password: 'secret12' });
  real.admin = first.body.token;
  for (const role of ROLES.filter((r) => r !== 'admin')) {
    await request(app).post('/auth/register').set('Authorization', `Bearer ${real.admin}`).send({ name: role, email: `${role}@parity.test`, password: 'secret12', role });
    real[role] = (await request(app).post('/auth/login').send({ email: `${role}@parity.test`, password: 'secret12' })).body.token;
  }
  for (const a of SAMPLE_ACCOUNTS) preview[a.role] = (await demo.request('POST', '/auth/login', { body: { email: a.email, password: a.password } })).body.token;
});
after(async () => {
  await mongoose.connection.dropDatabase();
  await mongoose.disconnect();
});

const fill = (path) => path.replace(/:\w+/g, ID);
const callReal = async (method, path, role) => {
  let r = request(app)[method.toLowerCase()](path).set('Authorization', `Bearer ${real[role]}`);
  if (method !== 'GET') r = r.send({});
  return (await r).status;
};
const callPreview = async (method, path, role) => (await demo.request(method, path, { token: preview[role], body: {} })).status;

test('every guarded route returns 403 exactly for the roles the matrix denies, on both sides', async () => {
  const guarded = ROUTES.filter((r) => r.perm);
  assert.ok(guarded.length > 80, `only ${guarded.length} guarded routes`);
  const mismatches = [];
  for (const r of guarded) {
    const path = fill(r.path);
    for (const role of ROLES) {
      const [a, b] = [await callReal(r.method, path, role), await callPreview(r.method, path, role)];
      const denied = !can(role, r.perm);
      if ((a === 403) !== denied) mismatches.push(`server ${r.method} ${r.path} as ${role}: ${a} (matrix says ${denied ? 'deny' : 'allow'})`);
      if ((b === 403) !== denied) mismatches.push(`preview ${r.method} ${r.path} as ${role}: ${b} (matrix says ${denied ? 'deny' : 'allow'})`);
      if (a !== b) mismatches.push(`${r.method} ${r.path} as ${role}: server ${a} vs preview ${b}`);
    }
  }
  assert.deepEqual(mismatches, []);
});

test('anonymous requests are rejected on both sides', async () => {
  for (const r of ROUTES.filter((x) => !x.public).slice(0, 25)) {
    const path = fill(r.path);
    let q = request(app)[r.method.toLowerCase()](path);
    if (r.method !== 'GET') q = q.send({});
    assert.equal((await q).status, 401, `${r.method} ${r.path}`);
    assert.equal((await demo.request(r.method, path, {})).status, 401);
  }
});
