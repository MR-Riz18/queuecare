const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const userSchema = new mongoose.Schema(
  {
    name: { type: String, required: [true, 'Name is required'], trim: true },
    email: {
      type: String,
      required: [true, 'Email is required'],
      unique: true,
      lowercase: true,
      trim: true,
      match: [/^\S+@\S+\.\S+$/, 'Please provide a valid email address'],
    },
    // Hashed with bcrypt (10 rounds) in the pre-save hook. Never select by default.
    passwordHash: { type: String, required: [true, 'Password is required'], select: false },
    role: {
      type: String,
      enum: ['admin', 'receptionist', 'practitioner'],
      required: [true, 'Role is required'],
      default: 'receptionist',
    },
    clinic: { type: mongoose.Schema.Types.ObjectId, ref: 'Clinic', required: true, index: true },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true }
);

userSchema.index({ clinic: 1, role: 1 });

// Hash the password whenever it is set/modified. `password` is a virtual
// setter used by controllers so plaintext never persists on the doc.
userSchema.virtual('password').set(function (plain) {
  this._plainPassword = plain;
});

userSchema.pre('validate', async function () {
  // NOTE: must be pre('validate'), not pre('save') — Mongoose runs validation
  // before pre('save') hooks, and passwordHash is a required path.
  if (this._plainPassword) {
    this.passwordHash = await bcrypt.hash(this._plainPassword, 10);
    this._plainPassword = undefined;
  }
});

userSchema.methods.comparePassword = function (plain) {
  return bcrypt.compare(plain, this.passwordHash);
};

// Public-safe representation (never leaks passwordHash).
userSchema.methods.toSafeJSON = function () {
  const obj = this.toObject();
  delete obj.passwordHash;
  return obj;
};

module.exports = mongoose.model('User', userSchema);
