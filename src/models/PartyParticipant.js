// src/models/PartyParticipant.js
const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const PartyParticipant = sequelize.define('PartyParticipant', {
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true,
  },
  userId: {
    type: DataTypes.UUID,
    allowNull: false,
  },
  partyId: {
    type: DataTypes.UUID,
    allowNull: false,
  },
  role: {
    type: DataTypes.ENUM('host', 'moderator', 'speaker', 'listener'),
    defaultValue: 'listener',
  },
  seatNumber: {
    type: DataTypes.INTEGER,
    allowNull: true,
    validate: {
      min: 1,
      max: 6,
    },
    unique: 'unique_seat_per_party'
  },
  joinedAt: {
    type: DataTypes.DATE,
    defaultValue: DataTypes.NOW,
  },
  leftAt: {
    type: DataTypes.DATE,
    allowNull: true,
  },
  isActive: {
    type: DataTypes.BOOLEAN,
    defaultValue: true,
  },
  isMuted: {
    type: DataTypes.BOOLEAN,
    defaultValue: true,
  },
  isHandRaised: {
    type: DataTypes.BOOLEAN,
    defaultValue: false,
  }
}, {
  tableName: 'party_participants',
  timestamps: true,
  underscored: true,
  indexes: [
    {
      name: 'seat_unique_per_party',
      unique: true,
      fields: ['party_id', 'seat_number']
    }
  ]
});

module.exports = PartyParticipant;
