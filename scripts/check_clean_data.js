'use strict';
const fs = require('fs');

const html = fs.readFileSync('public/index.html', 'utf8');
const idx = html.indexOf('CLEAN_ZERO_DATA');
console.log(html.substring(idx, idx + 1000));
