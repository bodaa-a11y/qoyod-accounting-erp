'use strict';
// End-to-end accounting cycle tests against a real (test) Postgres.
// Usage:  TEST_DATABASE_URL=postgresql://... node --test test/api.test.js
process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret-test-secret-test-secret';
process.env.ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'TestPass123!';

const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const { pool } = require('../src/lib');

let server, base, adminToken, entityId, customerId, revAccId, cashAccId, invoiceId, journalId;

async function api(method, p, body, token) {
  const res = await fetch(base + '/api' + p, {
    method,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: 'Bearer ' + token } : {}) },
    body: body ? JSON.stringify(body) : undefined });
  return { status: res.status, body: await res.json() };
}

test.before(async () => {
  // fresh schema
  const sql = fs.readFileSync(path.join(__dirname, '..', 'db', 'schema.sql'), 'utf8');
  await pool.query(sql);
  const bcrypt = require('bcryptjs');
  await pool.query(`INSERT INTO users (email, password_hash, full_name, role)
    VALUES ('admin@test.local', $1, 'Admin', 'admin') ON CONFLICT (email) DO NOTHING`,
    [await bcrypt.hash('TestPass123!', 4)]);
  process.env.PORT = '0';
  await pool.end();
  // spawn server as child for full HTTP fidelity
  server = require('child_process').spawn('node', [path.join(__dirname, '..', 'src', 'server.js')],
    { env: { ...process.env, PORT: '4123' }, stdio: 'ignore' });
  base = 'http://localhost:4123';
  await new Promise(r => setTimeout(r, 1200));
});

test.after(async () => { server && server.kill(); });

test('full sales accounting cycle', async () => {
  // login
  let r = await api('POST', '/auth/login', { email: 'admin@test.local', password: 'TestPass123!' });
  assert.strictEqual(r.status, 200); adminToken = r.body.token;

  // entity
  r = await api('POST', '/entities', { code: 'test', name: 'منشأة اختبار' }, adminToken);
  assert.strictEqual(r.status, 201); entityId = r.body.entity.id;

  // seed starter chart via inline minimal chart (accounts needed for posting)
  const mk = (body) => api('POST', `/entities/${entityId}/accounts`, body, adminToken);
  assert.strictEqual((await mk({ code: '1', name: 'الأصول', type: 'asset', is_group: true })).status, 201);
  const a11 = (await mk({ code: '11', name: 'متداولة', type: 'asset', parent_id: (await api('GET', `/entities/${entityId}/accounts`, null, adminToken)).body.accounts.find(a=>a.code==='1').id, is_group: true })).status;
  assert.strictEqual(a11, 201);
  const accs = (await api('GET', `/entities/${entityId}/accounts`, null, adminToken)).body.accounts;
  const root1 = accs.find(a => a.code === '1').id;
  // build the standard leaves the engine needs
  const mkUnder = async (parentCode, code, name, type, sub, extra={}) => {
    const parent = (await api('GET', `/entities/${entityId}/accounts`, null, adminToken)).body.accounts.find(a => a.code === parentCode);
    return (await mk({ code, name, type, sub_type: sub, parent_id: parent.id, ...extra })).body.account;
  };
  const grp1101 = await mkUnder('11', '1101', 'النقدية', 'asset', 'cash', { is_group: true });
  cashAccId = (await mk({ code: '110101', name: 'الصندوق', type: 'asset', sub_type: 'cash', parent_id: grp1101.id })).body.account.id;
  const grp1103 = await mkUnder('11', '1103', 'العملاء', 'asset', 'receivable', { is_group: true });
  await mk({ code: '110301', name: 'مدينون تجاريون', type: 'asset', sub_type: 'receivable', parent_id: grp1103.id });
  await mk({ code: '2', name: 'الالتزامات', type: 'liability', is_group: true });
  const grp2102 = await mkUnder('2', '2102', 'ضرائب', 'liability', 'tax_payable', { is_group: true });
  await mk({ code: '210201', name: 'ض.ق.م مخرجة', type: 'liability', sub_type: 'tax_payable', parent_id: grp2102.id });
  await mk({ code: '4', name: 'الإيرادات', type: 'revenue', is_group: true });
  const grp41 = await mkUnder('4', '41', 'إيرادات نشاط', 'revenue', 'operating_revenue', { is_group: true });
  revAccId = (await mk({ code: '410101', name: 'مبيعات', type: 'revenue', sub_type: 'operating_revenue', parent_id: grp41.id })).body.account.id;

  // customer
  r = await api('POST', `/entities/${entityId}/customers`, { name: 'عميل اختبار' }, adminToken);
  customerId = r.body.customer.id;

  // invoice (draft)
  r = await api('POST', `/entities/${entityId}/invoices`, {
    customer_id: customerId, issue_date: '2026-01-10',
    lines: [{ revenue_account_id: revAccId, description: 'خدمة', qty: 2, unit_price: '100.00', vat_rate: 15 }] }, adminToken);
  assert.strictEqual(r.status, 201);
  invoiceId = r.body.invoice.id;
  assert.strictEqual(r.body.invoice.total_halalas, 23000); // 200 + 30 VAT

  // idempotency: same key -> no duplicate
  const key = 'test-key-1';
  r = await api('POST', `/entities/${entityId}/invoices`, {
    customer_id: customerId, issue_date: '2026-01-10', idempotency_key: key,
    lines: [{ revenue_account_id: revAccId, qty: 1, unit_price: '10.00' }] }, adminToken);
  const again = await api('POST', `/entities/${entityId}/invoices`, {
    customer_id: customerId, issue_date: '2026-01-10', idempotency_key: key,
    lines: [{ revenue_account_id: revAccId, qty: 1, unit_price: '10.00' }] }, adminToken);
  assert.strictEqual(again.body.invoice.id, r.body.invoice.id);

  // post invoice
  r = await api('POST', `/entities/${entityId}/invoices/${invoiceId}/post`, null, adminToken);
  assert.strictEqual(r.status, 200, JSON.stringify(r.body));
  // double-post rejected
  r = await api('POST', `/entities/${entityId}/invoices/${invoiceId}/post`, null, adminToken);
  assert.strictEqual(r.status, 400);

  // trial balance must be balanced and reflect the invoice
  r = await api('GET', `/entities/${entityId}/reports/trial-balance`, null, adminToken);
  assert.strictEqual(r.body.totals.balanced, true);

  // receipt for full amount
  r = await api('POST', `/entities/${entityId}/receipts`, {
    invoice_id: invoiceId, amount: '230.00', cash_account_id: cashAccId, method: 'cash' }, adminToken);
  assert.strictEqual(r.status, 201, JSON.stringify(r.body));
  // over-collection rejected
  r = await api('POST', `/entities/${entityId}/receipts`, {
    invoice_id: invoiceId, amount: '1.00', cash_account_id: cashAccId, method: 'cash' }, adminToken);
  assert.strictEqual(r.status, 400);

  // invoice now paid
  r = await api('GET', `/entities/${entityId}/invoices/${invoiceId}`, null, adminToken);
  assert.strictEqual(r.body.invoice.status, 'paid');

  // unbalanced manual journal rejected
  r = await api('POST', `/entities/${entityId}/journals`, {
    date: '2026-01-15', description: 'قيد فاشل',
    lines: [{ accountId: cashAccId, debit: '100.00' }, { accountId: revAccId, credit: '50.00' }] }, adminToken);
  assert.strictEqual(r.status, 400);

  // balanced journal OK + reversal works
  r = await api('POST', `/entities/${entityId}/journals`, {
    date: '2026-01-15', description: 'قيد صحيح',
    lines: [{ accountId: cashAccId, debit: '100.00' }, { accountId: revAccId, credit: '100.00' }] }, adminToken);
  assert.strictEqual(r.status, 201, JSON.stringify(r.body));
  journalId = r.body.journal.id;
  r = await api('POST', `/entities/${entityId}/journals/${journalId}/reverse`, { reason: 'اختبار' }, adminToken);
  assert.strictEqual(r.status, 200);
  r = await api('GET', `/entities/${entityId}/journals`, null, adminToken);
  const orig = r.body.journals.find(j => j.id === journalId);
  assert.strictEqual(orig.status, 'reversed');

  // posting to a GROUP account rejected
  const grp = (await api('GET', `/entities/${entityId}/accounts`, null, adminToken)).body.accounts.find(a => a.code === '1');
  r = await api('POST', `/entities/${entityId}/journals`, {
    date: '2026-01-16', description: 'x',
    lines: [{ accountId: grp.id, debit: '10.00' }, { accountId: revAccId, credit: '10.00' }] }, adminToken);
  assert.strictEqual(r.status, 400);

  // reports exist and balance sheet balances
  r = await api('GET', `/entities/${entityId}/reports/balance-sheet?as_of=2026-01-31`, null, adminToken);
  assert.strictEqual(r.body.totals.balanced, true, JSON.stringify(r.body.totals));
  r = await api('GET', `/entities/${entityId}/reports/income-statement?from=2026-01-01&to=2026-01-31`, null, adminToken);
  assert.ok(r.body.totals);

  // entity isolation: another user without membership gets 403
  const bcrypt = require('bcryptjs');
  await pool.connect(); // ensure pool usable
  const c = await pool.connect();
  await c.query(`INSERT INTO users (email, password_hash, full_name, role)
    VALUES ('out@test.local', $1, 'Outsider', 'accountant')`, [await bcrypt.hash('TestPass123!', 4)]);
  c.release();
  r = await api('POST', '/auth/login', { email: 'out@test.local', password: 'TestPass123!' });
  const outToken = r.body.token;
  r = await api('GET', `/entities/${entityId}/invoices`, null, outToken);
  assert.strictEqual(r.status, 403);

  // audit log is populated
  r = await api('GET', `/entities/${entityId}/audit-log`, null, adminToken);
  assert.ok(r.body.audit.length > 3);
  await pool.end();
});
