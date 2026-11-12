/**
 * Consistent JSON envelope: { success, message, data }.
 * Every controller should use these helpers so the frontend can rely
 * on a single shape.
 */

function sendSuccess(res, data = null, message = 'OK', statusCode = 200) {
  return res.status(statusCode).json({ success: true, message, data });
}

function sendCreated(res, data = null, message = 'Created') {
  return sendSuccess(res, data, message, 201);
}

/**
 * Small error class for known client errors (400/401/403/404/409).
 * Thrown inside controllers; the central errorHandler maps it to JSON.
 */
class ApiError extends Error {
  constructor(statusCode, message) {
    super(message);
    this.statusCode = statusCode;
    this.isOperational = true;
  }

  static badRequest(msg = 'Invalid request') { return new ApiError(400, msg); }
  static unauthorized(msg = 'Not authenticated') { return new ApiError(401, msg); }
  static forbidden(msg = 'Not authorized') { return new ApiError(403, msg); }
  static notFound(msg = 'Not found') { return new ApiError(404, msg); }
  static conflict(msg = 'Conflict') { return new ApiError(409, msg); }
}

module.exports = { sendSuccess, sendCreated, ApiError };
