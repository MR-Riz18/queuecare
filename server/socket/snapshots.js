/**
 * Snapshot builders for the Socket.IO layer.
 *
 * When a client joins (queue:join), it immediately receives a full STATE
 * SNAPSHOT so it is in sync without refreshing. This is what makes
 * reconnects seamless: the socket.io client auto-reconnects, the frontend
 * re-emits queue:join, and the snapshot re-syncs the UI.
 *
 * Shapes are kept identical to the Stage 1 REST contract:
 *  - buildDisplaySnapshot(clinic) === GET /api/display/:displayKey
 *  - buildQueueSnapshot(queueId, clinicId) === the queue + tokens a receptionist sees
 */

const { getServiceDate } = require('../utils/serviceDate');
const Clinic = require('../models/Clinic');
const Token = require('../models/Token');

/**
 * Public-safe display snapshot: token numbers, room names, calledAt,
 * waiting count, clinic name, announcement. NEVER patient names/phones/notes.
 */
async function buildDisplaySnapshot(clinic) {
  const serviceDate = getServiceDate(clinic.timezone);
  const base = { clinic: clinic._id, serviceDate };

  const [current, recent, waitingCount] = await Promise.all([
    Token.findOne({ ...base, status: 'called' })
      .select('tokenNumber calledAt room')
      .populate('room', 'name')
      .sort({ calledAt: -1 }),
    Token.find({ ...base, status: 'called' })
      .select('tokenNumber calledAt room')
      .populate('room', 'name')
      .sort({ calledAt: -1 })
      .limit(5),
    Token.countDocuments({ ...base, status: 'waiting' }),
  ]);

  const shape = (t) => ({
    tokenNumber: t.tokenNumber,
    roomName: t.room ? t.room.name : null,
    calledAt: t.calledAt,
  });

  return {
    clinicName: clinic.name,
    announcement: (clinic.settings && clinic.settings.announcement) || '',
    serviceDate,
    currentCalled: current ? shape(current) : null,
    recentlyCalled: recent.map(shape),
    waitingCount,
  };
}

/**
 * Staff snapshot: today's tokens for one queue, call-ordered
 * (priorityWeight desc, seq asc) — the same view the receptionist dashboard shows.
 */
async function buildQueueSnapshot(queueId, clinicId) {
  const clinic = await Clinic.findById(clinicId).select('timezone');
  const serviceDate = getServiceDate(clinic.timezone);

  const tokens = await Token.find({ queue: queueId, clinic: clinicId, serviceDate })
    .populate('room', 'name')
    .populate('queue', 'name prefix')
    .sort({ priorityWeight: -1, seq: 1 })
    .lean();

  return { queueId: String(queueId), serviceDate, tokens };
}

module.exports = { buildDisplaySnapshot, buildQueueSnapshot };
