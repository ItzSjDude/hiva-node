// src/routes/parties.js
const express = require('express');
const { body } = require('express-validator');
const partyController = require('../controllers/partyController');
const authOrRegisterMiddleware = require('../middleware/auth');

const router = express.Router();

// List & search
router.get('/',authOrRegisterMiddleware, partyController.getAllParties);

// Create (host only)
router.post(
  '/create',
  authOrRegisterMiddleware,
  [ body('title').notEmpty().withMessage('Title required') ],
  partyController.createParty
);

// Get single party
router.get('/:id',authOrRegisterMiddleware, partyController.getPartyById);

// Join / leave
router.post('/:id/join', authOrRegisterMiddleware, partyController.joinParty);
router.post('/:id/leave', authOrRegisterMiddleware, partyController.leaveParty);

// Seat management (1–6)
router.post('/:id/seats/:seatNumber/take', authOrRegisterMiddleware, partyController.takeSeat);
router.post('/:id/seats/:seatNumber/leave', authOrRegisterMiddleware, partyController.leaveSeat);

// End party
router.post('/:id/end', authOrRegisterMiddleware, partyController.endParty);

module.exports = router;
