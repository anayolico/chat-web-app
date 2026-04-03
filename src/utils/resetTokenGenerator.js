const crypto = require('crypto');

const generateOTP = () => crypto.randomInt(100000, 1000000).toString();

const hashOTP = (otp) => crypto.createHash('sha256').update(String(otp)).digest('hex');

const getTokenExpiry = (minutes = 10) => new Date(Date.now() + minutes * 60 * 1000);

module.exports = {
  generateOTP,
  hashOTP,
  getTokenExpiry
};
