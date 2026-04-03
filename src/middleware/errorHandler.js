const { StatusCodes, getReasonPhrase } = require('http-status-codes');
const logger = require('../utils/logger');

const errorHandler = (err, _req, res, _next) => {
  const isProduction = process.env.NODE_ENV === 'production';
  let statusCode = err.statusCode || StatusCodes.INTERNAL_SERVER_ERROR;
  let message = err.message || getReasonPhrase(StatusCodes.INTERNAL_SERVER_ERROR);
  let errors;

  if (err.code === 11000) {
    statusCode = StatusCodes.CONFLICT;
    message = 'Phone number already exists';
  }

  if (err.name === 'ValidationError') {
    statusCode = StatusCodes.BAD_REQUEST;
    message = 'Validation failed';
    errors = Object.values(err.errors).map((error) => ({
      field: error.path,
      message: error.message
    }));
  }

  if (err.errors && Array.isArray(err.errors)) {
    errors = err.errors;
  }

  if (err.name === 'MulterError') {
    statusCode = StatusCodes.BAD_REQUEST;
    message = err.code === 'LIMIT_FILE_SIZE' ? 'File size cannot exceed 15MB' : err.message;
  }

  if (statusCode >= StatusCodes.INTERNAL_SERVER_ERROR) {
    logger.error('Request failed', {
      message: err.message,
      statusCode
    });
    message = isProduction ? 'Something went wrong. Please try again later.' : message;
  } else if (!isProduction) {
    logger.warn('Request validation failed', {
      message,
      statusCode
    });
  }

  res.status(statusCode).json({
    success: false,
    message,
    ...(errors ? { errors } : {})
  });
};

module.exports = errorHandler;
