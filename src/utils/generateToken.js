const jwt = require('jsonwebtoken');

const generateToken = (payload, options = {}) => {
  const secret = options.secret || process.env.JWT_SECRET;
  const expiresIn = options.expiresIn || process.env.JWT_EXPIRES_IN || '7d';

  return jwt.sign(payload, secret, { expiresIn });
};

module.exports = generateToken;
