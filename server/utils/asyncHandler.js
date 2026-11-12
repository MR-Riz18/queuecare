/**
 * Wrap an async Express handler so rejected promises flow into the
 * central error middleware instead of crashing the request.
 */
const asyncHandler = (fn) => (req, res, next) => {
  Promise.resolve(fn(req, res, next)).catch(next);
};

module.exports = asyncHandler;
