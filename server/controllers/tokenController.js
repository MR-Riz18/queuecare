const asyncHandler = require('../utils/asyncHandler');
const { sendSuccess, ApiError } = require('../utils/response');
const { isObjectId, isNonEmptyString } = require('../utils/validate');
const { emit } = require('../socket/events');
const Token = require('../models/Token');
const Room = require('../models/Room');

/**
 * Allowed status transitions. Every state change goes through
 * applyTransition(), which rejects anything not listed here with 409.
 *
 *   waiting   -> called | cancelled
 *   called    -> serving | skipped | cancelled   (called -> called = recall)
 *   serving   -> completed | skipped
 *   skipped   -> waiting (return to queue) | cancelled
 *   completed, cancelled -> terminal
 */
const TRANSITIONS = {
  waiting: ['called', 'cancelled'],
  called: ['called', 'serving', 'skipped', 'cancelled'], // called->called is a recall
  serving: ['completed', 'skipped'],
  skipped: ['waiting', 'cancelled'],
  completed: [],
  cancelled: [],
};

const EVENT_FOR = {
  called: 'token:called',
  serving: 'token:serving',
  completed: 'token:completed',
  skipped: 'token:skipped',
  cancelled: 'token:cancelled',
};

async function loadToken(req) {
  const { id } = req.params;
  if (!isObjectId(id)) throw ApiError.badRequest('Invalid token id');
  // Clinic-scoped: tokens from other clinics are invisible (404, not 403).
  const token = await Token.findOne({ _id: id, clinic: req.user.clinic })
    .populate('room', 'name')
    .populate('queue', 'name prefix')
    .populate('practitioner', 'name');
  if (!token) throw ApiError.notFound('Token not found');
  return token;
}

async function resolveRoom(req, roomId) {
  if (!roomId) return null;
  if (!isObjectId(roomId)) throw ApiError.badRequest('Invalid room id');
  const room = await Room.findOne({ _id: roomId, clinic: req.user.clinic, isActive: true });
  if (!room) throw ApiError.notFound('Room not found');
  return room;
}

/**
 * Validate + apply a status transition, maintaining lifecycle timestamps.
 * Recall (called -> called) refreshes calledAt and bumps recallCount.
 */
async function applyTransition(token, to, { roomId, reason } = {}) {
  const from = token.status;
  if (!TRANSITIONS[from].includes(to)) {
    throw ApiError.conflict(`Cannot move token from '${from}' to '${to}'`);
  }

  const now = new Date();
  const isRecall = from === 'called' && to === 'called';

  if (to === 'called') {
    token.calledAt = now;
    if (roomId) token.room = roomId;
    if (isRecall) token.recallCount += 1;
  } else if (to === 'serving') {
    token.servingStartedAt = now;
  } else if (to === 'completed') {
    token.completedAt = now;
  } else if (to === 'skipped') {
    token.skipReason = reason || '';
  } else if (to === 'cancelled') {
    token.cancelReason = reason || '';
  }
  // skipped -> waiting keeps history; the token rejoins by its original seq.

  token.status = to;
  await token.save();

  const populated = await Token.findById(token._id)
    .populate('room', 'name')
    .populate('queue', 'name prefix');

  // token.queue is POPULATED by loadToken (a Queue document with _id, name,
  // prefix), not a bare ObjectId — String(token.queue) stringifies the whole
  // document, which then fails Cast to ObjectId in the socket router. Use
  // the id explicitly (populated.queue is the fresh copy of the same queue).
  const queueId = String(populated.queue?._id ?? token.queue?._id ?? token.queue);

  const event = isRecall ? 'token:recalled' : EVENT_FOR[to];
  if (event) {
    emit(event, {
      tokenId: String(token._id),
      tokenNumber: token.tokenNumber,
      queueId,
      roomId: populated.room ? String(populated.room._id) : null,
      roomName: populated.room ? populated.room.name : null,
      status: to,
      at: now,
    });
  }
  emit('queue:updated', { queueId, serviceDate: token.serviceDate });
  emit('queue:stats', { clinicId: String(token.clinic), serviceDate: token.serviceDate });

  return populated;
}

/** GET /api/tokens/:id — full token detail (staff only). */
const getToken = asyncHandler(async (req, res) => {
  const token = await loadToken(req);
  sendSuccess(res, { token }, 'Token retrieved');
});

/** PATCH /api/tokens/:id/call — waiting -> called. Body: { roomId? } */
const callToken = asyncHandler(async (req, res) => {
  const token = await loadToken(req);
  const room = await resolveRoom(req, req.body && req.body.roomId);
  const updated = await applyTransition(token, 'called', { roomId: room ? room._id : null });
  sendSuccess(res, { token: updated }, `Called token ${updated.tokenNumber}`);
});

/** PATCH /api/tokens/:id/recall — called -> called (re-announce). Body: { roomId? } */
const recallToken = asyncHandler(async (req, res) => {
  const token = await loadToken(req);
  if (token.status !== 'called') {
    throw ApiError.conflict(`Only a called token can be recalled (current: '${token.status}')`);
  }
  const room = await resolveRoom(req, req.body && req.body.roomId);
  const updated = await applyTransition(token, 'called', { roomId: room ? room._id : null });
  sendSuccess(res, { token: updated }, `Recalled token ${updated.tokenNumber} (recall #${updated.recallCount})`);
});

/** PATCH /api/tokens/:id/start-serving — called -> serving. */
const startServing = asyncHandler(async (req, res) => {
  const token = await loadToken(req);
  const updated = await applyTransition(token, 'serving');
  sendSuccess(res, { token: updated }, `Token ${updated.tokenNumber} is now being served`);
});

/** PATCH /api/tokens/:id/skip — called|serving -> skipped. Body: { reason? } */
const skipToken = asyncHandler(async (req, res) => {
  const token = await loadToken(req);
  const reason = req.body && req.body.reason ? String(req.body.reason) : '';
  if (reason && !isNonEmptyString(reason, 300)) throw ApiError.badRequest('reason is too long');
  const updated = await applyTransition(token, 'skipped', { reason });
  sendSuccess(res, { token: updated }, `Token ${updated.tokenNumber} skipped`);
});

/** PATCH /api/tokens/:id/return — skipped -> waiting (explicit return to queue). */
const returnToQueue = asyncHandler(async (req, res) => {
  const token = await loadToken(req);
  const updated = await applyTransition(token, 'waiting');
  sendSuccess(res, { token: updated }, `Token ${updated.tokenNumber} returned to queue`);
});

/** PATCH /api/tokens/:id/complete — serving -> completed. */
const completeToken = asyncHandler(async (req, res) => {
  const token = await loadToken(req);
  const updated = await applyTransition(token, 'completed');
  sendSuccess(res, { token: updated }, `Token ${updated.tokenNumber} completed`);
});

/** PATCH /api/tokens/:id/cancel — waiting|called|skipped -> cancelled. Body: { reason? } */
const cancelToken = asyncHandler(async (req, res) => {
  const token = await loadToken(req);
  const reason = req.body && req.body.reason ? String(req.body.reason) : '';
  if (reason && !isNonEmptyString(reason, 300)) throw ApiError.badRequest('reason is too long');
  const updated = await applyTransition(token, 'cancelled', { reason });
  sendSuccess(res, { token: updated }, `Token ${updated.tokenNumber} cancelled`);
});

module.exports = {
  getToken,
  callToken,
  recallToken,
  startServing,
  skipToken,
  returnToQueue,
  completeToken,
  cancelToken,
  // Exported for the automated tests (Stage 4) and documentation.
  TRANSITIONS,
};
