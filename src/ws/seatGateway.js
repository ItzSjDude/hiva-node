const jwt = require('jsonwebtoken');
const logger = require('../utils/logger');
const {
  SeatError,
  takeSeat,
  leaveSeat,
  setSeatMute,
  muteAll,
  unmuteAll,
  setSeatLock,
  lockAll,
} = require('../services/audioPartySeatService');
const AudioPartySeat = require('../models/AudioPartySeats');
const AudioParty = require('../models/AudioParty');
const { deleteRoom, all, allowMic} = require('../services/livekitservice');

// simple UUID regex to detect real PKs
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

async function fetchSeatsSnapshot(partyId) {
  const rows = await AudioPartySeat.findAll({
    where: { partyId },
    order: [['seatNumber', 'ASC']],
    attributes: ['id','partyId','seatNumber','userId','isMuted','isLocked','isHost','joinedAt','updatedAt'],
  });
  return { partyId, seats: rows.map(r => r.toJSON()) };
}

function registerSeatNamespace(io, { jwtSecret = process.env.JWT_SECRET, autoLeaveOnDisconnect = true } = {}) {
  if (!jwtSecret) throw new Error('JWT secret missing');

  io.on('connection', async (socket) => {
    logger.info(`[SeatGateway] New connection: ${socket.id} from ${socket.handshake.address}`);

    // keep only this error handler (fine)
    socket.on('error', (error) => {
      logger.error(`[SeatGateway] Error for ${socket.id}:`, error);
    });

    // 🔐 Read from query (your client is sending query)
    const { token, jwt: jwtToken, partyId: rawPartyId } = socket.handshake.query || {};
    const tok = token || jwtToken;
    if (!tok) {
      logger.warn(`[SeatGateway] Disconnect: missing token`);
      return socket.disconnect(true);
    }
    if (!rawPartyId) {
      logger.warn(`[SeatGateway] Disconnect: missing partyId`);
      return socket.disconnect(true);
    }
    const reqPartyId = String(rawPartyId);

    // // ✅ Verify JWT
    // let payload;
    // try {
    //   payload = jwt.verify(String(tok), jwtSecret);
    // } catch (e) {
    //   logger.warn(`[SeatGateway] Disconnect: invalid JWT (${e.message})`);
    //   return socket.disconnect(true);
    // } 

    //<<<<<<<<<<<<<<SKIP JWT VERIFICATION FOR NOW>>>>>>>>>>>>>
    // ✅ Decode JWT (no verification)  
     let payload;
     try {     
       payload = jwt.decode(String(tok), { complete: false });
     } catch (e) {
     logger.warn(`[SeatGateway] Disconnect: invalid JWT (${e.message})`);
     }
    const userId = String(payload.userId || payload.uid || payload.sub || '');
     console.log(`[SeatGateway] Decoded payload:`, payload);
    if (!userId) {
      logger.warn(`[SeatGateway] Disconnect: no userId in token`);
      return socket.disconnect(true);
    }
  

    // ✅ Find party by PK or by livekitRoomName (your "party_..." value)
    let party = null;
    try {
      if (UUID_RE.test(reqPartyId)) {
        party = await AudioParty.findByPk(reqPartyId);
      } else {
        party = await AudioParty.findOne({ where: { livekitRoomName: reqPartyId } });
      } 
    } catch (e) {
      logger.error(`[SeatGateway] DB error during party lookup`, e);
    }

    if (!party) {
      logger.warn(`[SeatGateway] Disconnect: party not found for "${reqPartyId}" (PK or livekitRoomName)`);
      return socket.disconnect(true);
    }
    if (!party.isActive) {
      logger.warn(`[SeatGateway] Disconnect: party "${party.id}" inactive`);
      return socket.disconnect(true);
    }

    // attach auth context
    socket.data.userId = userId;
    socket.data.partyId = String(party.id);          // store canonical PK
    socket.data.party = party;

    const room = `party:${party.id}`;
    await socket.join(room);

    // initial events
    socket.emit('hello', { partyId: party.id, userId, ts: Date.now() });
    try {
      socket.emit('sync.state', await fetchSeatsSnapshot(party.id));
    } catch (e) {
      socket.emit('error', { code: 'SyncFailed', message: e.message });
    }

    socket.data.joined = false;

    const ackOk  = (cb, data) => { try { typeof cb === 'function' && cb({ ok: true, data }); } catch(_) {} };
    const ackErr = (cb, code, message) => { try { typeof cb === 'function' && cb({ ok: false, error: { code, message } }); } catch(_) {} };
    const requireMember = (cb) => { if(!socket.data.joined) { ackErr(cb,'NotJoined','Join party first'); return false;} return true; };

    // Presence
    socket.on('JOIN_PARTY', async (_payload, cb) => {
      logger.info(`[SeatGateway] JOIN_PARTY: ${socket.id} user=${userId} party=${party.id}`);
      socket.data.joined = true;
      ackOk(cb, { partyId: party.id, userId });
      socket.to(room).emit('presence.join', { partyId: party.id, userId, ts: Date.now() });
    });

    socket.on('LEAVE_PARTY', async (_payload, cb) => {
  const room = `party:${party.id}`;

  if (String(userId) === String(party.hostId)) {
    logger.info(`[SeatGateway] LEAVE_PARTY (host): ${socket.id} user=${userId} party=${party.id}`);

    try {
      // 1. Close LiveKit room
      if (party.livekitRoomName) {
        await deleteRoom(party.livekitRoomName);
        logger.info(`[SeatGateway] LiveKit room closed: ${party.livekitRoomName}`);
      }

      // 2. Delete all seats for this party
      await AudioPartySeat.destroy({ where: { partyId: party.id } });

      // 3. Delete party itself
      await AudioParty.destroy({ where: { id: party.id } });

      // 4. Notify all clients
      io.to(room).emit('room.closed', { partyId: party.id, reason: 'host left' });

      logger.info(`[SeatGateway] Party deleted: ${party.id}`);
    } catch (err) {
      logger.error(`[SeatGateway] Error deleting party ${party.id}`, err);
    }

    socket.data.joined = false;
    return ackOk(cb, { partyId: party.id, userId });
  }

  // Normal user leave
  logger.info(`[SeatGateway] LEAVE_PARTY (user): ${socket.id} user=${userId} party=${party.id}`);
  socket.data.joined = false;
  ackOk(cb, { partyId: party.id, userId });
  socket.to(room).emit('presence.leave', { partyId: party.id, userId, ts: Date.now() });
});


    socket.on('SYNC', async (_payload, cb) => {
      logger.info(`[SeatGateway] SYNC: ${socket.id} user=${userId} party=${party.id}`);
      try { ackOk(cb, await fetchSeatsSnapshot(party.id)); } 
      catch (e) { ackErr(cb, 'SyncFailed', e.message); }
    });

    // Seats
    socket.on('TAKE_SEAT_REQ', async ({ seatNumber, force=false }={}, cb) => {
      if(!requireMember(cb)) return;
      if(!Number.isInteger(seatNumber)) return ackErr(cb,'ValidationError','seatNumber int required');
      logger.info(`[SeatGateway] TAKE_SEAT_REQ: ${socket.id} user=${userId} party=${party.id} seat=${seatNumber} force=${force}`);
      try {
        const seat = await takeSeat({ partyId: party.id, seatNumber, userId, force });
        await allowMic(party.livekitRoomName, String(userId)); // allow publish
        ackOk(cb, seat);
        io.to(room).emit('seat.updated', seat);
      } catch (err) {
        if(err instanceof SeatError) return ackErr(cb, err.code||'SeatError', err.message);
        logger.error(`[SeatGateway] TAKE_SEAT_ERROR: ${socket.id}`, err);
        ackErr(cb,'InternalError','Something went wrong');
      }
    });//

    socket.on('LEAVE_SEAT_REQ', async (_payload, cb) => {
      if(!requireMember(cb)) return;
      logger.info(`[SeatGateway] LEAVE_SEAT_REQ: ${socket.id} user=${userId} party=${party.id}`);
      try {
        const seat = await leaveSeat({ partyId: party.id, userId, allowHostLeave:false });
        ackOk(cb, seat);
        if(seat) io.to(room).emit('seat.updated', seat);
      } catch (err) {
        if(err instanceof SeatError) return ackErr(cb, err.code||'SeatError', err.message);
        logger.error(`[SeatGateway] LEAVE_SEAT_ERROR: ${socket.id}`, err);
        ackErr(cb,'InternalError','Something went wrong');
      }
    });

    // Mute / Unmute
    socket.on('SET_MUTE', async ({ targetUserId, isMuted }={}, cb) => {
      if(!requireMember(cb)) return;
      const target = String(targetUserId || userId);
      try {
        const seat = await setSeatMute({ partyId: party.id, userId: target, isMuted: !!isMuted, actorUserId: userId, allowSelf:true });
        ackOk(cb, seat);
        io.to(room).emit('seat.updated', seat);
      } catch (err) {
        if(err instanceof SeatError) return ackErr(cb, err.code||'SeatError', err.message);
        logger.error(`[SeatGateway] SET_MUTE_ERROR: ${socket.id}`, err);
        ackErr(cb,'InternalError','Something went wrong');
      }
    });

    socket.on('MUTE_ALL', async ({ includeHost }={}, cb) => {
      if(!requireMember(cb)) return;
      try {
        const seats = await muteAll({ partyId: party.id, actorUserId:userId, includeHost:!!includeHost });
        ackOk(cb,{ count: seats.length });
        io.to(room).emit('party.muted', { partyId: party.id, includeHost, ts: Date.now() });
      } catch (err) {
        if(err instanceof SeatError) return ackErr(cb, err.code||'SeatError', err.message);
        logger.error(`[SeatGateway] MUTE_ALL_ERROR: ${socket.id}`, err);
        ackErr(cb,'InternalError','Something went wrong');
      }
    });

    socket.on('UNMUTE_ALL', async ({ includeHost }={}, cb) => {
      if(!requireMember(cb)) return;
      try {
        const seats = await unmuteAll({ partyId: party.id, actorUserId:userId, includeHost:!!includeHost });
        ackOk(cb,{ count: seats.length });
        io.to(room).emit('party.unmuted', { partyId: party.id, includeHost, ts: Date.now() });
      } catch (err) {
        if(err instanceof SeatError) return ackErr(cb, err.code||'SeatError', err.message);
        logger.error(`[SeatGateway] UNMUTE_ALL_ERROR: ${socket.id}`, err);
        ackErr(cb,'InternalError','Something went wrong');
      }
    });

    // Lock / Unlock
    socket.on('SET_LOCK', async ({ seatNumber, lock }={}, cb) => {
      if(!requireMember(cb)) return;
      if(!Number.isInteger(seatNumber) || typeof lock!=='boolean') return ackErr(cb,'ValidationError','seatNumber int & lock bool required');
      try {
        const seat = await setSeatLock({ partyId: party.id, seatNumber, lock:!!lock, actorUserId:userId });
        ackOk(cb, seat);
        io.to(room).emit('seat.updated', seat);
      } catch(err) {
        if(err instanceof SeatError) return ackErr(cb, err.code||'SeatError', err.message);
        logger.error(`[SeatGateway] SET_LOCK_ERROR: ${socket.id}`, err);
        ackErr(cb,'InternalError','Something went wrong');
      }
    });

    socket.on('LOCK_ALL', async ({ includeHost }={}, cb) => {
      if(!requireMember(cb)) return;
      try {
        const seats = await lockAll({ partyId: party.id, actorUserId:userId, includeHost:!!includeHost });
        ackOk(cb, { count: seats.length });
        io.to(room).emit('party.locked', { partyId: party.id, includeHost, ts: Date.now() });
      } catch(err) {
        if(err instanceof SeatError) return ackErr(cb, err.code||'SeatError', err.message);
        logger.error(`[SeatGateway] LOCK_ALL_ERROR: ${socket.id}`, err);
        ackErr(cb,'InternalError','Something went wrong');
      }
    });

    // Ping
    socket.on('PING', (_payload, cb) => {
      socket.emit('PONG', { ts: Date.now() });
      ackOk(cb,{ ts: Date.now() });
    });

    // Disconnect cleanup (keep only this one)
    socket.on('disconnect', async (reason) => {
      logger.info(`[SeatGateway] DISCONNECT: ${socket.id} user=${userId} reason=${reason}`);
      if(autoLeaveOnDisconnect){
        try {
          const seat = await leaveSeat({ partyId: party.id, userId, allowHostLeave:false });
          if(seat) io.to(room).emit('seat.updated', seat);
        } catch(err) {
          logger.error(`[SeatGateway] AUTO_LEAVE_ERROR: ${socket.id} user=${userId}`, err);
        }
      }
      socket.to(room).emit('presence.leave', { partyId: party.id, userId, ts: Date.now(), reason });
    });
  });
}

module.exports = { registerSeatNamespace };
