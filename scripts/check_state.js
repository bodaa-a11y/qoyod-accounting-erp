'use strict';
const fs = require('fs');

const html = fs.readFileSync('public/index.html', 'utf8');

// Search for state declaration
const idx = html.indexOf('const state =') !== -1 ? html.indexOf('const state =') : html.indexOf('let state =');
console.log('State declaration index:', idx);
if (idx !== -1) {
  console.log(html.substring(idx, idx + 1000));
}
