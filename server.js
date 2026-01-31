/**
 * Budget Splitter API Server
 * 
 * Modes:
 *   MODE=local  - SQLite, no auth, single local group (development/standalone)
 *   MODE=vps    - PostgreSQL, JWT auth, multi-group (production VPS)
 * 
 * Port: 3012
 * PM2: pm2 start ecosystem.config.js
 */

require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');

const MODE = process.env.MODE || 'local';
const PORT = process.env.PORT || 3012;
const isLocalMode = MODE === 'local';

console.log(`Starting Budget Splitter API in ${MODE.toUpperCase()} mode on port ${PORT}`);

const app = express();

// Security middleware
app.use(helmet({ contentSecurityPolicy: false }));
app.use(cors({
  origin: isLocalMode
    ? true  // Allow all origins in local mode
    : ['https://linkup-event.com', 'capacitor://localhost', 'ionic://localhost', 'http://localhost:*'],
  credentials: true
}));
app.use(express.json());

// Rate limiting (relaxed for local)
const apiLimiter = rateLimit({
  windowMs: 1 * 60 * 1000,
  max: isLocalMode ? 500 : 100,
  message: { error: 'Too many requests' }
});
app.use('/api', apiLimiter);

// Load mode-specific routes
if (isLocalMode) {
  require('./routes/local')(app);
} else {
  const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 10,
    message: { error: 'Too many login attempts' }
  });
  app.use('/auth', authLimiter);
  require('./routes/vps')(app);
}

// Health check
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    mode: MODE,
    port: PORT,
    timestamp: new Date().toISOString()
  });
});

// Landing page & static assets
app.use(express.static('public'));

// Start server
app.listen(PORT, '0.0.0.0', () => {
  console.log(`Budget Splitter API running on port ${PORT} (${MODE} mode)`);
});

module.exports = app;
