// Tiny schema validator used for request bodies on the server and in the live preview.
// Usage: const s = schema({ name: str({ max: 80 }), age: num({ min: 0, max: 150, optional: true }) });
//        const { ok, value, errors } = s.parse(body);
const isBlank = (v) => v === undefined || v === null || v === '';

const make = (kind, opts, check) => ({ kind, opts, check });

export const str = (o = {}) =>
  make('string', o, (v, label) => {
    if (typeof v !== 'string') return [`${label} must be text`];
    const s = o.trim === false ? v : v.trim();
    if (!s) return o.empty ? [null, ''] : [`${label} is required`];
    if (o.min && s.length < o.min) return [`${label} must be at least ${o.min} characters`];
    if (o.max && s.length > o.max) return [`${label} must be at most ${o.max} characters`];
    if (o.pattern && !o.pattern.test(s)) return [o.message || `${label} is not valid`];
    return [null, o.lower ? s.toLowerCase() : s];
  });

export const num = (o = {}) =>
  make('number', o, (v, label) => {
    const n = typeof v === 'string' && v.trim() === '' ? NaN : Number(v);
    if (!Number.isFinite(n)) return [`${label} must be a number`];
    if (o.int && !Number.isInteger(n)) return [`${label} must be a whole number`];
    if (o.min !== undefined && n < o.min) return [`${label} must be at least ${o.min}`];
    if (o.max !== undefined && n > o.max) return [`${label} must be at most ${o.max}`];
    return [null, n];
  });

export const oneOf = (values, o = {}) =>
  make('enum', o, (v, label) => (values.includes(v) ? [null, v] : [`${label} must be one of: ${values.join(', ')}`]));

export const bool = (o = {}) =>
  make('boolean', o, (v, label) => {
    if (v === true || v === 'true') return [null, true];
    if (v === false || v === 'false') return [null, false];
    return [`${label} must be true or false`];
  });

export const date = (o = {}) =>
  make('date', o, (v, label) => {
    const d = new Date(v);
    if (Number.isNaN(d.getTime())) return [`${label} must be a valid date`];
    return [null, d.toISOString()];
  });

export const id = (o = {}) =>
  make('id', o, (v, label) => (isId(v) ? [null, v] : [`${label} must be a valid id`]));

function runRule(rule, v, label) {
  const [err, value, many] = rule.check(v, label);
  if (err) return { errors: many || [err] };
  return { errors: [], value };
}

export const arr = (item, o = {}) =>
  make('array', o, (v, label) => {
    if (!Array.isArray(v)) return [`${label} must be a list`];
    if (o.min && v.length < o.min) return [`${label} needs at least ${o.min} item${o.min > 1 ? 's' : ''}`];
    if (o.max && v.length > o.max) return [`${label} can have at most ${o.max} items`];
    const out = [];
    const errs = [];
    v.forEach((x, i) => {
      const r = runRule(item, x, `${label} #${i + 1}`);
      if (r.errors.length) errs.push(...r.errors);
      else out.push(r.value);
    });
    return errs.length ? [errs[0], undefined, errs] : [null, out];
  });

export const shape = (fields, o = {}) =>
  make('object', o, (v, label) => {
    if (!v || typeof v !== 'object' || Array.isArray(v)) return [`${label} must be an object`];
    const r = parseFields(fields, v, o.partial, label);
    return r.errors.length ? [r.errors[0], undefined, r.errors] : [null, r.value];
  });

const LABELS = (k) => k.replace(/([A-Z])/g, ' $1').replace(/^./, (c) => c.toUpperCase());

function parseFields(fields, body, partial, prefix = '') {
  const out = {};
  const errors = [];
  for (const [key, rule] of Object.entries(fields)) {
    const label = rule.opts.label || (prefix && prefix !== 'Body' ? `${prefix} ${key}` : LABELS(key));
    const v = body[key];
    const emptyOk = rule.kind === 'string' && v === '' && rule.opts.empty;
    if (isBlank(v) && !emptyOk) {
      if (partial && v === undefined) continue;
      if (v === null && rule.opts.nullable) {
        out[key] = null;
        continue;
      }
      if (rule.opts.optional || rule.opts.default !== undefined) {
        if (rule.opts.default !== undefined && v === undefined) out[key] = rule.opts.default;
        continue;
      }
      errors.push(`${label} is required`);
      continue;
    }
    const r = runRule(rule, v, label);
    if (r.errors.length) errors.push(...r.errors);
    else out[key] = r.value;
  }
  return { value: out, errors };
}

export function schema(fields, { partial = false } = {}) {
  return {
    fields,
    parse(body) {
      const src = body && typeof body === 'object' && !Array.isArray(body) ? body : {};
      const { value, errors } = parseFields(fields, src, partial, 'Body');
      return { ok: errors.length === 0, value, errors };
    },
    partial() {
      return schema(fields, { partial: true });
    },
  };
}

export function isId(v) {
  return typeof v === 'string' && /^[a-f0-9]{24}$/i.test(v);
}
