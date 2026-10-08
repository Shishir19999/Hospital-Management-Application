// Small fixed-window rate limiter (no external dependency, in-memory per process).
export function createLimiter({ windowMs, max, key = (req) => req.ip, skip = () => false, countOnly = () => true, message = 'Too many requests. Please try again later.' }) {
  const hits = new Map();
  const sweep = setInterval(() => {
    const now = Date.now();
    for (const [k, v] of hits) if (v.reset <= now) hits.delete(k);
  }, Math.min(windowMs, 60000));
  sweep.unref?.();

  const middleware = (req, res, next) => {
    if (skip(req)) return next();
    const k = key(req);
    const now = Date.now();
    let entry = hits.get(k);
    if (!entry || entry.reset <= now) {
      entry = { count: 0, reset: now + windowMs };
      hits.set(k, entry);
    }
    res.setHeader('RateLimit-Limit', String(max));
    res.setHeader('RateLimit-Remaining', String(Math.max(0, max - entry.count)));
    if (entry.count >= max) {
      res.setHeader('Retry-After', String(Math.ceil((entry.reset - now) / 1000)));
      return res.status(429).json({ error: message });
    }
    // Count after the response so callers can choose what counts (for example only failed logins).
    res.on('finish', () => {
      if (countOnly(res)) entry.count += 1;
    });
    next();
  };
  middleware.reset = () => hits.clear();
  return middleware;
}
