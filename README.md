# QueueCare — Real-Time Queue & Token Display System

A full-stack queue management system for clinics, hospitals, dental practices, and
veterinary clinics. Receptionists register patients/pets, generate queue tokens, call
the next patient, and every change appears **instantly** on the waiting-room display
via WebSockets — no refresh needed.

**Stack:** React 18 · Vite · Tailwind CSS · React Router · Axios · Socket.IO ·
Node.js · Express · MongoDB/Mongoose · JWT (httpOnly cookie) · bcrypt

---

## Project structure

```text
queuecare/
├── README.md
├── client/                          # React SPA
│   ├── vite.config.js               # proxies /api + /socket.io → :5000
│   └── src/
│       ├── api/                     # axios (withCredentials) + thin wrappers
│       │   └── authApi queueApi tokenApi roomApi dashboardApi
│       │       displayApi adminApi analyticsApi auditApi
│       ├── context/                 # Auth, Socket (auto-rejoin), Toast
│       ├── components/              # Navbar, TokenTable, StatusChip, Charts,
│       │                            # RegisterPatientModal, ConfirmDialog, …
│       └── pages/
│           ├── Login, Dashboard, QueuePanel, History, Rooms, Profile
│           ├── Analytics            # KPIs + served/day, peak hours, volume charts
│           ├── Display              # PUBLIC waiting-room TV screen (/display/:key)
│           └── admin/Settings, admin/Users, admin/AuditLogs
└── server/
    ├── server.js                    # Express + Socket.IO on one HTTP server
    ├── config/db.js  utils/         # serviceDate (tz-aware), cookies, audit, …
    ├── models/                      # Clinic User Queue QueueCounter
    │                                # Token Room AuditLog
    ├── middleware/                  # auth (cookie JWT), roles, rateLimit, errors
    ├── controllers/                 # auth queues tokens rooms dashboard
    │                                # display admin analytics
    ├── routes/                      # /api/auth /queues /tokens /rooms
    │                                # /dashboard /display /admin /analytics
    ├── socket/                      # rooms, auth, event router, snapshots
    ├── seed/seed.js
    └── tests/                       # jest + supertest (+ mongodb-memory-server)
```

---

## Quick start

### Prerequisites

- Node.js 18+, npm
- MongoDB running locally (or an Atlas URI)

### 1. Backend

```bash
cd server
cp .env.example .env        # then set MONGO_URI + a strong JWT_SECRET
npm install
npm run seed                # demo clinic, users, queues, rooms, 18 tokens
npm run dev                 # http://localhost:5000
```

### 2. Frontend

```bash
cd client
npm install
npm run dev                 # http://localhost:5173 (proxies /api + /socket.io)
```

### Environment (`server/.env`)

```env
PORT=5000
NODE_ENV=development
MONGO_URI=mongodb://localhost:27017/queuecare
JWT_SECRET=<redacted>   # long random string in production
JWT_EXPIRE=8h
CLIENT_URL=http://localhost:5173
```

### Seed accounts (demo only — never in frontend code)

| Role         | Email                  | Password      |
|--------------|------------------------|---------------|
| Admin        | admin@queuecare.local  | Admin123!     |
| Receptionist | reception1@queuecare.local | Reception123! |
| Receptionist | reception2@queuecare.local | Reception123! |
| Practitioner | doctor1@queuecare.local | Doctor123!   |

The seed prints the waiting-room display URL (`/display/<32-hex-key>`).

---

## REST API overview (all under `/api`, envelope `{ success, message, data }`)

| Area | Endpoints |
|---|---|
| Auth | `POST /auth/login` (rate-limited) · `POST /auth/logout` · `GET /auth/me` · `PATCH /auth/password` |
| Queues | `GET /queues` · `POST /queues` (admin) · `GET /queues/:id` · `GET /queues/:id/tokens` · `POST /queues/:id/tokens` (register) · `POST /queues/:id/call-next` (atomic claim, 404 when empty) |
| Tokens | `GET /tokens/:id` · `PATCH /tokens/:id/call` · `/recall` · `/start-serving` · `/skip` · `/return` · `/complete` · `/cancel` — every transition validated server-side (invalid → 409) |
| Rooms | `GET /rooms` · `POST /rooms` · `PATCH /rooms/:id` · `DELETE /rooms/:id` (admin) |
| Dashboard | `GET /dashboard/stats` (also returns `clinicName` + `display` key for receptionists) |
| Display | `GET /display/:displayKey` — **public**, public-safe payload only |
| Analytics | `GET /analytics/queue?from=&to=&queueId=` — served/day, avg wait/service, peak hours, volume by queue |
| Admin | `GET|POST /admin/users` · `PATCH /admin/users/:id` · `GET|PATCH /admin/settings` · `POST /admin/settings/regenerate-display-key` · `GET /admin/audit-logs` |

**Token lifecycle:** `waiting → called → serving → completed`, plus
`called → recalled/skipped`, `serving → skipped`, `skipped → waiting` (return),
and `cancelled` from waiting/called/skipped. `completed`/`cancelled` are terminal.
Token numbers (`G001`) come from an atomic DB counter — never from the client —
and "call next" is a single atomic `findOneAndUpdate`, so two receptionists can
never claim different patients as "next".

## Socket.IO events

| Direction | Event | Notes |
|---|---|---|
| client → server | `queue:join { queueId?, role, displayKey? }` | staff authed via cookie; displays via key; server replies with a **snapshot** |
| client → server | `queue:leave` | unsubscribe |
| server → staff | `queue:updated`, `queue:stats` | refetch hints |
| server → staff | `token:called/recalled/serving/skipped/completed/cancelled` | full detail payload |
| server → display | `token:called/recalled/serving`, `queue:updated`, `display:snapshot` | **public-safe only** (token number, room, calledAt) |
| server → client | `display:error`, `queue:error` | invalid key / queue |

Rooms: `clinic:<id>` + `queue:<id>` (staff, ownership verified server-side),
`display:<key>` (public). Reconnect = socket.io auto-reconnect + client re-emits
`queue:join` → server re-validates and pushes a fresh snapshot. No refresh needed.

---

## Waiting-room display (second screen)

1. As a receptionist, click **Open display screen** on the dashboard (or copy the
   key from Admin → Settings).
2. Open the URL on the waiting-room TV/monitor: `http://<host>:5173/display/<key>`
   — no login required, no admin rights exposed.
3. Press the fullscreen button (top-right) for kiosk mode.

The display shows the current token in huge type, the room to proceed to,
recently called tokens, waiting count, clinic name and announcement. It never
shows patient names, phones, or notes.

## Manual acceptance test (from the spec)

1. Open the **receptionist panel** (`/queue`) in browser A and the **display**
   (`/display/<key>`) in browser B.
2. In A: register a token → **B updates instantly** (waiting count).
3. In A: **Call next** (pick a room) → **B shows the token + room immediately**.
4. In A: skip a token, then complete the called one → both screens stay in sync.
5. In B: hit refresh (or kill/reopen the tab) → the display restores the exact
   current state from the snapshot — no stale data.

## Running the tests

```bash
cd server
npm test            # jest --runInBand
```

- `transitions.test.js` — table-driven check of the status state machine (no DB).
- `serviceDate.test.js` — timezone-aware service-date logic (no DB).
- `api.test.js` — 20× concurrent registrations (unique numbers, seqs 1–20),
  5× concurrent call-next (5 distinct claims), transition 409s, RBAC
  (401/403), clinic isolation, empty-queue 404, analytics shape.
- `socket.test.js` — bad-cookie rejection, malformed display key →
  `display:error`, `projectForDisplay` strips private fields, and a live
  `token:called` broadcast reaching a display room with a public-safe payload.

DB-backed tests use `mongodb-memory-server` (downloads a mongod binary on first
run — needs network). If it can't start, those tests **skip gracefully** and the
pure-logic tests still run.

## Deployment notes

- **Build the client:** `cd client && npm run build` → serve `dist/` statically
  (or via the same Express app).
- **Env:** set `NODE_ENV=production`, a strong `JWT_SECRET`, `MONGO_URI`
  (MongoDB Atlas), and the real `CLIENT_URL`. Cookies become `secure` automatically
  in production — serve everything over **HTTPS**.
- **Single origin (recommended):** serve the SPA from Express and proxy
  `/socket.io` through the same host — no CORS issues, cookies just work.
  Behind nginx: proxy `/api` and `/socket.io` (with `proxy_http_version 1.1` +
  `Upgrade` headers for websockets) to the Node process.
- **Process:** PM2 (`pm2 start server.js -i max`) or the Docker sketch below.
  Note: rate limiters use in-memory stores — put the app behind sticky sessions
  or a shared store (e.g. Redis) if you run multiple instances.
- **Docker sketch:**
  ```dockerfile
  FROM node:20-alpine
  WORKDIR /app
  COPY server/package*.json ./server/
  RUN cd server && npm ci --omit=dev
  COPY server ./server
  COPY client/dist ./server/public   # serve statically from Express
  ENV NODE_ENV=production PORT=5000
  CMD ["node", "server/server.js"]
  ```
- **Ops:** run `npm run seed` once per fresh database; rotate the display key
  from Admin → Settings if a TV URL ever leaks; review Admin → Audit logs
  periodically.

## Security & privacy notes

- Passwords hashed with bcrypt (10 rounds); JWT in httpOnly cookie (`SameSite=lax`,
  `secure` in production); role-based access (`admin` / `receptionist` / `practitioner`).
- Every record is clinic-scoped — cross-clinic reads return 404.
- The public display surface (endpoint + socket room) only ever carries token
  numbers, room names, and counts — never names, phones, or notes.
- This is a queue-management demo, not a certified medical-records system.
