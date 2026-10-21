'use strict';
const http = require('http');

http.get('http://localhost:3000', res => {
  let body = '';
  res.on('data', chunk => body += chunk);
  res.on('end', () => {
    console.log('HTTP Status:', res.statusCode);
    const checks = [
      'view-clients', 'view-quotes', 'view-suppliers',
      'view-payroll', 'view-fixed-assets', 'view-help',
      'newClientModal', 'newSupplierModal', 'newEmployeeModal',
      'newAssetModal'
    ];
    checks.forEach(c => {
      console.log(`- ${c}:`, body.includes(c) ? 'PRESENT' : 'MISSING');
    });
  });
});
