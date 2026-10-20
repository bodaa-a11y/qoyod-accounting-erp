'use strict';
require('dotenv').config();
const { Pool } = require('pg');
const jwt = require('jsonwebtoken');

// Money and Tax Precision Helpers (Integer Halalas)
function toHalalas(val) {
  if (val === null || val === undefined) return null;
  if (typeof val === 'number') {
    if (!Number.isFinite(val)) return null;
    return Math.round(val * 100);
  }
  let str = String(val).trim();
  if (!str) return null;

  // Replace Arabic-Indic digits ٠-٩ with standard digits
  const arabicDigits = ['٠','١','٢','٣','٤','٥','٦','٧','٨','٩'];
  for (let i = 0; i < 10; i++) {
    str = str.replaceAll(arabicDigits[i], String(i));
  }

  // Replace Arabic decimal comma ٫ with standard dot
  str = str.replaceAll('٫', '.');
  // Remove thousand separators
  str = str.replaceAll(',', '').replaceAll('٬', '');

  // Must match standard decimal number
  const match = str.match(/^-?\d+(\.\d+)?$/);
  if (!match) return null;

  if (str.includes('.')) {
    const decimals = str.split('.')[1];
    if (decimals.length > 2) return null; // >2 decimals rejected
  }

  const num = parseFloat(str);
  if (isNaN(num)) return null;
  return Math.round(num * 100);
}

function toRiyals(halalas) {
  const h = Number(halalas) || 0;
  const isNeg = h < 0;
  const abs = Math.abs(h);
  const riyals = Math.floor(abs / 100);
  const remainder = abs % 100;
  const sign = isNeg ? '-' : '';
  return `${sign}${riyals}.${String(remainder).padStart(2, '0')}`;
}

function vatOf(amountHalalas, rate = 15) {
  if (!amountHalalas || !rate) return 0;
  return Math.round(amountHalalas * (rate / 100));
}

// PostgreSQL Connection Pool
const isProduction = process.env.NODE_ENV === 'production';
const pool = new Pool({
  connectionString: process.env.DATABASE_URL || process.env.TEST_DATABASE_URL,
  ssl: (process.env.DATABASE_URL && process.env.DATABASE_URL.includes('sslmode=require')) ? { rejectUnauthorized: false } : false
});

// JWT Helpers
const JWT_SECRET = process.env.JWT_SECRET || 'qoyod-super-secret-jwt-key-change-in-production';

function signToken(payload) {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: '12h' });
}

function verifyToken(token) {
  try {
    return jwt.verify(token, JWT_SECRET);
  } catch (err) {
    return null;
  }
}

// Transaction Helper
async function withTransaction(fn) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

// Immutable Audit Log Recorder
async function audit(client, entityId, userId, action, entityType, entityIdRef, payload = {}) {
  const q = `
    INSERT INTO audit_log (entity_id, user_id, action, entity_type, entity_id_ref, payload)
    VALUES ($1, $2, $3, $4, $5, $6)
  `;
  const executor = client || pool;
  await executor.query(q, [entityId, userId, action, entityType, entityIdRef, JSON.stringify(payload)]);
}

// Sequence & Numbering Generator with Row Locking
async function nextDocNumber(client, entityId, docType) {
  // Lock the sequence row for this entity and docType
  const checkQ = `
    SELECT last_number, prefix
    FROM doc_sequences
    WHERE entity_id = $1 AND doc_type = $2
    FOR UPDATE
  `;
  const res = await client.query(checkQ, [entityId, docType]);
  let nextNum = 1;
  let prefix = docType.toUpperCase() + '-';

  if (res.rows.length === 0) {
    await client.query(`
      INSERT INTO doc_sequences (entity_id, doc_type, prefix, last_number)
      VALUES ($1, $2, $3, 1)
    `, [entityId, docType, prefix]);
  } else {
    nextNum = res.rows[0].last_number + 1;
    prefix = res.rows[0].prefix || prefix;
    await client.query(`
      UPDATE doc_sequences
      SET last_number = $1
      WHERE entity_id = $2 AND doc_type = $3
    `, [nextNum, entityId, docType]);
  }

  const year = new Date().getFullYear();
  return `${prefix}${year}-${String(nextNum).padStart(4, '0')}`;
}

module.exports = {
  toHalalas,
  toRiyals,
  vatOf,
  pool,
  signToken,
  verifyToken,
  withTransaction,
  audit,
  nextDocNumber
};
