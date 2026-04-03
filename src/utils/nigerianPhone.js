const NIGERIAN_PHONE_REGEX = /^(070|080|081|090|091)\d{8}$/;

const isValidNigerianPhone = (phone) => NIGERIAN_PHONE_REGEX.test(String(phone || '').trim());

const toTermiiPhoneNumber = (phone) => `234${String(phone || '').trim().slice(1)}`;

module.exports = {
  NIGERIAN_PHONE_REGEX,
  isValidNigerianPhone,
  toTermiiPhoneNumber
};
