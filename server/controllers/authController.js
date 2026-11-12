const jwt = require('jsonwebtoken');
const asyncHandler = require('../utils/asyncHandler');
const { sendSuccess, ApiError } = require('../utils/response');
const { setTokenCookie, clearTokenCookie } = require('../utils/cookies');
const { requireFields, assertValid, isEmail } = require('../utils/validate');
const User = require('../models/User');

function signToken(userId) {
  return jwt.sign({ id: userId }, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRE || '8h',
  });
}

/**
 * POST /api/auth/login — rate-limited. Sets httpOnly `token` cookie.
 * Generic "invalid email or password" message avoids user enumeration.
 */
const login = asyncHandler(async (req, res) => {
  const errors = requireFields(req.body || {}, ['email', 'password']);
  if (req.body.email && !isEmail(req.body.email)) {
    errors.push('email must be a valid email address');
  }
  assertValid(errors);

  const user = await User.findOne({
    email: req.body.email.trim().toLowerCase(),
  }).select('+passwordHash');

  const valid = user && (await user.comparePassword(req.body.password));
  if (!valid) {
    throw ApiError.unauthorized('Invalid email or password');
  }
  if (!user.isActive) {
    throw ApiError.unauthorized('This account has been disabled');
  }

  setTokenCookie(res, signToken(user._id));
  // Populate the clinic name (see middleware/auth.js) so the client can
  // show it on the Profile page straight after login.
  const safe = await User.findById(user._id).select('-passwordHash').populate('clinic', 'name');
  sendSuccess(res, { user: safe.toSafeJSON() }, 'Logged in successfully');
});

/** POST /api/auth/logout — clears the session cookie. */
const logout = asyncHandler(async (req, res) => {
  clearTokenCookie(res);
  sendSuccess(res, null, 'Logged out successfully');
});

/** GET /api/auth/me — current user (protect). */
const me = asyncHandler(async (req, res) => {
  sendSuccess(res, { user: req.user.toSafeJSON() }, 'Current user');
});

/**
 * PATCH /api/auth/password — self-service password change.
 * Body: { currentPassword, newPassword }. The virtual `password` setter
 * hashes via bcrypt on save, so plaintext never persists.
 */
const changePassword = asyncHandler(async (req, res) => {
  const errors = requireFields(req.body || {}, ['currentPassword', 'newPassword']);
  if (req.body.newPassword && String(req.body.newPassword).length < 8) {
    errors.push('newPassword must be at least 8 characters');
  }
  assertValid(errors);

  const user = await User.findById(req.user._id).select('+passwordHash');
  if (!user) throw ApiError.notFound('User not found');

  const ok = await user.comparePassword(req.body.currentPassword);
  if (!ok) throw ApiError.unauthorized('Current password is incorrect');

  user.password = req.body.newPassword; // virtual setter → pre('save') hashes
  await user.save();

  sendSuccess(res, null, 'Password changed successfully');
});

module.exports = { login, logout, me, changePassword };
