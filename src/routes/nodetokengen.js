// src/routes/auth.js
const express = require('express');
const router = express.Router();
const authOrRegister = require('../middleware/auth');

router.post('/', authOrRegister); // POST /api/auth

module.exports = router;
