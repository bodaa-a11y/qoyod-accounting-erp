'use strict';
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { pool } = require('../src/lib');

async function runMigration() {
  console.log('🔄 Running database migrations...');
  const schemaPath = path.join(__dirname, '..', 'db', 'schema.sql');
  const sql = fs.readFileSync(schemaPath, 'utf8');

  const client = await pool.connect();
  try {
    await client.query(sql);
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
