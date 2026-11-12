/**
 * Stage 2 — Socket.IO real-time layer.
 *
 * initSocket(httpServer) attaches Socket.IO to the Express HTTP server and
 * wires the controllers' emit() calls (socket/events.js) to real rooms.
 *
 * Rooms:
 *   clinic:<clinicId>   — authenticated staff of one clinic (detailed payloads)
 *   queue:<queueId>     — staff subscribed to one queue (finer granularity)
 *   display:<displayKey>— PUBLIC waiting-room screens (public-safe payloads only)
 *
 * Auth:
 *   - Staff sockets: JWT from the `token` cookie (same secret/expiry as the
 *     REST `protect` middleware). Missing/invalid/expired token or inactive
 *     user -> rejected at handshake (client gets `connect_error`).
 *   - Display sockets: connect with handshake auth { role: 'display' } and NO
 *     login; they prove identity per-join with a valid displayKey.
 *     Invalid key -> `display:error` + disconnect.
 *
 * Client -> server:
 *   queue:join  { queueId?, role: 'staff'|'display', displayKey? }
 *   queue:leave { queueId? }
 *
 * On every successful join the server sends a state snapshot to that socket
 * only (queue:snapshot for staff, display:snapshot for displays), which is
 * what makes reconnects work without a page refresh.
 */

const { Server } = require('socket.io');
const jwt = require('jsonwebtoken');
const { setEmitter } = require('./events');
const { buildDisplaySnapshot, buildQueueSnapshot } = require('./snapshots');
const Clinic = require('../models/Clinic');
const Queue = require('../models/Queue');
const Token = require('../models/Token');
const User = require('../models/User');

const staffRoom = (clinicId) => `clinic:${clinicId}`;
const queueRoom = (queueId) => `queue:${queueId}`;
const displayRoom = (displayKey) => `display:${displayKey}`;

const DISPLAY_KEY_RE = /^[0-9a-f]{32}$/;

// Token events the waiting-room screen cares about. They are re-emitted to
// the display room in a PUBLIC-SAFE projection (no patient PII, no IDs).
const DISPLAY_TOKEN_EVENTS = new Set(['token:called', 'token:recalled', 'token:serving']);

// --- small in-memory caches (emits are fire-and-forget; a stale entry only
//     costs a missed refresh, and TTLs keep them fresh) ---
// clinicId -> { displayKey, expires } (60s; displayKey can be regenerated)
const clinicKeyCache = new Map();
// queueId -> { clinicId, expires } (5 min; a queue's clinic never changes)
const queueClinicCache = new Map();

async function getDisplayKey(clinicId) {
  const key = String(clinicId);
  const hit = clinicKeyCache.get(key);
  if (hit && hit.expires > Date.now()) return hit.displayKey;
  const clinic = await Clinic.findById(key).select('settings.displayKey').lean();
  const displayKey = clinic && clinic.settings ? clinic.settings.displayKey : null;
  clinicKeyCache.set(key, { displayKey, expires: Date.now() + 60_000 });
  return displayKey;
}

async function getQueueClinicId(queueId) {
  const key = String(queueId);
  const hit = queueClinicCache.get(key);
  if (hit && hit.expires > Date.now()) return hit.clinicId;
  const queue = await Queue.findById(key).select('clinic').lean();
  const clinicId = queue && queue.clinic ? String(queue.clinic) : null;
  queueClinicCache.set(key, { clinicId, expires: Date.now() + 300_000 });
  return clinicId;
}

/** Minimal cookie parser for the socket handshake (avoids an extra dependency). */
function parseCookies(header) {
  const out = {};
  if (!header) return out;
  for (const part of String(header).split(';')) {
    const i = part.indexOf('=');
    if (i <= 0) continue;
    const name = part.slice(0, i).trim();
    const raw = part.slice(i + 1).trim();
    if (!name) continue;
    try {
      out[name] = decodeURIComponent(raw);
    } catch {
      out[name] = raw;
    }
  }
  return out;
}

/**
 * Handshake auth. Staff sockets present the same httpOnly `token` cookie as
 * REST requests; display screens declare { role: 'display' } in handshake
 * auth and prove identity with a displayKey at join time instead.
 */
async function socketAuth(socket, next) {
  if (socket.handshake.auth && socket.handshake.auth.role === 'display') {
    socket.authKind = 'display';
    return next();
  }

  const token = parseCookies(socket.handshake.headers.cookie).token;
  if (!token) {
    return next(new Error('Not authenticated. Please log in.'));
  }

  let decoded;
  try {
    decoded = jwt.verify(token, process.env.JWT_SECRET);
  } catch (err) {
    return next(new Error('Session expired. Please log in again.'));
  }

  const user = await User.findById(decoded.id).select('-passwordHash');
  if (!user) {
    return next(new Error('User no longer exists.'));
  }
  if (!user.isActive) {
    return next(new Error('Account has been disabled.'));
  }

  socket.authKind = 'staff';
  socket.user = {
    id: String(user._id),
    role: user.role,
    clinic: String(user.clinic),
  };
  next();
}

/** Public-safe projection of a token event for the waiting-room display. */
function projectForDisplay(payload) {
  return {
    tokenNumber: payload.tokenNumber,
    roomName: payload.roomName || null,
    calledAt: payload.calledAt || payload.at || null,
  };
}

/**
 * Route one controller emit() call to the right rooms. All clinic/queue
 * lookups are done server-side — client payloads are never trusted.
 */
async function routeEvent(io, event, payload) {
  const p = payload || {};
  try {
    if (event === 'queue:stats') {
      if (!p.clinicId) return;
      io.to(staffRoom(String(p.clinicId))).emit(event, p);
      return;
    }

    if (event === 'queue:updated') {
      if (!p.queueId) return;
      // Defensive: tolerate a populated queue document (use its _id) and
      // ignore a malformed id instead of throwing a Cast error on every emit.
      const rawQueueId = p.queueId && typeof p.queueId === 'object' ? p.queueId._id : p.queueId;
      const queueId = String(rawQueueId);
      if (!/^[0-9a-f]{24}$/i.test(queueId)) return;
      const clinicId = await getQueueClinicId(queueId);
      if (!clinicId) return;
      io.to(staffRoom(clinicId)).to(queueRoom(queueId)).emit(event, p);
      const displayKey = await getDisplayKey(clinicId);
      if (displayKey) {
        io.to(displayRoom(displayKey)).emit(event, { queueId, serviceDate: p.serviceDate });
      }
      return;
    }

    if (event.startsWith('token:')) {
      // Resolve the token's clinic server-side (payload clinic is not trusted).
      let clinicId = null;
      if (p.tokenId) {
        const token = await Token.findById(String(p.tokenId)).select('clinic').lean();
        if (token && token.clinic) clinicId = String(token.clinic);
      }
      if (!clinicId && p.queueId) {
        const rawQueueId = p.queueId && typeof p.queueId === 'object' ? p.queueId._id : p.queueId;
        const fallbackQueueId = String(rawQueueId);
        if (/^[0-9a-f]{24}$/i.test(fallbackQueueId)) clinicId = await getQueueClinicId(fallbackQueueId);
      }
      if (!clinicId) return;

      io.to(staffRoom(clinicId)).emit(event, p); // staff-detailed payload

      if (DISPLAY_TOKEN_EVENTS.has(event)) {
        const displayKey = await getDisplayKey(clinicId);
        if (displayKey) {
          io.to(displayRoom(displayKey)).emit(event, projectForDisplay(p));
        }
      }
      return;
    }
    // Unknown event names are ignored (controllers only emit known names).
  } catch (err) {
    console.error(`[socket] failed to route ${event}:`, err.message);
  }
}

async function handleJoin(io, socket, payload) {
  const { queueId, role, displayKey } = payload || {};
  try {
    // ---- public display screen ----
    if (role === 'display') {
      if (!DISPLAY_KEY_RE.test(String(displayKey || ''))) {
        socket.emit('display:error', { message: 'Invalid display key' });
        return socket.disconnect(true);
      }
      const clinic = await Clinic.findOne({ 'settings.displayKey': displayKey })
        .select('name settings.announcement settings.displayKey timezone');
      if (!clinic) {
        socket.emit('display:error', { message: 'Display not found' });
        return socket.disconnect(true);
      }
      socket.join(displayRoom(clinic.settings.displayKey));
      socket.data.displayKey = clinic.settings.displayKey;
      socket.emit('display:snapshot', await buildDisplaySnapshot(clinic));
      return;
    }

    // ---- staff ----
    if (!socket.user) {
      socket.emit('queue:error', { message: 'Not authenticated. Please log in.' });
      return socket.disconnect(true);
    }
    const clinicId = socket.user.clinic;
    socket.join(staffRoom(clinicId));

    if (queueId) {
      // Re-validate: the queue must exist AND belong to the user's clinic.
      const queue = await Queue.findOne({ _id: queueId, clinic: clinicId }).select('_id').lean();
      if (!queue) {
        socket.emit('queue:error', { message: 'Queue not found' });
        return;
      }
      socket.join(queueRoom(String(queue._id)));
      socket.emit('queue:snapshot', await buildQueueSnapshot(String(queue._id), clinicId));
    }
  } catch (err) {
    console.error('[socket] queue:join failed:', err.message);
    socket.emit('queue:error', { message: 'Failed to join queue' });
  }
}

function handleLeave(socket, payload) {
  const { queueId } = payload || {};
  if (queueId) {
    socket.leave(queueRoom(String(queueId)));
  } else {
    for (const room of socket.rooms) {
      if (room.startsWith('queue:')) socket.leave(room);
    }
  }
}

function onConnection(io, socket) {
  socket.on('queue:join', (payload) => handleJoin(io, socket, payload || {}));
  socket.on('queue:leave', (payload) => handleLeave(socket, payload || {}));
}

/**
 * Attach Socket.IO to the HTTP server. Called once from server.js.
 * Also installs the real emitter for controllers' emit() calls.
 */
function initSocket(httpServer) {
  const io = new Server(httpServer, {
    cors: {
      origin: process.env.CLIENT_URL || 'http://localhost:5173',
      credentials: true,
    },
  });

  io.use(socketAuth);
  io.on('connection', (socket) => onConnection(io, socket));

  setEmitter((event, payload) => routeEvent(io, event, payload));

  return io;
}

module.exports = { initSocket, projectForDisplay };
