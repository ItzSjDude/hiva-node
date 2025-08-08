// src/routes/chat.js
const express = require('express');
const chatController = require('../controllers/chatController');
const authOrRegisterMiddleware  = require('../middleware/auth');

const router = express.Router();

// Get last N messages
router.get('/:id', authOrRegisterMiddleware, chatController.getChatHistory);

// Send a new message
router.post('/:id', authOrRegisterMiddleware, chatController.sendMessage);

// Edit / delete / react
router.put('/:partyId/:messageId', authOrRegisterMiddleware, chatController.editMessage);
router.delete('/:partyId/:messageId', authOrRegisterMiddleware, chatController.deleteMessage);
router.post('/:partyId/:messageId/react', authOrRegisterMiddleware, chatController.reactMessage);

module.exports = router;
