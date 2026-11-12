const mongoose = require('mongoose');

const queueSchema = new mongoose.Schema(
  {
    clinic: { type: mongoose.Schema.Types.ObjectId, ref: 'Clinic', required: true, index: true },
    name: { type: String, required: [true, 'Queue name is required'], trim: true },
    // Single-letter (or short) prefix used in token numbers, e.g. "G" -> G042
    prefix: { type: String, required: [true, 'Prefix is required'], trim: true, uppercase: true, maxlength: 4 },
    department: { type: String, default: '', trim: true },
    // YYYY-MM-DD in the clinic's timezone. A queue is a per-day resource.
    serviceDate: { type: String, required: true, index: true, match: [/^\d{4}-\d{2}-\d{2}$/, 'serviceDate must be YYYY-MM-DD'] },
    isActive: { type: Boolean, default: true },
    config: {
      priorityRules: { type: mongoose.Schema.Types.Mixed, default: {} },
    },
  },
  { timestamps: true }
);

// One queue name per clinic per day; prefixes must also not collide per day
// since token numbers are derived from them.
queueSchema.index({ clinic: 1, name: 1, serviceDate: 1 }, { unique: true });
queueSchema.index({ clinic: 1, prefix: 1, serviceDate: 1 }, { unique: true });

module.exports = mongoose.model('Queue', queueSchema);
