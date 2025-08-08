// src/controllers/chatController.js

const { ChatMessage, PartyParticipant, User } = require('../models');
const { Op } = require('sequelize');

/**
 * Get last N messages for a party (chat history)
 */
exports.getChatHistory = async (req, res) => {
  try {
    const partyId = req.params.id;
    const limit = parseInt(req.query.limit, 10) || 50;

    // ensure user is (or was) a participant
    const part = await PartyParticipant.findOne({
      where: { partyId, userId: req.user.id }
    });
    if (!part) {
      return res.status(403).json({ error: 'Not authorized to view chat' });
    }

    const messages = await ChatMessage.findAll({
      where: { partyId },
      include: [
        { model: User, as: 'sender', attributes: ['id','username','displayName','avatar'] },
        { model: ChatMessage, as: 'replyTo', attributes: ['id','message','messageType','createdAt'],
          include: [{ model: User, as: 'sender', attributes: ['id','username','displayName'] }] }
      ],
      order: [['created_at','DESC']],
      limit
    });

    res.json({ messages: messages.reverse() });
  } catch (err) {
    console.error('Get chat history error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
};

/**
 * Send a new chat message
 */
exports.sendMessage = async (req, res) => {
  try {
    const partyId = req.params.id;
    const userId  = req.user.id;
    const { message, messageType = 'text', replyToId } = req.body;

    if (!message || !message.trim()) {
      return res.status(400).json({ error: 'Message cannot be empty' });
    }

    // check participant
    const part = await PartyParticipant.findOne({
      where: { partyId, userId, isActive: true }
    });
    if (!part) {
      return res.status(403).json({ error: 'Must join party to chat' });
    }

    const chat = await ChatMessage.create({
      partyId,
      senderId: userId,
      message: message.trim(),
      messageType,
      replyToId: replyToId || null
    });

    const fullMsg = await ChatMessage.findByPk(chat.id, {
      include: [
        { model: User, as: 'sender', attributes: ['id','username','displayName','avatar'] },
        { model: ChatMessage, as: 'replyTo', attributes: ['id','message','messageType','createdAt'],
          include: [{ model: User, as: 'sender', attributes: ['id','username','displayName'] }] }
      ]
    });

    // emit via socketService if you have it, e.g.:
    // socketService.emitToParty(partyId, 'newMessage', fullMsg);

    res.status(201).json({ message: 'Sent', chat: fullMsg });
  } catch (err) {
    console.error('Send message error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
};

/**
 * Edit an existing message
 */
exports.editMessage = async (req, res) => {
  try {
    const { partyId, messageId } = req.params;
    const { newText } = req.body;
    const userId = req.user.id;

    const chat = await ChatMessage.findByPk(messageId);
    if (!chat || chat.partyId !== partyId) {
      return res.status(404).json({ error: 'Message not found' });
    }
    if (chat.senderId !== userId) {
      return res.status(403).json({ error: 'Not authorized to edit' });
    }

    await chat.update({ message: newText.trim(), isEdited: true, editedAt: new Date() });
    res.json({ message: 'Edited', chat });
  } catch (err) {
    console.error('Edit message error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
};

/**
 * Delete a message
 */
exports.deleteMessage = async (req, res) => {
  try {
    const { partyId, messageId } = req.params;
    const userId = req.user.id;

    const chat = await ChatMessage.findByPk(messageId);
    if (!chat || chat.partyId !== partyId) {
      return res.status(404).json({ error: 'Message not found' });
    }
    if (chat.senderId !== userId) {
      return res.status(403).json({ error: 'Not authorized to delete' });
    }

    await chat.update({ isDeleted: true, deletedAt: new Date() });
    res.json({ message: 'Deleted' });
  } catch (err) {
    console.error('Delete message error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
};

/**
 * React to a message (toggle)
 */
exports.reactMessage = async (req, res) => {
  try {
    const { partyId, messageId } = req.params;
    const { emoji } = req.body;
    const userId = req.user.id;

    const chat = await ChatMessage.findByPk(messageId);
    if (!chat || chat.partyId !== partyId) {
      return res.status(404).json({ error: 'Message not found' });
    }

    let reactions = chat.reactions || {};
    reactions[emoji] = reactions[emoji] || [];

    const idx = reactions[emoji].indexOf(userId);
    if (idx === -1) reactions[emoji].push(userId);
    else reactions[emoji].splice(idx, 1);

    await chat.update({ reactions });
    res.json({ message: 'Reacted', reactions });
  } catch (err) {
    console.error('React error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
};
