// src/config/livekit.js
const { AccessToken, RoomServiceClient } = require('livekit-server-sdk');

const LIVEKIT_API_KEY    = process.env.LIVEKIT_API_KEY;
const LIVEKIT_API_SECRET = process.env.LIVEKIT_API_SECRET;
const LIVEKIT_WS_URL     = process.env.LIVEKIT_WS_URL || 'ws://localhost:7880';

// initialize the LiveKit RoomService client
const roomService = new RoomServiceClient(
  LIVEKIT_WS_URL,
  LIVEKIT_API_KEY,
  LIVEKIT_API_SECRET
);

/**
 * Generate a LiveKit AccessToken for a room and identity.
 * @param {string} roomName
 * @param {string} identity
 * @param {boolean} canPublish
 * @returns {string} JWT token
 */
function generateLiveKitToken(roomName, identity, canPublish = false) {
  const at = new AccessToken(
    LIVEKIT_API_KEY,
    LIVEKIT_API_SECRET,
    { identity }
  );

  // grant joining + subscription + optional publishing
  at.addGrant({
    roomJoin: true,
    room: roomName,
    canSubscribe: true,
    canPublish
  });

  return at.toJwt();
}

module.exports = {
  roomService,
  generateLiveKitToken,
  LIVEKIT_WS_URL,
};


