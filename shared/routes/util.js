import { isId } from '../validate.js';

export class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}
export const bad = (m) => new HttpError(400, m);
export const forbidden = (m = 'You do not have permission to perform this action') => new HttpError(403, m);
export const notFound = (m = 'Not found') => new HttpError(404, m);
export const conflict = (m) => new HttpError(409, m);

export const escapeRegex = (s) => String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
export const rx = (s) => ({ $regex: escapeRegex(s), $options: 'i' });

// ?page&limit&search (limit capped at 100)
export function paging(query = {}, { defaultLimit = 10, maxLimit = 100 } = {}) {
  const page = Math.max(1, parseInt(query.page, 10) || 1);
  const limit = Math.min(maxLimit, Math.max(1, parseInt(query.limit, 10) || defaultLimit));
  const search = typeof query.search === 'string' ? query.search.trim().slice(0, 100) : '';
  return { page, limit, search };
}

// Runs a paginated query -> { data, page, limit, total, pages }
export async function paged(store, col, filter, { page, limit }, { sort = { _id: 1 }, map } = {}) {
  const total = await store.count(col, filter);
  let data = await store.find(col, filter, { sort, skip: (page - 1) * limit, limit });
  if (map) data = await map(data);
  return { data, page, limit, total, pages: Math.max(1, Math.ceil(total / limit)) };
}

export function needId(value, label = 'ID') {
  if (!isId(value)) throw bad(label === 'ID' ? 'Invalid ID' : `A valid ${label} is required`);
  return value;
}

export async function getOr404(store, col, id, label = 'Record') {
  needId(id);
  const doc = await store.get(col, id);
  if (!doc) throw notFound(`${label} not found`);
  return doc;
}

export const pick = (obj, keys) => Object.fromEntries(keys.filter((k) => obj?.[k] !== undefined).map((k) => [k, obj[k]]));
export const pickFields = (obj, spec) => (spec === '*' ? obj : pick(obj, ['_id', ...spec.split(' ')]));

// Replace id fields by small objects: join(store, docs, { patient: ['patients', 'name age gender'] })
export async function join(store, input, spec) {
  const list = Array.isArray(input) ? input : input ? [input] : [];
  for (const [field, [col, fields]] of Object.entries(spec)) {
    const ids = [...new Set(list.map((d) => d[field]).filter((v) => typeof v === 'string' && isId(v)))];
    if (!ids.length) continue;
    const found = await store.find(col, { _id: { $in: ids } });
    const map = new Map(found.map((d) => [String(d._id), pickFields(d, fields)]));
    for (const d of list) {
      if (typeof d[field] === 'string') d[field] = map.get(d[field]) || null;
    }
  }
  return Array.isArray(input) ? list : list[0];
}

export const numberOf = (prefix, seq) => `${prefix}-${String(seq).padStart(6, '0')}`;
export const idOf = (x) => (x && typeof x === 'object' ? String(x._id) : x ? String(x) : '');

// Resolve ?doctor=me to the signed-in doctor's record
export function doctorFilter(value, user) {
  if (value === 'me') return user.doctor || '000000000000000000000000';
  return value;
}

export const nowIso = (ctx) => ctx.now.toISOString();

export const PATIENT_BRIEF = 'name age gender mrn';
export const PATIENT_FULL = 'name age gender mrn phone allergies bloodGroup conditions';
export const DOCTOR_BRIEF = 'name specialty';
