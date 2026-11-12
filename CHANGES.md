# QueueCare — modernised (CHANGES.md)

Based on the original `queuecare.zip`. No backend API contract, routes,
features, or branding were changed. All fixes below keep the existing
`{ success, message, data }` envelope and endpoint shapes.

## Bugs found and fixed

1. **Waiting-room display never received live updates** — `client/src/context/SocketContext.jsx`
   The shared Socket.IO client opened its handshake with no `auth` and no
   staff cookie on the public `/display/:key` page, so the server rejected
   it ("Not authenticated") and the TV screen only ever showed the one-time
   REST snapshot. Fixed: the socket now sends handshake `auth: { role: 'display' }`
   whenever the current route is `/display/<32-hex-key>` (re-evaluated on
   every reconnect), and `SocketContext` exposes a `reconnect()` helper.
   `client/src/pages/Login.jsx` calls it on mount (drops a stale staff
   connection after logout) and after a successful login (fresh cookie).
2. **Display went stale when a token finished** — `client/src/pages/Display.jsx`
   The server only forwards `called`/`recalled`/`serving` as token events to
   display rooms; complete/cancel/skip arrive as `queue:updated`, which the
   page never subscribed to — a finished token stayed on screen. Fixed: the
   page now subscribes to `queue:updated` and refetches the snapshot.
3. **Saving clinic settings blanked the display URL** — `client/src/pages/admin/Settings.jsx`
   `PATCH /admin/settings` returns only `{ name, timezone }`, but the page
   replaced its whole settings object with the response, losing `displayKey`
   until reload. Fixed: the response is now merged into the existing settings.
4. **Profile "Clinic" always showed "—"** — `server/middleware/auth.js`, `server/controllers/authController.js`
   `req.user.clinic` was a bare ObjectId, so `user.clinic.name` was undefined.
   Fixed: `protect` and `login` now populate the clinic name. No response
   shape change (the field already existed).
5. **Analytics could refetch in a loop on error** — `client/src/pages/Analytics.jsx`
   The queue-list effect depended on `[error]`, but `error` is a new function
   identity on every `ToastProvider` render, so a failed fetch re-ran the
   effect (and re-toasted). Fixed: the effect runs once on mount.
6. **Missing `server/.env.example`** — new file. The README and `config/db.js`
   both tell the user to copy it, but it did not exist in the zip.
7. **Dead code** — `client/src/pages/Dashboard.jsx` fetched the room list into
   state that was never rendered. Removed the unused fetch/state.

Checked and found **correct** (no change): all client↔server field names
(token/queue/room/dashboard/analytics/display/admin payloads), token state
machine wiring, socket event names/payloads, route guards, and the seed data.

## UI changes (same Tailwind setup, same pages/features)

- New shared styles in `client/src/index.css`: `.btn-primary`, `.btn-blue`,
  `.btn-danger`, `.btn-secondary`, `.btn-ghost`, `.input`, `.label`, `.card`,
  `.card-hover`, `.page-title`, `.page-subtitle`, plus a teal `:focus-visible`
  ring and selection colour. All pages now compose these instead of repeating
  long class strings.
- **Dark header**: `client/src/components/Navbar.jsx` is now slate-900 with
  white text, a teal logo tile, and a matching dark user menu; light content
  below is unchanged.
- **Login** (`client/src/pages/Login.jsx`): tighter card with a ring and
  softer shadow, shared primary button.
- **Waiting-room display** (`client/src/pages/Display.jsx`): dark slate-900
  header and footer, current token shown in a white card with a ring, waiting
  count in a dark pill. Still shows only token numbers, room names and counts.
- **Stat cards** (`client/src/components/StatCard.jsx`): subtle lift + shadow
  on hover. Tables, modals, toasts and charts keep their layout; buttons and
  inputs are now consistent across Dashboard, Queue, History, Rooms, Profile,
  Analytics, Settings, Users and Audit logs.

## How to run

```bash
# Backend — needs MongoDB running locally (or an Atlas URI)
cd server
cp .env.example .env        # set MONGO_URI + a strong JWT_SECRET
npm install
npm run seed                # demo clinic, users, queues, rooms, 18 tokens
npm run dev                 # http://localhost:5000

# Frontend
cd client
npm install
npm run dev                 # http://localhost:5173 (proxies /api + /socket.io)
# Production build: npm run build  ->  client/dist/
```

Seed logins: `admin@queuecare.local / Admin123!`,
`reception1@queuecare.local / Reception123!`,
`doctor1@queuecare.local / Doctor123!`.

## What was tested

- `cd client && npm run build` — **passes** (vite 5.4.21, 1708 modules,
  `dist/assets/index-DEDwpYLX.js` 366.17 kB / gzip 110.67 kB,
  `dist/assets/index-C8a5q4J6.css` 36.44 kB). Baseline build before changes
  also passed, so no regression was introduced.
- `cd server && npx jest --runInBand --forceExit` — **34/34 tests pass**
  (4 suites: transitions, serviceDate, api, socket), including the DB-backed
  API tests (concurrent registrations, call-next claims, 409s, RBAC) and the
  socket tests, using mongodb-memory-server.
- `node --check` on every server `.js` file — **no syntax errors**.
- Live smoke test against the real server + in-memory MongoDB (8 checks,
  all passed): `/api/health` OK; a socket with no cookie/auth is rejected
  (proves the original display bug); a socket with display handshake auth
  receives `display:snapshot` with the called token and no patient names;
  login works and returns the populated clinic name; `/dashboard/stats`
  returns the expected shape incl. `display.displayKey`; public
  `/display/:key` returns the public-safe payload; a bad display key is 404.
- Not tested live (no local MongoDB / browser in this environment): the full
  click-through in a browser (login → register → call next → TV display
  updating). The server socket tests + the smoke test above cover the same
  paths at the protocol level; please verify the display updates instantly
  in the browser as the final check.

## Notes

- No `node_modules`, `dist/`, or `.env` files are included in this package.
  Run `npm install` in `client/` and `server/` as above.
- `server/.env.example` is included; create your own `server/.env` from it.
