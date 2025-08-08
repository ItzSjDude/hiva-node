// src/app.js
require('dotenv').config();
const express    = require('express');
const cors       = require('cors');
const helmet     = require('helmet');
const compression= require('compression');
const morgan     = require('morgan');
const { createServer } = require('http');

const routes          = require('./routes');
const errorHandler    = require('./middleware/errorHandler');
const socketService   = require('./services/socketService');

const app    = express();
const server = createServer(app);

// Middlewares
app.use(helmet());
app.use(compression());
app.use(cors({
  origin: process.env.FRONTEND_URL || '*',
  credentials: true
}));
app.use(morgan('combined'));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// Static uploads folder
app.use('/uploads', express.static('uploads'));

// Mount API routes
app.use('/api', routes);

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'OK', timestamp: new Date().toISOString() });
});

// Global error handler (must be after routes) 
app.use(errorHandler);

// Initialize Socket.IO
const { Server } = require('socket.io');
const io = new Server(server, {
  cors: { origin: process.env.FRONTEND_URL || '*', methods: ['GET','POST'] }
});
socketService.init(io);

module.exports = server;
