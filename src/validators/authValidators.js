const { body } = require('express-validator');

const { NIGERIAN_PHONE_REGEX } = require('../utils/nigerianPhone');

const passwordValidator = (fieldName, label) =>
  body(fieldName)
    .trim()
    .notEmpty()
    .withMessage(`${label} is required`)
    .isLength({ min: 6, max: 128 })
    .withMessage(`${label} must be at least 6 characters`);

const registerValidator = [
  body('name')
    .trim()
    .notEmpty()
    .withMessage('Name is required')
    .isLength({ min: 2, max: 50 })
    .withMessage('Name must be between 2 and 50 characters'),
  body('phone')
    .trim()
    .notEmpty()
    .withMessage('Phone number is required')
    .matches(NIGERIAN_PHONE_REGEX)
    .withMessage('Phone number must be a valid Nigerian number like 08012345678'),
  passwordValidator('password', 'Password')
];

const loginValidator = [
  body('phone')
    .trim()
    .notEmpty()
    .withMessage('Phone number is required')
    .matches(NIGERIAN_PHONE_REGEX)
    .withMessage('Phone number must be a valid Nigerian number like 08012345678'),
  passwordValidator('password', 'Password')
];

const forgotPasswordValidator = [
  body('phone')
    .trim()
    .notEmpty()
    .withMessage('Phone number is required')
    .matches(NIGERIAN_PHONE_REGEX)
    .withMessage('Phone number must be a valid Nigerian number like 08012345678')
];

const resetPasswordValidator = [
  body('phone')
    .trim()
    .notEmpty()
    .withMessage('Phone number is required')
    .matches(NIGERIAN_PHONE_REGEX)
    .withMessage('Phone number must be a valid Nigerian number like 08012345678'),
  body('otp')
    .trim()
    .notEmpty()
    .withMessage('OTP is required')
    .matches(/^\d{6}$/)
    .withMessage('OTP must be exactly 6 digits'),
  passwordValidator('newPassword', 'New password')
];

const verifyResetOtpValidator = [
  body('phone')
    .trim()
    .notEmpty()
    .withMessage('Phone number is required')
    .matches(NIGERIAN_PHONE_REGEX)
    .withMessage('Phone number must be a valid Nigerian number like 08012345678'),
  body('otp')
    .trim()
    .notEmpty()
    .withMessage('OTP is required')
    .matches(/^\d{6}$/)
    .withMessage('OTP must be exactly 6 digits')
];

const updateProfileValidator = [
  body('name')
    .trim()
    .notEmpty()
    .withMessage('Name is required')
    .isLength({ min: 2, max: 50 })
    .withMessage('Name must be between 2 and 50 characters')
];

module.exports = {
  registerValidator,
  loginValidator,
  forgotPasswordValidator,
  resetPasswordValidator,
  verifyResetOtpValidator,
  updateProfileValidator
};
