'use strict';
const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const { pool, signToken, verifyToken } = require('./lib');

// POST /api/auth/login
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body || {};
    if (!email || !password) {
      return res.status(400).json({ error: 'البريد الإلكتروني وكلمة المرور مطلوبان' });
    }

    const result = await pool.query('SELECT * FROM users WHERE email = $1', [email.toLowerCase().trim()]);
    if (result.rows.length === 0) {
      return res.status(401).json({ error: 'بيانات الدخول غير صحيحة' });
    }

    const user = result.rows[0];
    const match = await bcrypt.compare(password, user.password_hash);
    if (!match) {
      return res.status(401).json({ error: 'بيانات الدخول غير صحيحة' });
    }

    // Mandatory Correction 1: DO NOT query UPDATE users SET last_login=now()
    // because last_login column is not in schema.sql

    const token = signToken({
      id: user.id,
      email: user.email,
      role: user.role,
      name: user.full_name
    });

    res.json({
      token,
      user: {
        id: user.id,
        email: user.email,
        full_name: user.full_name,
        role: user.role
      }
    });
  } catch (err) {
    console.error('Login error:', err);
    res.status(500).json({ error: 'حدث خطأ في الخادم أثناء تسجيل الدخول' });
  }
});

// GET /api/auth/me
router.get('/me', async (req, res) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'غير مصرح' });
  }
  const token = authHeader.split(' ')[1];
  const decoded = verifyToken(token);
  if (!decoded) {
    return res.status(401).json({ error: 'انتهت صلاحية الجلسة' });
  }

  const result = await pool.query('SELECT id, email, full_name, role FROM users WHERE id = $1', [decoded.id]);
  if (result.rows.length === 0) {
    return res.status(401).json({ error: 'المستخدم غير موجود' });
  }

  res.json({ user: result.rows[0] });
});

module.exports = router;
