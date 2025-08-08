// src/services/authService.js

const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { User } = require('../models');
const { Op } = require('sequelize');

/**
 * Hash a plain-text password.
 * @param {string} password
 * @returns {Promise<string>}
 */
async function hashPassword(password) {
  return await bcrypt.hash(password, 10);
}

/**
 * Compare a plain-text password with a hash.
 * @param {string} password
 * @param {string} hash
 * @returns {Promise<boolean>}
 */
async function comparePassword(password, hash) {
  return await bcrypt.compare(password, hash);
}

/**
 * Generate a JWT for a user.
 * @param {{ id: string, username: string }} payload
 * @returns {string}
 */
function generateToken(payload) {
  return jwt.sign(
    payload,
    process.env.JWT_SECRET,
    { expiresIn: process.env.JWT_EXPIRE || '7d' }
  );
}

/**
 * Verify a JWT and return its payload.
 * @param {string} token
 * @returns {object}
 * @throws
 */
function verifyToken(token) {
  return jwt.verify(token, process.env.JWT_SECRET);
}

/**
 * Register a new user.
 * @param {{ username, email, password, displayName }} data
 * @returns {Promise<User>}
 */
async function registerUser({ username, email, password, displayName }) {
  // check uniqueness
  const existing = await User.findOne({
    where: { [Op.or]: [{ email }, { username }] }
  });
  if (existing) {
    const field = existing.email === email ? 'email' : 'username';
    const err = new Error(`${field} already in use`);
    err.status = 409;
    throw err;
  }
  const hashed = await hashPassword(password);
  return await User.create({
    username,
    email,
    password: hashed,
    displayName: displayName || username
  });
}

/**
 * Authenticate existing user by credentials.
 * @param {{ email, password }} data
 * @returns {Promise<User>}
 */
async function authenticateUser({ email, password }) {
  const user = await User.findOne({ where: { email } });
  if (!user) {
    const err = new Error('Invalid credentials');
    err.status = 401;
    throw err;
  }
  const valid = await comparePassword(password, user.password);
  if (!valid) {
    const err = new Error('Invalid credentials');
    err.status = 401;
    throw err;
  }
  await user.update({ isOnline: true, lastSeen: new Date() });
  return user;
}

module.exports = {
  hashPassword,
  comparePassword,
  generateToken,
  verifyToken,
  registerUser,
  authenticateUser,
};
