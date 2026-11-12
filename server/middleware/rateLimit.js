const rateLimit = require('express-rate-limit');

/**
 * Brute-force protection for login attempts.
 * 10 attempts per 15 minutes per IP — generous enough for a front desk,
 * strict enough to blunt password guessing.
 */
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { success: false, message: 'Too many login attempts. Try again in 15 minutes.', data: null },
});

/**
 * The public display endpoint is unauthenticated by design, so cap it
 * against scraping: 120 requests/minute per IP.
 */
const displayLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 120,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { success: false, message: 'Too many requests.', data: null },
});

module.exports = { loginLimiter, displayLimiter };
