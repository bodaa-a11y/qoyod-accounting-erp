'use strict';
require('dotenv').config();
process.env.DATABASE_URL = process.env.TEST_DATABASE_URL || process.env.DATABASE_URL;
process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret-test-secret-test-secret';

const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const { pool } = require('../src/lib');

let server;
let token;
const base = 'http://127.0.0.1:4124';

async function api(method, route, body, raw = false) {
  const response = await fetch(base + '/api' + route, {
    method,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body ? JSON.stringify(body) : undefined
  });
  if (raw) return response;
  return { status: response.status, body: await response.json() };
}

test.before(async () => {
  await pool.query(fs.readFileSync(path.join(__dirname, '..', 'db', 'schema.sql'), 'utf8'));
  await pool.query(fs.readFileSync(path.join(__dirname, '..', 'db', 'migration_002_missing_modules.sql'), 'utf8'));
  const bcrypt = require('bcryptjs');
  await pool.query(`INSERT INTO users (email, password_hash, full_name, role)
    VALUES ('state@test.local', $1, 'مدير اختبار', 'admin')`, [await bcrypt.hash('TestPass123!', 4)]);
  server = require('child_process').spawn(process.execPath, [path.join(__dirname, '..', 'src', 'server.js')], {
    env: { ...process.env, PORT: '4124' }, stdio: 'inherit'
  });
  await new Promise(resolve => setTimeout(resolve, 2500));
  const login = await api('POST', '/auth/login', { email: 'state@test.local', password: 'TestPass123!' });
  assert.strictEqual(login.status, 200);
  token = login.body.token;
});

test.after(async () => {
  if (server?.pid) try { process.kill(server.pid); } catch (_) {}
  await pool.end();
});

test('legacy invoice workflow is validated, atomic, idempotent and readable as PDF', async () => {
  const initial = {
    branches: [{ id: 'law', name: 'منشأة اختبار', cr: '123', vat: '310123456700003' }],
    invoices: [], quotes: [], journals: [], vouchers: [],
    treasury: { cash: 0, rajhi: 0, ahli: 0 }, _revision: 0
  };
  let result = await api('POST', '/state', initial);
  assert.strictEqual(result.status, 200, JSON.stringify(result.body));

  const operationId = 'invoiceoperationtest0001';
  const payload = {
    operationId, docType: 'tax_invoice', entity: 'law', client: 'عميل اختبار',
    clientVat: '', clientAddress: '', date: '2026-02-01', dueDate: '2026-02-15',
    status: 'paid', method: 'تحويل بنكي', notes: 'اختبار معزول', subtotal: 1, vat: 0, total: 1,
    items: [
      { desc: 'خدمة أولى', qty: 2, price: '100.10', discount: '10.10', vatRate: 15 },
      { desc: 'خدمة ثانية', qty: 1, price: '50.00', discount: 0, vatRate: 15 }
    ]
  };
  result = await api('POST', '/state/invoices', payload);
  assert.strictEqual(result.status, 201, JSON.stringify(result.body));
  const invoice = result.body.invoice;
  assert.match(invoice.id, /^INV-2026-0001$/);
  assert.strictEqual(invoice.subtotal, 240.1);
  assert.strictEqual(invoice.discount, 10.1);
  assert.strictEqual(invoice.vat, 36.02);
  assert.strictEqual(invoice.total, 276.12);
  assert.strictEqual(invoice.paidAmount, 276.12);
  assert.strictEqual(result.body.state.treasury.rajhi, 276.12);
  assert.strictEqual(result.body.state.journals.length, 2);
  assert.strictEqual(result.body.state.vouchers.length, 1);
  for (const entry of result.body.state.journals) {
    const debit = entry.lines.reduce((sum, line) => sum + line.debit, 0);
    const credit = entry.lines.reduce((sum, line) => sum + line.credit, 0);
    assert.strictEqual(Math.round(debit * 100), Math.round(credit * 100));
  }

  const retry = await api('POST', '/state/invoices', payload);
  assert.strictEqual(retry.status, 200);
  assert.strictEqual(retry.body.idempotent, true);
  assert.strictEqual(retry.body.invoice.id, invoice.id);
  assert.strictEqual(retry.body.state.invoices.length, 1);
  assert.strictEqual(retry.body.state.journals.length, 2);

  const readback = await api('GET', '/state');
  assert.strictEqual(readback.status, 200);
  assert.strictEqual(readback.body.invoices[0].total, 276.12);
  assert.strictEqual(readback.body._revision, 2);

  const pdf = await api('GET', `/state/invoices/${invoice.id}/pdf`, null, true);
  assert.strictEqual(pdf.status, 200);
  assert.strictEqual(pdf.headers.get('content-type'), 'application/pdf');
  const bytes = Buffer.from(await pdf.arrayBuffer());
  assert.strictEqual(bytes.subarray(0, 5).toString(), '%PDF-');
  assert.ok(bytes.length > 5000);

  const quote = await api('POST', '/state/invoices', {
    ...payload, operationId: 'quoteoperationtest00001', docType: 'quote', status: 'unpaid'
  });
  assert.strictEqual(quote.status, 201, JSON.stringify(quote.body));
  assert.match(quote.body.invoice.id, /^QUO-2026-0001$/);
  assert.strictEqual(quote.body.state.quotes.length, 1);
  assert.strictEqual(quote.body.state.invoices.length, 1);
  assert.strictEqual(quote.body.state.journals.length, 2);

  const invalid = await api('POST', '/state/invoices', {
    ...payload, operationId: 'invalidoperationtest001', items: [{ desc: 'خصم زائد', qty: 1, price: 10, discount: 11 }]
  });
  assert.strictEqual(invalid.status, 400);
});
