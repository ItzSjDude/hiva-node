// src/middleware/authOrRegisterMiddleware.js
const jwt = require('jsonwebtoken');
const NodeUser = require('../models/NodeUser');

module.exports = async (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  try {
    if (token) {
      // ✅ 1. Token Flow
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      const user = await NodeUser.findOne({ where: { uid: decoded.uid } });

      if (!user || user.is_banned) {
        return res.status(403).json({ success: false, message: 'Invalid or banned user.' });
      }

      req.user = user;
      return next(); // continue to controller
    } else {
      // ✅ 2. No token: Try to register with uid + device_token
      const { uid, device_token, username } = req.body;

      if (!uid || !device_token) {
        return res.status(400).json({ success: false, message: 'uid and device_token are required.' });
      }

      let user = await NodeUser.findOne({ where: { uid } });

      if (!user) {
        user = await NodeUser.create({
          uid,
          device_token,
          username: username || `user_${uid}`,
          user_type: 'user',
          balance: 0,
          login_count: 1,
          last_login: new Date(),
        });
      } else {
        user.login_count += 1;
        user.last_login = new Date();
        await user.save();
      }

      // 🔐 Generate JWT
      const newToken = jwt.sign({ uid: user.uid }, process.env.JWT_SECRET, { expiresIn: '7d' });

      return res.json({
        success: true,
        message: 'User auto-registered',
        token: newToken,
        user,
      });
    }
  } catch (err) {
    console.error('auth/register middleware error:', err);
    return res.status(500).json({ success: false, message: 'Server error' });
  }
};
