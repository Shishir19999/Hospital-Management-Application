import { ROLES, can } from '../policy.js';
import { schema, str, oneOf, bool, id } from '../validate.js';
import { HttpError, bad, conflict, forbidden, getOr404, notFound, paging, paged, rx, needId } from './util.js';

export const publicUser = (u) => ({ id: String(u._id), name: u.name, email: u.email, role: u.role, doctor: u.doctor || null, active: u.active !== false });

const EMAIL = /^\S+@\S+\.\S+$/;
const registerBody = schema({
  name: str({ max: 80 }),
  email: str({ pattern: EMAIL, message: 'A valid email is required', lower: true, label: 'Email' }),
  password: str({ min: 6, max: 200, trim: false, message: 'Password must be at least 6 characters' }),
  role: oneOf(ROLES, { optional: true }),
  doctor: id({ optional: true, nullable: true }),
});

export function register(add) {
  add('GET', '/auth/status', { public: true }, async ({ store }) => ({ needsSetup: (await store.count('users')) === 0 }));

  // The very first account becomes admin (public). Afterwards only admins can create users.
  add('POST', '/auth/register', { public: true, body: registerBody, name: 'users.create', entity: 'User', status: 201 }, async (ctx) => {
    const { store, body, user, helpers } = ctx;
    const first = (await store.count('users')) === 0;
    if (!first) {
      if (!user) throw new HttpError(401, 'Authentication required');
      if (!can(user.role, 'users.manage')) throw forbidden();
    }
    if (typeof ctx.raw.password === 'string' && ctx.raw.password.length < 6) throw bad('Password must be at least 6 characters');
    if (await store.count('users', { email: body.email })) throw conflict('Email already registered');
    const role = first ? 'admin' : body.role || 'receptionist';
    if (body.doctor && !(await store.get('doctors', body.doctor))) throw notFound('Doctor not found');
    const rec = await store.insert('users', {
      name: body.name, email: body.email, password: await helpers.hashPassword(body.password), role,
      doctor: role === 'doctor' ? body.doctor || null : null, active: true, tokenVersion: 0, readNotifications: [],
    });
    ctx.note = `Created ${role} account ${rec.email}`;
    const out = { user: publicUser(rec) };
    if (first) out.token = helpers.signToken(rec);
    return out;
  });

  add('POST', '/auth/login', { public: true, audit: false }, async (ctx) => {
    const { email, password } = ctx.body || {};
    if (typeof email !== 'string' || typeof password !== 'string' || !email || !password) throw bad('Email and password are required');
    const user = await ctx.helpers.verifyPassword(email.trim().toLowerCase(), password);
    if (!user) throw new HttpError(401, 'Invalid credentials');
    if (user.active === false) throw forbidden('This account has been disabled');
    await ctx.audit('auth.login', 'User', user._id, `${user.name} signed in`, { id: String(user._id), name: user.name, role: user.role });
    return { token: ctx.helpers.signToken(user), user: publicUser(user) };
  });

  add('GET', '/auth/me', {}, async ({ store, user }) => {
    const rec = await store.get('users', user.id);
    if (!rec) throw new HttpError(401, 'User no longer exists');
    return { user: publicUser(rec) };
  });

  // Revokes every token issued so far for this user (all devices).
  add('POST', '/auth/logout', { name: 'auth.logout' }, async ({ store, user }) => {
    const rec = await store.get('users', user.id);
    if (rec) await store.update('users', user.id, { tokenVersion: (rec.tokenVersion || 0) + 1 });
    return { message: 'Logged out' };
  });

  // ---- staff accounts (admin) ----
  add('GET', '/users', { perm: 'users.manage' }, async ({ store, query }) => {
    const p = paging(query);
    const filter = {};
    if (p.search) filter.$or = [{ name: rx(p.search) }, { email: rx(p.search) }];
    if (query.role && ROLES.includes(query.role)) filter.role = query.role;
    return paged(store, 'users', filter, p, { sort: { name: 1, _id: 1 }, map: (rows) => rows.map(publicUser) });
  });

  const patchBody = schema({
    name: str({ max: 80 }),
    role: oneOf(ROLES),
    active: bool(),
    doctor: id({ nullable: true }),
    password: str({ min: 6, max: 200, trim: false }),
  });
  add(['PATCH', 'PUT'], '/users/:id', { perm: 'users.manage', body: patchBody, partial: true, name: 'users.update', entity: 'User' }, async (ctx) => {
    const { store, params, body, user, helpers } = ctx;
    const target = await getOr404(store, 'users', params.id, 'User');
    const self = String(target._id) === user.id;
    if (self && (body.role && body.role !== target.role)) throw conflict('You cannot change your own role');
    if (self && body.active === false) throw conflict('You cannot disable your own account');
    const patch = {};
    for (const k of ['name', 'role', 'active']) if (body[k] !== undefined) patch[k] = body[k];
    if (body.doctor !== undefined) {
      if (body.doctor && !(await store.get('doctors', body.doctor))) throw notFound('Doctor not found');
      patch.doctor = body.doctor;
    }
    if (patch.role && patch.role !== 'doctor') patch.doctor = null;
    if (body.password) {
      patch.password = await helpers.hashPassword(body.password);
      patch.tokenVersion = (target.tokenVersion || 0) + 1;
    }
    if (patch.active === false) patch.tokenVersion = (target.tokenVersion || 0) + 1;
    const rec = await store.update('users', params.id, patch);
    ctx.note = `Updated ${rec.email}`;
    return publicUser(rec);
  });

  add('DELETE', '/users/:id', { perm: 'users.manage', name: 'users.remove', entity: 'User' }, async (ctx) => {
    const { store, params, user } = ctx;
    needId(params.id);
    if (params.id === user.id) throw conflict('You cannot delete your own account');
    const gone = await store.remove('users', params.id);
    if (!gone) throw notFound('User not found');
    ctx.note = `Removed ${gone.email}`;
    return { ok: true };
  });
}
