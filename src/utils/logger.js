// src/utils/logger.js
const { createLogger, format, transports } = require('winston');

const logger = createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: format.combine(
    format.timestamp(),
    format.errors({ stack: true }),
    format.splat(),
    format.json()
  ),
  defaultMeta: { service: 'audio-party-backend' },
  transports: [
    new transports.Console({
      format: format.combine(
        format.colorize(),
        format.simple()
      )
    }),
    // Add file transport for PM2 logs
    new transports.File({
      filename: 'logs/socket.log',
      format: format.combine(
        format.timestamp(),
        format.json()
      )
    })
  ]
});

// Ensure logs directory exists
const fs = require('fs');
const path = require('path');
const logsDir = path.join(__dirname, '..', 'logs');
if (!fs.existsSync(logsDir)) {
  fs.mkdirSync(logsDir, { recursive: true });
}

module.exports = logger;
