const AuditLog = require('../models/AuditLog');

/**
 * Persist an audit trail entry. Fire-and-forget friendly: callers should
 * not await unless they need the record — failures are logged, never thrown,
 * so auditing can never break the primary request.
 *
 * @param {Object} opts
 * @param {mongoose.Types.ObjectId} opts.clinic
 * @param {mongoose.Types.ObjectId} [opts.user]
 * @param {string} opts.action  e.g. 'user.create', 'settings.update'
 * @param {string} [opts.entityType]
 * @param {mongoose.Types.ObjectId} [opts.entityId]
 * @param {Object} [opts.metadata]
 */
async function logAudit({ clinic, user, action, entityType, entityId, metadata = {} }) {
  try {
    await AuditLog.create({ clinic, user, action, entityType, entityId, metadata });
  } catch (err) {
    console.error('[audit] failed to write log:', err.message);
  }
}

module.exports = { logAudit };
