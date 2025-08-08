// src/routes/auth.js
const express = require('express');
const { body } = require('express-validator');
const authController = require('../controllers/authController');
const authOrRegisterMiddleware = require('../middleware/auth');

const router = express.Router();

// Validation rules
const registerValidators = [
  body('username').notEmpty().withMessage('Username required'),
  body('email').isEmail().withMessage('Valid email required'),
  body('password').isLength({ min: 6 }).withMessage('Password ≥ 6 chars'),
];

router.post(
  '/register',
  authOrRegisterMiddleware,
  authController.register
);

router.post(
  '/login',
  [ body('email').isEmail(), body('password').notEmpty() ],
  authController.login
);

router.get(
  '/me',
  authOrRegisterMiddleware,
  authController.getMe
);

module.exports = router;
