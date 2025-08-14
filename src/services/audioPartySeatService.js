// src/services/audioPartySeatService.js
const { Sequelize } = require('sequelize');
const sequelize = require('../config/database');
const AudioParty = require('../models/AudioParty');
const AudioPartySeat = require('../models/AudioPartySeat');

// 🔗 LiveKit server-side controls (hard mute/unmute)
const {
  hardMute,
  hardUnmute,
  muteAllParticipantsAudio,
} = require('./livekitService'); // path correct: services -> same folder

class SeatError extends Error {
  constructor(code, msg) { super(msg); this.code = code; }
}

/** host verify helper (returns party row too) */
async function assertHost({ partyId, actorUserId, t }) {
  const party = await AudioParty.findByPk(partyId, { transaction: t, lock: t.LOCK.UPDATE });
  if (!party) throw new SeatError('PartyNotFound', 'Party not found');
  if (String(party.hostId) !== String(actorUserId)) {
    throw new SeatError('Forbidden', 'Only host can perform this action');
  }
  return party;
}

/** TAKE SEAT: user ko specific seat par bithao (race-safe). */
async function takeSeat({ partyId, seatNumber, userId, force = false }) {
  return sequelize.transaction(async (t) => {
    const party = await AudioParty.findByPk(partyId, { transaction: t, lock: t.LOCK.UPDATE });
    if (!party) throw new SeatError('PartyNotFound', 'Party not found');

    const seat = await AudioPartySeat.findOne({
      where: { partyId, seatNumber },
      transaction: t, lock: t.LOCK.UPDATE,
    });
    if (!seat) throw new SeatError('SeatNotFound', 'Seat not found');

    if (seat.isLocked && !force) throw new SeatError('SeatLocked', 'Seat is locked');
    if (seat.userId && !force) throw new SeatError('SeatOccupied', 'Seat already occupied');

    // ensure user not already seated; if seated somewhere else, move them
    const existing = await AudioPartySeat.findOne({
      where: { partyId, userId },
      transaction: t, lock: t.LOCK.UPDATE,
    });
    if (existing && existing.seatNumber !== seatNumber) {
      existing.userId = null;
      existing.isMuted = false;
      existing.joinedAt = null;
      await existing.save({ transaction: t });
    }

    seat.userId = userId;
    seat.isMuted = false;     // fresh seat => not muted by default
    seat.joinedAt = new Date();
    await seat.save({ transaction: t });

    return seat; // { seatNumber, userId, ... }
  });
}

/** LEAVE SEAT: user jis seat par hai wahan se uth jaye (host ko block). */
async function leaveSeat({ partyId, userId, allowHostLeave = false }) {
  return sequelize.transaction(async (t) => {
    const seat = await AudioPartySeat.findOne({
      where: { partyId, userId },
      transaction: t, lock: t.LOCK.UPDATE,
    });
    if (!seat) return null;

    if (seat.isHost && !allowHostLeave) {
      throw new SeatError('HostSeatCannotLeave', 'Host seat cannot be vacated without transfer');
    }

    seat.userId = null;
    seat.isMuted = false;
    seat.joinedAt = null;
    await seat.save({ transaction: t });
    return seat;
  });
}

/**
 * MUTE (single): self ya host action — user ki seat ko mute/unmute.
 * - Self action: DB state update only (no LiveKit hard mute)
 * - Host action: DB update + LiveKit hardMute/hardUnmute
 */
async function setSeatMute({ partyId, userId, isMuted, actorUserId, allowSelf = true }) {
  // We'll detect whether this is host action or self
  let partyForLivekit = null;
  let doHardMute = false; // only for host action

  const seat = await sequelize.transaction(async (t) => {
    const seatRow = await AudioPartySeat.findOne({
      where: { partyId, userId },
      transaction: t, lock: t.LOCK.UPDATE,
    });
    if (!seatRow) throw new SeatError('SeatNotFound', 'User not seated');

    const isSelf = String(actorUserId) === String(userId);

    // permissions: host can always; otherwise user can only self-toggle
    if (!isSelf) {
      partyForLivekit = await assertHost({ partyId, actorUserId, t }); // ensures host & gives roomName
      doHardMute = true;
    } else if (!allowSelf) {
      throw new SeatError('Forbidden', 'You cannot change mute yourself');
    }

    // Update logical seat state
    seatRow.isMuted = !!isMuted;
    await seatRow.save({ transaction: t });
    return seatRow;
  });

  // LiveKit hard-mute only when host performed the action
  if (doHardMute && partyForLivekit) {
    const roomName = partyForLivekit.livekitRoomName;
    try {
      if (isMuted) {
        await hardMute(roomName, userId);
      } else {
        await hardUnmute(roomName, userId);
      }
    } catch (e) {
      // If LiveKit call fails, we keep DB state but surface a soft error
      // (caller can decide to retry or show warning)
      // You can also choose to revert DB state here if you want strict consistency.
      // console.error('LiveKit hardMute error:', e);
    }
  }

  return seat;
}

/** MUTE ALL: host-only; host ko by default exclude karte (configurable) + LiveKit hard mute all. */
async function muteAll({ partyId, actorUserId, includeHost = false }) {
  // DB changes + LiveKit call
  let party;
  const seats = await sequelize.transaction(async (t) => {
    party = await assertHost({ partyId, actorUserId, t });

    const where = includeHost
      ? { partyId, userId: { [Sequelize.Op.ne]: null } }
      : { partyId, userId: { [Sequelize.Op.ne]: null }, isHost: false };

    const list = await AudioPartySeat.findAll({ where, transaction: t, lock: t.LOCK.UPDATE });
    if (!list.length) return [];

    for (const s of list) s.isMuted = true;
    await Promise.all(list.map(s => s.save({ transaction: t })));
    return list;
  });

  // LiveKit hard mute all (exclude host if needed)
  if (party) {
    try {
      await muteAllParticipantsAudio(party.livekitRoomName, {
        muted: true,
        includeHost,
        hostIdentity: String(party.hostId),
      });
    } catch (e) {
      // console.error('LiveKit muteAll error:', e);
    }
  }

  return seats;
}

/** UNMUTE ALL: host-only; reverse of muteAll (DB + LiveKit). */
async function unmuteAll({ partyId, actorUserId, includeHost = false }) {
  let party;
  const seats = await sequelize.transaction(async (t) => {
    party = await assertHost({ partyId, actorUserId, t });

    const where = includeHost
      ? { partyId, userId: { [Sequelize.Op.ne]: null } }
      : { partyId, userId: { [Sequelize.Op.ne]: null }, isHost: false };

    const list = await AudioPartySeat.findAll({ where, transaction: t, lock: t.LOCK.UPDATE });
    if (!list.length) return [];

    for (const s of list) s.isMuted = false;
    await Promise.all(list.map(s => s.save({ transaction: t })));
    return list;
  });

  if (party) {
    try {
      await muteAllParticipantsAudio(party.livekitRoomName, {
        muted: false,
        includeHost,
        hostIdentity: String(party.hostId),
      });
    } catch (e) {
      // console.error('LiveKit unmuteAll error:', e);
    }
  }

  return seats;
}

/** LOCK (single seat): host-only. */
async function setSeatLock({ partyId, seatNumber, lock, actorUserId }) {
  return sequelize.transaction(async (t) => {
    await assertHost({ partyId, actorUserId, t });

    const seat = await AudioPartySeat.findOne({
      where: { partyId, seatNumber },
      transaction: t, lock: t.LOCK.UPDATE,
    });
    if (!seat) throw new SeatError('SeatNotFound', 'Seat not found');

    seat.isLocked = !!lock;
    await seat.save({ transaction: t });
    return seat;
  });
}

/** LOCK ALL: host-only (host seat optional). */
async function lockAll({ partyId, actorUserId, includeHost = false }) {
  return sequelize.transaction(async (t) => {
    await assertHost({ partyId, actorUserId, t });

    const where = includeHost ? { partyId } : { partyId, isHost: false };
    const seats = await AudioPartySeat.findAll({ where, transaction: t, lock: t.LOCK.UPDATE });
    if (!seats.length) return [];

    for (const s of seats) s.isLocked = true;
    await Promise.all(seats.map(s => s.save({ transaction: t })));
    return seats;
  });
}

module.exports = {
  SeatError,
  takeSeat,
  leaveSeat,
  setSeatMute,        // host -> DB + LiveKit hard mute ; self -> DB only
  muteAll,            // host -> DB + LiveKit hard mute all
  unmuteAll,          // host -> DB + LiveKit hard unmute all
  setSeatLock,
  lockAll,
};
