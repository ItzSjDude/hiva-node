// src/routes/partyRoutes.js
const express = require('express');
const { body, param } = require('express-validator');
const partyController = require('../controllers/partyController');
const authOrRegisterMiddleware = require('../middleware/authOrRegisterMiddleware');

const router = express.Router();

// Create party
router.post(
  '/create',
  authOrRegisterMiddleware,
  [body('title').notEmpty().withMessage('Title is required')],
  partyController.createParty
);

// List & Details
router.get('/', partyController.getAllParties);
router.get('/:id', partyController.getPartyById);

// Join / Leave party
router.post('/:id/join', authOrRegisterMiddleware, partyController.joinParty);
router.post('/:id/leave', authOrRegisterMiddleware, partyController.leaveParty);

// Seats
router.post(
  '/:id/seats/:seatNumber/take',
  authOrRegisterMiddleware,
  [param('seatNumber').isInt({ min: 1 }).withMessage('Seat number must be valid')],
  partyController.takeSeat
);
router.post(
  '/:id/seats/:seatNumber/leave',
  authOrRegisterMiddleware,
  [param('seatNumber').isInt({ min: 1 }).withMessage('Seat number must be valid')],
  partyController.leaveSeat
);

// End party (host)
router.post('/:id/end', authOrRegisterMiddleware, partyController.endParty);

module.exports = router;
