const logger = require('../utils/logger');

/**
 * Socket.IO logging middleware for real-time event tracking
 */
function createSocketLogger(io) {
  // Log all incoming connections
  io.on('connection', (socket) => {
    logger.info(`[Socket.IO] New connection: ${socket.id} from ${socket.handshake.address}`);
    
    // Log handshake details
    logger.info(`[Socket.IO] Handshake query: ${JSON.stringify(socket.handshake.query)}`);
    logger.info(`[Socket.IO] User agent: ${socket.handshake.headers['user-agent']}`);
    
    // Log all events
    const originalEmit = socket.emit;
    socket.emit = function(event, ...args) {
      logger.info(`[Socket.IO] Emit: ${socket.id} -> ${event}`, { data: args });
      return originalEmit.apply(this, [event, ...args]);
    };
    
    // Log all incoming events
    const originalOn = socket.on;
    socket.on = function(event, handler) {
      const wrappedHandler = (...args) => {
        logger.info(`[Socket.IO] Received: ${socket.id} <- ${event}`, { data: args });
        return handler.apply(this, args);
      };
      return originalOn.call(this, event, wrappedHandler);
    };
    
    // Log disconnections
    socket.on('disconnect', (reason) => {
      logger.info(`[Socket.IO] Disconnected: ${socket.id}, Reason: ${reason}`);
    });
    
    // Log errors
    socket.on('error', (error) => {
      logger.error(`[Socket.IO] Error for ${socket.id}:`, error);
    });
    
    // Log room joins/leaves
    const originalJoin = socket.join;
    socket.join = function(room) {
      logger.info(`[Socket.IO] ${socket.id} joined room: ${room}`);
      return originalJoin.call(this, room);
    };
    
    const originalLeave = socket.leave;
    socket.leave = function(room) {
      logger.info(`[Socket.IO] ${socket.id} left room: ${room}`);
      return originalLeave.call(this, room);
    };
  });
  
  // Log namespace events
  io.on('connect_error', (error) => {
    logger.error('[Socket.IO] Connection error:', error);
  });
  
  io.on('connect_timeout', (timeout) => {
    logger.warn('[Socket.IO] Connection timeout:', timeout);
  });
  
  // Log all room events
  io.on('create_room', (room) => {
    logger.info(`[Socket.IO] Room created: ${room}`);
  });
  
  io.on('delete_room', (room) => {
    logger.info(`[Socket.IO] Room deleted: ${room}`);
  });
  
  return io;
}

module.exports = { createSocketLogger };
