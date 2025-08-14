const jwt = require('jsonwebtoken');
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
    const { token, jwt: jwtToken, partyId } = socket.handshake.query || {};
    const tok = token || jwtToken;
    if (!tok || !partyId) return socket.disconnect(true);

    let payload;
    try { payload = jwt.verify(String(tok), jwtSecret); } 
    catch { return socket.disconnect(true); }

    const userId = String(payload.userId || payload.id || payload.sub || '');
    if (!userId) return socket.disconnect(true);

    const party = await AudioParty.findByPk(partyId);
    if (!party || !party.isActive) return socket.disconnect(true);

    // attach auth context
    socket.data.userId = userId;
    socket.data.partyId = String(partyId);
    socket.data.party = party;

    const room = `party:${partyId}`;
    socket.join(room);

    // initial events
    socket.emit('hello', { partyId, userId, ts: Date.now() });
    try { socket.emit('sync.state', await fetchSeatsSnapshot(partyId)); } 
    catch (e) { socket.emit('error', { code: 'SyncFailed', message: e.message }); }

    socket.data.joined = false;

    const ackOk = (cb, data) => { try { typeof cb === 'function' && cb({ ok: true, data }); } catch(_) {} };
    const ackErr = (cb, code, message) => { try { typeof cb === 'function' && cb({ ok: false, error: { code, message } }); } catch(_) {} };
    const requireMember = (cb) => { if(!socket.data.joined) { ackErr(cb,'NotJoined','Join party first'); return false;} return true; };

    // Presence
    socket.on('JOIN_PARTY', async (_payload, cb) => {
      socket.data.joined = true;
      ackOk(cb, { partyId, userId });
      socket.to(room).emit('presence.join', { partyId, userId, ts: Date.now() });
    });

    socket.on('LEAVE_PARTY', async (_payload, cb) => {
      socket.data.joined = false;
      ackOk(cb, { partyId, userId });
      socket.to(room).emit('presence.leave', { partyId, userId, ts: Date.now() });
    });

    socket.on('SYNC', async (_payload, cb) => {
      try { ackOk(cb, await fetchSeatsSnapshot(partyId)); } 
      catch (e) { ackErr(cb, 'SyncFailed', e.message); }
    });

    // Seats
    socket.on('TAKE_SEAT_REQ', async ({ seatNumber, force=false }={}, cb) => {
      if(!requireMember(cb)) return;
      if(!Number.isInteger(seatNumber)) return ackErr(cb,'ValidationError','seatNumber int required');
      try {
        const seat = await takeSeat({ partyId, seatNumber, userId, force });
        ackOk(cb, seat);
        io.to(room).emit('seat.updated', seat);
      } catch (err) {
        if(err instanceof SeatError) return ackErr(cb, err.code||'SeatError', err.message);
        console.error(err); ackErr(cb,'InternalError','Something went wrong');
      }
    });

    socket.on('LEAVE_SEAT_REQ', async (_payload, cb) => {
      if(!requireMember(cb)) return;
      try {
        const seat = await leaveSeat({ partyId, userId, allowHostLeave:false });
        ackOk(cb, seat);
        if(seat) io.to(room).emit('seat.updated', seat);
      } catch (err) {
        if(err instanceof SeatError) return ackErr(cb, err.code||'SeatError', err.message);
        console.error(err); ackErr(cb,'InternalError','Something went wrong');
      }
    });

    // Mute / Unmute
    socket.on('SET_MUTE', async ({ targetUserId, isMuted }={}, cb) => {
      if(!requireMember(cb)) return;
      const target = String(targetUserId || userId);
      try {
        const seat = await setSeatMute({ partyId, userId: target, isMuted: !!isMuted, actorUserId: userId, allowSelf:true });
        ackOk(cb, seat);
        io.to(room).emit('seat.updated', seat);
      } catch (err) {
        if(err instanceof SeatError) return ackErr(cb, err.code||'SeatError', err.message);
        console.error(err); ackErr(cb,'InternalError','Something went wrong');
      }
    });

    socket.on('MUTE_ALL', async ({ includeHost }={}, cb) => {
      if(!requireMember(cb)) return;
      try {
        const seats = await muteAll({ partyId, actorUserId:userId, includeHost:!!includeHost });
        ackOk(cb,{ count: seats.length });
        io.to(room).emit('party.muted', { partyId, includeHost, ts: Date.now() });
      } catch (err) {
        if(err instanceof SeatError) return ackErr(cb, err.code||'SeatError', err.message);
        console.error(err); ackErr(cb,'InternalError','Something went wrong');
      }
    });

    socket.on('UNMUTE_ALL', async ({ includeHost }={}, cb) => {
      if(!requireMember(cb)) return;
      try {
        const seats = await unmuteAll({ partyId, actorUserId:userId, includeHost:!!includeHost });
        ackOk(cb,{ count: seats.length });
        io.to(room).emit('party.unmuted', { partyId, includeHost, ts: Date.now() });
      } catch (err) {
        if(err instanceof SeatError) return ackErr(cb, err.code||'SeatError', err.message);
        console.error(err); ackErr(cb,'InternalError','Something went wrong');
      }
    });

    // Lock / Unlock
    socket.on('SET_LOCK', async ({ seatNumber, lock }={}, cb) => {
      if(!requireMember(cb)) return;
      if(!Number.isInteger(seatNumber) || typeof lock!=='boolean') return ackErr(cb,'ValidationError','seatNumber int & lock bool required');
      try {
        const seat = await setSeatLock({ partyId, seatNumber, lock:!!lock, actorUserId:userId });
        ackOk(cb, seat);
        io.to(room).emit('seat.updated', seat);
      } catch(err) {
        if(err instanceof SeatError) return ackErr(cb, err.code||'SeatError', err.message);
        console.error(err); ackErr(cb,'InternalError','Something went wrong');
      }
    });

    socket.on('LOCK_ALL', async ({ includeHost }={}, cb) => {
      if(!requireMember(cb)) return;
      try {
        const seats = await lockAll({ partyId, actorUserId:userId, includeHost:!!includeHost });
        ackOk(cb, { count: seats.length });
        io.to(room).emit('party.locked', { partyId, includeHost, ts: Date.now() });
      } catch(err) {
        if(err instanceof SeatError) return ackErr(cb, err.code||'SeatError', err.message);
        console.error(err); ackErr(cb,'InternalError','Something went wrong');
      }
    });

    // Ping
    socket.on('PING', (_payload, cb) => {
      socket.emit('PONG', { ts: Date.now() });
      ackOk(cb,{ ts: Date.now() });
    });

    // Disconnect cleanup
    socket.on('disconnect', async (reason) => {
      if(autoLeaveOnDisconnect){
        try {
          const seat = await leaveSeat({ partyId, userId, allowHostLeave:false });
          if(seat) io.to(room).emit('seat.updated', seat);
        } catch(_) {}
      }
      socket.to(room).emit('presence.leave', { partyId, userId, ts: Date.now(), reason });
    });
  });
}

module.exports = { registerSeatNamespace };
