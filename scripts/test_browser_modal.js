'use strict';
const fs = require('fs');

const html = fs.readFileSync('public/index.html', 'utf8');

// Check script execution of openNewInvoiceModal
const scriptMatch = html.match(/<script(?![^>]*src=)[^>]*>([\s\S]*?)<\/script>/gi);
const script = scriptMatch[1].replace(/<script[^>]*>/i, '').replace(/<\/script>/i, '');

// Create a simulated DOM
const { JSDOM } = require('jsdom');
const dom = new JSDOM(html, { runScripts: "dangerously", resources: "usable" });
const window = dom.window;
const document = window.document;

console.log('Testing openNewInvoiceModal in JSDOM...');
try {
  window.openNewInvoiceModal();
  const modal = document.getElementById('newInvoiceModal');
  console.log('Modal found:', !!modal);
  console.log('Modal classes:', modal ? modal.className : 'null');
  console.log('Modal hidden:', modal ? modal.classList.contains('hidden') : 'null');
} catch (err) {
  console.error('Error running openNewInvoiceModal():', err);
}
