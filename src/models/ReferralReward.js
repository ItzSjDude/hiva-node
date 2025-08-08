// src/models/ReferralReward.js
const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const ReferralReward = sequelize.define('ReferralReward', {
  id: {
    type: DataTypes.BIGINT.UNSIGNED,
    autoIncrement: true,
    primaryKey: true,
  },
  user_id: {
    type: DataTypes.BIGINT.UNSIGNED,
    allowNull: false,
  },
  referred_uid: {
    type: DataTypes.STRING(255),
    allowNull: false,
    comment: 'UID of the user who was referred',
  },
  reward_amount: {
    type: DataTypes.FLOAT,
    defaultValue: 0.0,
  },
  reward_type: {
    type: DataTypes.ENUM('coin', 'cash', 'voucher'),
    defaultValue: 'coin',
  },
  status: {
    type: DataTypes.ENUM('pending', 'credited', 'failed'),
    defaultValue: 'pending',
  },
}, {
  tableName: 'referral_rewards',
  timestamps: true,
  underscored: true,
});

module.exports = ReferralReward;
