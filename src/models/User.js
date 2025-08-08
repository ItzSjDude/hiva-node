// src/models/User.js
const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const User = sequelize.define('User', {
  id: {
    type: DataTypes.BIGINT.UNSIGNED,
    autoIncrement: true,
    primaryKey: true,
    allowNull: false,
  },
  identity: {
    type: DataTypes.STRING(255),
    allowNull: false,
  },
  username: {
    type: DataTypes.STRING(255),
    allowNull: true,
  },
  full_name: {
    type: DataTypes.STRING(255),
    allowNull: true,
  },
  bio: {
    type: DataTypes.STRING(255),
    allowNull: true,
  },
  interest_ids: {
    type: DataTypes.STRING(255),
    allowNull: true,
  },
  profile: {
    type: DataTypes.STRING(255),
    allowNull: true,
  },
  background_image: {
    type: DataTypes.STRING(255),
    allowNull: true,
  },
  is_push_notifications: {
    type: DataTypes.INTEGER,
    allowNull: true,
    defaultValue: 1,
    comment: "0 = not push notification.. , 1 = Push notification...",
  },
  is_invited_to_room: {
    type: DataTypes.INTEGER,
    allowNull: true,
    defaultValue: 1,
    comment: "0 = Not invited to room pubilcally , 1 = Able to invite in room publically",
  },
  is_verified: {
    type: DataTypes.INTEGER,
    allowNull: false,
    defaultValue: 0,
    comment: "0 = notVerified, 1 = verificationInPending, 2 = verified, 3 = verifiedBySubscription",
  },
  is_block: {
    type: DataTypes.INTEGER,
    allowNull: true,
    defaultValue: 0,
    comment: "0 = Unblock, 1 = Block",
  },
  block_user_ids: {
    type: DataTypes.STRING(255),
    allowNull: true,
  },
  saved_music_ids: {
    type: DataTypes.STRING(255),
    allowNull: true,
  },
  saved_reel_ids: {
    type: DataTypes.STRING(255),
    allowNull: true,
  },
  following: {
    type: DataTypes.INTEGER,
    allowNull: true,
  },
  followers: {
    type: DataTypes.INTEGER,
    allowNull: true,
  },
  is_moderator: {
    type: DataTypes.INTEGER,
    allowNull: false,
    defaultValue: 0,
  },
  login_type: {
    type: DataTypes.INTEGER,
    allowNull: false,
    comment: "0 = Google login, 1 = Apple Login, 2 = email login",
  },
  device_type: {
    type: DataTypes.INTEGER,
    allowNull: false,
    comment: "0 = Android / 1 iOS",
  },
  device_token: {
    type: DataTypes.STRING(255),
    allowNull: true,
  },
}, {
  sequelize,
  tableName: 'users',
  timestamps: true,
  underscored: true,
  indexes: [
    {
      name: "PRIMARY",
      unique: true,
      using: "BTREE",
      fields: [
        { name: "id" },
      ]
    },
  ]
});

module.exports = User;
