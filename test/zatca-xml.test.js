'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { buildInvoiceXml, sha256Base64 } = require('../src/zatca-xml');

test('ZATCA XML preview escapes user-supplied text and emits core UBL namespaces', () => {
  const result = buildInvoiceXml({
    invoice: { id: 'inv-1', invoice_number: 'INV-1', issue_date: '2026-10-25', created_at: '2026-10-25T08:00:00Z', subtotal_halalas: 100000, vat_halalas: 15000, total_halalas: 115000 },
    lines: [{ description: 'Service <A>', qty: 1, unit_price_halalas: 100000, vat_rate: 15, subtotal_halalas: 100000, vat_halalas: 15000 }],
    customer: { name: 'Customer & Sons', vat_number: '310000000000003' },
    seller: { seller_name_ar: 'Company', vat_number: '310000000000003', cr_number: '123', building_number: '1234', street_name: 'King Road', district: 'Central', city: 'Riyadh', postal_code: '12345' },
    type: 'simplified'
  });
  assert.match(result.xml, /urn:oasis:names:specification:ubl:schema:xsd:Invoice-2/);
  assert.match(result.xml, /Service &lt;A&gt;/);
  assert.match(result.xml, /Customer &amp; Sons/);
  assert.match(result.xml, /<cbc:TaxInclusiveAmount currencyID="SAR">1150\.00<\/cbc:TaxInclusiveAmount>/);
  assert.ok(result.uuid);
  assert.ok(result.qr);
  assert.equal(sha256Base64(result.xml).length > 20, true);
});
