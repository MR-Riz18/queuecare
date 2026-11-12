require('dotenv').config();

const express = require('express');
const http = require('http');
const cors = require('cors');
const cookieParser = require('cookie-parser');

const connectDB = require('./config/db');
const { errorHandler, notFound } = require('./middleware/errorHandler');
const { initSocket } = require('./socket');

const authRoutes = require('./routes/auth');
const queueRoutes = require('./routes/queues');
const tokenRoutes = require('./routes/tokens');
const roomRoutes = require('./routes/rooms');
const dashboardRoutes = require('./routes/dashboard');
const displayRoutes = require('./routes/display');
const adminRoutes = require('./routes/admin');
const analyticsRoutes = require('./routes/analytics');

const app = express();

// CORS: the SPA runs on CLIENT_URL and sends the httpOnly auth cookie,
// so credentials must be allowed and the origin must match exactly.
app.use(
  cors({
    origin: process.env.CLIENT_URL || 'http://localhost:5173',
    credentials: true,
  })
);
app.use(express.json({ limit: '1mb' }));
app.use(cookieParser());

// Liveness probe (unauthenticated).
app.get('/api/health', (req, res) => {
  res.json({ success: true, message: 'QueueCare API is running', data: { uptime: process.uptime() } });
});

app.use('/api/auth', authRoutes);
app.use('/api/queues', queueRoutes);
app.use('/api/tokens', tokenRoutes);
app.use('/api/rooms', roomRoutes);
app.use('/api/dashboard', dashboardRoutes);
app.use('/api/display', displayRoutes); // public, rate-limited
app.use('/api/admin', adminRoutes);
app.use('/api/analytics', analyticsRoutes);

app.use('/api', notFound);
app.use(errorHandler);

const PORT = process.env.PORT || 5000;

// Stage 2: Socket.IO shares the same HTTP server as Express.
const httpServer = http.createServer(app);
initSocket(httpServer);

// Only connect + listen when run directly (`node server.js` / `npm run dev`).
// Requiring this module (e.g. from the automated tests) gives you the bare
// Express app with Socket.IO attached but no DB connection and no listener.
if (require.main === module) {
  connectDB()
    .then(() => {
      httpServer.listen(PORT, () => {
        console.log(`QueueCare API listening on port ${PORT} (${process.env.NODE_ENV || 'development'})`);
      });
    })
    .catch((err) => {
      console.error('Failed to connect to MongoDB:', err.message);
      process.exit(1);
    });
}

module.exports = app; // exported for the automated tests (Stage 4)
