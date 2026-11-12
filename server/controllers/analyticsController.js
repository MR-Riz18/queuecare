const mongoose = require('mongoose');
const asyncHandler = require('../utils/asyncHandler');
const { sendSuccess, ApiError } = require('../utils/response');
const { getServiceDate } = require('../utils/serviceDate');
const { requireFields, assertValid } = require('../utils/validate');
const Clinic = require('../models/Clinic');
const Queue = require('../models/Queue');
const Token = require('../models/Token');

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function addDays(dateStr, n) {
  const d = new Date(`${dateStr}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

function dateRange(from, to) {
  const days = [];
  for (let d = from; d <= to; d = addDays(d, 1)) days.push(d);
  return days;
}

const round1 = (n) => Math.round(n * 10) / 10;

/**
 * GET /api/analytics/queue?from=YYYY-MM-DD&to=YYYY-MM-DD&queueId=
 * Clinic-scoped queue performance analytics computed from Token records.
 * Defaults to the last 7 service days (inclusive) in the clinic's timezone.
 */
const getQueueAnalytics = asyncHandler(async (req, res) => {
  const clinic = await Clinic.findById(req.user.clinic).select('timezone');
  if (!clinic) throw ApiError.notFound('Clinic not found');
  const tz = clinic.timezone || 'UTC';

  const today = getServiceDate(tz);
  let { from = addDays(today, -6), to = today, queueId } = req.query;

  const errors = [];
  if (!DATE_RE.test(from)) errors.push('from must be YYYY-MM-DD');
  if (!DATE_RE.test(to)) errors.push('to must be YYYY-MM-DD');
  if (from > to) errors.push('from must not be after to');
  if (queueId && !mongoose.Types.ObjectId.isValid(queueId)) errors.push('queueId is not valid');
  assertValid(errors);

  if (queueId) {
    const queue = await Queue.findOne({ _id: queueId, clinic: req.user.clinic }).select('_id');
    if (!queue) throw ApiError.notFound('Queue not found');
  }

  const match = { clinic: req.user.clinic, serviceDate: { $gte: from, $lte: to } };
  if (queueId) match.queue = new mongoose.Types.ObjectId(queueId);

  const tokens = await Token.find(match)
    .select('serviceDate queue status registeredAt calledAt servingStartedAt completedAt')
    .lean();

  const queues = await Queue.find({ clinic: req.user.clinic }).select('name prefix').lean();
  const queueName = Object.fromEntries(queues.map((q) => [String(q._id), `${q.prefix} — ${q.name}`]));

  // Hour extractor in the clinic's timezone (peak-hours chart).
  const hourFmt = new Intl.DateTimeFormat('en-US', { timeZone: tz, hour: 'numeric', hour12: false });

  const days = dateRange(from, to);
  const servedPerDay = days.map((date) => ({ date, count: 0 }));
  const servedIdx = Object.fromEntries(days.map((d, i) => [d, i]));
  const peakHours = Array.from({ length: 24 }, (_, hour) => ({ hour, count: 0 }));
  const volumeByQueue = {};
  const totals = { served: 0, waiting: 0, skipped: 0, cancelled: 0, tokens: tokens.length };
  let waitSum = 0;
  let waitN = 0;
  let serviceSum = 0;
  let serviceN = 0;

  for (const t of tokens) {
    if (t.status === 'completed') {
      totals.served += 1;
      if (servedIdx[t.serviceDate] !== undefined) servedPerDay[servedIdx[t.serviceDate]].count += 1;
    } else if (t.status === 'waiting' || t.status === 'called' || t.status === 'serving') {
      totals.waiting += 1;
    } else if (t.status === 'skipped') {
      totals.skipped += 1;
    } else if (t.status === 'cancelled') {
      totals.cancelled += 1;
    }

    if (t.calledAt && t.registeredAt) {
      waitSum += new Date(t.calledAt) - new Date(t.registeredAt);
      waitN += 1;
    }
    if (t.servingStartedAt && t.completedAt) {
      serviceSum += new Date(t.completedAt) - new Date(t.servingStartedAt);
      serviceN += 1;
    }
    if (t.registeredAt) {
      const h = Number(hourFmt.format(new Date(t.registeredAt))) % 24;
      peakHours[h].count += 1;
    }
    const qk = String(t.queue);
    if (!volumeByQueue[qk]) {
      volumeByQueue[qk] = { queueId: qk, label: queueName[qk] || 'Queue', count: 0 };
    }
    volumeByQueue[qk].count += 1;
  }

  sendSuccess(
    res,
    {
      from,
      to,
      totals,
      avgWaitingMinutes: waitN ? round1(waitSum / waitN / 60000) : 0,
      avgServiceMinutes: serviceN ? round1(serviceSum / serviceN / 60000) : 0,
      servedPerDay,
      peakHours,
      volumeByQueue: Object.values(volumeByQueue).sort((a, b) => b.count - a.count),
    },
    'Queue analytics'
  );
});

module.exports = { getQueueAnalytics };
