'use strict';
const fs = require('fs');

const html = fs.readFileSync('public/index.html', 'utf8');

// Find all occurrences of openNewInvoiceModal
const occurrences = [];
let pos = 0;
while ((pos = html.indexOf('openNewInvoiceModal', pos)) !== -1) {
  occurrences.push(pos);
  pos += 'openNewInvoiceModal'.length;
}

console.log('Occurrences of openNewInvoiceModal:', occurrences.length);
occurrences.forEach((p, i) => {
  console.log(`[${i}] around pos ${p}:`, html.substring(Math.max(0, p - 30), p + 50).replace(/\n/g, ' '));
});
