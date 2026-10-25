'use strict';
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { pool } = require('../src/lib');

async function runMigration() {
  console.log('🔄 Running database migrations...');
  const dbDir = path.join(__dirname, '..', 'db');
  const migrationFiles = ['schema.sql', ...fs.readdirSync(dbDir)
    .filter(file => /^migration_\d+.*\.sql$/i.test(file))
    .sort()];

  const client = await pool.connect();
  try {
    for (const file of migrationFiles) {
      const sql = fs.readFileSync(path.join(dbDir, file), 'utf8');
      await client.query(sql);
      console.log(`✅ Applied ${file}`);
    }
    console.log('✅ All tables, constraints, and audit triggers created successfully.');
  } catch (err) {
    console.error('❌ Migration failed:', err);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

runMigration();
