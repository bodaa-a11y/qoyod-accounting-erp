'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const workflowRouter = require('../src/routes-workflows');

test('Workflow router exports all required endpoints', () => {
  const routes = workflowRouter.stack
    .filter(r => r.route)
    .map(r => `${Object.keys(r.route.methods)[0].toUpperCase()} ${r.route.path}`);

  assert.ok(routes.includes('GET /:entityId/dashboard/live-kpis'), 'Should have dashboard live-kpis endpoint');
  assert.ok(routes.includes('GET /:entityId/workflows/approvals'), 'Should have workflows approvals list endpoint');
  assert.ok(routes.includes('POST /:entityId/workflows/submit'), 'Should have workflows submit endpoint');
  assert.ok(routes.includes('POST /:entityId/workflows/approvals/:id/action'), 'Should have workflows action endpoint');
  assert.ok(routes.includes('GET /:entityId/quotes'), 'Should have quotes list endpoint');
  assert.ok(routes.includes('POST /:entityId/quotes'), 'Should have quotes create endpoint');
  assert.ok(routes.includes('POST /:entityId/quotes/:id/convert-to-invoice'), 'Should have convert quote endpoint');
  assert.ok(routes.includes('GET /:entityId/inventory/transfers'), 'Should have stock transfers endpoint');
  assert.ok(routes.includes('POST /:entityId/inventory/transfers'), 'Should have create stock transfer endpoint');
  assert.ok(routes.includes('GET /:entityId/inventory/adjustments'), 'Should have stock adjustments endpoint');
  assert.ok(routes.includes('POST /:entityId/inventory/adjustments'), 'Should have create stock adjustment endpoint');
});
