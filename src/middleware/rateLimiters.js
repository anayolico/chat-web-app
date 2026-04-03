const rateLimit = require('express-rate-limit');

const commonConfig = {
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    message: 'Too many requests. Please try again shortly.'
  }
};

const authLimiter = rateLimit({
  ...commonConfig,
  windowMs: 15 * 60 * 1000,
  max: 20
});

const forgotPasswordLimiter = rateLimit({
  ...commonConfig,
  windowMs: 10 * 60 * 1000,
  max: 5
});

const otpVerificationLimiter = rateLimit({
  ...commonConfig,
  windowMs: 10 * 60 * 1000,
  max: 10
});

const uploadLimiter = rateLimit({
  ...commonConfig,
  windowMs: 15 * 60 * 1000,
  max: 30
});

const messageReadLimiter = rateLimit({
  ...commonConfig,
  windowMs: 60 * 1000,
  max: 120
});

module.exports = {
  authLimiter,
  forgotPasswordLimiter,
  messageReadLimiter,
  otpVerificationLimiter,
  uploadLimiter
};
