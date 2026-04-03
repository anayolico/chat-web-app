// Database configuration and connection setup
// This module handles MongoDB connection using Mongoose ODM

const mongoose = require('mongoose');
const logger = require('../utils/logger');

// Function to establish connection to MongoDB
const connectDB = async (mongoUri) => {
  if (!mongoUri) {
    throw new Error('MONGODB_URI is not defined in environment variables');
  }

  mongoose.connection.on('error', (error) => {
    logger.error('MongoDB connection error', {
      message: error.message
    });
  });

  mongoose.connection.on('disconnected', () => {
    logger.warn('MongoDB disconnected');
  });

  await mongoose.connect(mongoUri, {
    serverSelectionTimeoutMS: 10000
  });

  logger.info('MongoDB connected successfully');
};

module.exports = connectDB;
