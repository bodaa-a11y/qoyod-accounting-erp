'use strict';
const test = require('node:test');
const assert = require('node:assert');
const { toHalalas, toRiyals, vatOf } = require('../src/lib');

test('toHalalas parses riyal strings with Arabic separators', () => {
  assert.strictEqual(toHalalas('123.45'), 12345);
  assert.strictEqual(toHalalas('1,000.00'), 100000);
  assert.strictEqual(toHalalas('٥٠٠٫٢٥'), 50025);
  assert.strictEqual(toHalalas(10), 1000);
  assert.strictEqual(toHalalas('0.01'), 1);
  assert.strictEqual(toHalalas('-5.50'), -550);
  assert.strictEqual(toHalalas('abc'), null);
  assert.strictEqual(toHalalas('1.234'), null); // >2 decimals rejected
});

test('vatOf computes 15% with half-up rounding', () => {
  assert.strictEqual(vatOf(10000, 15), 1500);   // 100.00 -> 15.00
  assert.strictEqual(vatOf(333, 15), 50);        // 3.33 -> 0.50 (3.33*0.15=0.4995)
  assert.strictEqual(vatOf(1, 15), 0);           // 0.01 -> 0.0015 -> 0
  assert.strictEqual(vatOf(100000, 0), 0);
});

test('toRiyals formats halalas', () => {
  assert.strictEqual(toRiyals(12345), '123.45');
  assert.strictEqual(toRiyals(5), '0.05');
});
