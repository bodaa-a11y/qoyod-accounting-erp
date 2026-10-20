'use strict';
require('dotenv').config();
const bcrypt = require('bcryptjs');
const { pool } = require('../src/lib');

async function fixUsers() {
  console.log('Updating user passwords in Neon DB...');
  const users = [
    { email: 'mohamed.babiker@qoyod.com', name: 'محمد بابكر', pass: 'Babiker@2026', role: 'cfo' },
    { email: 'ahmed.elnady@qoyod.com', name: 'احمد النادي', pass: 'Elnady@2026', role: 'chief_accountant' },
    { email: 'eid.abdulrahman@qoyod.com', name: 'عيد عبدالرحمن', pass: 'Eid@2026', role: 'auditor' }
  ];

  for (const u of users) {
    const hash = await bcrypt.hash(u.pass, 10);
    await pool.query(
      'UPDATE users SET password_hash = $1, full_name = $2, role = $3 WHERE email = $4',
      [hash, u.name, u.role, u.email]
    );
    console.log('✅ Updated password for:', u.name, '=>', u.email);
  }

  await pool.end();
  console.log('🎉 Done successfully.');
}

fixUsers().catch(err => {
  console.error(err);
  process.exit(1);
});
