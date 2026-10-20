'use strict';
require('dotenv').config();
const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

function runBackup() {
  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) {
    console.error('DATABASE_URL is required for backup');
    process.exit(1);
  }

  const backupDir = path.join(__dirname, '..', 'backups');
  if (!fs.existsSync(backupDir)) {
    fs.mkdirSync(backupDir, { recursive: true });
  }

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const outFile = path.join(backupDir, `qoyod-backup-${timestamp}.sql`);

  console.log(`📦 Creating database backup to: ${outFile}`);
  try {
    execSync(`pg_dump "${dbUrl}" -f "${outFile}"`, { stdio: 'inherit' });
    console.log(`✅ Backup successfully saved: ${outFile}`);
  } catch (err) {
    console.error('❌ Backup command failed. Ensure pg_dump is installed and accessible on PATH.', err.message);
    process.exit(1);
  }
}

runBackup();
