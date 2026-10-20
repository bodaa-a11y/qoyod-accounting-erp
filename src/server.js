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

// Full System State API (Backed by Neon PostgreSQL)
app.get('/api/state', async (req, res) => {
  try {
    const { pool } = require('./lib');
    const result = await pool.query('SELECT data FROM system_state WHERE key = $1', ['main_state']);
    if (result.rows.length > 0) {
      return res.json(result.rows[0].data);
    }
    const dataFile = path.join(__dirname, '..', 'web', 'data.json');
    if (fs.existsSync(dataFile)) {
      return res.json(JSON.parse(fs.readFileSync(dataFile, 'utf8')));
    }
    res.json({});
  } catch (err) {
    console.error('State GET error:', err);
    res.status(500).json({ error: 'خطأ في جلب بيانات النظام' });
  }
});

app.post('/api/state', async (req, res) => {
  try {
    const { pool } = require('./lib');
    const newState = req.body || {};
    await pool.query(`
      INSERT INTO system_state (key, data, updated_at)
      VALUES ('main_state', $1, now())
      ON CONFLICT (key) DO UPDATE
      SET data = EXCLUDED.data, updated_at = now()
    `, [newState]);
    res.json({ success: true, message: 'تم حفظ البيانات بنجاح في قاعدة البيانات السحابية' });
  } catch (err) {
    console.error('State POST error:', err);
    res.status(500).json({ error: 'خطأ في حفظ بيانات النظام' });
  }
});

app.get('/api/auth/users', async (req, res) => {
  try {
    const { pool } = require('./lib');
    const result = await pool.query('SELECT id, email, full_name, role FROM users');
    const roleTitles = {
      'cfo': 'المدير المالي العام (CFO)',
      'chief_accountant': 'رئيس الحسابات (Chief Accountant)',
      'auditor': 'مراجع مالي ومدقق داخلي (Internal Auditor)',
      'admin': 'المدير العام'
    };
    const users = result.rows.map(u => ({
      id: u.id,
      name: u.full_name,
      email: u.email,
      role: u.role,
      roleTitle: roleTitles[u.role] || u.role
    }));
    res.json({ success: true, users });
  } catch (err) {
    res.status(500).json({ error: 'خطأ في جلب قائمة المستخدمين' });
  }
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
