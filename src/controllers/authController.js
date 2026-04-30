// Authentication controller handling user registration, login, profile management,
// and password reset functionality

const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const { StatusCodes } = require('http-status-codes');

const User = require('../models/User');
const ApiError = require('../utils/ApiError');
const asyncHandler = require('../utils/asyncHandler');
const generateToken = require('../utils/generateToken');
const { generateOTP, hashOTP, getTokenExpiry } = require('../utils/resetTokenGenerator');
const { sendPasswordResetOtpSms } = require('../services/smsService');
const uploadFileToCloudinary = require('../utils/uploadFileToCloudinary');

const buildTokenHash = (token) => crypto.createHash('sha256').update(token).digest('hex');
const getRefreshSecret = () => process.env.REFRESH_TOKEN_SECRET || process.env.JWT_SECRET;
const getRefreshExpiresIn = () => process.env.REFRESH_TOKEN_EXPIRES_IN || '30d';
const getRefreshTtlMs = () => Number(process.env.REFRESH_TOKEN_TTL_MS || 30 * 24 * 60 * 60 * 1000);
const allowedThemes = new Set(['aurora', 'sunset', 'midnight']);
const allowedWallpapers = new Set(['nebula', 'dunes', 'grid', 'rain']);

const pruneExpiredRefreshTokens = (refreshTokens = []) =>
  refreshTokens.filter((entry) => entry?.expiresAt && new Date(entry.expiresAt).getTime() > Date.now());

const issueAuthTokens = async (user) => {
  const accessToken = generateToken({ userId: user._id });
  const refreshToken = generateToken(
    {
      userId: user._id,
      type: 'refresh'
    },
    {
      secret: getRefreshSecret(),
      expiresIn: getRefreshExpiresIn()
    }
  );

  const nextRefreshTokens = pruneExpiredRefreshTokens(user.refreshTokens || []);
  nextRefreshTokens.push({
    tokenHash: buildTokenHash(refreshToken),
    expiresAt: new Date(Date.now() + getRefreshTtlMs()),
    createdAt: new Date()
  });
  user.refreshTokens = nextRefreshTokens;
  await user.save({ validateBeforeSave: false });

  return {
    token: accessToken,
    refreshToken
  };
};

// Build consistent auth response to avoid leaking sensitive fields
const buildAuthResponse = (user) => ({
  id: user._id,
  name: user.name,
  phone: user.phone,
  profilePic: user.profilePic,
  createdAt: user.createdAt,
  lastSeen: user.lastSeen || null,
  privacy: {
    showLastSeen: user.privacy?.showLastSeen !== false,
    showOnlineStatus: user.privacy?.showOnlineStatus !== false,
    allowReadReceipts: user.privacy?.allowReadReceipts !== false
  },
  preferences: {
    theme: user.preferences?.theme || 'aurora',
    wallpaper: user.preferences?.wallpaper || 'nebula'
  },
  blockedUsers: (user.blockedUsers || []).map((blockedUserId) => blockedUserId.toString())
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
  const tokens = await issueAuthTokens(user);

  res.status(StatusCodes.CREATED).json({
    success: true,
    message: 'User registered successfully',
    data: {
      ...tokens,
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
  const tokens = await issueAuthTokens(user);

  res.status(StatusCodes.OK).json({
    success: true,
    message: 'Login successful',
    data: {
      ...tokens,
      user: buildAuthResponse(user)
    }
  });
});

const refreshSession = asyncHandler(async (req, res) => {
  const refreshToken = req.body.refreshToken?.toString().trim();

  if (!refreshToken) {
    throw new ApiError(StatusCodes.BAD_REQUEST, 'refreshToken is required');
  }

  let decoded;
  try {
    decoded = jwt.verify(refreshToken, getRefreshSecret());
  } catch (_error) {
    throw new ApiError(StatusCodes.UNAUTHORIZED, 'Invalid or expired refresh token');
  }

  if (decoded.type !== 'refresh') {
    throw new ApiError(StatusCodes.UNAUTHORIZED, 'Invalid refresh token type');
  }

  const user = await User.findById(decoded.userId).select('+refreshTokens');
  if (!user) {
    throw new ApiError(StatusCodes.UNAUTHORIZED, 'User no longer exists');
  }

  const tokenHash = buildTokenHash(refreshToken);
  const activeTokens = pruneExpiredRefreshTokens(user.refreshTokens || []);
  const isKnownToken = activeTokens.some((entry) => entry.tokenHash === tokenHash);

  if (!isKnownToken) {
    user.refreshTokens = activeTokens;
    await user.save({ validateBeforeSave: false });
    throw new ApiError(StatusCodes.UNAUTHORIZED, 'Refresh token has been revoked');
  }

  user.refreshTokens = activeTokens.filter((entry) => entry.tokenHash !== tokenHash);
  const tokens = await issueAuthTokens(user);

  res.status(StatusCodes.OK).json({
    success: true,
    message: 'Session refreshed',
    data: {
      ...tokens,
      user: buildAuthResponse(user)
    }
  });
});

const logout = asyncHandler(async (req, res) => {
  const refreshToken = req.body.refreshToken?.toString().trim();
  const user = await User.findById(req.user._id).select('+refreshTokens');

  if (!user) {
    throw new ApiError(StatusCodes.NOT_FOUND, 'User not found');
  }

  const activeTokens = pruneExpiredRefreshTokens(user.refreshTokens || []);

  if (refreshToken) {
    const tokenHash = buildTokenHash(refreshToken);
    user.refreshTokens = activeTokens.filter((entry) => entry.tokenHash !== tokenHash);
  } else {
    user.refreshTokens = [];
  }

  await user.save({ validateBeforeSave: false });

  res.status(StatusCodes.OK).json({
    success: true,
    message: 'Logged out successfully'
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

  const updates = {};

  if (nextName) {
    updates.name = nextName;
  }

  if (typeof req.body.showLastSeen !== 'undefined') {
    updates['privacy.showLastSeen'] = req.body.showLastSeen === 'true' || req.body.showLastSeen === true;
  }

  if (typeof req.body.showOnlineStatus !== 'undefined') {
    updates['privacy.showOnlineStatus'] = req.body.showOnlineStatus === 'true' || req.body.showOnlineStatus === true;
  }

  if (typeof req.body.allowReadReceipts !== 'undefined') {
    updates['privacy.allowReadReceipts'] =
      req.body.allowReadReceipts === 'true' || req.body.allowReadReceipts === true;
  }

  const nextTheme = req.body.theme?.toString().trim();
  if (nextTheme) {
    updates['preferences.theme'] = allowedThemes.has(nextTheme) ? nextTheme : 'aurora';
  }

  const nextWallpaper = req.body.wallpaper?.toString().trim();
  if (nextWallpaper) {
    updates['preferences.wallpaper'] = allowedWallpapers.has(nextWallpaper) ? nextWallpaper : 'nebula';
  }

  if (Object.keys(updates).length === 0 && !req.file) {
    throw new ApiError(StatusCodes.BAD_REQUEST, 'At least one profile field is required');
  }

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
  logout,
  refreshSession,
  getCurrentUser,
  updateCurrentUser,
  forgotPassword,
  verifyResetOtp,
  resetPassword
};
