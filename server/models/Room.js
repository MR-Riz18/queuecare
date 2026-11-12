const mongoose = require('mongoose');

const roomSchema = new mongoose.Schema(
  {
    clinic: { type: mongoose.Schema.Types.ObjectId, ref: 'Clinic', required: true, index: true },
    name: { type: String, required: [true, 'Room name is required'], trim: true },
    assignedStaff: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true }
);

roomSchema.index({ clinic: 1, name: 1 }, { unique: true });

module.exports = mongoose.model('Room', roomSchema);
