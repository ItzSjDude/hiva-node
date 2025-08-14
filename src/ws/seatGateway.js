/* eslint-disable no-console */
const http = require('http');
const jwt = require('jsonwebtoken');
const { Server } = require('socket.io');

// OPTIONAL: for multi-process scale (Redis pub/sub)
// const { createAdapter } = require('@socket.io/redis-adapter');
// const { createClient } = require('redis');

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

function startSeatIoServer({
  port = 9048,
  path = '/ws',                     // will be socket.io path
  jwtSecret = process.env.JWT_SECRET,
  autoLeaveOnDisconnect = true,
} = {}) {
  if (!jwtSecret) throw new Error('JWT secret missing');

  const server = http.createServer();
  const io = new Server(server, {
    path,
    transports: ['websocket'],      // skip polling if you want pure WS
    serveClient: false,
    pingInterval: 25000,            // Socket.IO heartbeat
    pingTimeout: 60000,
    maxHttpBufferSize: 2 * 1024 * 1024,
  });

  // OPTIONAL: Redis adapter (uncomment to scale horizontally)
  // (async () => {
  //   const pubClient = createClient({ url: process.env.REDIS_URL });
  //   const subClient = pubClient.duplicate();
  //   await pubClient.connect(); await subClient.connect();
  //   io.adapter(createAdapter(pubClient, subClient));
  // })().catch(console.error);

  /** Auth middleware on connection (handshake) */
  io.use(async (socket, next) => {
    try {
      // token & partyId can come from query or headers
      const { token, jwt: jwtToken, partyId } = socket.handshake.query || {};
      const tok = token || jwtToken;
      if (!tok || !partyId) return next(new Error('Missing token or partyId'));

      let payload;
      try { payload = jwt.verify(String(tok), jwtSecret); }
      catch { return next(new Error('Invalid token')); }

      const userId = String(payload.userId || payload.id || payload.sub || '');
      if (!userId) return next(new Error('Invalid token payload'));

      const party = await AudioParty.findByPk(partyId);
      if (!party || !party.isActive) return next(new Error('Party not active'));

      // attach auth context
      socket.data.userId = userId;
      socket.data.partyId = String(partyId);
      socket.data.party = party; // keep if needed later

      return next();
    } catch (e) { return next(e); }
  });

  /** Helper room name */
  const roomOf = (partyId) => `party:${partyId}`;

  /** Helper: safe ack */
  const ackOk = (cb, data) => { try { typeof cb === 'function' && cb({ ok: true, data }); } catch (_) {} };
  const ackErr = (cb, code, message) => { try { typeof cb === 'function' && cb({ ok: false, error: { code, message } }); } catch (_) {} };

  io.on('connection', async (socket) => {
    const { userId, partyId } = socket.data;
    const room = roomOf(partyId);

    // Join party room on connect
    socket.join(room);

    // Initial hello + snapshot
    socket.emit('hello', { partyId, userId, ts: Date.now() });
    try { socket.emit('sync.state', await fetchSeatsSnapshot(partyId)); }
    catch (e) { socket.emit('error', { code: 'SyncFailed', message: e.message }); }

    // Track membership flag
    socket.data.joined = false;

    /** Presence */
    socket.on('JOIN_PARTY', async (_payload = {}, cb) => {
      socket.data.joined = true;
      ackOk(cb, { partyId, userId });
      socket.to(room).emit('presence.join', { partyId, userId, ts: Date.now() });
    });

    socket.on('LEAVE_PARTY', async (_payload = {}, cb) => {
      socket.data.joined = false;
      ackOk(cb, { partyId, userId });
      socket.to(room).emit('presence.leave', { partyId, userId, ts: Date.now() });
    });

    socket.on('SYNC', async (_payload = {}, cb) => {
      try { ackOk(cb, await fetchSeatsSnapshot(partyId)); }
      catch (e) { ackErr(cb, 'SyncFailed', e.message); }
    });

    /** Guard: must have joined */
    const requireMember = (cb) => {
      if (!socket.data.joined) { ackErr(cb, 'NotJoined', 'Join party first'); return false; }
      return true;
    };

    /** Seats */
    socket.on('TAKE_SEAT_REQ', async (payload = {}, cb) => {
      if (!requireMember(cb)) return;
      const { seatNumber, force = false } = payload;
      if (!Number.isInteger(seatNumber)) return ackErr(cb, 'ValidationError', 'seatNumber int required');
      try {
        const seat = await takeSeat({ partyId, seatNumber, userId, force });
        ackOk(cb, seat);
        io.to(room).emit('seat.updated', seat);
      } catch (err) {
        if (err instanceof SeatError) return ackErr(cb, err.code || 'SeatError', err.message);
        console.error(err); return ackErr(cb, 'InternalError', 'Something went wrong');
      }
    });

    socket.on('LEAVE_SEAT_REQ', async (_payload = {}, cb) => {
      if (!requireMember(cb)) return;
      try {
        const seat = await leaveSeat({ partyId, userId, allowHostLeave: false });
        ackOk(cb, seat);
        if (seat) io.to(room).emit('seat.updated', seat);
      } catch (err) {
        if (err instanceof SeatError) return ackErr(cb, err.code || 'SeatError', err.message);
        console.error(err); return ackErr(cb, 'InternalError', 'Something went wrong');
      }
    });

    /** Mute / Unmute */
    socket.on('SET_MUTE', async (payload = {}, cb) => {
      if (!requireMember(cb)) return;
      const targetUserId = String(payload.targetUserId || userId);
      const isMuted = !!payload.isMuted;
      try {
        const seat = await setSeatMute({
          partyId,
          userId: targetUserId,
          isMuted,
          actorUserId: userId,
          allowSelf: true, // self => DB only; host => DB + LiveKit hard mute
        });
        ackOk(cb, seat);
        io.to(room).emit('seat.updated', seat);
      } catch (err) {
        if (err instanceof SeatError) return ackErr(cb, err.code || 'SeatError', err.message);
        console.error(err); return ackErr(cb, 'InternalError', 'Something went wrong');
      }
    });

    socket.on('MUTE_ALL', async (payload = {}, cb) => {
      if (!requireMember(cb)) return;
      const includeHost = !!payload.includeHost;
      try {
        const seats = await muteAll({ partyId, actorUserId: userId, includeHost });
        ackOk(cb, { count: seats.length });
        io.to(room).emit('party.muted', { partyId, includeHost, ts: Date.now() });
      } catch (err) {
        if (err instanceof SeatError) return ackErr(cb, err.code || 'SeatError', err.message);
        console.error(err); return ackErr(cb, 'InternalError', 'Something went wrong');
      }
    });

    socket.on('UNMUTE_ALL', async (payload = {}, cb) => {
      if (!requireMember(cb)) return;
      const includeHost = !!payload.includeHost;
      try {
        const seats = await unmuteAll({ partyId, actorUserId: userId, includeHost });
        ackOk(cb, { count: seats.length });
        io.to(room).emit('party.unmuted', { partyId, includeHost, ts: Date.now() });
      } catch (err) {
        if (err instanceof SeatError) return ackErr(cb, err.code || 'SeatError', err.message);
        console.error(err); return ackErr(cb, 'InternalError', 'Something went wrong');
      }
    });

    /** Locks */
    socket.on('SET_LOCK', async (payload = {}, cb) => {
      if (!requireMember(cb)) return;
      const { seatNumber, lock } = payload;
      if (!Number.isInteger(seatNumber) || typeof lock !== 'boolean') {
        return ackErr(cb, 'ValidationError', 'seatNumber int & lock bool required');
      }
      try {
        const seat = await setSeatLock({ partyId, seatNumber, lock: !!lock, actorUserId: userId });
        ackOk(cb, seat);
        io.to(room).emit('seat.updated', seat);
      } catch (err) {
        if (err instanceof SeatError) return ackErr(cb, err.code || 'SeatError', err.message);
        console.error(err); return ackErr(cb, 'InternalError', 'Something went wrong');
      }
    });

    socket.on('LOCK_ALL', async (payload = {}, cb) => {
      if (!requireMember(cb)) return;
      const includeHost = !!payload.includeHost;
      try {
        const seats = await lockAll({ partyId, actorUserId: userId, includeHost });
        ackOk(cb, { count: seats.length });
        io.to(room).emit('party.locked', { partyId, includeHost, ts: Date.now() });
      } catch (err) {
        if (err instanceof SeatError) return ackErr(cb, err.code || 'SeatError', err.message);
        console.error(err); return ackErr(cb, 'InternalError', 'Something went wrong');
      }
    });

    /** Ping (optional; Socket.IO already heartbeats) */
    socket.on('PING', (_payload = {}, cb) => {
      socket.emit('PONG', { ts: Date.now() });
      ackOk(cb, { ts: Date.now() });
    });

    /** Disconnect cleanup */
    socket.on('disconnect', async (reason) => {
      // Optional: leave seat automatically
      if (autoLeaveOnDisconnect) {
        try {
          const seat = await leaveSeat({ partyId, userId, allowHostLeave: false });
          if (seat) io.to(room).emit('seat.updated', seat);
        } catch (_) {}
      }
      // Presence broadcast
      socket.to(room).emit('presence.leave', { partyId, userId, ts: Date.now(), reason });
    });
  });

  server.listen(port, () => console.log(`✅ Socket.IO listening on :${port}${path}`));

  return { io, server };
}

module.exports = { startSeatIoServer };
