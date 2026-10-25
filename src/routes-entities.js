'use strict';
const express = require('express');
const router = express.Router();
const { pool, withTransaction, verifyToken, audit } = require('./lib');

// Auth Middleware
function requireAuth(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'رمز الدخول مطلوب' });
  }
  const token = authHeader.split(' ')[1];
  const user = verifyToken(token);
  if (!user) {
    return res.status(401).json({ error: 'رمز الدخول غير صالح أو منتهي الصلاحية' });
  }
  req.user = user;
  next();
}

// Entity Isolation Middleware
async function requireEntityAccess(req, res, next) {
  const entityId = req.params.entityId || req.params.id;
  if (!entityId) return next();

  // Admin and CFO roles have full access to all entities
  if (req.user && ['admin', 'cfo', 'chief_accountant', 'auditor'].includes(req.user.role)) {
    return next();
  }

  try {
    const resCheck = await pool.query(
      'SELECT 1 FROM user_entities WHERE user_id = $1 AND entity_id = $2',
      [req.user.id, entityId]
    );

    if (resCheck.rows.length === 0) {
      return res.status(403).json({ error: 'غير مصرح لك بالوصول إلى بيانات هذه المنشأة' });
    }
    next();
  } catch (err) {
    return res.status(500).json({ error: 'خطأ في التحقق من صلاحيات المنشأة' });
  }
}

// ---------------- ENTITIES ----------------

// POST /api/entities
router.post('/', requireAuth, async (req, res) => {
  try {
    const { code, name, vat_number, cr_number, currency = 'SAR' } = req.body || {};
    if (!code || !name) {
      return res.status(400).json({ error: 'كود المنشأة واسمها مطلوبان' });
    }

    const result = await pool.query(`
      INSERT INTO entities (code, name, vat_number, cr_number, currency)
      VALUES ($1, $2, $3, $4, $5)
      RETURNING *
    `, [code.toLowerCase().trim(), name.trim(), vat_number || null, cr_number || null, currency]);

    const entity = result.rows[0];

    // Grant creator access in user_entities
    await pool.query(`
      INSERT INTO user_entities (user_id, entity_id, role)
      VALUES ($1, $2, 'admin')
      ON CONFLICT DO NOTHING
    `, [req.user.id, entity.id]);

    await audit(null, entity.id, req.user.id, 'ENTITY_CREATED', 'entities', entity.id, { code, name });

    res.status(201).json({ entity });
  } catch (err) {
    if (err.code === '23505') {
      return res.status(400).json({ error: 'كود المنشأة مسجل مسبقاً' });
    }
    console.error('Create entity error:', err);
    res.status(500).json({ error: 'حدث خطأ أثناء إنشاء المنشأة' });
  }
});

// GET /api/entities
router.get('/', requireAuth, async (req, res) => {
  try {
    let result;
    if (req.user.role === 'admin') {
      result = await pool.query('SELECT * FROM entities ORDER BY name ASC');
    } else {
      result = await pool.query(`
        SELECT e.* FROM entities e
        JOIN user_entities ue ON ue.entity_id = e.id
        WHERE ue.user_id = $1
        ORDER BY e.name ASC
      `, [req.user.id]);
    }
    res.json({ entities: result.rows });
  } catch (err) {
    res.status(500).json({ error: 'خطأ في جلب المنشآت' });
  }
});

// ---------------- ACCOUNTS ----------------

// GET /api/entities/:entityId/accounts
router.get('/:entityId/accounts', requireAuth, requireEntityAccess, async (req, res) => {
  try {
    const { entityId } = req.params;
    const result = await pool.query(`
      SELECT * FROM accounts
      WHERE entity_id = $1
      ORDER BY code ASC
    `, [entityId]);
    res.json({ accounts: result.rows });
  } catch (err) {
    res.status(500).json({ error: 'خطأ في جلب شجرة الحسابات' });
  }
});

// POST /api/entities/:entityId/accounts
router.post('/:entityId/accounts', requireAuth, requireEntityAccess, async (req, res) => {
  try {
    const { entityId } = req.params;
    const { code, name, name_en, type, sub_type = 'general', parent_id = null, is_group = false, nature, description } = req.body || {};

    if (!code || !name || !type) {
      return res.status(400).json({ error: 'كود الحساب والاسم والتصنيف مطلوبة' });
    }

    const cleanCode = String(code).trim();
    let parent = null;
    let level = 1;
    let determinedNature = nature;

    if (parent_id) {
      const parentRes = await pool.query(
        'SELECT * FROM accounts WHERE id = $1 AND entity_id = $2',
        [parent_id, entityId]
      );
      if (parentRes.rows.length === 0) {
        return res.status(400).json({ error: 'الحساب الرئيسي المحدد غير موجود' });
      }
      parent = parentRes.rows[0];
      level = (parent.level || 1) + 1;
      if (!determinedNature) determinedNature = parent.nature;
    }

    if (!determinedNature) {
      determinedNature = ['asset', 'expense'].includes(type) ? 'debit' : 'credit';
    }

    const result = await withTransaction(async (client) => {
      // If parent was not group, promote to group
      if (parent && !parent.is_group) {
        await client.query('UPDATE accounts SET is_group = true WHERE id = $1', [parent.id]);
      }

      const insRes = await client.query(`
        INSERT INTO accounts (entity_id, code, name, name_en, type, sub_type, parent_id, level, nature, is_group, description)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
        RETURNING *
      `, [entityId, cleanCode, name.trim(), name_en ? name_en.trim() : null, type, sub_type, parent_id, level, determinedNature, !!is_group, description]);

      return insRes.rows[0];
    });

    await audit(null, entityId, req.user.id, 'ACCOUNT_CREATED', 'accounts', result.id, { code: cleanCode, name });

    res.status(201).json({ account: result });
  } catch (err) {
    if (err.code === '23505') {
      return res.status(400).json({ error: `كود الحساب (${req.body.code}) مسجل بالفعل لهذه المنشأة` });
    }
    console.error('Create account error:', err);
    res.status(500).json({ error: 'خطأ أثناء إنشاء الحساب' });
  }
});

// ---------------- CUSTOMERS ----------------

// GET /api/entities/:entityId/customers
router.get('/:entityId/customers', requireAuth, requireEntityAccess, async (req, res) => {
  try {
    const { entityId } = req.params;
    const result = await pool.query(
      'SELECT * FROM customers WHERE entity_id = $1 ORDER BY name ASC',
      [entityId]
    );
    res.json({ customers: result.rows });
  } catch (err) {
    res.status(500).json({ error: 'خطأ في جلب العملاء' });
  }
});

// POST /api/entities/:entityId/customers
router.post('/:entityId/customers', requireAuth, requireEntityAccess, async (req, res) => {
  try {
    const { entityId } = req.params;
    const { name, vat_number, phone, email } = req.body || {};
    if (!name) {
      return res.status(400).json({ error: 'اسم العميل مطلوب' });
    }

    const result = await pool.query(`
      INSERT INTO customers (entity_id, name, vat_number, phone, email)
      VALUES ($1, $2, $3, $4, $5)
      RETURNING *
    `, [entityId, name.trim(), vat_number || null, phone || null, email || null]);

    const customer = result.rows[0];
    await audit(null, entityId, req.user.id, 'CUSTOMER_CREATED', 'customers', customer.id, { name });

    res.status(201).json({ customer });
  } catch (err) {
    res.status(500).json({ error: 'خطأ في إضافة العميل' });
  }
});

module.exports = {
  router,
  requireAuth,
  requireEntityAccess
};
