// Transport-free request engine: route matching, authorisation, validation, audit and errors.
// Express (server) and the in-browser preview both feed requests into `dispatch`.
import { can } from './policy.js';
import { HttpError } from './routes/util.js';

export function createRegistry() {
  const routes = [];
  const add = (method, path, opts, handler) => {
    const methods = Array.isArray(method) ? method : [method];
    for (const m of methods) {
      routes.push({ method: m, path, segs: path.split('/').filter(Boolean), ...opts, handler });
    }
  };
  return { routes, add };
}

function matchPath(segs, parts) {
  if (segs.length !== parts.length) return null;
  const params = {};
  for (let i = 0; i < segs.length; i++) {
    if (segs[i].startsWith(':')) params[segs[i].slice(1)] = decodeURIComponent(parts[i]);
    else if (segs[i] !== parts[i]) return null;
  }
  return params;
}

export function findRoute(routes, method, path) {
  const parts = path.split('?')[0].split('/').filter(Boolean);
  for (const r of routes) {
    if (r.method !== method) continue;
    const params = matchPath(r.segs, parts);
    if (params) return { route: r, params };
  }
  return null;
}

const fail = (status, error) => ({ status, body: { error } });

// request: { method, path, query, body, user, store, now, tz, helpers }
export async function dispatch(routes, request, { onError } = {}) {
  const { method, path, query = {}, body = {}, user = null, store, helpers = {} } = request;
  const now = request.now || new Date();
  const hit = findRoute(routes, method, path);
  if (!hit) return fail(404, 'Not found');
  const { route, params } = hit;
  if (!route.public && !user) return fail(401, 'Authentication required');
  if (route.perm && !can(user?.role, route.perm)) return fail(403, 'You do not have permission to perform this action');

  let data = body;
  if (route.body) {
    const parsed = (route.partial ? route.body.partial() : route.body).parse(body);
    if (!parsed.ok) return fail(400, parsed.errors.join('; '));
    data = parsed.value;
  }

  const tzRaw = Number(request.tz ?? query.tz);
  const ctx = {
    store, user, params, query, body: data, raw: body, now, helpers, route,
    tz: Number.isFinite(tzRaw) ? tzRaw : 0,
    note: '',
    async audit(action, entity, entityId, summary, actor = user) {
      await store.insert('audit', {
        at: now.toISOString(), user: actor?.id || '', userName: actor?.name || '', role: actor?.role || '',
        action, entity: entity || '', entityId: entityId ? String(entityId) : '', summary: summary || '',
      });
    },
  };
  try {
    const result = await route.handler(ctx);
    if (method !== 'GET' && route.audit !== false && user) {
      const id = result && typeof result === 'object' ? result._id || result.id || params.id : params.id;
      await ctx.audit(route.name || route.perm || `${method} ${route.path}`, route.entity, id, ctx.note || route.label || '');
    }
    return { status: route.status || 200, body: result === undefined ? { ok: true } : result };
  } catch (err) {
    if (err instanceof HttpError) return fail(err.status, err.message);
    if (err instanceof RangeError) return fail(400, err.message);
    onError?.(err);
    return fail(500, 'Internal Server Error');
  }
}
