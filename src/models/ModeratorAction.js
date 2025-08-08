// src/models/ModeratorAction.js
const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const ModeratorAction = sequelize.define('ModeratorAction', {
  id: {
    type: DataTypes.BIGINT.UNSIGNED,
    autoIncrement: true,
    primaryKey: true,
  },
  moderator_id: {
    type: DataTypes.BIGINT.UNSIGNED,
    allowNull: false,
  },
  target_uid: {
    type: DataTypes.STRING(255),
    allowNull: false,
    comment: 'UID of the user who is affected by the action',
  },
  action_type: {
    type: DataTypes.ENUM('mute', 'ban', 'warn', 'kick'),
    allowNull: false,
  },
  reason: {
    type: DataTypes.STRING(500),
    allowNull: true,
  },
  duration_minutes: {
    type: DataTypes.INTEGER,
    allowNull: true,
    comment: 'For temp actions like temp-ban or mute',
  },
}, {
  tableName: 'moderator_actions',
  timestamps: true,
  underscored: true,
});

module.exports = ModeratorAction;
