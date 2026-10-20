const http = require('http');

const PORT = 3000;
const BASE_URL = `http://localhost:${PORT}`;

function request(method, path, body = null) {
  return new Promise((resolve, reject) => {
    const url = new URL(path, BASE_URL);
    const options = {
      method,
      hostname: url.hostname,
      port: url.port,
      path: url.pathname + url.search,
      headers: {
        'Content-Type': 'application/json'
      }
    };

    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const json = JSON.parse(data);
          resolve({ status: res.statusCode, body: json });
        } catch (e) {
          resolve({ status: res.statusCode, body: data });
        }
      });
    });

    req.on('error', reject);
    if (body) {
      req.write(JSON.stringify(body));
    }
    req.end();
  });
}

async function runTests() {
  console.log('====================================================');
  console.log('   🧪 Qoyod Accounting ERP - Test Suite');
  console.log('   Chart of Accounts & Double-Entry Accounting Engine');
  console.log('====================================================\n');

  let passed = 0;
  let failed = 0;

  function assert(condition, testName, details = '') {
    if (condition) {
      console.log(` ✅ PASS: ${testName}`);
      passed++;
    } else {
      console.error(` ❌ FAIL: ${testName} - ${details}`);
      failed++;
    }
  }

  try {
    // 1. Check Accounts List
    const resAccounts = await request('GET', '/api/accounts');
    assert(resAccounts.status === 200, 'GET /api/accounts returns HTTP 200');
    const accounts = resAccounts.body.accounts || resAccounts.body;
    assert(Array.isArray(accounts) && accounts.length >= 50, 'Chart of Accounts initialized with standard accounts (count >= 50)', `Count: ${accounts.length}`);

    // Verify 5 main roots exist
    const roots = accounts.filter(a => !a.parentId);
    const rootCodes = roots.map(r => r.code);
    assert(rootCodes.includes('1') && rootCodes.includes('2') && rootCodes.includes('3') && rootCodes.includes('4') && rootCodes.includes('5'),
      'All 5 Core Accounting Root Classes Exist (1-Assets, 2-Liabilities, 3-Equity, 4-Revenue, 5-Expenses)');

    // 2. Test Duplicate Code Rejection
    const dupRes = await request('POST', '/api/accounts', {
      code: '110101', // existing cash code
      name: 'صندوق مكرر',
      type: 'asset',
      parentId: 'acc_1101',
      nature: 'debit',
      isGroup: false
    });
    assert(dupRes.status === 400 && dupRes.body.error && dupRes.body.error.includes('مسجل بالفعل'),
      'Backend Validation: Duplicate Account Code rejected with 400 error', JSON.stringify(dupRes.body));

    // 3. Test Invalid Parent Rejection
    const invalidParentRes = await request('POST', '/api/accounts', {
      code: '999999',
      name: 'حساب يتيم',
      type: 'asset',
      parentId: 'non_existent_parent_id',
      nature: 'debit',
      isGroup: false
    });
    assert(invalidParentRes.status === 400, 'Backend Validation: Non-existent parent account rejected with 400 error');

    // 4. Test Valid Account Creation
    const createRes = await request('POST', '/api/accounts', {
      code: '110209',
      name: 'حساب بنك تجريبي جديد',
      nameEn: 'Test Bank Account',
      type: 'asset',
      parentId: 'acc_1102',
      nature: 'debit',
      isGroup: false,
      entity: 'all',
      description: 'حساب بنكي تجريبي لاختبار دورة حياة الحساب'
    });
    assert(createRes.status === 201 && createRes.body.account && createRes.body.account.code === '110209',
      'Account Creation: New account created successfully with 201 Created');
    const createdAccountId = createRes.body.account ? createRes.body.account.id : null;

    // 5. Test Circular Hierarchy Prevention in PUT
    const circularRes = await request('PUT', `/api/accounts/acc_1`, {
      parentId: 'acc_11' // cannot set root's parent to its own child!
    });
    assert(circularRes.status === 400 && circularRes.body.error && (circularRes.body.error.includes('دائرية') || circularRes.body.error.includes('تسلسل')),
      'Accounting Integrity: Circular parentage hierarchy prevented in account update');

    // 6. Test Root Account Deletion Protection
    const deleteRootRes = await request('DELETE', '/api/accounts/acc_1');
    assert(deleteRootRes.status === 400, 'Accounting Protection: Deletion of root accounts is strictly forbidden');

    // 7. Test Account with Children Deletion Protection
    const deleteParentRes = await request('DELETE', '/api/accounts/acc_1102'); // has children
    assert(deleteParentRes.status === 400 && deleteParentRes.body.error && deleteParentRes.body.error.includes('حسابات فرعية'),
      'Accounting Protection: Deletion of parent accounts with active children is blocked');

    // 8. Test Journal Posting & Ledger Balance
    // Fetch full state to preserve accounts
    const stateGet = await request('GET', '/api/state');
    const fullState = stateGet.body;
    fullState.journals = fullState.journals || [];

    const journalDate = new Date().toISOString().substring(0, 10);
    const testAmount = 5000.00;
    fullState.journals.push({
      id: 'JRN-TEST-001',
      date: journalDate,
      entity: 'law',
      desc: 'إيداع أتعاب قضية في الحساب التجريبي',
      debit: '110209 - حساب بنك تجريبي جديد',
      credit: '410101 - إيرادات أتعاب القضايا والاستشارات (شركة المحاماة)',
      amount: testAmount,
      status: 'متزن'
    });

    const journalRes = await request('POST', '/api/state', fullState);
    assert(journalRes.status === 200, 'Journal Posting: Double-entry balanced transaction posted to /api/state');

    // 9. Test Deletion Protection for Account with Journal Postings
    const deleteWithJournalRes = await request('DELETE', `/api/accounts/${createdAccountId}`);
    assert(deleteWithJournalRes.status === 400 && deleteWithJournalRes.body.error && deleteWithJournalRes.body.error.includes('قيود وحركات'),
      'Accounting Protection: Cannot delete account linked to journal entries (suggests deactivation)');

    // 10. Clean up test journal & test account
    fullState.journals = fullState.journals.filter(j => j.id !== 'JRN-TEST-001');
    await request('POST', '/api/state', fullState);
    const cleanDeleteRes = await request('DELETE', `/api/accounts/${createdAccountId}`);
    assert(cleanDeleteRes.status === 200, 'Account Deletion: Successfully deleted clean test account after journals cleared');

    // Summary
    console.log('\n----------------------------------------------------');
    console.log(` Total Tests: ${passed + failed} | Passed: ${passed} | Failed: ${failed}`);
    if (failed === 0) {
      console.log(' 🎉 ALL ACCOUNTING MODULE TESTS PASSED WITH 100% SUCCESS!');
    } else {
      console.log(' ⚠️ Some tests failed, check details above.');
    }
    console.log('----------------------------------------------------\n');

  } catch (err) {
    console.error('Fatal Test Execution Error:', err);
  }
}

runTests();
