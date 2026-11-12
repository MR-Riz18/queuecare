const Clinic = require('../models/Clinic');
const { ApiError } = require('./response');

/**
 * Load the current user's clinic doc (cached per-request). Needed for the
 * clinic timezone when computing the service date.
 */
async function getClinic(req) {
  if (req._clinic) return req._clinic;
  const clinic = await Clinic.findById(req.user.clinic);
  if (!clinic) throw ApiError.notFound('Clinic not found');
  req._clinic = clinic;
  return clinic;
}

module.exports = { getClinic };
