// Load environment before any other module reads process.env
require('dotenv').config();

const logger = require('./config/logger');
const { validateEnv } = require('./config/env');

validateEnv(logger);

const app = require('./app');
const connectDB = require('./config/db');

const PORT = process.env.PORT || 5000;

const start = async () => {
  await connectDB();
  require('./services/reminderService').startReminderScheduler();

  const server = app.listen(PORT, () => {
    logger.info(`🚀 Server is running on port ${PORT}`, {
      port: PORT,
      environment: process.env.NODE_ENV || 'development',
      timestamp: new Date().toISOString()
    });
  });

  const shutdown = (signal) => {
    logger.info(`${signal} signal received: closing HTTP server`);
    server.close(() => {
      logger.info('HTTP server closed');
      process.exit(0);
    });
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
};

start();
