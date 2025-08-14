// src/models/AudioPartySeat.js
const { DataTypes, Op } = require('sequelize');
const sequelize = require('../config/database');
const AudioParty = require('./AudioParty');

const AudioPartySeat = sequelize.define('AudioPartySeat', {
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true,
  },
  partyId: {
    type: DataTypes.UUID,
    allowNull: false,
    references: {
      model: 'audio_parties',
      key: 'id',
    },
    onDelete: 'CASCADE',
    field: 'party_id',
  },
  seatNumber: {
    type: DataTypes.INTEGER,
    allowNull: false,
    field: 'seat_number',
    validate: { min: 1, max: 7 },
  },
  userId: {
    type: DataTypes.BIGINT.UNSIGNED,
    allowNull: true, // null => empty seat
    field: 'user_id',
  },
  isHost: {
    type: DataTypes.BOOLEAN,
    allowNull: false,
    defaultValue: false,
    field: 'is_host',
  },
  isLocked: {
    type: DataTypes.BOOLEAN,
    allowNull: false,
    defaultValue: false,
    field: 'is_locked',
  },
  isMuted: {
    type: DataTypes.BOOLEAN,
    allowNull: false,
    defaultValue: false, // mic state, persistent
    field: 'is_muted',
  },
  joinedAt: {
    type: DataTypes.DATE,
    allowNull: true,
    field: 'joined_at',
  },
}, {
  tableName: 'audio_party_seats',
  timestamps: true,
  underscored: true,
  indexes: [
    { fields: ['party_id'] },
    { unique: true, fields: ['party_id', 'seat_number'] },
    { unique: true, fields: ['party_id', 'user_id'], where: { user_id: { [Op.ne]: null } } },
  ],
});

// Associations
AudioParty.hasMany(AudioPartySeat, {
  foreignKey: 'party_id',
  sourceKey: 'id',
  as: 'seats',
  onDelete: 'CASCADE',
});
AudioPartySeat.belongsTo(AudioParty, {
  foreignKey: 'party_id',
  targetKey: 'id',
  as: 'party',
});

module.exports = AudioPartySeat;



// // src/models/AudioParty.js
// const { DataTypes } = require('sequelize');
// const sequelize = require('../config/database');

// const AudioParty = sequelize.define('AudioParty', {
//   id: {
//     type: DataTypes.UUID,
//     defaultValue: DataTypes.UUIDV4,
//     primaryKey: true,
//   },
//   title: {
//     type: DataTypes.STRING(150),
//     allowNull: false,
//   },
//   description: {
//     type: DataTypes.TEXT,
//     allowNull: true,
//   },
//   hostId: {
//     type: DataTypes.BIGINT.UNSIGNED,
//     allowNull: false,
//   },
//   livekitRoomName: {
//     type: DataTypes.STRING(100),
//     allowNull: false,
//     unique: true,
//   },
//   maxParticipants: {
//     type: DataTypes.INTEGER,
//     allowNull: false,
//     defaultValue: 50,
//   },
//   isActive: {
//     type: DataTypes.BOOLEAN,
//     allowNull: false,
//     defaultValue: true,
//   },
//   isPrivate: {
//     type: DataTypes.BOOLEAN,
//     allowNull: false,
//     defaultValue: false,
//   },
//   password: {
//     type: DataTypes.STRING,
//     allowNull: true,
//   },
//   startTime: {
//     type: DataTypes.DATE,
//     allowNull: true,
//   },
//   endTime: {
//     type: DataTypes.DATE,
//     allowNull: true,
//   },
//   tags: {
//     type: DataTypes.JSON,
//     allowNull: true,
//   },
//   participantCount: {
//     type: DataTypes.INTEGER,
//     allowNull: false,
//     defaultValue: 0,
//   }
// }, {
//   tableName: 'audio_parties',
//   timestamps: true,
//   underscored: true,
// });

// module.exports = AudioParty;


