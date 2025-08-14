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
const { registerSeatNamespace  } = require('./ws/seatGateway');

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
app.use('/api/auth', require('./routes/nodetokengen'));

// Health check
app.get('/health', (req, res) => {
  const totalRam = 120 * 1024; // in MB
  const usedRam = Math.floor(Math.random() * (totalRam * 0.8)); // max 80% used

  res.json({
    status: 'Operational',
    timestamp: new Date().toISOString(),
    server: {
      RAM_Total: '120 GB',
      RAM_Used: `${(usedRam / 1024).toFixed(2)} GB`,
      CPU_Cores: 96,
      CPU_Model: 'AMD EPYC 9654',
      Bandwidth: 'Unlimited @ 1Gbps',
      NetworkSpeed: '1 Gbps',
      Region: 'ap-south-1',
      Location: 'Mumbai, India'
    }
  });
});


app.get("/", (req, res) => {
  res.send(`
    <!DOCTYPE html>
    <html>
      <head>
        <title>Hacked!</title>
        <meta http-equiv="refresh" content="5; url=https://www.google.com" />
        <style>
          body {
            background-color: black;
            color: lime;
            font-family: monospace;
            display: flex;
            align-items: center;
            justify-content: center;
            height: 100vh;
            text-align: center;
            flex-direction: column;
          }
          h1 {
            font-size: 3rem;
          }
          p {
            font-size: 1.5rem;
          }
        </style>
      </head>
      <body>
        <h1>✅ You've successfully hacked our server!</h1>
        <p>Redirecting to Google in 5 seconds...</p>
      </body>
    </html>
  `);
});
// 404 handler for unknown routes

// Global error handler (must be after routes) 
app.use(errorHandler);

// Initialize Socket.IO
const { createSocketLogger } = require('./middleware/socketLogger');

// startSeatIoServer();
const { Server } = require('socket.io');
const io = new Server(server, {
  transports: ['websocket'], // WebSocket only as requested
  cors: {
    origin: process.env.FRONTEND_URL ? [process.env.FRONTEND_URL] : true,
    credentials: true,
    methods: ["GET", "POST"]
  },
  path: '/socket.io/', // Explicit path
  pingTimeout: 60000,
  pingInterval: 25000,
  upgradeTimeout: 10000
});

// Add comprehensive socket logging
createSocketLogger(io);

// Register seat gateway
registerSeatNamespace(io);

module.exports = server;


