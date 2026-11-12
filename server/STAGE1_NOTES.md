# QueueCare — Stage 1 Notes (Backend Foundation)

## Design locks (later stages depend on these — do not change)

- **Auth**: JWT (8h, `JWT_EXPIRE`) in httpOnly cookie `token` (`SameSite=lax`, `secure` in production).
  Frontend must use `axios` with `withCredentials: true`.
- **Clinic scoping**: every `User` has a `clinic` ref; all queries filter by `req.user.clinic`.
- **Service date**: `utils/serviceDate.js` → `getServiceDate(timezone)` returns `YYYY-MM-DD`
  in the clinic's timezone (e.g. `Asia/Karachi`). Token "day" = serviceDate.
- **Token numbers**: `Queue.prefix` + zero-padded seq → `G001`, `G042`. Allocated via
  atomic `QueueCounter.nextSeq()` (`findOneAndUpdate` `$inc` + upsert); unique index on
  `Token(queue, serviceDate, seq)` is the backstop.
- **Priority**: `normal|high|emergency` → `priorityWeight` 1|2|3 (denormalized, kept in
  sync by a `pre('validate')` hook). Call order = `priorityWeight` desc, `seq` asc.
- **Public display**: `Clinic.settings.displayKey` = 32-hex string. Public endpoint
  `GET /api/display/:displayKey` returns ONLY token numbers, room names, calledAt,
  waiting count, clinic name, announcement. Never patient names/phones/notes.
- **JSON envelope**: `{ success, message, data }` everywhere; proper HTTP codes.
- **Socket hook**: controllers call `emit(event, payload)` from `socket/events.js`
  AFTER each DB commit. Currently a safe no-op; Stage 2 attaches the real emitter
  via `setEmitter(fn)` once at startup.

## REST contract (all under /api)

| Method & path | Auth | Body / query | Returns |
|---|---|---|---|
| `POST /auth/login` | public (rate-limited 10/15m) | `{email, password}` | sets cookie; `{user}` |
| `POST /auth/logout` | — | — | clears cookie |
| `GET /auth/me` | protect | — | `{user}` |
| `GET /queues` | receptionist+ | — | `{queues, serviceDate}` (today, this clinic) |
| `POST /queues` | admin | `{name, prefix, department?, serviceDate?}` | `{queue}` 201 |
| `GET /queues/:id` | receptionist+ | — | `{queue}` |
| `GET /queues/:id/tokens` | receptionist+ | `?status=&search=&page=&limit=` | `{tokens, page, limit, total, totalPages}` |
| `POST /queues/:id/tokens` | receptionist+ | `{subject:{name, kind?, ownerName?, animalType?, refNumber?, phone?, visitType?, note?}, priority?, queueType?}` | `{token}` 201 — number generated server-side |
| `POST /queues/:id/call-next` | receptionist+ | `{roomId?}` | `{token}` — atomic claim; 404 "No waiting patients" when empty |
| `GET /tokens/:id` | receptionist+ | — | `{token}` |
| `PATCH /tokens/:id/call` | receptionist+ | `{roomId?}` | waiting→called |
| `PATCH /tokens/:id/recall` | receptionist+ | `{roomId?}` | called→called (bumps `calledAt`, `recallCount`) |
| `PATCH /tokens/:id/start-serving` | receptionist+ | — | called→serving |
| `PATCH /tokens/:id/skip` | receptionist+ | `{reason?}` | called\|serving→skipped |
| `PATCH /tokens/:id/return` | receptionist+ | — | skipped→waiting |
| `PATCH /tokens/:id/complete` | receptionist+ | — | serving→completed |
| `PATCH /tokens/:id/cancel` | receptionist+ | `{reason?}` | waiting\|called\|skipped→cancelled |
| `GET /rooms` | receptionist+ | — | `{rooms}` |
| `POST /rooms` | admin | `{name, assignedStaff?}` | `{room}` 201 |
| `PATCH /rooms/:id` | admin | `{name?, assignedStaff?, isActive?}` | `{room}` |
| `DELETE /rooms/:id` | admin | — | 409 if referenced by today's live tokens |
| `GET /dashboard/stats` | receptionist+ | — | `{servedToday, waiting, completed, skipped, cancelled, avgWaitingMinutes, currentlyCalled, queueStatus[], waitingTokens[], recentActivity[]}` |
| `GET /display/:displayKey` | PUBLIC (rate-limited 120/min) | — | `{clinicName, announcement, serviceDate, currentCalled, recentlyCalled[], waitingCount}` |
| `GET /admin/users` | admin | — | `{users}` (no password hashes) |
| `POST /admin/users` | admin | `{name, email, role, password?}` | `{user, tempPassword}` 201 — password returned ONCE |
| `PATCH /admin/users/:id` | admin | `{name?, role?, isActive?}` | `{user}` — cannot change own role / deactivate self |
| `GET /admin/settings` | admin | — | `{settings}` (includes displayKey) |
| `PATCH /admin/settings` | admin | `{name?, facilityType?, timezone?, logoUrl?, announcement?, resetPolicy?, displayPreferences?}` | `{settings}` |
| `POST /admin/settings/regenerate-display-key` | admin | — | `{displayKey}` |

Invalid transitions → **409** with `Cannot move token from 'x' to 'y'`.

### Status state machine
```
waiting   → called | cancelled
called    → serving | skipped | cancelled   (+ called→called = recall)
serving   → completed | skipped
skipped   → waiting (return) | cancelled
completed, cancelled → terminal
```

## Planned Socket.IO events (Stage 2)

Client → server:
- `queue:join` — `{ queueId, role }` — subscribe a browser to a queue's updates
- `queue:leave` — `{ queueId }` — unsubscribe

Server → clients (emitted via `socket/events.js` `emit()`):
- `queue:updated` — `{ queueId, serviceDate }` — a token changed in this queue; clients refetch
- `queue:stats` — `{ clinicId, serviceDate }` — dashboard figures may have changed
- `token:called` — `{ tokenId, tokenNumber, queueId, roomId, roomName, calledAt }`
- `token:recalled` — `{ tokenId, tokenNumber, queueId, roomId, roomName, status, at }`
- `token:serving` — same shape (Stage 2 may add it to the display flow)
- `token:skipped` — same shape
- `token:completed` — same shape
- `token:cancelled` — same shape

All payloads use **string IDs** (`String(...)`) so they serialize cleanly over the wire.
Display screens subscribe per-clinic; the display payload must stay public-safe.

## Seed
`npm run seed` → clinic "CityCare General Clinic" (Asia/Karachi), 5 users, 3 queues
(G/D/E), 4 rooms, 18 tokens in mixed states, audit entry. Prints display URL + credentials.

## Test hooks
`module.exports = app` in server.js; `TRANSITIONS` exported from tokenController
for the Stage 4 automated tests.
