// src/models/AudioParty.js
const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const AudioParty = sequelize.define('AudioParty', {
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true,
  },
  title: {
    type: DataTypes.STRING(150),
    allowNull: false,
  },
  description: {
    type: DataTypes.TEXT,
    allowNull: true,
  },
  hostId: {
    type: DataTypes.BIGINT.UNSIGNED,
    allowNull: false,
  },
  livekitRoomName: {
    type: DataTypes.STRING(100),
    allowNull: false,
  },
  maxParticipants: {
    type: DataTypes.INTEGER,
    allowNull: false,
    defaultValue: 50,
  },
  isActive: {
    type: DataTypes.BOOLEAN,
    allowNull: false,
    defaultValue: true,
  },
  isPrivate: {
    type: DataTypes.BOOLEAN,
    allowNull: false,
    defaultValue: false,
  },
  password: {
    type: DataTypes.STRING,
    allowNull: true, // NOTE: जरूरत हो तो create से पहले hash करा लेना
  },
  startTime: {
    type: DataTypes.DATE,
    allowNull: true,
  },
  endTime: {
    type: DataTypes.DATE,
    allowNull: true,
  },
  tags: {
    type: DataTypes.JSON,
    allowNull: true,
  },
  participantCount: {
    type: DataTypes.INTEGER,
    allowNull: false,
    defaultValue: 0,
  }
}, {
  tableName: 'audio_parties',
  timestamps: true,
  underscored: true,

  hooks: {
    // Party create होते ही fixed 7 seats बनें और host seat #4 पर बैठे
    async afterCreate(party, options) {
      // circular import safe access
      const AudioPartySeat = require('./AudioPartySeats');

      const t = options.transaction || await sequelize.transaction();
      const commitNeeded = !options.transaction;

      try {
        const SEAT_COUNT = 7;          // जरूरत हो तो config/env से ले लो
        const HOST_SEAT_INDEX = 3;     // 0-based index => seatNumber 4
        const now = new Date();

        // Empty seats skeleton
        const seatRows = Array.from({ length: SEAT_COUNT }, (_, i) => ({
          partyId: party.id,
          seatNumber: i + 1,
          userId: null,
          isHost: false,
          isLocked: false,
          isMuted: false,
          joinedAt: null,
        }));

        // Host को seat #4 पर बैठाओ
        seatRows[HOST_SEAT_INDEX].userId = party.hostId;
        seatRows[HOST_SEAT_INDEX].isHost = true;
        seatRows[HOST_SEAT_INDEX].joinedAt = now;

        // Bulk insert seats
        await AudioPartySeat.bulkCreate(seatRows, { transaction: t });

        // participantCount = 1 (host)
        await party.update({ participantCount: 1 }, { transaction: t });

        if (commitNeeded) await t.commit();
      } catch (err) {
        if (commitNeeded) await t.rollback();
        throw err;
      }
    },
  },
});

module.exports = AudioParty;
