const asyncHandler = require('../utils/asyncHandler');
const { sendSuccess, sendCreated, ApiError } = require('../utils/response');
const { getServiceDate } = require('../utils/serviceDate');
const { getClinic } = require('../utils/clinic');
const { requireFields, assertValid, isObjectId, isNonEmptyString } = require('../utils/validate');
const Room = require('../models/Room');
const Token = require('../models/Token');
const User = require('../models/User');

async function loadRoom(req) {
  const { id } = req.params;
  if (!isObjectId(id)) throw ApiError.badRequest('Invalid room id');
  const room = await Room.findOne({ _id: id, clinic: req.user.clinic }).populate('assignedStaff', 'name role');
  if (!room) throw ApiError.notFound('Room not found');
  return room;
}

async function resolveStaff(req, staffId) {
  if (!staffId) return null;
  if (!isObjectId(staffId)) throw ApiError.badRequest('Invalid staff id');
  const staff = await User.findOne({ _id: staffId, clinic: req.user.clinic, isActive: true });
  if (!staff) throw ApiError.notFound('Staff member not found');
  if (!['practitioner', 'receptionist', 'admin'].includes(staff.role)) {
    throw ApiError.badRequest('Only staff members can be assigned to a room');
  }
  return staff;
}

/** GET /api/rooms — all rooms for this clinic. */
const listRooms = asyncHandler(async (req, res) => {
  const rooms = await Room.find({ clinic: req.user.clinic })
    .populate('assignedStaff', 'name role')
    .sort({ name: 1 });
  sendSuccess(res, { rooms }, 'Rooms retrieved');
});

/** POST /api/rooms — admin. Body: { name, assignedStaff? } */
const createRoom = asyncHandler(async (req, res) => {
  const body = req.body || {};
  const errors = requireFields(body, ['name']);
  if (body.name && !isNonEmptyString(body.name, 80)) errors.push('name must be 1-80 characters');
  assertValid(errors);

  const staff = await resolveStaff(req, body.assignedStaff);
  const room = await Room.create({
    clinic: req.user.clinic,
    name: body.name.trim(),
    assignedStaff: staff ? staff._id : null,
  });
  await room.populate('assignedStaff', 'name role');
  sendCreated(res, { room }, 'Room created');
});

/** PATCH /api/rooms/:id — admin. Body: { name?, assignedStaff?, isActive? } */
const updateRoom = asyncHandler(async (req, res) => {
  const room = await loadRoom(req);
  const body = req.body || {};

  if (body.name !== undefined) {
    if (!isNonEmptyString(body.name, 80)) throw ApiError.badRequest('name must be 1-80 characters');
    room.name = body.name.trim();
  }
  if (body.assignedStaff !== undefined) {
    const staff = await resolveStaff(req, body.assignedStaff);
    room.assignedStaff = staff ? staff._id : null;
  }
  if (body.isActive !== undefined) {
    room.isActive = Boolean(body.isActive);
  }

  await room.save();
  await room.populate('assignedStaff', 'name role');
  sendSuccess(res, { room }, 'Room updated');
});

/**
 * DELETE /api/rooms/:id — admin.
 * Blocked while any of today's tokens reference the room in a live status
 * (waiting/called/serving); historical references stay intact.
 */
const deleteRoom = asyncHandler(async (req, res) => {
  const room = await loadRoom(req);
  const clinic = await getClinic(req);
  const serviceDate = getServiceDate(clinic.timezone);

  const live = await Token.exists({
    room: room._id,
    clinic: req.user.clinic,
    serviceDate,
    status: { $in: ['waiting', 'called', 'serving'] },
  });
  if (live) {
    throw ApiError.conflict('Cannot delete a room with active tokens today');
  }

  await room.deleteOne();
  sendSuccess(res, null, 'Room deleted');
});

module.exports = { listRooms, createRoom, updateRoom, deleteRoom };
