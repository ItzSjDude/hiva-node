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


async function allowMic({ roomName, identity }) {
  await roomService.updateParticipant(roomName, identity, undefined, {
      canSubscribe: true,
      canPublish: true,
      canPublishData: true,
      canPublishSources: ['microphone'],
    
  });
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
