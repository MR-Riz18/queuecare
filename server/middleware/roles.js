const { ApiError } = require('../utils/response');

/**
 * authorize(...roles) — role-based gate. Must run after `protect`.
 * Example: router.post('/rooms', protect, authorize('admin'), ...)
 */
function authorize(...roles) {
  return (req, res, next) => {
    if (!req.user) {
      throw ApiError.unauthorized('Not authenticated.');
    }
    if (!roles.includes(req.user.role)) {
      throw ApiError.forbidden(`Requires one of: ${roles.join(', ')}`);
    }
    next();
  };
}

// Convenience sets for the receptionist desk (receptionist + admin).
const RECEPTION_ROLES = ['admin', 'receptionist'];

// All staff, including practitioners: read-only views (dashboard, queue
// lists, rooms, analytics, token detail). Writes stay on RECEPTION_ROLES
// (or admin) so the front desk keeps control of the live queue.
const STAFF_ROLES = ['admin', 'receptionist', 'practitioner'];

module.exports = { authorize, RECEPTION_ROLES, STAFF_ROLES };
