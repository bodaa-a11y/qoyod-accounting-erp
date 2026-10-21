'use strict';
const fs = require('fs');

const html = fs.readFileSync('public/index.html', 'utf8');

// Find function openNewInvoiceModal definition
const fnIdx = html.indexOf('function openNewInvoiceModal()');
console.log('Index of openNewInvoiceModal:', fnIdx);
if (fnIdx !== -1) {
  console.log(html.substring(fnIdx, fnIdx + 800));
}
