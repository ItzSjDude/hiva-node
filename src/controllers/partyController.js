// src/controllers/partyController.js

const { Op } = require('sequelize');
const bcrypt = require('bcryptjs');
const { AudioParty, PartyParticipant, User } = require('../models');
const { roomService, generateLiveKitToken } = require('../config/livekit');

/**
 * Create a new audio party
 */
exports.createParty = async (req, res) => {
  try {
    const { title, description, maxParticipants, isPrivate, password, startTime, tags } = req.body;
    if (!title) return res.status(400).json({ error: 'Title is required' });

    // generate a unique LiveKit room name
    const livekitRoomName = `party_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`;

    // persist party in DB
    const party = await AudioParty.create({
      title,
      description,
      hostId: req.user.id,
      livekitRoomName,
      maxParticipants: maxParticipants || 6,
      isPrivate: isPrivate || false,
      password: password ? await bcrypt.hash(password, 10) : null,
      startTime: startTime ? new Date(startTime) : new Date(),
      tags: tags || []
    });

    // create room in LiveKit
    await roomService.createRoom({
      name: livekitRoomName,
      maxParticipants: maxParticipants || 6,
      metadata: JSON.stringify({ partyId: party.id })
    });

    // add the host as first participant
    await PartyParticipant.create({
      userId: req.user.id,
      partyId: party.id,
      role: 'host',
      isMuted: false
    });

    // fetch with host info
    const partyWithHost = await AudioParty.findByPk(party.id, {
      include: [{ model: User, as: 'host', attributes: ['id','username','displayName','avatar'] }]
    });

    res.status(201).json({ message: 'Party created', party: partyWithHost });
  } catch (err) {
    console.error('Create party error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
};

/**
 * List all active parties (with optional search & tags)
 */
exports.getAllParties = async (req, res) => {
  try {
    const { page = 1, limit = 10, search, tags } = req.query;
    const where = { isActive: true };

    if (search) {
      where[Op.or] = [
        { title:    { [Op.like]: `%${search}%` } },
        { description: { [Op.like]: `%${search}%` } }
      ];
    }
    if (tags) {
      where.tags = { [Op.contains]: Array.isArray(tags) ? tags : [tags] };
    }

    const result = await AudioParty.findAndCountAll({
      where,
      include: [{ model: User, as: 'host', attributes: ['id','username','displayName','avatar'] }],
      limit: parseInt(limit),
      offset: (page - 1) * limit,
      order: [['createdAt','DESC']]
    });

    res.json({
      parties: result.rows,
      pagination: {
        page: parseInt(page),
        total: result.count,
        pages: Math.ceil(result.count / limit)
      }
    });
  } catch (err) {
    console.error('List parties error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
};

/**
 * Get details of a single party by ID
 */
exports.getPartyById = async (req, res) => {
  try {
    const party = await AudioParty.findByPk(req.params.id, {
      include: [
        { model: User, as: 'host', attributes: ['id','username','displayName','avatar'] },
        {
          model: User, as: 'participants',
          attributes: ['id','username','displayName','avatar'],
          through: { attributes: ['role','seatNumber','isMuted','isHandRaised','joinedAt'] }
        }
      ]
    });
    if (!party) return res.status(404).json({ error: 'Party not found' });
    res.json({ party });
  } catch (err) {
    console.error('Get party error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
};

/**
 * Join a party as a listener
 */
exports.joinParty = async (req, res) => {
  try {
    const { password } = req.body;
    const party = await AudioParty.findByPk(req.params.id);
    if (!party || !party.isActive) return res.status(404).json({ error: 'Party not available' });

    // if private, validate password
    if (party.isPrivate) {
      if (!password) return res.status(400).json({ error: 'Password required' });
      const valid = await bcrypt.compare(password, party.password);
      if (!valid) return res.status(401).json({ error: 'Invalid password' });
    }

    // check if already joined
    let participant = await PartyParticipant.findOne({
      where: { partyId: party.id, userId: req.user.id, isActive: true }
    });
    if (!participant) {
      participant = await PartyParticipant.create({
        userId: req.user.id,
        partyId: party.id,
        role: 'listener'
      });
      await party.increment('participantCount');
    }

    // issue a listener token
    const token = generateLiveKitToken(
      party.livekitRoomName,
      req.user.username,
      false
    );

    res.json({ message: 'Joined party', token, seatNumber: participant.seatNumber });
  } catch (err) {
    console.error('Join party error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
};

/**
 * Leave a party
 */
exports.leaveParty = async (req, res) => {
  try {
    const party = await AudioParty.findByPk(req.params.id);
    if (!party) return res.status(404).json({ error: 'Party not found' });

    const participant = await PartyParticipant.findOne({
      where: { partyId: party.id, userId: req.user.id, isActive: true }
    });
    if (!participant) return res.status(400).json({ error: 'Not a participant' });

    await participant.update({ isActive: false, leftAt: new Date(), seatNumber: null });
    await party.decrement('participantCount');

    res.json({ message: 'Left party' });
  } catch (err) {
    console.error('Leave party error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
};

/**
 * Take a speaker seat (1-6)
 */
exports.takeSeat = async (req, res) => {
  try {
    const seat = parseInt(req.params.seatNumber, 10);
    if (seat < 1 || seat > 6) return res.status(400).json({ error: 'Seat must be 1-6' });

    const party = await AudioParty.findByPk(req.params.id);
    if (!party || !party.isActive) return res.status(404).json({ error: 'Party not active' });

    // check if seat available
    const occupied = await PartyParticipant.findOne({
      where: { partyId: party.id, seatNumber: seat, isActive: true }
    });
    if (occupied) return res.status(409).json({ error: 'Seat already taken' });

    const participant = await PartyParticipant.findOne({
      where: { partyId: party.id, userId: req.user.id, isActive: true }
    });
    if (!participant) return res.status(403).json({ error: 'Join party first' });

    await participant.update({ seatNumber: seat, role: 'speaker', isMuted: false });

    const token = generateLiveKitToken(
      party.livekitRoomName,
      req.user.username,
      true
    );
    res.json({ message: `Seat ${seat} taken`, token });
  } catch (err) {
    console.error('Take seat error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
};

/**
 * Leave a seat and become listener again
 */
exports.leaveSeat = async (req, res) => {
  try {
    const participant = await PartyParticipant.findOne({
      where: { partyId: req.params.id, userId: req.user.id, isActive: true }
    });
    if (!participant || participant.seatNumber === null) {
      return res.status(400).json({ error: 'Not sitting on a seat' });
    }

    await participant.update({ seatNumber: null, role: 'listener', isMuted: true });
    const party = await AudioParty.findByPk(req.params.id);
    const token = generateLiveKitToken(
      party.livekitRoomName,
      req.user.username,
      false
    );
    res.json({ message: 'Left seat', token });
  } catch (err) {
    console.error('Leave seat error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
};

/**
 * End a party (host only)
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

    // remove LiveKit room
    try { await roomService.deleteRoom(party.livekitRoomName); } catch (e) {}

    res.json({ message: 'Party ended' });
  } catch (err) {
    console.error('End party error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
};
