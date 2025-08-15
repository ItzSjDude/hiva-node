// src/controllers/partyController.js

const { Op } = require('sequelize');
const bcrypt = require('bcryptjs');
const { AudioParty, PartyParticipant, User } = require('../models');
const { roomService, generateLiveKitToken } = require('../config/livekit');

// Utility: strip sensitive fields
function sanitizeParty(partyInstance) {
  if (!partyInstance) return partyInstance;
  const party = partyInstance.toJSON ? partyInstance.toJSON() : partyInstance;
  delete party.password;
  return party;
}

/**
 * POST /api/parties/create
 * Host creates a party + gets a publish token immediately
 */
exports.createParty = async (req, res) => {
  try {
    const { title, description, maxParticipants, isPrivate, password, startTime, tags } = req.body;
    if (!title) return res.status(400).json({ error: 'Title is required' });

    // generate unique LiveKit room name
    const livekitRoomName = `party_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`;

    // persist party in DB
    const party = await AudioParty.create({
      title,
      description,
      hostId: req.user.id,
      livekitRoomName,
      maxParticipants: maxParticipants || 6,
      isPrivate: !!isPrivate,
      password: password ? await bcrypt.hash(password, 10) : null,
      startTime: startTime ? new Date(startTime) : new Date(),
      tags: tags || [],
    });

    // create room in LiveKit (idempotent if exists)
    await roomService.createRoom({
      name: livekitRoomName,
      maxParticipants: maxParticipants || 6,
      metadata: JSON.stringify({ partyId: party.id }),
    });

    // add host as first participant (active)
    await PartyParticipant.create({
      userId: req.user.id,
      partyId: party.id,
      role: 'host',
      isMuted: false,
      isActive: true,
    });

    // fetch with host info (only safe attrs)
    const partyWithHost = await AudioParty.findByPk(party.id, {
      include: [{ model: User, as: 'host', attributes: ['id', 'username'] }],
    });

    // generate LiveKit token for host (publish allowed)
    const token = generateLiveKitToken(livekitRoomName, String(req.user.id), true);

    res.status(201).json({
      message: 'Party created',
      party: sanitizeParty(partyWithHost),
      token,                                // host token (publish)
      roomName: livekitRoomName,
      serverUrl: process.env.LIVEKIT_WS_URL // e.g. wss://your-livekit.example.com
    });
  } catch (err) {
    console.error('Create party error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
};

/**
 * GET /api/parties
 * List active parties (optional search/tags)
 */
exports.getAllParties = async (req, res) => {
  try {
    const { page = 1, limit = 10, search, tags } = req.query;
    const where = { isActive: true };

    if (search) {
      where[Op.or] = [
        { title: { [Op.like]: `%${search}%` } },
        { description: { [Op.like]: `%${search}%` } },
      ];
    }
    if (tags) {
      where.tags = { [Op.contains]: Array.isArray(tags) ? tags : [tags] };
    }

    const result = await AudioParty.findAndCountAll({
      where,
      include: [{ model: User, as: 'host', attributes: ['id', 'username'] }],
      limit: parseInt(limit),
      offset: (page - 1) * limit,
      order: [['createdAt', 'DESC']],
    });

    res.json({
      parties: result.rows.map(sanitizeParty),
      pagination: {
        page: parseInt(page),
        total: result.count,
        pages: Math.ceil(result.count / limit),
      },
    });
  } catch (err) {
    console.error('List parties error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
};

/**
 * GET /api/parties/:id
 */
exports.getPartyById = async (req, res) => {
  try {
    const party = await AudioParty.findByPk(req.params.id, {
      include: [
        { model: User, as: 'host', attributes: ['id', 'username', 'displayName', 'avatar'] },
        {
          model: User,
          as: 'participants',
          attributes: ['id', 'username', 'displayName', 'avatar'],
          through: { attributes: ['role', 'seatNumber', 'isMuted', 'isHandRaised', 'joinedAt', 'isActive'] },
        },
      ],
    });
    if (!party) return res.status(404).json({ error: 'Party not found' });
    res.json({ party: sanitizeParty(party) });
  } catch (err) {
    console.error('Get party error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
};

/**
 * POST /api/parties/:id/join
 * Join as listener (needs token to subscribe)
 */
exports.joinParty = async (req, res) => {
  try {
    const { password } = req.body;
    const party = await AudioParty.findByPk(req.params.id);
    if (!party || !party.isActive) return res.status(404).json({ error: 'Party not available' });

    // password check if private
    if (party.isPrivate) {
      if (!password) return res.status(400).json({ error: 'Password required' });
      const ok = await bcrypt.compare(password, party.password);
      if (!ok) return res.status(401).json({ error: 'Invalid password' });
    }

    // ensure participant row
    let participant = await PartyParticipant.findOne({
      where: { partyId: party.id, userId: req.user.id, isActive: true },
    });
    if (!participant) {
      participant = await PartyParticipant.create({
        userId: req.user.id,
        partyId: party.id,
        role: 'listener',
        isActive: true,
      });
      await party.increment('participantCount');
    }

    // listener token (no publish)
    const token = generateLiveKitToken(party.livekitRoomName, req.user.id, false);

    res.json({
      message: 'Joined party',
      token,
      roomName: party.livekitRoomName,
      serverUrl: process.env.LIVEKIT_WS_URL,
      seatNumber: participant.seatNumber,
    });
  } catch (err) {
    console.error('Join party error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
};

/**
 * POST /api/parties/:id/leave
 * Leave the room entirely
 */
exports.leaveParty = async (req, res) => {
  try {
    const party = await AudioParty.findByPk(req.params.id);
    if (!party) return res.status(404).json({ error: 'Party not found' });

    const participant = await PartyParticipant.findOne({
      where: { partyId: party.id, userId: req.user.id, isActive: true },
    });
    if (!participant) return res.status(400).json({ error: 'Not a participant' });

    await participant.update({ isActive: false, leftAt: new Date(), seatNumber: null });
    if (party.participantCount > 0) await party.decrement('participantCount');

    res.json({ message: 'Left party' });
  } catch (err) {
    console.error('Leave party error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
};

/**
 * POST /api/parties/:id/seats/:seatNumber/take
 * Upgrade listener -> speaker (fresh publish token)
 */
exports.takeSeat = async (req, res) => {
  try {
    const seat = parseInt(req.params.seatNumber, 10);
    if (!Number.isInteger(seat) || seat < 1 || seat > 6) {
      return res.status(400).json({ error: 'Seat must be 1-6' });
    }

    const party = await AudioParty.findByPk(req.params.id);
    if (!party || !party.isActive) return res.status(404).json({ error: 'Party not active' });

    // seat availability
    const occupied = await PartyParticipant.findOne({
      where: { partyId: party.id, seatNumber: seat, isActive: true },
    });
    if (occupied) return res.status(409).json({ error: 'Seat already taken' });

    // must be active participant already
    const participant = await PartyParticipant.findOne({
      where: { partyId: party.id, userId: req.user.id, isActive: true },
    });
    if (!participant) return res.status(403).json({ error: 'Join party first' });

    await participant.update({ seatNumber: seat, role: 'speaker', isMuted: false });

    // speaker token (publish)
    const token = generateLiveKitToken(party.livekitRoomName, req.phpuser.id, true);
    res.json({ message: `Seat ${seat} taken`, token, roomName: party.livekitRoomName, serverUrl: process.env.LIVEKIT_WS_URL });
  } catch (err) {
    console.error('Take seat error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
};

/**
 * POST /api/parties/:id/seats/:seatNumber/leave
 * Downgrade speaker -> listener (fresh no-publish token)
 */
exports.leaveSeat = async (req, res) => {
  try {
    const party = await AudioParty.findByPk(req.params.id);
    if (!party) return res.status(404).json({ error: 'Party not found' });

    const participant = await PartyParticipant.findOne({
      where: { partyId: party.id, userId: req.user.id, isActive: true },
    });
    if (!participant || participant.seatNumber == null) {
      return res.status(400).json({ error: 'Not sitting on a seat' });
    }

    await participant.update({ seatNumber: null, role: 'listener', isMuted: true });

    // listener token (no publish)
    const token = generateLiveKitToken(party.livekitRoomName, req.phpuser.username, false);
    res.json({ message: 'Left seat', token, roomName: party.livekitRoomName, serverUrl: process.env.LIVEKIT_WS_URL });
  } catch (err) {
    console.error('Leave seat error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
};

/**
 * POST /api/parties/:id/end (host only)
 */
exports.endParty = async (req, res) => {
  try {
    const party = await AudioParty.findByPk(req.params.id);
    if (!party) return res.status(404).json({ error: 'Party not found' });
    if (party.hostId !== req.user.id) {
      return res.status(403).json({ error: 'Only host can end the party' });
    }

    await party.update({ isActive: false, endTime: new Date() });
    await PartyParticipant.update(
      { isActive: false, leftAt: new Date(), seatNumber: null },
      { where: { partyId: party.id, isActive: true } }
    );

    // try to delete LiveKit room (best-effort)
    try { await roomService.deleteRoom(party.livekitRoomName); } catch (_) {}

    res.json({ message: 'Party ended' });
  } catch (err) {
    console.error('End party error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
};
