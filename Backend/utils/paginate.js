// Shared helpers for ?page&limit&search list endpoints.
export const escapeRegex = (s) => String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

export function parsePaging(query, { defaultLimit = 10, maxLimit = 100 } = {}) {
  const page = Math.max(1, parseInt(query.page, 10) || 1);
  const limit = Math.min(maxLimit, Math.max(1, parseInt(query.limit, 10) || defaultLimit));
  const search = typeof query.search === 'string' ? query.search.trim().slice(0, 100) : '';
  return { page, limit, search };
}

// Runs a paginated query and returns { data, page, limit, total, pages }.
export async function paginate(Model, filter, { page, limit }, { sort = { _id: 1 }, populate = [] } = {}) {
  const total = await Model.countDocuments(filter);
  let q = Model.find(filter).sort(sort).skip((page - 1) * limit).limit(limit);
  for (const p of populate) q = q.populate(...p);
  const data = await q;
  return { data, page, limit, total, pages: Math.max(1, Math.ceil(total / limit)) };
}
