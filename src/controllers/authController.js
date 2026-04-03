// Authentication controller handling user registration, login, profile management,
// and password reset functionality

const bcrypt = require('bcryptjs');
const { StatusCodes } = require('http-status-codes');

const User = require('../models/User');
const ApiError = require('../utils/ApiError');
const asyncHandler = require('../utils/asyncHandler');
const generateToken = require('../utils/generateToken');
const { generateOTP, hashOTP, getTokenExpiry } = require('../utils/resetTokenGenerator');
const { sendPasswordResetOtpSms } = require('../services/smsService');
const uploadFileToCloudinary = require('../utils/uploadFileToCloudinary');

// Build consistent auth response to avoid leaking sensitive fields
const buildAuthResponse = (user) => ({
  id: user._id,
  name: user.name,
  phone: user.phone,
  profilePic: user.profilePic,
  createdAt: user.createdAt,
  lastSeen: user.lastSeen || null
});

// User registration handler
const register = asyncHandler(async (req, res) => {
  const { name, phone, password } = req.body;

  // Check if phone number already exists
  const existingUser = await User.findOne({ phone });
  if (existingUser) {
    throw new ApiError(StatusCodes.CONFLICT, 'Phone number already exists');
  }

  // Hash password with bcrypt
  const saltRounds = Number(process.env.BCRYPT_SALT_ROUNDS) || 12;
  const hashedPassword = await bcrypt.hash(password, saltRounds);

  // Create new user
  const user = await User.create({
    name,
    phone,
    password: hashedPassword
  });

  // Generate JWT token
  const token = generateToken({ userId: user._id });

  res.status(StatusCodes.CREATED).json({
    success: true,
    message: 'User registered successfully',
    data: {
      token,
      user: buildAuthResponse(user)
    }
  });
});

// User login handler
const login = asyncHandler(async (req, res) => {
  const { phone, password } = req.body;

  // Find user and include password field
  const user = await User.findOne({ phone }).select('+password');
  if (!user) {
    throw new ApiError(StatusCodes.UNAUTHORIZED, 'Invalid phone number or password');
  }

  // Verify password
  const isPasswordValid = await bcrypt.compare(password, user.password);
  if (!isPasswordValid) {
    throw new ApiError(StatusCodes.UNAUTHORIZED, 'Invalid phone number or password');
  }

  // Generate JWT token
  const token = generateToken({ userId: user._id });

  res.status(StatusCodes.OK).json({
    success: true,
    message: 'Login successful',
    data: {
      token,
      user: buildAuthResponse(user)
    }
  });
});

// Get current user profile
const getCurrentUser = asyncHandler(async (req, res) => {
  res.status(StatusCodes.OK).json({
    success: true,
    data: {
      user: buildAuthResponse(req.user)
    }
  });
});

// Update current user profile
const updateCurrentUser = asyncHandler(async (req, res) => {
  const nextName = req.body.name?.toString().trim();

  if (!nextName) {
    throw new ApiError(StatusCodes.BAD_REQUEST, 'Name is required');
  }

  const updates = {
    name: nextName
  };

  // Handle profile picture upload if provided
  if (req.file) {
    const uploadResult = await uploadFileToCloudinary(req.file.buffer, {
      folder: 'chat-web-app/profile-pictures',
      public_id: `${req.user._id}-${Date.now()}`,
      resource_type: 'image'
    });

    updates.profilePic = uploadResult.secure_url;
  }

  // Update user in database
  const user = await User.findByIdAndUpdate(req.user._id, updates, {
    new: true,
    runValidators: true
  });

  res.status(StatusCodes.OK).json({
    success: true,
    message: 'Profile updated successfully',
    data: {
      user: buildAuthResponse(user)
    }
  });
});

/**
 * Initiate forgot password flow by generating and storing reset OTP
 * @route POST /auth/forgot-password
 */
const forgotPassword = asyncHandler(async (req, res) => {
  const { phone } = req.body;

  // Find user by phone
  const user = await User.findOne({ phone });
  if (!user) {
    throw new ApiError(StatusCodes.NOT_FOUND, 'Phone number not registered');
  }

  // Generate and hash OTP
  const otp = generateOTP();
  const hashedOtp = hashOTP(otp);
  const otpExpiry = getTokenExpiry(10);

  // Store hashed OTP and expiry
  user.passwordResetOtp = hashedOtp;
  user.passwordResetOtpExpiry = otpExpiry;
  await user.save();

  // // Development-only helper: remove this log before production deployment.
  // console.log('🔐 OTP for', user.phone, 'is:', otp);

  // Send OTP via SMS
  await sendPasswordResetOtpSms({ phone: user.phone, otp });

  res.status(StatusCodes.OK).json({
    success: true,
    message: 'Password reset OTP sent successfully',
    data: {
      expiresIn: '10 minutes'
    }
  });
});

/**
 * Verify reset OTP validity
 * @route POST /auth/verify-reset-otp
 */
const verifyResetOtp = asyncHandler(async (req, res) => {
  const { phone, otp } = req.body;

  // Hash the provided OTP for comparison
  const hashedOtp = hashOTP(otp);

  // Find user with matching phone, OTP, and valid expiry
  const user = await User.findOne({
    phone,
    passwordResetOtp: hashedOtp,
    passwordResetOtpExpiry: { $gt: Date.now() }
  }).select('+passwordResetOtp +passwordResetOtpExpiry');

  if (!user) {
    throw new ApiError(StatusCodes.BAD_REQUEST, 'Invalid or expired OTP');
  }

  res.status(StatusCodes.OK).json({
    success: true,
    message: 'OTP is valid',
    data: {
      phone: user.phone
    }
  });
});

/**
 * Reset password with valid OTP
 * @route POST /auth/reset-password
 */
const resetPassword = asyncHandler(async (req, res) => {
  const { phone, otp, newPassword } = req.body;

  // Hash the provided OTP
  const hashedOtp = hashOTP(otp);

  // Find user with valid OTP
  const user = await User.findOne({
    phone,
    passwordResetOtp: hashedOtp,
    passwordResetOtpExpiry: { $gt: Date.now() }
  }).select('+password +passwordResetOtp +passwordResetOtpExpiry');

  if (!user) {
    throw new ApiError(StatusCodes.BAD_REQUEST, 'Invalid or expired OTP');
  }

  // Hash new password
  const saltRounds = Number(process.env.BCRYPT_SALT_ROUNDS) || 12;
  const hashedPassword = await bcrypt.hash(newPassword, saltRounds);

  // Update password and clear OTP fields
  user.password = hashedPassword;
  user.passwordResetOtp = null;
  user.passwordResetOtpExpiry = null;
  await user.save();

  res.status(StatusCodes.OK).json({
    success: true,
    message: 'Password has been reset successfully. Please log in with your new password.',
    data: {
      phone: user.phone
    }
  });
});

module.exports = {
  register,
  login,
  getCurrentUser,
  updateCurrentUser,
  forgotPassword,
  verifyResetOtp,
  resetPassword
};
