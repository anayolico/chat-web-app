// User model definition using Mongoose
// This schema defines the structure for user documents in MongoDB

const mongoose = require('mongoose');

const userSchema = new mongoose.Schema(
  {
    // User's full name
    name: {
      type: String,
      required: [true, 'Name is required'],
      trim: true,
      minlength: [2, 'Name must be at least 2 characters'],
      maxlength: [50, 'Name cannot exceed 50 characters']
    },
    // Phone number (unique identifier for login)
    phone: {
      type: String,
      required: [true, 'Phone number is required'],
      unique: true,
      trim: true
    },
    // Hashed password (not selected by default for security)
    password: {
      type: String,
      required: [true, 'Password is required'],
      minlength: [6, 'Password must be at least 6 characters'],
      select: false
    },
    // Profile picture URL
    profilePic: {
      type: String,
      required: false,
      default: ''
    },
    // Last seen timestamp for presence tracking
    lastSeen: {
      type: Date,
      default: Date.now
    },
    // Password reset OTP (temporary, not selected by default)
    passwordResetOtp: {
      type: String,
      required: false,
      default: null,
      select: false
    },
    // OTP expiry timestamp
    passwordResetOtpExpiry: {
      type: Date,
      required: false,
      default: null,
      select: false
    }
  },
  {
    // Schema options
    timestamps: {
      createdAt: true,
      updatedAt: false
    },
    versionKey: false
  }
);

// Database indexes for performance
userSchema.index({ lastSeen: -1 });

module.exports = mongoose.model('User', userSchema);
