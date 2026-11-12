# QueueCare — Stage 2 Socket Notes (Real-time Layer)

Stage 2 adds Socket.IO v4 on top of the Stage 1 REST foundation. Socket.IO
shares the same HTTP server as Express (`server.js` creates `httpServer` and
calls `initSocket(httpServer)`); the REST contract is unchanged except for
two added fields on `GET /api/dashboard/stats` (see below).

## Rooms

| Room | Who joins | Payload safety |
|---|---|---|
| `clinic:<clinicId>` | Authenticated staff whose `user.clinic` matches | Staff-detailed (tokenId, tokenNumber, queueId, status, roomId/roomName, timestamps) |
| `queue:<queueId>` | Authenticated staff, after server-side check that the queue belongs to their clinic | Same as `clinic:<clinicId>` (finer granularity) |
| `display:<displayKey>` | **Public** waiting-room screens, no login | Public-safe ONLY: `tokenNumber`, `roomName`, `calledAt`, plus refresh hints. Never patient names, phones, notes, or internal IDs beyond the displayKey itself |

## Auth rules

- **Staff sockets**: handshake middleware reads the `token` cookie from
  `socket.handshake.headers.cookie` and verifies the JWT with the same
  `JWT_SECRET`/expiry logic as the REST `protect` middleware, then loads the
  user and checks `isActive`. Missing/invalid/expired token or inactive user
  → handshake rejected (client receives `connect_error`). `socket.user` is
  `{ id, role, clinic }`.
- **Display sockets**: connect with handshake auth `{ role: 'display' }` and no
  cookie. They are NOT auto-trusted — on `queue:join` they must present a
  valid `displayKey` (32-hex, must match a clinic's
  `Clinic.settings.displayKey`). Invalid key → `display:error` + disconnect.
  A "display" handshake that never presents a valid key can do nothing.
- **Never trust client payloads**: `queue:join` re-validates queueId against
  the socket user's clinic and re-validates displayKey against the Clinic
  collection on every join. The event router resolves the token/queue's clinic
  from the DB for every emit.

## Event catalog

### Client → server

| Event | Payload | Behavior |
|---|---|---|
| `queue:join` | `{ queueId?, role: 'staff' \| 'display', displayKey? }` | Staff: joins `clinic:<clinicId>` (+ `queue:<queueId>` if given and clinic-owned), then receives `queue:snapshot` (socket-only). Display: validates displayKey, joins `display:<displayKey>`, then receives `display:snapshot` (socket-only). Idempotent — re-join is safe. |
| `queue:leave` | `{ queueId? }` | Leaves the given `queue:` room, or all `queue:` rooms when omitted. (The broad `clinic:<clinicId>` membership is kept.) |

### Server → client (emitted by controllers via `emit()` after DB commits)

Controllers call `emit(event, payload)` with the exact names below; the
router in `socket/index.js` fans each out to the right rooms.

| Event | Controller payload (all IDs are strings) | → staff rooms `clinic:<id>` / `queue:<id>` | → display room `display:<key>` |
|---|---|---|---|
| `queue:updated` | `{ queueId, serviceDate }` | full payload | `{ queueId, serviceDate }` (refresh hint) |
| `queue:stats` | `{ clinicId, serviceDate }` | full payload | — (dashboard figures are staff detail) |
| `token:called` | `{ tokenId, tokenNumber, queueId, roomId, roomName, calledAt }` | full payload | `{ tokenNumber, roomName, calledAt }` |
| `token:recalled` | `{ tokenId, tokenNumber, queueId, roomId, roomName, status, at }` | full payload | `{ tokenNumber, roomName, calledAt }` |
| `token:serving` | `{ tokenId, tokenNumber, queueId, roomId, roomName, status, at }` | full payload | `{ tokenNumber, roomName, calledAt }` |
| `token:skipped` | `{ tokenId, tokenNumber, queueId, roomId, roomName, status, at }` | full payload | — (display follows via `queue:updated`) |
| `token:completed` | `{ tokenId, tokenNumber, queueId, roomId, roomName, status, at }` | full payload | — (display follows via `queue:updated`) |
| `token:cancelled` | `{ tokenId, tokenNumber, queueId, roomId, roomName, status, at }` | full payload | — (display follows via `queue:updated`) |

### Server → client errors

| Event | When |
|---|---|
| `display:error` | `{ message }` — invalid/unknown displayKey; socket is then disconnected |
| `queue:error` | `{ message }` — e.g. queue not found / not clinic-owned; socket stays connected |

## Snapshot protocol

Immediately after a successful `queue:join`, the server sends a full state
snapshot **to that socket only** (not the room):

- Staff → `queue:snapshot` `{ queueId, serviceDate, tokens }` — today's
  tokens for the queue, call-ordered (`priorityWeight` desc, `seq` asc),
  with room and queue populated. Emitted only when a `queueId` was joined.
- Display → `display:snapshot`
  `{ clinicName, announcement, serviceDate, currentCalled, recentlyCalled[], waitingCount }`
  — **byte-identical shape** to `GET /api/display/:displayKey`.

After the snapshot, the socket receives only incremental events; it never
needs to poll.

## Reconnect flow

1. The socket.io client auto-reconnects on its own (built-in backoff).
2. On every `connect`, the **frontend** re-emits `queue:join` with the same
   payload it used originally (Stage 3's job).
3. The server re-validates auth/ownership, re-joins the rooms, and sends a
   fresh snapshot — the UI re-syncs with zero user action.
4. If the staff JWT expired while offline, the handshake is rejected; the
   frontend redirects to login.

## What must stay public-safe

The display room and `GET /api/display/:displayKey` are the two public
surfaces. On them you may only ever expose:

- `tokenNumber`, `roomName`, `calledAt`
- `waitingCount`, `clinicName`, `announcement`, `serviceDate`

Never: patient names, phones, refNumbers, notes, visitType, internal token/
queue/user IDs, or queue statistics. The router enforces this by projecting
display events through `projectForDisplay()`; the REST display endpoint
selects only safe fields.

## Contract addition (Stage 2, documented)

`GET /api/dashboard/stats` now also returns:

```json
{
  "clinicName": "CityCare General Clinic",
  "display": { "displayKey": "<32-hex>", "urlPath": "/display/<32-hex>" }
}
```

so receptionists can open the waiting-room display screen without admin
rights. Everything else in the response is unchanged.
