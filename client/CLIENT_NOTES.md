# QueueCare — Stage 3 Notes (Frontend)

## API contract used (locked from Stage 1)

- **Base URL**: `/api` (Vite proxies `/api` → `http://localhost:5000`).
- **Auth**: httpOnly JWT cookie `token`. Every request uses `withCredentials: true`
  (`src/api/axios.js`). There is deliberately NO token in localStorage.
- **Envelope**: every response is `{ success, message, data }`; API wrappers return `data`.
- **Errors**: normalized to `{ message }` by the response interceptor; 401 redirects to
  `/login` (unless already there).

## Socket.IO contract used (Stage 2 implements the server side)

- Path `/socket.io` (Vite proxies it with `ws: true`), `withCredentials: true`,
  auto-reconnect with backoff. One shared instance in `SocketContext`.
- **Client → server**:
  - `queue:join` — `{ queueId?, role, displayKey? }` (queueId omitted for display screens)
  - `queue:leave` — `{ queueId?, displayKey? }`
- **Handshake auth** (`SocketContext`): staff sockets authenticate with the
  httpOnly cookie; when the current route is `/display/<32-hex-key>` the
  handshake instead carries `{ role: 'display' }`, because the public display
  has no cookie and the server rejects a cookie-less staff handshake. The
  auth is re-evaluated on every (re)connect, and `reconnect()` is exposed so
  login/logout can force a fresh handshake (Login calls it on mount and
  after a successful login).
- **Display refresh**: the display subscribes to `queue:updated` as well as
  the token events — complete/cancel/skip are only forwarded to display
  rooms as `queue:updated`, so without it a finished token stays on screen.
- **Server → client** (all handled):
  - `queue:updated` `{ queueId, serviceDate }` → refetch queue tokens
  - `queue:stats` `{ clinicId, serviceDate }` → refetch dashboard stats
  - `token:called` / `token:recalled` / `token:serving` / `token:skipped` /
    `token:completed` / `token:cancelled` → toast + refetch
  - `display:snapshot` — full public payload pushed right after a display joins
  - `queue:snapshot` — reserved for Stage 2; client ignores it if received (no-op safe)
- On `connect`, the client re-emits the last `queue:join` params so rooms
  resubscribe automatically after a drop.

## Display URL pattern

`/display/:displayKey` — public route, no login, no navbar. Example:

```
http://localhost:5173/display/<32-hex-key>
```

- The key comes from `GET /api/admin/settings` (`settings.displayKey`).
- The Dashboard's "Open display screen" button prefers a future
  `display.displayKey` field on `/api/dashboard/stats` (Stage 2 may add it),
  falls back to `/api/admin/settings` for admins, and hides gracefully for
  non-admins when the key is unavailable.
- The display renders ONLY token numbers, room names, calledAt, waiting count,
  clinic name and announcement. Patient names/phones/notes are never fetched
  or referenced in `src/pages/Display.jsx`.

## Route map

| Route | Access |
|---|---|
| `/login` | public |
| `/display/:displayKey` | public (no auth, no layout) |
| `/` (Dashboard) | staff |
| `/queue` (receptionist panel) | staff |
| `/history` | staff |
| `/rooms` | staff view; admin CRUD |
| `/profile` | staff |
| `/admin/settings`, `/admin/users` | `roles: ['admin']` |

## Decisions / deferrals

1. **Password change: DONE (Stage 4).** `PATCH /api/auth/password`
   `{ currentPassword, newPassword }` added; Profile page now has a
   change-password form with toasts.
2. **RegisterPatientModal kind toggle.** Receptionists cannot read
   `/api/admin/settings`, so the modal always offers a Person/Pet toggle and only
   *defaults* from `facilityType` when the admin settings are readable (Dashboard
   passes it through). This keeps registration usable for all staff roles.
3. **History scope = today.** `GET /queues/:id/tokens` is service-date scoped
   server-side. The History page fans out across today's queues and merges with
   client-side pagination; there is no cross-day query in Stage 1.
4. **Call Next room selection.** `POST /queues/:id/call-next` accepts an optional
   `roomId`; the UI defaults to "Auto room" (omitted) and otherwise uses the
   selected room. The backend claims the token atomically (409-safe).
5. **Demo login hint.** The login page shows `admin@queuecare.local / Admin123!`
   as hint text — these are the seeded demo credentials, not production secrets.
6. **Live toasts.** Socket `token:*` payloads carry `tokenNumber` and `roomName`
   (string IDs per the contract) and are used directly in toast messages.
