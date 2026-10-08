import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PERMISSIONS, PERMISSION_KEYS, ROLES, ROLE_LABELS, can, permsFor, rolesFor, isRole } from '../policy.js';
import { ROUTES } from '../routes/index.js';
import { schema, str, num, oneOf, arr, shape, bool, id, date } from '../validate.js';

test('the matrix only names known roles and admin can do everything', () => {
  for (const [perm, roles] of Object.entries(PERMISSIONS)) {
    assert.ok(roles.length > 0, `${perm} has no roles`);
    for (const r of roles) assert.ok(ROLES.includes(r), `${perm} lists unknown role ${r}`);
    assert.ok(roles.includes('admin'), `${perm} must include admin`);
  }
  for (const r of ROLES) assert.ok(ROLE_LABELS[r], `label for ${r}`);
});

test('role helpers', () => {
  assert.equal(can('doctor', 'visits.consult'), true);
  assert.equal(can('nurse', 'visits.consult'), false);
  assert.equal(can('nurse', 'visits.vitals'), true);
  assert.equal(can('receptionist', 'visits.read'), false);
  assert.equal(can('pharmacist', 'pharmacy.dispense'), true);
  assert.equal(can('lab_tech', 'labs.result'), true);
  assert.equal(can('doctor', 'labs.result'), false);
  assert.equal(can('receptionist', 'billing.pay'), true);
  assert.equal(can('nurse', 'billing.read'), false);
  assert.equal(can('nobody', 'patients.read'), false);
  assert.equal(can('admin', 'does.not.exist'), false);
  assert.deepEqual(rolesFor('reports.read'), ['admin']);
  assert.ok(permsFor('lab_tech').includes('labs.collect'));
  assert.ok(isRole('nurse') && !isRole('janitor'));
});

test('existing roles keep their original behaviour', () => {
  assert.ok(can('receptionist', 'patients.create') && can('receptionist', 'appointments.write'));
  assert.ok(!can('receptionist', 'patients.remove') && !can('receptionist', 'doctors.manage'));
  assert.ok(can('doctor', 'doctors.read') && !can('doctor', 'appointments.write') && !can('doctor', 'patients.create'));
  assert.ok(can('admin', 'patients.remove') && can('admin', 'doctors.manage'));
});

test('every route permission exists and every permission guards a route', () => {
  const used = new Set(ROUTES.map((r) => r.perm).filter(Boolean));
  for (const p of used) assert.ok(PERMISSIONS[p], `route uses unknown permission ${p}`);
  for (const p of PERMISSION_KEYS) assert.ok(used.has(p), `permission ${p} is not used by any route`);
  for (const r of ROUTES) {
    if (!r.public && !r.perm) assert.ok(['/auth/me', '/auth/logout'].includes(r.path), `unguarded route ${r.method} ${r.path}`);
  }
});

test('validator: types, trimming, partial and nested rules', () => {
  const s = schema({ name: str({ max: 5 }), age: num({ min: 1, max: 9, int: true }), kind: oneOf(['a', 'b'], { optional: true }), tags: arr(str(), { max: 2, optional: true }), on: bool({ optional: true }), when: date({ optional: true }), owner: id({ optional: true }), box: shape({ n: num() }, { optional: true }) });
  assert.deepEqual(s.parse({ name: '  Bob ', age: '3', tags: ['x'], on: 'true' }).value, { name: 'Bob', age: 3, tags: ['x'], on: true });
  assert.equal(s.parse({ name: 'toolongname', age: 3 }).ok, false);
  assert.equal(s.parse({ name: 'a', age: 3.5 }).ok, false);
  assert.equal(s.parse({ name: 'a', age: 3, kind: 'z' }).ok, false);
  assert.equal(s.parse({ name: 'a', age: 3, tags: ['a', 'b', 'c'] }).ok, false);
  assert.equal(s.parse({ name: 'a', age: 3, when: 'nonsense' }).ok, false);
  assert.equal(s.parse({ name: 'a', age: 3, owner: 'xyz' }).ok, false);
  assert.equal(s.parse({ name: 'a', age: 3, box: { n: 'q' } }).ok, false);
  assert.equal(s.parse(null).ok, false);
  assert.equal(s.partial().parse({ age: 4 }).ok, true);
  assert.deepEqual(s.partial().parse({ age: 4 }).value, { age: 4 });
  assert.match(s.parse({}).errors.join(), /Name is required/);
});
