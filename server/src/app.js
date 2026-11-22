const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');

const app = express();

const authRoutes = require('./routes/auth.routes');
const monitorRoutes = require('./routes/monitor.routes');
const websiteRoutes = require('./routes/website.routes');
const { requireAuth } = require('./middleware/auth.middleware');

app.use(helmet());
const allowedOrigins = (process.env.CLIENT_ORIGIN || '')
  .split(',')
  .map((origin) => origin.trim())
  .filter(Boolean);
app.use(cors({ origin: allowedOrigins.length ? allowedOrigins : false, credentials: true }));
app.use(express.json({ limit: '16kb' }));
app.use(express.urlencoded({ extended: true }));
app.use(morgan('dev'));

app.use('/api/auth', authRoutes);
app.use('/api/monitor', requireAuth, monitorRoutes);
app.use('/api/websites', requireAuth, websiteRoutes);

app.get('/', (req, res) => {
  res.json({
    success: true,
    message: 'Welcome to Pulsewatch API',
    version: '1.0.0',
    status: 'operational'
  });
});

app.get('/api/health', (req, res) => {
  res.status(200).json({
    success: true,
    status: 'healthy',
    timestamp: new Date().toISOString()
  });
});

module.exports = app;
