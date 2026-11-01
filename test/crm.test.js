'use strict';
const test = require('node:test');
const assert = require('node:assert');
const crmRouter = require('../src/routes-crm');

test('CRM Router exports express router with all IDURAR endpoints', () => {
  assert.strictEqual(typeof crmRouter, 'function');
  const routes = crmRouter.stack
    .filter(layer => layer.route)
    .map(layer => ({
      path: layer.route.path,
      methods: Object.keys(layer.route.methods)
    }));

  const paths = routes.map(r => r.path);
  assert.ok(paths.includes('/:entityId/crm/leads'), 'Has leads route');
  assert.ok(paths.includes('/:entityId/crm/deals'), 'Has deals route');
  assert.ok(paths.includes('/:entityId/invoices/:invoiceId/payments'), 'Has payments route');
  assert.ok(paths.includes('/:entityId/expense-categories'), 'Has expense categories route');
});
