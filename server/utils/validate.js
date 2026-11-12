const { ApiError } = require('../utils/response');

/**
 * Minimal manual validators (no extra dependency). Each returns an array of
 * human-readable errors; controllers throw ApiError.badRequest when non-empty.
 */
const isEmail = (v) => typeof v === 'string' && /^\S+@\S+\.\S+$/.test(v.trim());
const isNonEmptyString = (v, max = 500) =>
  typeof v === 'string' && v.trim().length > 0 && v.length <= max;
const isObjectId = (v) => /^[0-9a-fA-F]{24}$/.test(String(v));

function requireFields(body, fields) {
  const errors = [];
  for (const f of fields) {
    const v = body[f];
    if (v === undefined || v === null || (typeof v === 'string' && v.trim() === '')) {
      errors.push(`${f} is required`);
    }
  }
  return errors;
}

function assertValid(errors) {
  if (errors.length > 0) {
    throw ApiError.badRequest(errors.join('; '));
  }
}

module.exports = { isEmail, isNonEmptyString, isObjectId, requireFields, assertValid };
