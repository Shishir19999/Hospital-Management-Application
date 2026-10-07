# Hospital Management Application

A MERN-stack app for managing patients, doctors and appointments (CRUD, plus per-patient and per-doctor history views) with JWT login and role-based access.

## Live demo

**https://shishir19999.github.io/Hospital-Management-Application/**

A browser-only build with seeded sample data. There is no server and no database: everything is stored in your browser (localStorage) and never leaves your device. Use "Reset demo data" in the banner to start over.

| Role | Email | Password |
|---|---|---|
| admin | admin@example.com | Admin@123 |
| doctor | doctor@example.com | Doctor@123 |
| receptionist | receptionist@example.com | Reception@123 |

The login screen has buttons that fill these in.

## Features
- Dashboard with live stats and charts: appointments per day and per week, doctors by specialty, patient age and gender mix
- Agenda/calendar view with conflict warnings for overlapping appointments
- Global search (press `/`) across patients, doctors and appointments
- Sortable, filterable, paginated tables
- Patient detail page with a medical-history timeline; doctor pages with schedules
- Appointment status workflow: scheduled, completed, cancelled
- CSV export and a printable patient summary
- Role-aware UI: actions a role cannot use are hidden (admin, doctor, receptionist)
- Light and dark theme (follows the system, remembered), responsive from 320px, keyboard accessible, skeleton, empty and error states, toasts and confirm dialogs

Motion note: the landing hero and dashboard header/sections use a light parallax and scroll-reveal built with IntersectionObserver and requestAnimationFrame (transform and opacity only, no libraries). It is disabled with `prefers-reduced-motion` and on small or low-power screens, and is never applied to dense tables or forms.

## Run it

Full stack (API + MongoDB): follow Setup below, then `npm run dev` from the repo root.

Demo mode (no backend):
```
cd Frontend
npm install
npm run dev:demo        # local demo
npm run build:pages     # static build for GitHub Pages in Frontend/dist (base /Hospital-Management-Application/, hash routing)
```
Serve the contents of `Frontend/dist` from any static host.

## Stack
- Frontend: React 19, Vite 8, React Router, Axios
- Backend: Node.js, Express, Mongoose (MongoDB), JWT, bcryptjs

## Setup
1. Install dependencies:
   ```
   npm install
   npm install --prefix Backend
   npm install --prefix Frontend
   ```
2. Create env files from the examples and fill in your values (`JWT_SECRET` is required):
   ```
   cp Backend/.env.example Backend/.env
   cp Frontend/.env.example Frontend/.env
   ```
3. Run both servers from the repo root: `npm run dev`
4. Open the app and create the first account on the login page; it becomes the `admin`.

## Environment variables
| File | Variable | Purpose |
|------|----------|---------|
| Backend/.env | `MONGODB_URL` | MongoDB connection string |
| Backend/.env | `PORT` | API port (default 8080) |
| Backend/.env | `JWT_SECRET` | **Required.** Secret used to sign tokens (server exits if missing) |
| Backend/.env | `JWT_EXPIRE` | Token lifetime (default `1d`) |
| Frontend/.env | `VITE_API_URL` | Backend base URL (default `http://localhost:8080`) |

## Scripts
- Root: `npm run dev` (backend + frontend), `npm run server`, `npm run client`
- Backend: `npm start` (node server.js), `npm run dev` (nodemon)
- Frontend: `npm run dev`, `npm run build`, `npm run preview`, `npm run lint`

## Auth and roles
Send `Authorization: Bearer <token>` on every request except `/auth/*`.

| Method | Path | Notes |
|---|---|---|
| GET | `/auth/status` | `{ needsSetup }` - true until the first user exists |
| POST | `/auth/register` | `{ name, email, password, role? }`. Public only for the very first user (always `admin`); afterwards admin token required, `role` is `admin`, `doctor` or `receptionist` (default) |
| POST | `/auth/login` | `{ email, password }` returns `{ token, user }` |
| GET | `/auth/me` | Current user |

| Resource | Read | Create / update | Delete |
|---|---|---|---|
| Patients | all roles | admin, receptionist | admin |
| Doctors | all roles | admin | admin |
| Appointments | all roles | admin, receptionist | admin, receptionist |

## API
REST resources `/patients`, `/doctors`, `/appointments` with `/add`, `/delete/:id`, and updates via `PUT /:id` or `PATCH /:id` (partial bodies allowed). The legacy `POST /update/:id` still works. Also `/patients/:id/history` and `/doctors/:id/patient-history`.

Appointments take `patient`, `doctor`, `date` (future, date-time) and optional `duration` in minutes (default 30, 5-480). A request that overlaps another appointment of the same doctor returns `409`. Patients need `name`, `age` (0-150) and `gender` (Male/Female/Other); doctors need `name` and `specialty`; failures return `400 { error }`.

## Demo data
`cd Backend && npm run seed` (idempotent, uses `MONGODB_URL`, e.g. database `hospital`) creates 3 users, 20 doctors (varied specialties), 150 patients and 310 appointments (about 60% past, 40% future, weekdays 11:00-17:30 UTC, 30 or 60 min, never overlapping per doctor; plus 10 demo upcoming ones at 09:00-10:30 UTC). Uses `@faker-js/faker` with a fixed seed and reference date (2026-10-06), so re-running changes nothing.

| Role | Email | Password |
|---|---|---|
| admin | admin@example.com | Admin@123 |
| receptionist | receptionist@example.com | Reception@123 |
| doctor | doctor@example.com | Doctor@123 |


## Deploy with Docker

Files: `Backend/Dockerfile`, `Frontend/Dockerfile` (Vite build served by nginx, SPA fallback in `Frontend/nginx.conf`), `.dockerignore` in both folders and `docker-compose.yml` here (mongo + backend + frontend).

```bash
cp .env.example .env      # optional: set JWT_SECRET
docker compose up --build -d
```

- Frontend: http://localhost:8081 (`FRONTEND_PORT`), API: http://localhost:8080 (`BACKEND_PORT`). MongoDB is only reachable inside the compose network and its data lives in the `mongo-data` volume.
- `VITE_API_URL` is baked into the frontend bundle at build time and must be the address the **browser** uses to reach the backend (for a server: `http://<server-ip-or-domain>:8080`); rebuild with `docker compose build frontend` after changing it.
- `CORS_ORIGIN` must contain the origin the browser loads the frontend from (default `http://localhost:8081`); for a server use e.g. `http://<server-ip>:8081`.
- Seed demo data: `docker compose exec backend npm run seed` fails in the production image because the seed uses a dev dependency (`@faker-js/faker`); run the seed from your machine instead: `cd Backend && MONGODB_URL=mongodb://127.0.0.1:27017/hospital npm run seed` after temporarily publishing mongo (add `ports: ["27017:27017"]` to the `mongo` service).

> Note: these Docker files were written and reviewed but not built or run in the authoring environment (Docker engine was off).

## Open the app from a phone on the same Wi-Fi

1. Find the PC's LAN IP (`ipconfig` on Windows, look for the IPv4 address, e.g. `192.168.1.79`).
2. Start the backend bound to all interfaces (the default `HOST=0.0.0.0`) with the phone's origin allowed, and Vite with `--host`:
   ```bash
   # Backend
   CORS_ORIGIN=http://localhost:5173,http://192.168.1.79:5173 npm start
   # Frontend: the API URL must use the LAN IP, not localhost
   VITE_API_URL=http://192.168.1.79:8080 npm run dev -- --host 0.0.0.0 --port 5173
   ```
   (PowerShell: `$env:CORS_ORIGIN="..."; npm start`.)
3. Allow the two ports through Windows Firewall (first run usually prompts; otherwise add an inbound rule for TCP 8080 and 5173, "Private" network only).
4. On the phone (same network) open `http://192.168.1.79:5173`.

Without `CORS_ORIGIN` set the API accepts any origin. If the phone shows the page but API calls fail, `VITE_API_URL` still points at `localhost` or the origin is missing from `CORS_ORIGIN`.

## Tests

`cd Backend && npm test` (node:test + supertest) runs against a throwaway local database that is dropped afterwards (set `TEST_MONGO_URI` to change the server, default `mongodb://127.0.0.1:27017`).

## Pagination and logout (API)
- `GET /patients`, `/doctors`, `/appointments` accept `?page=1&limit=10&search=text` (limit max 100) and return `{ data, page, limit, total, pages }`. Appointments search matches patient or doctor name.
- `GET /patients/lookup` and `GET /doctors/lookup` return the full light lists (`[{_id, name(, specialty)}]`) used by the appointment form dropdowns.
- `POST /auth/logout` bumps the user's `tokenVersion`; every JWT issued earlier (all devices) is rejected afterwards, as are tokens of deleted users. Role is always read from the database, not the token.
