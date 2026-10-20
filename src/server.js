'use strict';
require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');

const authRoutes = require('./routes-auth');
const { router: entityRoutes } = require('./routes-entities');
const salesRoutes = require('./routes-sales');
const reportsRoutes = require('./routes-reports');

const app = express();
const PORT = process.env.PORT || 3000;

// Security & Parsing Middleware
const allowedOrigins = process.env.CORS_ORIGINS ? process.env.CORS_ORIGINS.split(',') : '*';
app.use(cors({ origin: allowedOrigins }));
app.use(express.json({ limit: '10mb' }));

// Health Check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', time: new Date().toISOString() });
});

// Mount API Routes
app.use('/api/auth', authRoutes);
app.use('/api/entities', entityRoutes);
app.use('/api/entities', salesRoutes);
app.use('/api/entities', reportsRoutes);

// Serve Frontend SPA
const publicDir = path.join(__dirname, '..', 'public');
app.use(express.static(publicDir));
app.use((req, res, next) => {
  if (req.method !== 'GET') return next();
  if (req.path.startsWith('/api/')) {
    return res.status(404).json({ error: 'المسار البرمجي غير موجود' });
  }
  res.sendFile(path.join(publicDir, 'index.html'));
});

// Centralized Error Handling Middleware
app.use((err, req, res, next) => {
  console.error('Unhandled Server Error:', err);
  const status = err.status || 500;
  const message = process.env.NODE_ENV === 'production'
    ? 'حدث خطأ داخلي في معالجة الطلب'
    : (err.message || 'خطأ غير متوقع');
  res.status(status).json({ error: message });
});

let server = null;
if (process.env.NODE_ENV !== 'test_skip_listen') {
  server = app.listen(PORT, () => {
    console.log(`🚀 Qoyod ERP Server listening on port ${PORT}`);
  });
}

module.exports = app;
