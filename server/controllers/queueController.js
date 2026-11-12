const asyncHandler = require('../utils/asyncHandler');
const { sendSuccess, sendCreated, ApiError } = require('../utils/response');
const { getServiceDate } = require('../utils/serviceDate');
const { getClinic } = require('../utils/clinic');
const { requireFields, assertValid, isNonEmptyString, isObjectId } = require('../utils/validate');
const { emit } = require('../socket/events');
const Queue = require('../models/Queue');
const QueueCounter = require('../models/QueueCounter');
const Token = require('../models/Token');
const Room = require('../models/Room');

const PRIORITIES = ['normal', 'high', 'emergency'];

function padSeq(seq) {
  return String(seq).padStart(3, '0'); // 1 -> "001", 42 -> "042"
}

async function loadQueue(req) {
  const { id } = req.params;
  if (!isObjectId(id)) throw ApiError.badRequest('Invalid queue id');
  const queue = await Queue.findOne({ _id: id, clinic: req.user.clinic });
  if (!queue) throw ApiError.notFound('Queue not found');
  return queue;
}

async function resolveRoom(req, roomId) {
  if (!roomId) return null;
  if (!isObjectId(roomId)) throw ApiError.badRequest('Invalid room id');
  const room = await Room.findOne({ _id: roomId, clinic: req.user.clinic, isActive: true });
  if (!room) throw ApiError.notFound('Room not found');
  return room;
}

/** GET /api/queues — today's queues for this clinic (active first). */
const listQueues = asyncHandler(async (req, res) => {
  const clinic = await getClinic(req);
  const serviceDate = getServiceDate(clinic.timezone);
  const queues = await Queue.find({ clinic: req.user.clinic, serviceDate })
    .sort({ isActive: -1, name: 1 });
  sendSuccess(res, { queues, serviceDate }, 'Queues retrieved');
});

/** POST /api/queues — admin: define a queue (defaults to today's service date). */
const createQueue = asyncHandler(async (req, res) => {
  const clinic = await getClinic(req);
  const body = req.body || {};
  const errors = requireFields(body, ['name', 'prefix']);
  if (body.prefix && !isNonEmptyString(body.prefix, 4)) errors.push('prefix must be 1-4 characters');
  if (body.serviceDate && !/^\d{4}-\d{2}-\d{2}$/.test(body.serviceDate)) {
    errors.push('serviceDate must be YYYY-MM-DD');
  }
  assertValid(errors);

  const queue = await Queue.create({
    clinic: req.user.clinic,
    name: body.name.trim(),
    prefix: body.prefix.trim().toUpperCase(),
    department: (body.department || '').trim(),
    serviceDate: body.serviceDate || getServiceDate(clinic.timezone),
    config: body.config || {},
  });
  sendCreated(res, { queue }, 'Queue created');
});

/** GET /api/queues/:id — single queue (clinic-scoped). */
const getQueue = asyncHandler(async (req, res) => {
  const queue = await loadQueue(req);
  sendSuccess(res, { queue }, 'Queue retrieved');
});

/**
 * GET /api/queues/:id/tokens — paginated token list.
 * Query: status=, search= (token number or patient name), page=, limit=.
 */
const listTokens = asyncHandler(async (req, res) => {
  const queue = await loadQueue(req);
  const clinic = await getClinic(req);
  const serviceDate = getServiceDate(clinic.timezone);

  const filter = { queue: queue._id, serviceDate };
  if (req.query.status) {
    if (!['waiting', 'called', 'serving', 'completed', 'skipped', 'cancelled'].includes(req.query.status)) {
      throw ApiError.badRequest('Invalid status filter');
    }
    filter.status = req.query.status;
  }
  if (req.query.search) {
    const rx = new RegExp(req.query.search.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
    filter.$or = [{ tokenNumber: rx }, { 'subject.name': rx }];
  }

  const page = Math.max(1, parseInt(req.query.page, 10) || 1);
  const limit = Math.min(100, Math.max(1, parseInt(req.query.limit, 10) || 20));
  const skip = (page - 1) * limit;

  const [tokens, total] = await Promise.all([
    Token.find(filter)
      .populate('room', 'name')
      .populate('practitioner', 'name')
      .sort({ seq: 1 })
      .skip(skip)
      .limit(limit),
    Token.countDocuments(filter),
  ]);

  sendSuccess(
    res,
    { tokens, page, limit, total, totalPages: Math.ceil(total / limit), serviceDate },
    'Tokens retrieved'
  );
});

/**
 * POST /api/queues/:id/tokens — register a patient.
 * Concurrency-safe: the sequence number comes from an atomic
 * QueueCounter $inc (upsert), never from the frontend.
 */
const registerToken = asyncHandler(async (req, res) => {
  const queue = await loadQueue(req);
  if (!queue.isActive) throw ApiError.conflict('Queue is not active');
  const clinic = await getClinic(req);
  const serviceDate = getServiceDate(clinic.timezone);

  const body = req.body || {};
  const subject = body.subject || {};
  const errors = [];
  if (!isNonEmptyString(subject.name, 120)) errors.push('subject.name is required');
  if (body.priority && !PRIORITIES.includes(body.priority)) {
    errors.push(`priority must be one of: ${PRIORITIES.join(', ')}`);
  }
  assertValid(errors);

  // Atomic: two simultaneous registrations can never receive the same seq.
  const seq = await QueueCounter.nextSeq(queue._id, serviceDate);
  const tokenNumber = `${queue.prefix}${padSeq(seq)}`;

  const token = await Token.create({
    tokenNumber,
    queue: queue._id,
    clinic: req.user.clinic,
    serviceDate,
    seq,
    subject: {
      kind: subject.kind === 'pet' ? 'pet' : 'human',
      name: subject.name.trim(),
      ownerName: (subject.ownerName || '').trim(),
      animalType: (subject.animalType || '').trim(),
      refNumber: (subject.refNumber || '').trim(),
      phone: (subject.phone || '').trim(),
      visitType: (subject.visitType || '').trim(),
      note: (subject.note || '').trim(),
    },
    queueType: (body.queueType || 'walk-in').trim(),
    priority: body.priority || 'normal',
    createdBy: req.user._id,
  });

  // Stage 2: subscribed UIs refresh their queue views.
  emit('queue:updated', { queueId: String(queue._id), serviceDate });
  emit('queue:stats', { clinicId: String(req.user.clinic), serviceDate });

  sendCreated(res, { token }, 'Token registered');
});

/**
 * POST /api/queues/:id/call-next — claim the next waiting token.
 * RACE-SAFE: a single atomic findOneAndUpdate selects the highest-priority,
 * earliest-registered waiting token and marks it called in one operation.
 * Two simultaneous receptionists can never claim two different tokens as "next".
 * Body: { roomId? }. 404 when the queue is empty.
 */
const callNext = asyncHandler(async (req, res) => {
  const queue = await loadQueue(req);
  if (!queue.isActive) throw ApiError.conflict('Queue is not active');
  const clinic = await getClinic(req);
  const serviceDate = getServiceDate(clinic.timezone);

  const room = await resolveRoom(req, req.body && req.body.roomId);

  const token = await Token.findOneAndUpdate(
    { queue: queue._id, serviceDate, status: 'waiting' },
    {
      $set: {
        status: 'called',
        calledAt: new Date(),
        ...(room ? { room: room._id } : {}),
      },
    },
    { sort: { priorityWeight: -1, seq: 1 }, new: true }
  ).populate('room', 'name');

  if (!token) {
    throw ApiError.notFound('No waiting patients in this queue');
  }

  emit('token:called', {
    tokenId: String(token._id),
    tokenNumber: token.tokenNumber,
    queueId: String(queue._id),
    roomId: token.room ? String(token.room._id) : null,
    roomName: token.room ? token.room.name : null,
    calledAt: token.calledAt,
  });
  emit('queue:updated', { queueId: String(queue._id), serviceDate });
  emit('queue:stats', { clinicId: String(req.user.clinic), serviceDate });

  sendSuccess(res, { token }, `Called token ${token.tokenNumber}`);
});

module.exports = { listQueues, createQueue, getQueue, listTokens, registerToken, callNext };
