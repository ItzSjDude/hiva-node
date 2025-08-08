// src/server.js
require('dotenv').config();
const server             = require('./src/app');
const { connectDatabase }= require('./src/models');
const logger             = require('./src/utils/logger');
const { roomService }    = require('./src/config/livekit');  // ← import LiveKit client

const PORT = process.env.PORT || 3000;

async function start() {
  try {
    // 1) Check LiveKit health
    await roomService.listRooms();
    logger.info('✅ LiveKit server reachable');

    // 2) Connect & sync DB
    await connectDatabase();
    logger.info('✅ Database connected & synced');

    // 3) Start HTTP + Socket.IO server
    server.listen(PORT, () => {
      logger.info(`🚀 Server running on port ${PORT}`);
    });
  } catch (err) {
    logger.error('❌ Startup failed:', err);
    process.exit(1);
  }
}

start();
