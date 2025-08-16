// src/services/livekitService.js

const { roomService, generateLiveKitToken } = require('../config/livekit');

/**
 * Create a LiveKit room (idempotent).
 * @param {string} name
 * @param {{ maxParticipants?: number, metadata?: object }} opts
 */
async function createRoom(name, opts = {}) {
  try {
    await roomService.createRoom({
      name,
      maxParticipants: opts.maxParticipants,
      metadata: opts.metadata && JSON.stringify(opts.metadata),
    });
  } catch (err) {
    // ignore if room already exists
    if (err.code !== 409) {
      throw err;
    }
  }
}

/**
 * Delete a LiveKit room.
 * @param {string} name
 */
async function deleteRoom(name) {
  await roomService.deleteRoom(name);
}

/**
 * Generate a LiveKit AccessToken JWT for a participant.
 * @param {string} roomName
 * @param {string} identity
 * @param {boolean} canPublish
 * @returns {string}
 */
function generateToken(roomName, identity, canPublish = false) {
  return generateLiveKitToken(roomName, identity, canPublish);
}

/**
 * Update a participant's permissions (e.g., mic on/off).
 * @param {string} roomName
 * @param {string} identity
 * @param {{ canPublish?: boolean, canSubscribe?: boolean, canPublishData?: boolean }} permissions
 */
// async function updateParticipant(roomName, identity, permissions) {
//   return await roomService.updateParticipant(roomName, identity,undefined, {
//     permission: permissions,
//   });
// }


// make sure baseURL/proxy resolves /twirp to livekit
async function allowMic({ roomName, identity }) {
  console.log('[allowMic] inputs =>', { roomName, identity, typeOfIdentity: typeof identity });

  try {
    await roomService.updateParticipant(
      roomName,
      identity,
      undefined,
      { canSubscribe: true, canPublish: true, canPublishData: true },
      undefined
    );

    console.log('[allowMic] success =>', { roomName, identity });
  } catch (err) {
    console.error('[allowMic] error =>', {
      roomName,
      identity,
      code: err?.code || err?.response?.status,
      message: err?.message,
    });
    throw err;
  }
}
async function allowMic({ roomName, identity }) {
  console.log('[allowMic] inputs =>', { roomName, identity, typeOfIdentity: typeof identity });

  try {
    await roomService.updateParticipant(
      roomName,
      identity,
      undefined,
      { canSubscribe: true, canPublish: true, canPublishData: true },
      undefined
    );

    console.log('[allowMic] success =>', { roomName, identity });
  } catch (err) {
    console.error('[allowMic] error =>', {
      roomName,
      identity,
      code: err?.code || err?.response?.status,
      message: err?.message,
    });
    throw err;
  }
}




async function revokeMic({ roomName, identity }) {
  await roomService.updateParticipant(roomName, String(identity), {
    permission: {
      canSubscribe: true,
      canPublish: false,
      canPublishData: true,
      canPublishSources: [], // or omit
    },
  });
}

/**
 * List all participants in a room.
 * @param {string} roomName
 * @returns {Promise<Array>}
 */
async function listParticipants(roomName) {
  const room = await roomService.getRoom(roomName);
  return room.participants || [];
}

/**
 * Remove (kick) a participant from a room.
 * @param {string} roomName
 * @param {string} identity
 */
async function removeParticipant(roomName, identity) {
  return await roomService.removeParticipant(roomName, identity);
}


module.exports = {
  createRoom,
  deleteRoom,
  generateToken,
  // updateParticipant,
  allowMic,
  revokeMic,
  listParticipants,
  removeParticipant, 
};



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


