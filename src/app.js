// Express application configuration and middleware setup
// This file sets up the main Express app with security, CORS, rate limiting,
// logging, and routes for the Chat Web App backend

const express = require('express');
const compression = require('compression');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const rateLimit = require('express-rate-limit');

const { validateEnv } = require('./config/env');
const routes = require('./routes');
const notFound = require('./middleware/notFound');
const errorHandler = require('./middleware/errorHandler');
const logger = require('./utils/logger');

// Create Express application instance
const app = express();
const env = validateEnv();

// Security: Disable X-Powered-By header to avoid revealing server technology
app.disable('x-powered-by');
// Trust proxy for accurate IP addresses when behind load balancers
app.set('trust proxy', 1);

// Rate limiter: 200 requests per 15 minutes per IP
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 200,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    message: 'Too many requests. Please try again shortly.'
  }
});

// Security middleware: Set various HTTP headers for security
app.use(
  helmet({
    crossOriginResourcePolicy: false
  })
);

app.use(compression());

const resolveCorsOrigin = (origin, callback) => {
  if (!origin) {
    callback(null, true);
    return;
  }

  if (!env.isProduction) {
    if (env.allowedOrigins.length === 0 || env.allowedOrigins.includes(origin)) {
      callback(null, true);
      return;
    }
  }

  if (env.allowedOrigins.includes(origin)) {
    callback(null, true);
    return;
  }

  callback(new Error('Origin is not allowed by CORS'));
};

// CORS configuration: Allow requests from client URL or all origins in development
app.use(
  cors({
    origin: resolveCorsOrigin
  })
);

// Body parsing middleware: Parse JSON and URL-encoded request bodies
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: false, limit: '1mb' }));

// Logging middleware: Use combined format in production, dev format in development
app.use(
  morgan(env.isProduction ? 'combined' : 'dev', {
    stream: {
      write: (message) => {
        logger.info(message.trim());
      }
    }
  })
);

// Health check endpoint for monitoring and load balancers
app.get('/health', (_req, res) => {
  res.status(200).json({
    success: true,
    message: 'Server is healthy'
  });
});

// Apply rate limiting to all API routes
app.use('/api', limiter, routes);

// Error handling middleware (must be last)
app.use(notFound);
app.use(errorHandler);

module.exports = app;
