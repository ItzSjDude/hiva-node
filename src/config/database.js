// src/config/database.js
const { Sequelize } = require('sequelize');

const sequelize = new Sequelize(
  process.env.DB_NAME     || 'audio_party_db',
  process.env.DB_USER     || 'root',
  process.env.DB_PASS     || '',
  {
    host       : process.env.DB_HOST   || 'localhost',
    port       : process.env.DB_PORT   || 3306,
    dialect    : 'mysql',
    logging    : false,
    pool       : { max: 10, min: 0, acquire: 30000, idle: 10000 },
    define     : { underscored: true }
  }
);

module.exports = sequelize;
