'use strict';
const fs = require('fs');

const html = fs.readFileSync('public/index.html', 'utf8');
const start = html.indexOf('id="newInvoiceModal"');
console.log(html.substring(start - 20, start + 1200));
