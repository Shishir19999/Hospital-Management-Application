import express from "express";
import cors from "cors";
import authRouter from './routes/auth.js';
import patientsRouter from './routes/patients.js';
import doctorsRouter from './routes/doctors.js';
import appointmentsRouter from './routes/appointments.js';
import { authenticate } from './middleware/auth.js';

// CORS_ORIGIN: comma-separated list of allowed browser origins
// (e.g. http://localhost:5173,http://192.168.1.20:5173). Unset = allow any origin (dev).
export function corsOptions() {
  const list = (process.env.CORS_ORIGIN || '').split(',').map((s) => s.trim()).filter(Boolean);
  return list.length ? { origin: list } : {};
}

export function createApp() {
  const app = express();
  app.use(cors(corsOptions()));
  app.use(express.json());
  // Express 5 leaves req.body undefined when no body is sent; keep the Express 4 behavior (empty object).
  app.use((req, res, next) => { if (req.body === undefined) req.body = {}; next(); });
  app.use(express.urlencoded({ extended: true }));

  app.use('/auth', authRouter);
  // Everything below requires a valid token; role checks live in each router.
  app.use('/patients', authenticate, patientsRouter);
  app.use('/doctors', authenticate, doctorsRouter);
  app.use('/appointments', authenticate, appointmentsRouter);
  return app;
}
