// src/models/ChatMessage.js
const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const ChatMessage = sequelize.define('ChatMessage', {
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true,
  },
  partyId: {
    type: DataTypes.UUID,
    allowNull: false,
  },
  senderId: {
    type: DataTypes.BIGINT.UNSIGNED,
    allowNull: false,
  },
  message: {
    type: DataTypes.TEXT,
    allowNull: false,
  },
  messageType: {
    type: DataTypes.ENUM('text', 'system', 'emoji', 'image'),
    defaultValue: 'text',
  },
  replyToId: {
    type: DataTypes.UUID,
    allowNull: true,
  },
  reactions: {
    type: DataTypes.JSON,
    defaultValue: {},
  },
  isEdited: {
    type: DataTypes.BOOLEAN,
    defaultValue: false,
  },
  editedAt: {
    type: DataTypes.DATE,
    allowNull: true,
  },
  isDeleted: {
    type: DataTypes.BOOLEAN,
    defaultValue: false,
  },
  deletedAt: {
    type: DataTypes.DATE,
    allowNull: true,
  }
}, {
  tableName: 'chat_messages',
  timestamps: true,
  underscored: true,
});

module.exports = ChatMessage;
