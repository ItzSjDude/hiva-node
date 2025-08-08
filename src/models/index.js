// src/models/index.js
const sequelize = require('../config/database');
const User = require('./User');
const AudioParty = require('./AudioParty');
const PartyParticipant = require('./PartyParticipant');
const ChatMessage = require('./ChatMessage');

// Associations
User.hasMany(AudioParty, {
  foreignKey: 'hostId',
  as: 'hostedParties'
});
AudioParty.belongsTo(User, {
  foreignKey: 'hostId',
  as: 'host'
});

User.belongsToMany(AudioParty, {
  through: PartyParticipant,
  foreignKey: 'userId',
  otherKey: 'partyId',
  as: 'joinedParties'
});
AudioParty.belongsToMany(User, {
  through: PartyParticipant,
  foreignKey: 'partyId',
  otherKey: 'userId',
  as: 'participants'
});

ChatMessage.belongsTo(User, {
  foreignKey: 'senderId',
  as: 'sender'
});
ChatMessage.belongsTo(AudioParty, {
  foreignKey: 'partyId',
  as: 'party'
});
ChatMessage.belongsTo(ChatMessage, {
  foreignKey: 'replyToId',
  as: 'replyTo'
});

// Connect & sync helper
async function connectDatabase() {
  await sequelize.authenticate();
  await sequelize.sync({ alter: true });
  console.log('✅ Database connected & models synced');
}

module.exports = {
  sequelize,
  User,
  AudioParty,
  PartyParticipant,
  ChatMessage,
  connectDatabase
};
