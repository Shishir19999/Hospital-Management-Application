import express from "express";
import cors from "cors";
import { dispatch, findRoute } from "../shared/engine.js";
import { ROUTES } from "../shared/routes/index.js";
import { authenticateRequest, passwordHelpers } from "./middleware/auth.js";
import { createMongoStore } from "./store/mongoStore.js";
import { createLimiter } from "./utils/rateLimit.js";

// CORS_ORIGIN: comma-separated list of allowed browser origins
// (e.g. http://localhost:5173,http://192.168.1.20:5173). Unset = allow any origin (dev).
export function corsOptions() {
  const list = (process.env.CORS_ORIGIN || '').split(',').map((s) => s.trim()).filter(Boolean);
  return list.length ? { origin: list } : {};
}

const num = (v, d) => (Number.isFinite(Number(v)) && Number(v) > 0 ? Number(v) : d);

// rateLimit: false turns the limiters off (tests); otherwise limits come from the environment.
export function createApp({ rateLimit = true } = {}) {
  const app = express();
  const store = createMongoStore();
  app.disable('x-powered-by');
  app.use(cors(corsOptions()));
  app.use(express.json({ limit: '256kb' }));
  // Express 5 leaves req.body undefined when no body is sent; keep the Express 4 behavior (empty object).
  app.use((req, res, next) => { if (req.body === undefined) req.body = {}; next(); });
  app.use(express.urlencoded({ extended: true }));

  app.get('/health', (req, res) => res.json({ ok: true }));

  if (rateLimit) {
    // Failed sign-ins are limited per address and email; everything else per address.
    const failedLogins = createLimiter({
      windowMs: num(process.env.LOGIN_WINDOW_MS, 15 * 60 * 1000),
      max: num(process.env.LOGIN_MAX_FAILURES, 10),
      key: (req) => `${req.ip}|${String(req.body?.email || '').toLowerCase()}`,
      countOnly: (res) => res.statusCode === 401,
      message: 'Too many failed sign-in attempts. Please wait a few minutes and try again.',
    });
    const general = createLimiter({
      windowMs: 60 * 1000,
      max: num(process.env.RATE_LIMIT_PER_MINUTE, 600),
      message: 'Too many requests. Please slow down.',
    });
    app.use(general);
    app.post('/auth/login', failedLogins);
  }

  app.use(async (req, res) => {
    try {
      const { user, error } = await authenticateRequest(req);
      const hit = findRoute(ROUTES, req.method, req.path);
      if (error && !(hit && hit.route.public)) return res.status(401).json({ error });
      const out = await dispatch(ROUTES, {
        method: req.method, path: req.path, query: req.query, body: req.body, user: error ? null : user, store, helpers: passwordHelpers, now: new Date(),
      }, { onError: (e) => console.error(e) });
      res.status(out.status).json(out.body);
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'Internal Server Error' });
    }
  });

  // body-parser failures (bad JSON, payload too large)
  // eslint-disable-next-line no-unused-vars
  app.use((err, req, res, next) => {
    res.status(err.status || 400).json({ error: err.type === 'entity.too.large' ? 'Request body is too large' : 'Malformed request body' });
  });
  return app;
}
