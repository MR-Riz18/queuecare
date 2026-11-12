const mongoose = require('mongoose');

/**
 * Token (a patient's place in a queue for one service day).
 *
 * Status state machine (enforced server-side in tokenController):
 *   waiting   -> called | cancelled
 *   called    -> serving | skipped | cancelled   (called -> called = recall)
 *   serving   -> completed | skipped
 *   skipped   -> waiting (explicit return-to-queue) | cancelled
 *   completed, cancelled -> terminal
 */

const PRIORITY_WEIGHTS = { normal: 1, high: 2, emergency: 3 };

const subjectSchema = new mongoose.Schema(
  {
    kind: { type: String, enum: ['human', 'pet'], default: 'human' },
    name: { type: String, required: [true, 'Patient name is required'], trim: true },
    // Vet use-case
    ownerName: { type: String, default: '', trim: true },
    animalType: { type: String, default: '', trim: true },
    // Optional patient identifiers — NEVER exposed on the public display endpoint
    refNumber: { type: String, default: '', trim: true },
    phone: { type: String, default: '', trim: true },
    visitType: { type: String, default: '', trim: true },
    note: { type: String, default: '', trim: true },
  },
  { _id: false }
);

const tokenSchema = new mongoose.Schema(
  {
    tokenNumber: { type: String, required: true, trim: true }, // e.g. "G042"
    queue: { type: mongoose.Schema.Types.ObjectId, ref: 'Queue', required: true, index: true },
    clinic: { type: mongoose.Schema.Types.ObjectId, ref: 'Clinic', required: true, index: true },
    serviceDate: { type: String, required: true, match: [/^\d{4}-\d{2}-\d{2}$/] },
    seq: { type: Number, required: true, min: 1 }, // position within the day's queue
    subject: { type: subjectSchema, required: true },
    queueType: { type: String, default: 'walk-in', trim: true }, // walk-in | appointment | follow-up ...
    priority: { type: String, enum: ['normal', 'high', 'emergency'], default: 'normal' },
    // Denormalized numeric weight so ordering is a single DB sort key
    // (emergency first, then arrival order via seq ascending).
    priorityWeight: { type: Number, default: 1, index: true },
    status: {
      type: String,
      enum: ['waiting', 'called', 'serving', 'completed', 'skipped', 'cancelled'],
      default: 'waiting',
      index: true,
    },
    room: { type: mongoose.Schema.Types.ObjectId, ref: 'Room', default: null },
    practitioner: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    registeredAt: { type: Date, default: Date.now },
    calledAt: { type: Date, default: null },
    servingStartedAt: { type: Date, default: null },
    completedAt: { type: Date, default: null },
    recallCount: { type: Number, default: 0, min: 0 },
    skipReason: { type: String, default: '', trim: true },
    cancelReason: { type: String, default: '', trim: true },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  },
  { timestamps: true }
);

// Backstop: even if the counter somehow raced, no duplicate (queue, day, seq).
tokenSchema.index({ queue: 1, serviceDate: 1, seq: 1 }, { unique: true });
// Clinic-scoped status scans (dashboard, display, waiting counts).
tokenSchema.index({ clinic: 1, serviceDate: 1, status: 1 });
// Per-queue status scans (call-next, queue token lists).
tokenSchema.index({ queue: 1, serviceDate: 1, status: 1 });

tokenSchema.statics.PRIORITY_WEIGHTS = PRIORITY_WEIGHTS;

// Keep priorityWeight in sync whenever priority changes.
tokenSchema.pre('validate', function () {
  this.priorityWeight = PRIORITY_WEIGHTS[this.priority] ?? 1;
});

module.exports = mongoose.model('Token', tokenSchema);
