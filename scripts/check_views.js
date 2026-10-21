'use strict';
const fs = require('fs');

const html = fs.readFileSync('public/index.html', 'utf8');
const viewMatches = html.match(/id=["']view-[^"']+["']/g) || [];
const viewIds = viewMatches.map(v => v.replace(/id=["']/, '').replace(/["']/, ''));
console.log('Existing view IDs in index.html:');
console.log(viewIds);
