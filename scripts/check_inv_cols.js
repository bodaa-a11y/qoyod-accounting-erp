'use strict';
require('dotenv').config();
const { pool } = require('../src/lib');

async function run() {
  const r = await pool.query("SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'inventory_movements'");
  console.log('inventory_movements columns:', r.rows);
  const p = await pool.query("SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'products'");
  console.log('products columns:', p.rows);
  process.exit(0);
}

run().catch(e => { console.error(e); process.exit(1); });
