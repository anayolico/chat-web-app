const { validationResult } = require('express-validator');
const { StatusCodes } = require('http-status-codes');

const validateRequest = (req, _res, next) => {
  const errors = validationResult(req);

  if (errors.isEmpty()) {
    return next();
  }

  return next({
    statusCode: StatusCodes.BAD_REQUEST,
    message: 'Validation failed',
    errors: errors.array().map((error) => ({
      field: error.path,
      message: error.msg
    }))
  });
};

module.exports = validateRequest;
