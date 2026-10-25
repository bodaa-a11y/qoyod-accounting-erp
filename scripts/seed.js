'use strict';
require('dotenv').config();
const bcrypt = require('bcryptjs');
const fs = require('fs');
const path = require('path');
const { pool } = require('../src/lib');

async function runSeed() {
  console.log('🌱 Seeding initial system data...');
  const client = await pool.connect();

  try {
    const adminEmail = (process.env.ADMIN_EMAIL || 'admin@qoyod.local').toLowerCase().trim();
    const adminPass = process.env.ADMIN_PASSWORD || 'Admin123456!';
    const hash = await bcrypt.hash(adminPass, 10);

    // 1. Insert Initial Admin User
    const userRes = await client.query(`
      INSERT INTO users (email, password_hash, full_name, role)
      VALUES ($1, $2, 'المدير المالي الرئيسي', 'admin')
      ON CONFLICT (email) DO UPDATE
      SET full_name = EXCLUDED.full_name
      RETURNING id, email
    `, [adminEmail, hash]);

    const adminUser = userRes.rows[0];
    console.log(`👤 Admin user ready: ${adminUser.email}`);

    // Additional Enterprise Users requested (Updated credentials)
    await client.query(`
      DELETE FROM users
      WHERE email IN ('mohamed.babiker@qoyod.com', 'ahmed.elnady@qoyod.com', 'eid.abdulrahman@qoyod.com')
    `);

    const customUsers = [
      { email: 'm.babiker@qoyod.sa', pass: 'MB@Qoyod2026!', name: 'محمد بابكر', role: 'cfo' },
      { email: 'a.elnady@qoyod.sa', pass: 'AN@Qoyod2026!', name: 'احمد النادي', role: 'chief_accountant' },
      { email: 'e.abdulrahman@qoyod.sa', pass: 'EA@Qoyod2026!', name: 'عيد عبدالرحمن', role: 'auditor' }
    ];

    for (const u of customUsers) {
      const uHash = await bcrypt.hash(u.pass, 10);
      await client.query(`
        INSERT INTO users (email, password_hash, full_name, role)
        VALUES ($1, $2, $3, $4)
        ON CONFLICT (email) DO UPDATE
        SET password_hash = EXCLUDED.password_hash, full_name = EXCLUDED.full_name, role = EXCLUDED.role
      `, [u.email, uHash, u.name, u.role]);
      console.log(`👤 Seeded user: ${u.name} (${u.email})`);
    }

    // 2. Insert Default Entities
    const defaultEntities = [
      { code: 'law', name: 'شركة حجاج للمحاماة والاستشارات القانونية', cr: '1010987654', vat: '310123456700003' },
      { code: 'restaurant', name: 'مطعم مذاق البخاري والشاورما', cr: '1010765432', vat: '310987654300003' },
      { code: 'farm', name: 'مزرعة الواحة الخضراء للمنتجات الزراعية', cr: '1010543210', vat: '310654321000003' },
      { code: 'barber', name: 'صالون الأناقة الرجالي', cr: '1010432109', vat: '310432109800003' },
      { code: 'home', name: 'الذمة المالية الشخصية والمنزلية المعزولة', cr: 'خاص', vat: 'غير خاضع' }
    ];

    const defAccPath = path.join(__dirname, '..', 'web', 'default_accounts.json');
    let standardAccounts = [];
    if (fs.existsSync(defAccPath)) {
      standardAccounts = JSON.parse(fs.readFileSync(defAccPath, 'utf8'));
    }

    for (const ent of defaultEntities) {
      const entRes = await client.query(`
        INSERT INTO entities (code, name, cr_number, vat_number)
        VALUES ($1, $2, $3, $4)
        ON CONFLICT (code) DO UPDATE
        SET name = EXCLUDED.name
        RETURNING id
      `, [ent.code, ent.name, ent.cr, ent.vat]);

      const entityId = entRes.rows[0].id;

      // Assign admin membership
      await client.query(`
        INSERT INTO user_entities (user_id, entity_id, role)
        VALUES ($1, $2, 'admin')
        ON CONFLICT DO NOTHING
      `, [adminUser.id, entityId]);

      // Seed standard chart of accounts for each entity
      const idMap = {};
      // 1st pass: root accounts (level 1)
      for (const a of standardAccounts.filter(x => !x.parentId)) {
        const r = await client.query(`
          INSERT INTO accounts (entity_id, code, name, name_en, type, sub_type, level, nature, is_group, description)
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
          ON CONFLICT (entity_id, code) DO NOTHING
          RETURNING id
        `, [entityId, a.code, a.name, a.nameEn, a.type, a.subType || 'root', a.level || 1, a.nature, a.isGroup, a.description]);
        if (r.rows.length > 0) idMap[a.id] = r.rows[0].id;
      }

      // 2nd pass: sub accounts
      for (const a of standardAccounts.filter(x => x.parentId)) {
        const parentDbId = idMap[a.parentId] || null;
        await client.query(`
          INSERT INTO accounts (entity_id, code, name, name_en, type, sub_type, parent_id, level, nature, is_group, description)
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
          ON CONFLICT (entity_id, code) DO NOTHING
        `, [entityId, a.code, a.name, a.nameEn, a.type, a.subType || 'general', parentDbId, a.level || 2, a.nature, a.isGroup, a.description]);
      }
    }

    console.log('✅ Default entities and Chart of Accounts seeded successfully.');
  } catch (err) {
    console.error('❌ Seeding failed:', err);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

runSeed();
