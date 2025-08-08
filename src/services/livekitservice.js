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

module.exports = {
  createRoom,
  deleteRoom,
  generateToken,
};
