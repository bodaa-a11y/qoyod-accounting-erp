'use strict';
const fs = require('fs');
const path = require('path');

function audit() {
  console.log('🔍 Starting Comprehensive ERP System Audit...\n');

  // 1. Inspect public/index.html
  const htmlPath = path.join(__dirname, '..', 'public', 'index.html');
  const html = fs.readFileSync(htmlPath, 'utf8');

  // View containers
  const viewRegex = /id=["'](view-[a-zA-Z0-9_-]+)["']/g;
  const views = new Set();
  let m;
  while ((m = viewRegex.exec(html)) !== null) {
    views.add(m[1]);
  }

  // Modals
  const modalRegex = /id=["']([a-zA-Z0-9_-]*Modal[a-zA-Z0-9_-]*)["']/gi;
  const modals = new Set();
  while ((m = modalRegex.exec(html)) !== null) {
    modals.add(m[1]);
  }

  // switchView calls
  const switchRegex = /switchView\s*\(\s*['"]([^'"]+)['"]\s*\)/g;
  const switchTargets = new Set();
  while ((m = switchRegex.exec(html)) !== null) {
    switchTargets.add(m[1]);
  }

  // Nav popovers
  const popoverRegex = /id=["'](popover-[a-zA-Z0-9_-]+)["']/g;
  const popovers = new Set();
  while ((m = popoverRegex.exec(html)) !== null) {
    popovers.add(m[1]);
  }

  console.log('--- FRONTEND AUDIT ---');
  console.log(`Views in HTML (${views.size}):`, Array.from(views).sort());
  console.log(`Modals in HTML (${modals.size}):`, Array.from(modals).sort());
  console.log(`SwitchView Targets (${switchTargets.size}):`, Array.from(switchTargets).sort());
  console.log(`Nav Popovers (${popovers.size}):`, Array.from(popovers).sort());

  // Check for orphan switchView targets (targets with no view element)
  const orphanSwitches = [];
  for (const target of switchTargets) {
    const expectedId = 'view-' + target;
    if (!views.has(expectedId) && !views.has(target)) {
      orphanSwitches.push(target);
    }
  }
  console.log(`Orphan switchView targets (no matching view container):`, orphanSwitches);

  // 2. Inspect Backend Routes in src/
  console.log('\n--- BACKEND ROUTES AUDIT ---');
  const srcDir = path.join(__dirname, '..', 'src');
  const routeFiles = fs.readdirSync(srcDir).filter(f => f.startsWith('routes-'));
  
  routeFiles.forEach(rf => {
    const code = fs.readFileSync(path.join(srcDir, rf), 'utf8');
    const endpointRegex = /router\.(get|post|put|delete|patch)\s*\(\s*['"]([^'"]+)['"]/g;
    const endpoints = [];
    while ((m = endpointRegex.exec(code)) !== null) {
      endpoints.push(`${m[1].toUpperCase()} ${m[2]}`);
    }
    console.log(`\nFile: src/${rf} (${endpoints.length} endpoints):`);
    endpoints.forEach(ep => console.log(`   ${ep}`));
  });

  // 3. Inspect Database Schemas in db/
  console.log('\n--- DATABASE AUDIT ---');
  const dbDir = path.join(__dirname, '..', 'db');
  const sqlFiles = fs.readdirSync(dbDir).filter(f => f.endsWith('.sql'));

  sqlFiles.forEach(sf => {
    const sql = fs.readFileSync(path.join(dbDir, sf), 'utf8');
    const tableRegex = /CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?([a-zA-Z0-9_]+)/gi;
    const tables = [];
    while ((m = tableRegex.exec(sql)) !== null) {
      tables.push(m[1]);
    }
    console.log(`File: db/${sf} -> Tables (${tables.length}):`, tables);
  });

  // 4. Inspect router.js
  const routerPath = path.join(__dirname, '..', 'public', 'js', 'router.js');
  if (fs.existsSync(routerPath)) {
    const rCode = fs.readFileSync(routerPath, 'utf8');
    const routeDefRegex = /['"]#\/([^'"]+)['"]\s*:/g;
    const hashRoutes = [];
    while ((m = routeDefRegex.exec(rCode)) !== null) {
      hashRoutes.push(m[1]);
    }
    console.log(`\nHash routes defined in router.js (${hashRoutes.length}):`, hashRoutes);
  }

  // 5. Inspect server.js mounts
  const serverCode = fs.readFileSync(path.join(srcDir, 'server.js'), 'utf8');
  console.log('\n--- SERVER ROUTE MOUNTS ---');
  const mountRegex = /app\.use\s*\(\s*['"]([^'"]+)['"]\s*,\s*([a-zA-Z0-9_-]+)\s*\)/g;
  while ((m = mountRegex.exec(serverCode)) !== null) {
    console.log(`Mount: ${m[1]} -> ${m[2]}`);
  }
}

audit();
