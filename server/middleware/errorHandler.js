const { ApiError } = require('../utils/response');

/**
 * Central error middleware. Always returns { success: false, message, ... }.
 * Maps Mongoose errors and rate-limit rejections to proper status codes.
 * In production, stack traces are never leaked.
 */
function errorHandler(err, req, res, next) {
  // eslint-disable-next-line no-unused-vars
  void next;

  let statusCode = err.statusCode || 500;
  let message = err.message || 'Server error';

  // Mongoose: malformed ObjectId
  if (err.name === 'CastError') {
    statusCode = 400;
    message = 'Invalid ID format';
  }

  // Mongoose: duplicate key (e.g. email, unique index)
  if (err.code === 11000) {
    statusCode = 409;
    const field = Object.keys(err.keyValue || {})[0];
    message = field ? `Duplicate value for ${field}` : 'Duplicate value';
  }

  // Mongoose: schema validation
  if (err.name === 'ValidationError') {
    statusCode = 400;
    message = Object.values(err.errors).map((e) => e.message).join('; ');
  }

  // express-rate-limit rejection
  if (err.name === 'RateLimitError' || statusCode === 429) {
    statusCode = 429;
    message = message || 'Too many requests. Please try again later.';
  }

  // Hide unknown server errors in production
  if (statusCode === 500 && process.env.NODE_ENV === 'production') {
    message = 'Server error';
  }

  const payload = { success: false, message, data: null };
  if (process.env.NODE_ENV !== 'production' && statusCode === 500) {
    payload.stack = err.stack;
  }

  res.status(statusCode).json(payload);
}

/** 404 for unknown /api routes — mounted after all routers. */
function notFound(req, res) {
  res.status(404).json({ success: false, message: 'Route not found', data: null });
}

module.exports = { errorHandler, notFound };
