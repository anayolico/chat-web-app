const express = require('express');

const {
  register,
  login,
  getCurrentUser,
  updateCurrentUser,
  forgotPassword,
  verifyResetOtp,
  resetPassword
} = require('../controllers/authController');
const { protect } = require('../middleware/authMiddleware');
const { authLimiter, forgotPasswordLimiter, otpVerificationLimiter, uploadLimiter } = require('../middleware/rateLimiters');
const { uploadSingleProfileImage } = require('../middleware/uploadMiddleware');
const validateRequest = require('../middleware/validateRequest');
const {
  registerValidator,
  loginValidator,
  forgotPasswordValidator,
  resetPasswordValidator,
  verifyResetOtpValidator,
  updateProfileValidator
} = require('../validators/authValidators');

const router = express.Router();

// Authentication routes
router.post('/register', authLimiter, registerValidator, validateRequest, register);
router.post('/login', authLimiter, loginValidator, validateRequest, login);
router.get('/me', protect, getCurrentUser);
router.put('/me', protect, uploadLimiter, uploadSingleProfileImage, updateProfileValidator, validateRequest, updateCurrentUser);

// Password reset routes
router.post('/forgot-password', forgotPasswordLimiter, forgotPasswordValidator, validateRequest, forgotPassword);
router.post('/verify-reset-otp', otpVerificationLimiter, verifyResetOtpValidator, validateRequest, verifyResetOtp);
router.post('/verify-reset-token', otpVerificationLimiter, verifyResetOtpValidator, validateRequest, verifyResetOtp);
router.post('/reset-password', otpVerificationLimiter, resetPasswordValidator, validateRequest, resetPassword);

module.exports = router;
