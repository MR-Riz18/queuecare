const asyncHandler = require('../utils/asyncHandler');
const { sendSuccess, ApiError } = require('../utils/response');
const { getServiceDate } = require('../utils/serviceDate');
const Clinic = require('../models/Clinic');
const Token = require('../models/Token');

/**
 * GET /api/display/:displayKey — PUBLIC (rate-limited), no auth.
 * Returns ONLY public-safe data for the waiting-room screen:
 *   clinic name, announcement, current called token + room, recently called
 *   tokens, waiting count.
 * NEVER patient names, phones, notes, or internal identifiers beyond what a
 * visitor could already see on the screen.
 */
const getDisplay = asyncHandler(async (req, res) => {
  const { displayKey } = req.params;
  if (!/^[0-9a-f]{32}$/.test(displayKey || '')) {
    throw ApiError.notFound('Display not found');
  }

  const clinic = await Clinic.findOne({ 'settings.displayKey': displayKey });
  if (!clinic) throw ApiError.notFound('Display not found');

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

  sendSuccess(
    res,
    {
      clinicName: clinic.name,
      announcement: clinic.settings.announcement || '',
      serviceDate,
      currentCalled: current ? shape(current) : null,
      recentlyCalled: recent.map(shape),
      waitingCount,
    },
    'Display data retrieved'
  );
});

module.exports = { getDisplay };
