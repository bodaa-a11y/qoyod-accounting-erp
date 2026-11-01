'use strict';
const fs = require('fs');
const lines = fs.readFileSync('public/index.html', 'utf8').split('\n');

lines.forEach((l, idx) => {
  if (l.includes('id="view-') || l.includes("id='view-")) {
    console.log(`Line ${idx + 1}: ${l.trim()}`);
  }
});
