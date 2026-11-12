const jwt = require('jsonwebtoken');
const asyncHandler = require('../utils/asyncHandler');
const { ApiError } = require('../utils/response');
const User = require('../models/User');

/**
 * protect — verify the httpOnly `token` cookie (JWT) and attach req.user.
 * 401 when missing, invalid, or expired. Inactive accounts are also rejected
 * so disabled staff lose access immediately.
 */
const protect = asyncHandler(async (req, res, next) => {
  const token = req.cookies && req.cookies.token;

  if (!token) {
    throw ApiError.unauthorized('Not authenticated. Please log in.');
  }

  let decoded;
  try {
    decoded = jwt.verify(token, process.env.JWT_SECRET);
  } catch (err) {
    throw ApiError.unauthorized('Session expired. Please log in again.');
  }

  // Populate the clinic name: the Profile page reads user.clinic.name, and
  // without this it is a bare ObjectId and the clinic always shows as "—".
  const user = await User.findById(decoded.id).select('-passwordHash').populate('clinic', 'name');
  if (!user) {
    throw ApiError.unauthorized('User no longer exists.');
  }
  if (!user.isActive) {
    throw ApiError.unauthorized('Account has been disabled.');
  }

  req.user = user;
  next();
});

module.exports = { protect };
