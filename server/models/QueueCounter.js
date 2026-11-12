const mongoose = require('mongoose');

/**
 * Monotonic sequence counter per (queue, serviceDate).
 * Token numbers are allocated via an ATOMIC findOneAndUpdate with $inc and
 * upsert — even under concurrent registrations, no two tokens can receive
 * the same sequence number.
 */
const queueCounterSchema = new mongoose.Schema(
  {
    queue: { type: mongoose.Schema.Types.ObjectId, ref: 'Queue', required: true },
    serviceDate: { type: String, required: true, match: [/^\d{4}-\d{2}-\d{2}$/] },
    seq: { type: Number, default: 0, min: 0 },
  },
  { timestamps: false }
);

queueCounterSchema.index({ queue: 1, serviceDate: 1 }, { unique: true });

/**
 * Atomically increment and return the next sequence number for a queue/day.
 * The upsert makes the first registration of the day self-initializing.
 */
queueCounterSchema.statics.nextSeq = async function (queueId, serviceDate) {
  const doc = await this.findOneAndUpdate(
    { queue: queueId, serviceDate },
    { $inc: { seq: 1 } },
    { new: true, upsert: true, setDefaultsOnInsert: true }
  );
  return doc.seq;
};

module.exports = mongoose.model('QueueCounter', queueCounterSchema);
