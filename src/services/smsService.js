const ApiError = require('../utils/ApiError');
const { StatusCodes } = require('http-status-codes');
const { toTermiiPhoneNumber } = require('../utils/nigerianPhone');
const logger = require('../utils/logger');

const sendWithTermii = async ({ phone, message }) => {
  const apiKey = process.env.TERMII_API_KEY;
  const senderId = process.env.TERMII_SENDER_ID;
  const channel = process.env.TERMII_CHANNEL || 'generic';

  if (!apiKey || !senderId) {
    if (process.env.NODE_ENV === 'production') {
      throw new ApiError(StatusCodes.INTERNAL_SERVER_ERROR, 'SMS service is not configured');
    }

    logger.warn('SMS service is not configured; skipping SMS delivery in non-production');
    return { provider: 'console' };
  }

  const response = await fetch('https://api.ng.termii.com/api/sms/send', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      api_key: apiKey,
      to: toTermiiPhoneNumber(phone),
      from: senderId,
      sms: message,
      type: 'plain',
      channel
    })
  });

  const payload = await response.json();

  // console.log("📩 FULL Termii response:", payload);

  if (!response.ok || payload.code !== 'ok') {
    throw new ApiError(StatusCodes.BAD_GATEWAY, 'Failed to send password reset OTP');
  }

  return payload;
};

const sendPasswordResetOtpSms = async ({ phone, otp }) => {
  const message = `Your Chat Sphere password reset OTP is ${otp}. It expires in 10 minutes.`;
  return sendWithTermii({ phone, message });
};

module.exports = {
  sendPasswordResetOtpSms
};
