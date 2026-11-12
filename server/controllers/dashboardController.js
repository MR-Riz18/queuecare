const asyncHandler = require('../utils/asyncHandler');
const { sendSuccess } = require('../utils/response');
const { getServiceDate } = require('../utils/serviceDate');
const { getClinic } = require('../utils/clinic');
const Queue = require('../models/Queue');
const Token = require('../models/Token');

/**
 * GET /api/dashboard/stats — today's operational snapshot for the clinic:
 * served/waiting/called/completed/skipped counts, average waiting time,
 * per-queue status breakdown, the currently-called token, and recent activity.
 * All figures are computed from Token records for the clinic's service date.
 */
const getStats = asyncHandler(async (req, res) => {
  const clinic = await getClinic(req);
  const serviceDate = getServiceDate(clinic.timezone);
  const base = { clinic: req.user.clinic, serviceDate };

  const [
    statusCounts,
    waitingTokens,
    currentlyCalled,
    recentActivity,
    queues,
    calledForAvg,
  ] = await Promise.all([
    Token.aggregate([
      { $match: base },
      { $group: { _id: '$status', count: { $sum: 1 } } },
    ]),
    Token.find({ ...base, status: 'waiting' })
      .select('tokenNumber priority seq queue')
      .populate('queue', 'name prefix')
      .sort({ priorityWeight: -1, seq: 1 })
      .limit(50),
    Token.findOne({ ...base, status: 'called' })
      .select('tokenNumber calledAt room queue')
      .populate('room', 'name')
      .populate('queue', 'name prefix')
      .sort({ calledAt: -1 }),
    Token.find(base)
      .select('tokenNumber status updatedAt queue')
      .populate('queue', 'name prefix')
      .sort({ updatedAt: -1 })
      .limit(10),
    Queue.find({ clinic: req.user.clinic, serviceDate }).sort({ name: 1 }),
    Token.find({ ...base, calledAt: { $ne: null } }).select('registeredAt calledAt'),
  ]);

  const countOf = (s) => (statusCounts.find((c) => c._id === s) || { count: 0 }).count;

  // Per-queue breakdown in one aggregation.
  const queueBreakdown = await Token.aggregate([
    { $match: base },
    { $group: { _id: { queue: '$queue', status: '$status' }, count: { $sum: 1 } } },
  ]);
  const queueStatus = queues.map((q) => {
    const row = { queueId: q._id, name: q.name, prefix: q.prefix, waiting: 0, called: 0, serving: 0, total: 0 };
    for (const b of queueBreakdown) {
      if (String(b._id.queue) === String(q._id)) {
        row.total += b.count;
        if (b._id.status === 'waiting') row.waiting = b.count;
        if (b._id.status === 'called') row.called = b.count;
        if (b._id.status === 'serving') row.serving = b.count;
      }
    }
    return row;
  });

  // Average minutes from registration to first call (only tokens that were called).
  let avgWaitingMinutes = 0;
  if (calledForAvg.length > 0) {
    const total = calledForAvg.reduce(
      (sum, t) => sum + (t.calledAt.getTime() - t.registeredAt.getTime()),
      0
    );
    avgWaitingMinutes = Math.round((total / calledForAvg.length / 60000) * 10) / 10;
  }

  sendSuccess(
    res,
    {
      serviceDate,
      clinicName: clinic.name,
      // Lets receptionists open the waiting-room display without admin rights.
      display: {
        displayKey: clinic.settings.displayKey,
        urlPath: `/display/${clinic.settings.displayKey}`,
      },
      servedToday: countOf('completed'),
      waiting: countOf('waiting'),
      completed: countOf('completed'),
      skipped: countOf('skipped'),
      cancelled: countOf('cancelled'),
      avgWaitingMinutes,
      currentlyCalled: currentlyCalled
        ? {
            tokenNumber: currentlyCalled.tokenNumber,
            roomName: currentlyCalled.room ? currentlyCalled.room.name : null,
            calledAt: currentlyCalled.calledAt,
          }
        : null,
      queueStatus,
      waitingTokens,
      recentActivity,
    },
    'Dashboard stats retrieved'
  );
});

module.exports = { getStats };
