'use strict';
const fs = require('fs');

const html = fs.readFileSync('public/index.html', 'utf8');

// Find all buttons that call openNewInvoiceModal
const regex = /<button[^>]*onclick=["'][^"']*openNewInvoiceModal[^"']*["'][^>]*>([\s\S]*?)<\/button>/gi;
let m;
while ((m = regex.exec(html)) !== null) {
  console.log('Button:', m[0].replace(/\s+/g, ' '));
}

// Check where newInvoiceModal is defined
const modalIndex = html.indexOf('id="newInvoiceModal"');
console.log('Modal index:', modalIndex);

// Check if openModal function exists and how it works
const openModalMatch = html.match(/function openModal[\s\S]*?}/);
console.log('openModal function:', openModalMatch ? openModalMatch[0] : 'not found');
