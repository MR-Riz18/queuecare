const mongoose = require('mongoose');

/**
 * Append-only audit trail. Stage 1 creates the model + log helper and writes
 * entries for admin-ish actions (user create/role/activation changes, settings
 * changes). Stage 4 builds the viewer UI/API.
 */
const auditLogSchema = new mongoose.Schema(
  {
    clinic: { type: mongoose.Schema.Types.ObjectId, ref: 'Clinic', required: true, index: true },
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    action: { type: String, required: true, trim: true, index: true }, // e.g. 'user.create'
    entityType: { type: String, default: '' },
    entityId: { type: mongoose.Schema.Types.ObjectId, default: null },
    metadata: { type: mongoose.Schema.Types.Mixed, default: {} },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

auditLogSchema.index({ clinic: 1, createdAt: -1 });

module.exports = mongoose.model('AuditLog', auditLogSchema);
