'use strict';
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { pool, toHalalas } = require('../src/lib');

async function migrateLegacy() {
  const legacyFile = process.argv[2] || path.join(__dirname, '..', 'web', 'data.json');
  if (!fs.existsSync(legacyFile)) {
    console.error(`Legacy file not found: ${legacyFile}`);
    process.exit(1);
  }

  console.log(`📦 Migrating legacy JSON state from: ${legacyFile}`);
  const data = JSON.parse(fs.readFileSync(legacyFile, 'utf8'));

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // 1. Entities
    const entityMap = {};
    const branches = data.branches || [];
    for (const b of branches) {
      const res = await client.query(`
        INSERT INTO entities (code, name, cr_number, vat_number)
        VALUES ($1, $2, $3, $4)
        ON CONFLICT (code) DO UPDATE
        SET name = EXCLUDED.name
        RETURNING id
      `, [b.id, b.name, b.cr, b.vat]);
      entityMap[b.id] = res.rows[0].id;
    }

    // Default global entity for 'all'
    const allRes = await client.query(`
      INSERT INTO entities (code, name)
      VALUES ('general', 'المجمع العام')
      ON CONFLICT (code) DO UPDATE SET name = EXCLUDED.name
      RETURNING id
    `);
    entityMap['all'] = allRes.rows[0].id;

    console.log(`✅ Migrated ${Object.keys(entityMap).length} entities.`);
    await client.query('COMMIT');
    console.log('🎉 Legacy migration completed successfully.');
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('❌ Legacy migration failed:', err);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

migrateLegacy();
