// src/services/socketService.js

let ioInstance = null;

/**
 * Initialize the Socket.IO instance.
 * Call this once in server setup.
 * @param {import('socket.io').Server} io
 */
function init(io) {
  ioInstance = io;
}

/**
 * Emit an event to all sockets in a party room.
 * @param {string} partyId
 * @param {string} event 
 * @param {any} payload
 */
function emitToParty(partyId, event, payload) {
  if (!ioInstance) return;
  ioInstance.to(partyId).emit(event, payload);
}

/**
 * Emit an event to everyone (global).
 * @param {string} event
 * @param {any} payload
 */
function emitGlobal(event, payload) {
  if (!ioInstance) return;
  ioInstance.emit(event, payload);
}

module.exports = {
  init,
  emitToParty,
  emitGlobal,
};
