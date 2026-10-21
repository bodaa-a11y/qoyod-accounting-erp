'use strict';
const fs = require('fs');

const html = fs.readFileSync('public/index.html', 'utf8');

// Print lines around nav items
const lines = html.split('\n');
lines.forEach((l, i) => {
  if (l.includes('id="nav-') || l.includes('id=\'nav-')) {
    console.log(`${i + 1}: ${l.trim()}`);
  }
});
