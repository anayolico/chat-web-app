// Main server entry point for the Chat Web App backend
// This file initializes the Express app, connects to the database,
// sets up Socket.IO for real-time communication, and starts the HTTP server

require('dotenv').config();

const http = require('http');

const app = require('./app');
const connectDB = require('./config/db');
const { validateEnv } = require('./config/env');
const createSocketServer = require('./socket/socketServer');
const backfillMessageExpirations = require('./utils/backfillMessageExpirations');
const logger = require('./utils/logger');

// Main function to start the server
const startServer = async () => {
  try {
    const env = validateEnv();
    const PORT = process.env.PORT || env.port;
    await connectDB(env.mongoUri);
    await backfillMessageExpirations();
    const httpServer = http.createServer(app);
    createSocketServer(httpServer);

    httpServer.listen(PORT, () => {
      logger.info(`Server running on port ${PORT}`, {
        environment: env.nodeEnv
      });
    });
  } catch (error) {
    logger.error('Failed to start server', {
      message: error.message
    });
    process.exit(1);
  }
};

process.on('unhandledRejection', (error) => {
  logger.error('Unhandled promise rejection', {
    message: error.message
  });
});

process.on('uncaughtException', (error) => {
  logger.error('Uncaught exception', {
    message: error.message
  });
  process.exit(1);
});

startServer();
