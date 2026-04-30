const { validateEnv } = require('../config/env');

const defaultOrigins = [
  'http://localhost:3000',
  'http://localhost:3001',
  'http://localhost:3002',
  'http://127.0.0.1:3000',
  'http://127.0.0.1:3001',
  'http://127.0.0.1:3002',
  'https://chat-web-app-frontend-eight.vercel.app'
];

const normalizeOrigin = (value = '') => value.trim().replace(/\/+$/, '');

const getAllowedOrigins = () => {
  const env = validateEnv();

  return [...new Set([...defaultOrigins, ...env.allowedOrigins].map(normalizeOrigin).filter(Boolean))];
};

const isOriginAllowed = (origin) => {
  if (!origin) {
    return true;
  }

  return getAllowedOrigins().includes(normalizeOrigin(origin));
};

const corsOriginDelegate = (origin, callback) => {
  if (isOriginAllowed(origin)) {
    callback(null, true);
    return;
  }

  callback(new Error(`Origin ${origin} is not allowed by CORS`));
};

const getExpressCorsOptions = () => ({
  origin: corsOriginDelegate,
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
});

const getSocketCorsOptions = () => ({
  origin: getAllowedOrigins(),
  credentials: true,
  methods: ['GET', 'POST']
});

module.exports = {
  getAllowedOrigins,
  getExpressCorsOptions,
  getSocketCorsOptions
};
