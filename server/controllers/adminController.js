const crypto = require('crypto');
const asyncHandler = require('../utils/asyncHandler');
const { sendSuccess, sendCreated, ApiError } = require('../utils/response');
const { requireFields, assertValid, isEmail, isObjectId, isNonEmptyString } = require('../utils/validate');
const { logAudit } = require('../utils/audit');
const User = require('../models/User');
const Clinic = require('../models/Clinic');
const AuditLog = require('../models/AuditLog');

const ROLES = ['admin', 'receptionist', 'practitioner'];

/** GET /api/admin/users — staff list for this clinic (no password hashes). */
const listUsers = asyncHandler(async (req, res) => {
  const users = await User.find({ clinic: req.user.clinic })
    .select('-passwordHash')
    .sort({ role: 1, name: 1 });
  sendSuccess(res, { users }, 'Users retrieved');
});

/**
 * POST /api/admin/users — create a staff member.
 * Body: { name, email, role, password? }. If no password is given, a random
 * temp password is generated and RETURNED ONCE in the response (it cannot be
 * recovered later — the admin must share it securely with the new staff member).
 */
const createUser = asyncHandler(async (req, res) => {
  const body = req.body || {};
  const errors = requireFields(body, ['name', 'email', 'role']);
  if (body.email && !isEmail(body.email)) errors.push('email must be a valid email address');
  if (body.role && !ROLES.includes(body.role)) errors.push(`role must be one of: ${ROLES.join(', ')}`);
  if (body.password && String(body.password).length < 8) {
    errors.push('password must be at least 8 characters');
  }
  assertValid(errors);

  const tempPassword = body.password || crypto.randomBytes(6).toString('base64url'); // 8 chars
  const user = new User({
    name: body.name.trim(),
    email: body.email.trim().toLowerCase(),
    role: body.role,
    clinic: req.user.clinic,
  });
  user.password = tempPassword; // virtual setter -> bcrypt-hashed on save
  await user.save();

  await logAudit({
    clinic: req.user.clinic,
    user: req.user._id,
    action: 'user.create',
    entityType: 'User',
    entityId: user._id,
    metadata: { name: user.name, email: user.email, role: user.role },
  });

  sendCreated(
    res,
    { user: user.toSafeJSON(), tempPassword },
    'User created. Share the temporary password securely — it will not be shown again.'
  );
});

/**
 * PATCH /api/admin/users/:id — change role and/or active status.
 * Guards: an admin cannot change their own role or deactivate themselves
 * (prevents locking everyone out of the clinic).
 */
const updateUser = asyncHandler(async (req, res) => {
  const { id } = req.params;
  if (!isObjectId(id)) throw ApiError.badRequest('Invalid user id');
  const user = await User.findOne({ _id: id, clinic: req.user.clinic });
  if (!user) throw ApiError.notFound('User not found');

  const body = req.body || {};
  const isSelf = String(user._id) === String(req.user._id);

  if (body.role !== undefined) {
    if (!ROLES.includes(body.role)) throw ApiError.badRequest(`role must be one of: ${ROLES.join(', ')}`);
    if (isSelf && body.role !== user.role) {
      throw ApiError.forbidden('You cannot change your own role');
    }
    user.role = body.role;
  }
  if (body.isActive !== undefined) {
    if (isSelf && body.isActive === false) {
      throw ApiError.forbidden('You cannot deactivate your own account');
    }
    user.isActive = Boolean(body.isActive);
  }
  if (body.name !== undefined) {
    if (!isNonEmptyString(body.name, 120)) throw ApiError.badRequest('name must be 1-120 characters');
    user.name = body.name.trim();
  }

  await user.save();

  await logAudit({
    clinic: req.user.clinic,
    user: req.user._id,
    action: 'user.update',
    entityType: 'User',
    entityId: user._id,
    metadata: { role: user.role, isActive: user.isActive, name: user.name },
  });

  sendSuccess(res, { user: user.toSafeJSON() }, 'User updated');
});

/** GET /api/admin/settings — clinic settings (includes displayKey for the admin). */
const getSettings = asyncHandler(async (req, res) => {
  const clinic = await Clinic.findById(req.user.clinic);
  if (!clinic) throw ApiError.notFound('Clinic not found');
  sendSuccess(
    res,
    {
      settings: {
        name: clinic.name,
        facilityType: clinic.facilityType,
        timezone: clinic.timezone,
        logoUrl: clinic.logoUrl,
        announcement: clinic.settings.announcement,
        resetPolicy: clinic.settings.resetPolicy,
        displayKey: clinic.settings.displayKey,
        displayPreferences: clinic.settings.displayPreferences,
      },
    },
    'Settings retrieved'
  );
});

/** PATCH /api/admin/settings — update clinic profile/announcement/timezone. */
const updateSettings = asyncHandler(async (req, res) => {
  const clinic = await Clinic.findById(req.user.clinic);
  if (!clinic) throw ApiError.notFound('Clinic not found');
  const body = req.body || {};

  if (body.name !== undefined) {
    if (!isNonEmptyString(body.name, 160)) throw ApiError.badRequest('name must be 1-160 characters');
    clinic.name = body.name.trim();
  }
  if (body.facilityType !== undefined) {
    if (!['clinic', 'hospital', 'dental', 'veterinary'].includes(body.facilityType)) {
      throw ApiError.badRequest('Invalid facilityType');
    }
    clinic.facilityType = body.facilityType;
  }
  if (body.timezone !== undefined) {
    if (!isNonEmptyString(body.timezone, 60)) throw ApiError.badRequest('timezone is required');
    // Validate it is a real IANA timezone (throws RangeError otherwise).
    try {
      new Intl.DateTimeFormat('en', { timeZone: body.timezone });
    } catch {
      throw ApiError.badRequest('Invalid timezone');
    }
    clinic.timezone = body.timezone;
  }
  if (body.logoUrl !== undefined) clinic.logoUrl = String(body.logoUrl).trim();
  if (body.announcement !== undefined) {
    if (String(body.announcement).length > 500) throw ApiError.badRequest('announcement is too long');
    clinic.settings.announcement = String(body.announcement).trim();
  }
  if (body.resetPolicy !== undefined) {
    if (!['daily', 'manual'].includes(body.resetPolicy)) throw ApiError.badRequest('Invalid resetPolicy');
    clinic.settings.resetPolicy = body.resetPolicy;
  }
  if (body.displayPreferences !== undefined) {
    clinic.settings.displayPreferences = body.displayPreferences;
  }

  await clinic.save();

  await logAudit({
    clinic: req.user.clinic,
    user: req.user._id,
    action: 'settings.update',
    entityType: 'Clinic',
    entityId: clinic._id,
    metadata: { fields: Object.keys(body) },
  });

  sendSuccess(res, { settings: { name: clinic.name, timezone: clinic.timezone } }, 'Settings updated');
});

/**
 * POST /api/admin/settings/regenerate-display-key — rotate the public display
 * key (e.g. if it leaked). The old waiting-room URL stops working immediately.
 */
const regenerateDisplayKey = asyncHandler(async (req, res) => {
  const clinic = await Clinic.findById(req.user.clinic);
  if (!clinic) throw ApiError.notFound('Clinic not found');

  clinic.settings.displayKey = crypto.randomBytes(16).toString('hex');
  await clinic.save();

  await logAudit({
    clinic: req.user.clinic,
    user: req.user._id,
    action: 'settings.regenerate-display-key',
    entityType: 'Clinic',
    entityId: clinic._id,
    metadata: {},
  });

  sendSuccess(res, { displayKey: clinic.settings.displayKey }, 'Display key regenerated');
});

/**
 * GET /api/admin/audit-logs?action=&userId=&from=&to=&page=&limit=
 * Append-only admin audit trail for this clinic, newest first.
 */
const listAuditLogs = asyncHandler(async (req, res) => {
  const { action, userId, from, to } = req.query;
  const page = Math.max(1, parseInt(req.query.page, 10) || 1);
  const limit = Math.min(100, Math.max(1, parseInt(req.query.limit, 10) || 25));

  const filter = { clinic: req.user.clinic };
  if (action) filter.action = String(action);
  if (userId) {
    if (!isObjectId(userId)) throw ApiError.badRequest('userId is not valid');
    filter.user = userId;
  }
  if (from || to) {
    filter.createdAt = {};
    if (from) filter.createdAt.$gte = new Date(`${from}T00:00:00Z`);
    if (to) filter.createdAt.$lte = new Date(`${to}T23:59:59Z`);
  }

  const [logs, total] = await Promise.all([
    AuditLog.find(filter)
      .populate('user', 'name email')
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .lean(),
    AuditLog.countDocuments(filter),
  ]);

  sendSuccess(
    res,
    { logs, page, limit, total, totalPages: Math.max(1, Math.ceil(total / limit)) },
    'Audit logs retrieved'
  );
});

module.exports = { listUsers, createUser, updateUser, getSettings, updateSettings, regenerateDisplayKey, listAuditLogs };
