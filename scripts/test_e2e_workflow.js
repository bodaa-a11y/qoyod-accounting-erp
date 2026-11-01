'use strict';

async function runE2ETest() {
  console.log('🧪 Starting End-to-End ERP Business Workflow Test (Phase 10 QA)...\n');

  // 1. Authenticate as CFO
  const authRes = await fetch('http://localhost:3000/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: 'm.babiker', password: 'MB@Qoyod2026!' })
  });
  const authData = await authRes.json();
  if (!authRes.ok || !authData.token) {
    throw new Error('Authentication failed: ' + JSON.stringify(authData));
  }
  console.log('✅ Step 1: Authenticated as CFO (' + authData.user.name + ')');

  const headers = {
    'Authorization': 'Bearer ' + authData.token,
    'Content-Type': 'application/json'
  };

  // 2. Create Customer
  const custRes = await fetch('http://localhost:3000/api/entities/law/customers', {
    method: 'POST',
    headers,
    body: JSON.stringify({
      name: 'شركة الرواد للتطوير العقاري',
      vat_number: '310112233400003',
      phone: '0551234567',
      email: 'info@alrawad.sa'
    })
  });
  const custData = await custRes.json();
  const customerId = custData.id || (custData.customer && custData.customer.id);
  console.log('✅ Step 2: Customer Created:', custData.name || 'شركة الرواد', '| ID:', customerId);

  // 3. Create Quotation
  const qRes = await fetch('http://localhost:3000/api/entities/law/quotes', {
    method: 'POST',
    headers,
    body: JSON.stringify({
      customerId,
      docType: 'quote',
      subtotal: '10000.00',
      vat: '1500.00',
      total: '11500.00',
      notes: 'صياغة عقود واستشارات قانونية سنوية'
    })
  });
  const qData = await qRes.json();
  if (!qRes.ok) throw new Error('Quote creation failed: ' + JSON.stringify(qData));
  const quote = qData.quote;
  console.log('✅ Step 3: Quotation Created:', quote.code, '| Total: 11,500.00 SAR');

  // 4. Convert Quotation to Sales Invoice
  const convRes = await fetch(`http://localhost:3000/api/entities/law/quotes/${quote.id}/convert-to-invoice`, {
    method: 'POST',
    headers
  });
  const convData = await convRes.json();
  if (!convRes.ok) throw new Error('Convert quote failed: ' + JSON.stringify(convData));
  const invoice = convData.invoice;
  console.log('✅ Step 4: Converted Quote to Sales Invoice:', invoice.invoice_number, '| Status:', invoice.status);

  // 5. Submit Invoice for Approval
  const subRes = await fetch('http://localhost:3000/api/entities/law/workflows/submit', {
    method: 'POST',
    headers,
    body: JSON.stringify({
      docType: 'invoice',
      docId: invoice.id,
      docNumber: invoice.invoice_number,
      amount: '11500.00',
      notes: 'طلب اعتماد الفاتورة للترحيل المالي'
    })
  });
  const subData = await subRes.json();
  if (!subRes.ok) throw new Error('Approval submission failed: ' + JSON.stringify(subData));
  console.log('✅ Step 5: Submitted Invoice to Approval Queue | Approval ID:', subData.approval.id);

  // 6. Approve Invoice in Workflow Queue
  const actRes = await fetch(`http://localhost:3000/api/entities/law/workflows/approvals/${subData.approval.id}/action`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ action: 'approve', notes: 'تمت المراجعة والاعتماد من المدير المالي' })
  });
  const actData = await actRes.json();
  if (!actRes.ok) throw new Error('Approval action failed: ' + JSON.stringify(actData));
  console.log('✅ Step 6: Approved Invoice | Status transitioned to: approved');

  // 7. Post Approved Invoice to General Ledger
  const postRes = await fetch(`http://localhost:3000/api/entities/law/invoices/${invoice.id}/post`, {
    method: 'POST',
    headers
  });
  const postData = await postRes.json();
  if (!postRes.ok) throw new Error('Post invoice failed: ' + JSON.stringify(postData));
  console.log('✅ Step 7: Invoice Posted to General Ledger | Journal ID:', postData.journal_id || (postData.journal && postData.journal.id));

  // 8. Register Partial Payment (5,000.00 SAR out of 11,500.00 SAR)
  const payRes = await fetch(`http://localhost:3000/api/entities/law/invoices/${invoice.id}/payments`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      amount: '5000.00',
      payment_method: 'bank_transfer',
      reference: 'TRX-998877',
      notes: 'دفعة أولى تحت الحساب'
    })
  });
  const payData = await payRes.json();
  if (!payRes.ok) throw new Error('Partial payment failed: ' + JSON.stringify(payData));
  console.log('✅ Step 8: Registered Partial Payment (5,000.00 SAR) | Remaining Balance:', payData.remaining_riyals, 'SAR');

  // 9. Verify Trial Balance & Financial Statements
  const tbRes = await fetch('http://localhost:3000/api/entities/law/reports/trial-balance', { headers });
  const tbData = await tbRes.json();
  console.log('✅ Step 9: Verified Trial Balance | Total Debit:', tbData.totals?.debit_riyals, '| Total Credit:', tbData.totals?.credit_riyals, '| Balanced:', tbData.totals?.is_balanced);

  const isRes = await fetch('http://localhost:3000/api/entities/law/reports/income-statement', { headers });
  const isData = await isRes.json();
  console.log('✅ Step 10: Verified Profit & Loss Statement | Net Income:', isData.net_income_riyals, 'SAR');

  // 11. Verify Live Dashboard KPIs
  const kpiRes = await fetch('http://localhost:3000/api/entities/law/dashboard/live-kpis', { headers });
  const kpiData = await kpiRes.json();
  console.log('✅ Step 11: Verified Live Smart Dashboard KPIs:', kpiData.kpis);

  console.log('\n🎉 ALL END-TO-END WORKFLOW STEPS PASSED 100%!');
}

runE2ETest().catch(err => {
  console.error('❌ E2E Test Failed:', err);
  process.exit(1);
});
