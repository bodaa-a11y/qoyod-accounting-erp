'use strict';
const fs = require('fs');

const files = ['public/index.html', 'web/index.html'];

for (const filePath of files) {
  let content = fs.readFileSync(filePath, 'utf8');

  // Let's inspect where sidebar-nav-item is and where aside starts
  console.log('Processing:', filePath);
}
