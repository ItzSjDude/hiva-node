const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const NodeUser = sequelize.define('NodeUser', {
  id: {
    type: DataTypes.BIGINT.UNSIGNED,
    autoIncrement: true,
    primaryKey: true,
  },

  uid: {
    type: DataTypes.STRING(255),
    allowNull: false,
    // unique: true,
    comment: 'Matches Laravel user ID',
  },

  jwt: {
    type: DataTypes.TEXT,
    allowNull: true,
    comment: 'Last issued JWT token (optional)',
  },

  user_type: {
    type: DataTypes.ENUM('user', 'moderator', 'admin', 'bot'),
    defaultValue: 'user',
  },

  balance: {
    type: DataTypes.FLOAT,
    defaultValue: 0.0,
    comment: 'In-app currency',
  },

  is_banned: {
    type: DataTypes.BOOLEAN,
    defaultValue: false,
  },

  ban_reason: {
    type: DataTypes.STRING(255),
    allowNull: true,
  },

  login_count: {
    type: DataTypes.INTEGER,
    defaultValue: 0,
  },

  last_login: {
    type: DataTypes.DATE,
    allowNull: true,
  },

  referrer_code: {
    type: DataTypes.STRING(100),
    allowNull: true,
  },

  referred_by: {
    type: DataTypes.STRING(100),
    allowNull: true,
    comment: 'UID of referrer (if any)',
  },

  location: {
    type: DataTypes.STRING(255),
    allowNull: true,
  },

  device_type: {
    type: DataTypes.STRING(50),
    allowNull: true,
    comment: 'Android / iOS / Web',
  },

  device_token: {
    type: DataTypes.STRING(255),
    allowNull: true,
  },

  is_online: {
    type: DataTypes.BOOLEAN,
    defaultValue: false,
  },

  fcm_token: {
    type: DataTypes.TEXT,
    allowNull: true,
    comment: 'Push notification token',
  },

  language: {
    type: DataTypes.STRING(10),
    defaultValue: 'en',
  },

  timezone: {
    type: DataTypes.STRING(100),
    defaultValue: 'Asia/Kolkata',
  },

  avatar_url: {
    type: DataTypes.STRING(500),
    allowNull: true,
  },

  notes: {
    type: DataTypes.TEXT,
    allowNull: true,
    comment: 'Internal moderation notes',
  },

}, {
  tableName: 'node_users',
  timestamps: true,
  underscored: true,
});

module.exports = NodeUser;
