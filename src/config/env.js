const DEFAULT_PORT = 5000;

const parseAllowedOrigins = (value = '') =>
  value
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);

const parsePositiveInteger = (value, fallback) => {
  const parsedValue = Number(value);
  return Number.isInteger(parsedValue) && parsedValue > 0 ? parsedValue : fallback;
};

const getRequiredEnvVars = (nodeEnv) => {
  const requiredEnvVars = ['MONGODB_URI', 'JWT_SECRET', 'CLOUDINARY_CLOUD_NAME', 'CLOUDINARY_API_KEY', 'CLOUDINARY_API_SECRET'];

  if (nodeEnv === 'production') {
    requiredEnvVars.push('CLIENT_URL');
  }

  return requiredEnvVars;
};

const validateEnv = () => {
  const nodeEnv = process.env.NODE_ENV || 'development';
  const requiredEnvVars = getRequiredEnvVars(nodeEnv);
  const missingEnvVars = requiredEnvVars.filter((envVar) => !process.env[envVar]);

  if (missingEnvVars.length > 0) {
    throw new Error(`Missing required environment variables: ${missingEnvVars.join(', ')}`);
  }

  const allowedOrigins = parseAllowedOrigins(process.env.CLIENT_URL);

  if (nodeEnv === 'production' && allowedOrigins.length === 0) {
    throw new Error('CLIENT_URL must contain at least one frontend origin in production');
  }

  return {
    allowedOrigins,
    bcryptSaltRounds: parsePositiveInteger(process.env.BCRYPT_SALT_ROUNDS, 12),
    isProduction: nodeEnv === 'production',
    mongoUri: process.env.MONGODB_URI,
    nodeEnv,
    port: parsePositiveInteger(process.env.PORT, DEFAULT_PORT)
  };
};

module.exports = {
  parseAllowedOrigins,
  validateEnv
};
