// In-memory document store with a small subset of MongoDB query syntax. It backs the browser-only
// preview and the engine tests; the server uses the same async interface on top of Mongoose.
const ISO = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?Z$/;

const norm = (v) => (typeof v === 'string' && ISO.test(v) ? Date.parse(v) : v instanceof Date ? v.getTime() : v);

const cmp = (a, b) => {
  const x = norm(a);
  const y = norm(b);
  if (x == null && y == null) return 0;
  if (x == null) return 1;
  if (y == null) return -1;
  if (typeof x === 'number' && typeof y === 'number') return x - y;
  return String(x) < String(y) ? -1 : String(x) > String(y) ? 1 : 0;
};

const same = (a, b) => cmp(a, b) === 0;

function matchValue(have, cond) {
  if (cond && typeof cond === 'object' && !(cond instanceof Date) && !Array.isArray(cond)) {
    return Object.entries(cond).every(([op, arg]) => {
      switch (op) {
        case '$in': return arg.some((a) => (Array.isArray(have) ? have.some((h) => same(h, a)) : same(have, a)));
        case '$nin': return !arg.some((a) => (Array.isArray(have) ? have.some((h) => same(h, a)) : same(have, a)));
        case '$ne': return Array.isArray(have) ? !have.some((h) => same(h, arg)) : !same(have, arg);
        case '$gt': return have != null && cmp(have, arg) > 0;
        case '$gte': return have != null && cmp(have, arg) >= 0;
        case '$lt': return have != null && cmp(have, arg) < 0;
        case '$lte': return have != null && cmp(have, arg) <= 0;
        case '$exists': return (have !== undefined && have !== null) === !!arg;
        case '$regex': return have != null && new RegExp(arg, cond.$options || '').test(String(have));
        case '$options': return true;
        default: throw new Error(`Unsupported operator ${op}`);
      }
    });
  }
  if (Array.isArray(have) && !Array.isArray(cond)) return have.some((h) => same(h, cond));
  return same(have, cond);
}

export function matches(doc, filter = {}) {
  return Object.entries(filter).every(([k, cond]) => {
    if (k === '$or') return cond.some((f) => matches(doc, f));
    if (k === '$and') return cond.every((f) => matches(doc, f));
    return matchValue(doc[k], cond);
  });
}

let counter = Math.floor(Math.random() * 0xffffff);
export function newId() {
  const ts = Math.floor(Date.now() / 1000).toString(16).padStart(8, '0');
  let rand = '';
  for (let i = 0; i < 10; i++) rand += Math.floor(Math.random() * 16).toString(16);
  counter = (counter + 1) % 0xffffff;
  return ts + rand + counter.toString(16).padStart(6, '0');
}

const clone = (x) => (x === undefined ? x : JSON.parse(JSON.stringify(x)));

function sortDocs(docs, sort) {
  const keys = Object.entries(sort || { _id: 1 });
  return [...docs].sort((a, b) => {
    for (const [k, dir] of keys) {
      const c = cmp(a[k], b[k]);
      if (c) return c * (dir < 0 ? -1 : 1);
    }
    return 0;
  });
}

// db: plain object { collection: [docs], counters: {} }; onChange() runs after every write.
export function createMemoryStore(db, onChange = () => {}) {
  const rows = (col) => (db[col] ||= []);
  const touch = (doc, create) => {
    const now = new Date().toISOString();
    if (create && !doc.createdAt) doc.createdAt = now;
    doc.updatedAt = now;
  };
  return {
    db,
    async find(col, filter = {}, { sort, skip = 0, limit = 0 } = {}) {
      let out = sortDocs(rows(col).filter((d) => matches(d, filter)), sort);
      if (skip) out = out.slice(skip);
      if (limit) out = out.slice(0, limit);
      return clone(out);
    },
    async count(col, filter = {}) {
      return rows(col).filter((d) => matches(d, filter)).length;
    },
    async get(col, id) {
      return clone(rows(col).find((d) => String(d._id) === String(id)) || null);
    },
    async insert(col, doc) {
      const rec = clone({ ...doc, _id: doc._id || newId() });
      touch(rec, true);
      rows(col).push(rec);
      onChange();
      return clone(rec);
    },
    async insertMany(col, docs) {
      const list = rows(col);
      for (const d of docs) {
        const rec = clone({ ...d, _id: d._id || newId() });
        touch(rec, true);
        list.push(rec);
      }
      onChange();
    },
    async update(col, id, patch) {
      const rec = rows(col).find((d) => String(d._id) === String(id));
      if (!rec) return null;
      Object.assign(rec, clone(patch));
      touch(rec);
      onChange();
      return clone(rec);
    },
    async updateMany(col, filter, patch) {
      let n = 0;
      for (const d of rows(col)) {
        if (matches(d, filter)) {
          Object.assign(d, clone(patch));
          touch(d);
          n++;
        }
      }
      if (n) onChange();
      return n;
    },
    async remove(col, id) {
      const list = rows(col);
      const i = list.findIndex((d) => String(d._id) === String(id));
      if (i < 0) return null;
      const [gone] = list.splice(i, 1);
      onChange();
      return clone(gone);
    },
    async removeMany(col, filter) {
      const list = rows(col);
      const keep = list.filter((d) => !matches(d, filter));
      const n = list.length - keep.length;
      db[col] = keep;
      if (n) onChange();
      return n;
    },
    async nextSeq(name) {
      db.counters ||= {};
      db.counters[name] = (db.counters[name] || 0) + 1;
      onChange();
      return db.counters[name];
    },
  };
}
