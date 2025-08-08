// src/routes/index.js
const express = require('express');
const authRoutes = require('./auth');
const partyRoutes = require('./parties');
const chatRoutes = require('./chat');

const router = express.Router();

router.use('/auth', authRoutes);
router.use('/parties', partyRoutes);
router.use('/chat', chatRoutes);

// Root API info
router.get('/', (req, res) => {
  res.json({
    message: 'LiveKit Audio Party API',
    version: '1.0.0',
    endpoints: {
      auth: '/api/auth',
      parties: '/api/parties',
      chat: '/api/chat'
    }
  });
});

module.exports = router;
