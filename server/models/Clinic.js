const mongoose = require('mongoose');
const crypto = require('crypto');

const clinicSchema = new mongoose.Schema(
  {
    name: { type: String, required: [true, 'Clinic name is required'], trim: true },
    facilityType: {
      type: String,
      enum: ['clinic', 'hospital', 'dental', 'veterinary'],
      default: 'clinic',
    },
    // IANA timezone used for service-date computation, e.g. "Asia/Karachi"
    timezone: { type: String, required: [true, 'Timezone is required'], default: 'Asia/Karachi' },
    logoUrl: { type: String, default: '' },
    settings: {
      // Public key for the waiting-room display. Long random hex; never guessable.
      displayKey: {
        type: String,
        default: () => crypto.randomBytes(16).toString('hex'), // 32 hex chars
        index: true,
      },
      announcement: { type: String, default: '', trim: true, maxlength: 500 },
      displayPreferences: { type: mongoose.Schema.Types.Mixed, default: {} },
      resetPolicy: {
        type: String,
        enum: ['daily', 'manual'],
        default: 'daily',
      },
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model('Clinic', clinicSchema);
