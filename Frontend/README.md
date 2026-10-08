# Frontend

React 19 + Vite single-page app with a role-aware UI (admin, doctor, nurse, receptionist, pharmacist, lab technician). See the root README for the full picture.

- `npm run dev` - full stack mode, talks to the API at `VITE_API_URL` (default http://localhost:8080)
- `npm run dev:demo` - browser-only live preview with sample data (the same server code runs in the browser)
- `npm run build` - production build for the API (`VITE_API_URL=/api` behind the nginx proxy in Docker)
- `npm run build:pages` - live preview build for GitHub Pages (HashRouter, base `/Hospital-Management-Application/`)
- `npm run lint` (zero warnings allowed), `npm test`

Folders: `src/api` (HTTP client and the in-browser server wrapper), `src/pages` (one file per screen), `src/ui` (shared components and forms), `src/hooks`, `src/lib`, `src/context`. The permission matrix and domain rules come from `../shared`.
