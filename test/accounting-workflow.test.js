/**
 * Page-Level Accounting Workflow & Financial Controls — Automated Acceptance Test Suite
 * Covers all 17 mandatory acceptance scenarios from Section 11:
 *  1. Journal entry with Customer Receivable account requires Customer; succeeds when linked.
 *  2. Journal entry with Supplier Payable account requires Supplier; succeeds when linked.
 *  3. Journal entry with general Expense/Bank account works without requiring a party.
 *  4. Unbalanced journal entry fails to post.
 *  5. Sales invoice with a single revenue account posts balanced journal.
 *  6. Sales invoice with multiple revenue accounts posts separate revenue credit lines.
 *  7. Sales invoice with VAT Exclusive (1,000 -> Net 1,000, VAT 150, Total 1,150).
 *  8. Sales invoice with VAT Inclusive (1,150 -> Net 1,000, VAT 150, Total 1,150, no double VAT).
 *  9. Purchase invoice with Inventory Asset account posts Dr Inventory, Dr Input VAT, Cr Supplier Payable.
 * 10. Purchase invoice with Expense account posts Dr Expense, Dr Input VAT, Cr Supplier Payable.
 * 11. Purchase invoice with VAT Exclusive (1,000 -> Net 1,000, VAT 150, Total 1,150).
 * 12. Purchase invoice with VAT Inclusive (1,150 -> Net 1,000, VAT 150, Total 1,150).
 * 13. Customer receipt reduces customer balance and updates Customer Statement.
 * 14. Supplier payment reduces supplier balance and updates Supplier Statement.
 * 15. General Ledger shows Party Name, Source Document Reference, and Running Balance.
 * 16. Customer Statement matches Customer Receivable ledger balance.
 * 17. Supplier Statement matches Supplier Payable ledger balance.
 */

const test = require('node:test');
const assert = require('node:assert/strict');

const {
  calculateInvoice,
  validateJournalEntry,
  validateInvoicePayload,
  validatePurchaseInvoicePayload,
  buildSalesInvoiceJournal,
  buildPurchaseInvoiceJournal,
  computeGeneralLedger,
  computePartyStatement
} = require('../public/js/invoice-utils.js');

const {
  createStateInvoice,
  recordInvoiceReceipt,
  recalculatePartyBalances
} = require('../src/state-invoices.js');

function createFixtureContext() {
  return {
    chartOfAccounts: [
      { code: '110101', name: 'النقدية بالصندوق الرئيسي', type: 'asset', subType: 'cash' },
      { code: '110201', name: 'البنك الأهلي السعودي (SNB)', type: 'asset', subType: 'bank' },
      { code: '110301', name: 'حساب العملاء (الذمم المدينة)', type: 'asset', subType: 'receivable', requiresParty: true, requiredPartyType: 'customer' },
      { code: '110401', name: 'مخزون البضاعة الجاهزة', type: 'asset', subType: 'inventory' },
      { code: '110501', name: 'ضريبة القيمة المضافة للمشتريات (مدخلات)', type: 'asset', subType: 'vat_input' },
      { code: '210101', name: 'حساب الموردين (الذمم الدائنة)', type: 'liability', subType: 'payable', requiresParty: true, requiredPartyType: 'supplier' },
      { code: '210201', name: 'ضريبة القيمة المضافة للمبيعات (مخرجات)', type: 'liability', subType: 'vat_output' },
      { code: '410101', name: 'إيرادات المبيعات والخدمات الرئيسية', type: 'revenue', subType: 'operating_revenue' },
      { code: '410201', name: 'إيرادات الخدمات الاستشارية', type: 'revenue', subType: 'service_revenue' },
      { code: '510101', name: 'تكلفة البضاعة المباعة (COGS)', type: 'expense', subType: 'cogs' },
      { code: '520102', name: 'مصروف الإيجارات والمقرات', type: 'expense', subType: 'operating_expense' }
    ],
    customers: [
      { id: 'CUST-001', name: 'شركة المدار التقنية', vat: '300112233400003', arAccount: '110301', defaultRevenueAccount: '410101', openingBalance: 0, balance: 0 }
    ],
    suppliers: [
      { id: 'SUP-001', name: 'مؤسسة التوريد الحديثة', vat: '310998877600003', apAccount: '210101', defaultExpenseAccount: '110401', openingBalance: 0, balance: 0 }
    ],
    employees: [
      { id: 'EMP-001', name: 'أحمد العتيبي' }
    ],
    products: [
      { id: 'PROD-001', sku: 'SKU-01', name: 'رخصة نظام سحابي', price: 1000, cost: 400, stock: 25, salesRevenueAccount: '410101', purchaseExpenseAccount: '110401', cogsAccount: '510101', vatTreatment: 'standard' },
      { id: 'PROD-002', sku: 'SKU-02', name: 'استشارات مالية', price: 500, cost: 0, stock: 99, salesRevenueAccount: '410201', purchaseExpenseAccount: '520102', cogsAccount: '510101', vatTreatment: 'standard' }
    ],
    invoices: [],
    purchaseInvoices: [],
    journals: [],
    payments: [],
    counters: {}
  };
}

test('1. Journal entry with Customer Receivable account requires Customer and succeeds when linked', () => {
  const ctx = createFixtureContext();

  // Without customer -> fails
  const missingCustomer = validateJournalEntry({
    date: '2026-11-02',
    desc: 'قيد مبيعات يدوي بدون عميل',
    lines: [
      { accountCode: '110301', debit: 1150, credit: 0 },
      { accountCode: '410101', debit: 0, credit: 1000 },
      { accountCode: '210201', debit: 0, credit: 150 }
    ]
  }, ctx);
  assert.equal(missingCustomer.valid, false);
  assert.match(missingCustomer.error, /يتطلب تحديد عميل مرتبط/);

  // With valid customer -> succeeds
  const withCustomer = validateJournalEntry({
    date: '2026-11-02',
    desc: 'قيد مبيعات يدوي مرتبط بعميل',
    lines: [
      { accountCode: '110301', debit: 1150, credit: 0, partyType: 'customer', partyId: 'CUST-001' },
      { accountCode: '410101', debit: 0, credit: 1000 },
      { accountCode: '210201', debit: 0, credit: 150 }
    ]
  }, ctx);
  assert.equal(withCustomer.valid, true);
  assert.equal(withCustomer.totalDebit, 1150);
  assert.equal(withCustomer.totalCredit, 1150);
  assert.equal(withCustomer.normalizedLines[0].partyName, 'شركة المدار التقنية');
});

test('2. Journal entry with Supplier Payable account requires Supplier and succeeds when linked', () => {
  const ctx = createFixtureContext();

  // Without supplier -> fails
  const missingSupplier = validateJournalEntry({
    date: '2026-11-02',
    desc: 'قيد مشتريات يدوي بدون مورد',
    lines: [
      { accountCode: '110401', debit: 1000, credit: 0 },
      { accountCode: '110501', debit: 150, credit: 0 },
      { accountCode: '210101', debit: 0, credit: 1150 }
    ]
  }, ctx);
  assert.equal(missingSupplier.valid, false);
  assert.match(missingSupplier.error, /يتطلب تحديد مورد مرتبط/);

  // With valid supplier -> succeeds
  const withSupplier = validateJournalEntry({
    date: '2026-11-02',
    desc: 'قيد مشتريات يدوي مرتبط بمورد',
    lines: [
      { accountCode: '110401', debit: 1000, credit: 0 },
      { accountCode: '110501', debit: 150, credit: 0 },
      { accountCode: '210101', debit: 0, credit: 1150, partyType: 'supplier', partyId: 'SUP-001' }
    ]
  }, ctx);
  assert.equal(withSupplier.valid, true);
  assert.equal(withSupplier.normalizedLines[2].partyName, 'مؤسسة التوريد الحديثة');
});

test('3. Journal entry with general Expense / Bank account works without requiring a party', () => {
  const ctx = createFixtureContext();
  const generalEntry = validateJournalEntry({
    date: '2026-11-02',
    desc: 'سداد إيجار المقر عن طريق البنك',
    lines: [
      { accountCode: '520102', debit: 5000, credit: 0, costCenter: 'CC-MAIN' },
      { accountCode: '110201', debit: 0, credit: 5000, costCenter: 'CC-MAIN' }
    ]
  }, ctx);
  assert.equal(generalEntry.valid, true);
  assert.equal(generalEntry.totalDebit, 5000);
  assert.equal(generalEntry.totalCredit, 5000);
});

test('4. Unbalanced journal entry fails to post', () => {
  const ctx = createFixtureContext();
  const unbalanced = validateJournalEntry({
    date: '2026-11-02',
    desc: 'قيد غير متوازن',
    lines: [
      { accountCode: '520102', debit: 1200, credit: 0 },
      { accountCode: '110201', debit: 0, credit: 1000 }
    ]
  }, ctx);
  assert.equal(unbalanced.valid, false);
  assert.match(unbalanced.error, /القيد غير متوازن/);
});

test('5. Sales invoice with a single revenue account posts balanced journal linked to customer', () => {
  const ctx = createFixtureContext();
  const invValidation = validateInvoicePayload({
    customerId: 'CUST-001',
    receivableAccount: '110301',
    taxMode: 'exclusive',
    items: [
      { productId: 'PROD-001', name: 'رخصة نظام سحابي', qty: 1, price: 1000, discount: 0, taxCategory: 'standard', revenueAccount: '410101' }
    ]
  }, ctx);

  assert.equal(invValidation.valid, true);
  const journal = buildSalesInvoiceJournal({
    id: 'INV-1001',
    date: '2026-11-02',
    customerId: 'CUST-001',
    customerName: invValidation.customer.name,
    receivableAccount: '110301',
    calc: invValidation.calc
  }, ctx);

  const jCheck = validateJournalEntry(journal, ctx);
  assert.equal(jCheck.valid, true);
  assert.equal(jCheck.totalDebit, 1150);
  assert.equal(jCheck.totalCredit, 1150);

  const arLine = journal.lines.find((l) => l.accountCode === '110301');
  const revLine = journal.lines.find((l) => l.accountCode === '410101');
  const vatLine = journal.lines.find((l) => l.accountCode === '210201');
  assert.equal(arLine.debit, 1150);
  assert.equal(arLine.partyId, 'CUST-001');
  assert.equal(revLine.credit, 1000);
  assert.equal(vatLine.credit, 150);
});

test('6. Sales invoice with multiple revenue accounts posts separate revenue credit lines', () => {
  const ctx = createFixtureContext();
  const invValidation = validateInvoicePayload({
    customerId: 'CUST-001',
    receivableAccount: '110301',
    taxMode: 'exclusive',
    items: [
      { productId: 'PROD-001', name: 'رخصة نظام سحابي', qty: 1, price: 1000, taxCategory: 'standard', revenueAccount: '410101' },
      { productId: 'PROD-002', name: 'استشارات مالية', qty: 2, price: 500, taxCategory: 'standard', revenueAccount: '410201' }
    ]
  }, ctx);

  assert.equal(invValidation.valid, true);
  assert.equal(invValidation.calc.subtotal, 2000);
  assert.equal(invValidation.calc.vat, 300);
  assert.equal(invValidation.calc.total, 2300);

  const journal = buildSalesInvoiceJournal({
    id: 'INV-1002',
    date: '2026-11-02',
    customerId: 'CUST-001',
    customerName: invValidation.customer.name,
    receivableAccount: '110301',
    calc: invValidation.calc
  }, ctx);

  const rev1 = journal.lines.find((l) => l.accountCode === '410101');
  const rev2 = journal.lines.find((l) => l.accountCode === '410201');
  const vatLine = journal.lines.find((l) => l.accountCode === '210201');
  assert.equal(rev1.credit, 1000);
  assert.equal(rev2.credit, 1000);
  assert.equal(vatLine.credit, 300);
});

test('7 & 8. Sales invoice VAT Exclusive vs VAT Inclusive calculations (never double-counts VAT)', () => {
  // 7. VAT Exclusive: 1,000 -> Net 1,000, VAT 150, Total 1,150
  const exclusiveCalc = calculateInvoice(
    [{ name: 'خدمة', qty: 1, price: 1000, discount: 0, taxCategory: 'standard', revenueAccount: '410101' }],
    { taxMode: 'exclusive' }
  );
  assert.equal(exclusiveCalc.subtotal, 1000);
  assert.equal(exclusiveCalc.vat, 150);
  assert.equal(exclusiveCalc.total, 1150);

  // 8. VAT Inclusive: 1,150 -> Net 1,000, VAT 150, Total 1,150
  const inclusiveCalc = calculateInvoice(
    [{ name: 'خدمة شاملة الضريبة', qty: 1, price: 1150, discount: 0, taxCategory: 'standard', revenueAccount: '410101' }],
    { taxMode: 'inclusive' }
  );
  assert.equal(inclusiveCalc.subtotal, 1000);
  assert.equal(inclusiveCalc.vat, 150);
  assert.equal(inclusiveCalc.total, 1150);
  assert.equal(inclusiveCalc.subtotal + inclusiveCalc.vat, inclusiveCalc.total);
});

test('9 & 10. Purchase invoice with Inventory Asset account and Expense account posts balanced journals linked to Supplier', () => {
  const ctx = createFixtureContext();

  // 9. Inventory Asset account (110401)
  const invPurchase = validatePurchaseInvoicePayload({
    supplierId: 'SUP-001',
    payableAccount: '210101',
    recoverableVatAccount: '110501',
    taxMode: 'exclusive',
    items: [
      { productId: 'PROD-001', name: 'توريد بضاعة للمخزون', qty: 1, price: 1000, taxCategory: 'standard', expenseAccount: '110401' }
    ]
  }, ctx);
  assert.equal(invPurchase.valid, true);
  const jInv = buildPurchaseInvoiceJournal({
    id: 'PUR-2001',
    date: '2026-11-02',
    supplierId: 'SUP-001',
    supplierName: invPurchase.supplier.name,
    payableAccount: '210101',
    recoverableVatAccount: '110501',
    calc: invPurchase.calc
  }, ctx);
  assert.equal(jInv.lines.find((l) => l.accountCode === '110401').debit, 1000);
  assert.equal(jInv.lines.find((l) => l.accountCode === '110501').debit, 150);
  assert.equal(jInv.lines.find((l) => l.accountCode === '210101').credit, 1150);
  assert.equal(jInv.lines.find((l) => l.accountCode === '210101').partyId, 'SUP-001');

  // 10. Expense account (520102)
  const expPurchase = validatePurchaseInvoicePayload({
    supplierId: 'SUP-001',
    payableAccount: '210101',
    recoverableVatAccount: '110501',
    taxMode: 'exclusive',
    items: [
      { name: 'صيانة مكتبية', qty: 1, price: 2000, taxCategory: 'standard', expenseAccount: '520102' }
    ]
  }, ctx);
  assert.equal(expPurchase.valid, true);
  const jExp = buildPurchaseInvoiceJournal({
    id: 'PUR-2002',
    date: '2026-11-02',
    supplierId: 'SUP-001',
    supplierName: expPurchase.supplier.name,
    payableAccount: '210101',
    recoverableVatAccount: '110501',
    calc: expPurchase.calc
  }, ctx);
  assert.equal(jExp.lines.find((l) => l.accountCode === '520102').debit, 2000);
  assert.equal(jExp.lines.find((l) => l.accountCode === '110501').debit, 300);
  assert.equal(jExp.lines.find((l) => l.accountCode === '210101').credit, 2300);
});

test('11 & 12. Purchase invoice VAT Exclusive vs VAT Inclusive calculations', () => {
  const ctx = createFixtureContext();

  // 11. VAT Exclusive: 1,000 -> Net 1,000, VAT 150, Total 1,150
  const purExcl = validatePurchaseInvoicePayload({
    supplierId: 'SUP-001',
    taxMode: 'exclusive',
    items: [{ name: 'مشتريات غير شاملة الضريبة', qty: 1, price: 1000, taxCategory: 'standard', expenseAccount: '110401' }]
  }, ctx);
  assert.equal(purExcl.valid, true);
  assert.equal(purExcl.calc.subtotal, 1000);
  assert.equal(purExcl.calc.vat, 150);
  assert.equal(purExcl.calc.total, 1150);

  // 12. VAT Inclusive: 1,150 -> Net 1,000, VAT 150, Total 1,150
  const purIncl = validatePurchaseInvoicePayload({
    supplierId: 'SUP-001',
    taxMode: 'inclusive',
    items: [{ name: 'مشتريات شاملة الضريبة', qty: 1, price: 1150, taxCategory: 'standard', expenseAccount: '110401' }]
  }, ctx);
  assert.equal(purIncl.valid, true);
  assert.equal(purIncl.calc.subtotal, 1000);
  assert.equal(purIncl.calc.vat, 150);
  assert.equal(purIncl.calc.total, 1150);
});

test('13, 14, 15, 16, 17. End-to-End Posting, Receipts, Payments, General Ledger & Party Statements reconciliation', async () => {
  let state = createFixtureContext();
  state.clients = state.customers;
  const seqMap = new Map();
  const mockClient = {
    async query(sql, params = []) {
      if (sql.includes('SELECT data FROM system_state')) {
        const key = params[0];
        if (key === 'main_state') return { rows: [{ data: state }] };
        if (seqMap.has(key)) return { rows: [{ data: seqMap.get(key) }] };
        return { rows: [] };
      }
      if (sql.includes('INSERT INTO system_state')) {
        if (sql.includes("'main_state'")) {
          state = params[0];
        } else {
          seqMap.set(params[0], params[1]);
        }
        return { rows: [] };
      }
      return { rows: [] };
    }
  };
  const withTransaction = async (fn) => fn(mockClient);

  // Post a credit sales invoice for CUST-001 (Total 1,150 SAR)
  const createdInv = await createStateInvoice({
    body: {
      operationId: 'op_inv_sales_0001',
      customerId: 'CUST-001',
      client: 'شركة المدار التقنية',
      payMethod: 'credit',
      taxMode: 'exclusive',
      date: '2026-11-01',
      items: [{ productId: 'PROD-001', name: 'رخصة نظام سحابي', qty: 1, price: 1000, taxCategory: 'standard', revenueAccount: '410101' }]
    },
    user: { id: 1, username: 'admin', name: 'Admin' },
    withTransaction
  });

  assert.equal(Boolean(createdInv.invoice), true);
  assert.equal(state.clients[0].balance, 1150);

  // 13. Record customer receipt of 500 SAR -> reduces customer balance to 650 SAR
  const receiptRes = await recordInvoiceReceipt({
    invoiceId: createdInv.invoice.id,
    body: { operationId: 'op_rcpt_sales_0001', amount: 500, date: '2026-11-02', method: 'تحويل بنكي' },
    user: { id: 1, username: 'admin', name: 'Admin' },
    withTransaction
  });
  assert.equal(Boolean(receiptRes.receipt), true);
  assert.equal(state.clients[0].balance, 650);

  // Post a purchase invoice for SUP-001 (Total 2,300 SAR) + Supplier Payment of 1,000 SAR
  const purValidation = validatePurchaseInvoicePayload({
    supplierId: 'SUP-001',
    taxMode: 'exclusive',
    items: [{ name: 'أجهزة ومعدات', qty: 2, price: 1000, taxCategory: 'standard', expenseAccount: '110401' }]
  }, state);
  const purJournal = buildPurchaseInvoiceJournal({
    id: 'PUR-3001',
    date: '2026-11-01',
    supplierId: 'SUP-001',
    supplierName: purValidation.supplier.name,
    payableAccount: '210101',
    recoverableVatAccount: '110501',
    calc: purValidation.calc
  }, state);
  state.journals.push(purJournal);

  // 14. Supplier payment of 1,000 SAR
  state.journals.push({
    id: 'JV-PAY-001',
    date: '2026-11-02',
    desc: 'سند صرف للمورد مؤسسة التوريد الحديثة',
    sourceDocRef: 'PAY-001',
    status: 'posted',
    lines: [
      { accountCode: '210101', account: '210101 - حساب الموردين (الذمم الدائنة)', debit: 1000, credit: 0, partyType: 'supplier', partyId: 'SUP-001', partyName: 'مؤسسة التوريد الحديثة', sourceDocRef: 'PAY-001' },
      { accountCode: '110201', account: '110201 - البنك الأهلي السعودي (SNB)', debit: 0, credit: 1000, sourceDocRef: 'PAY-001' }
    ]
  });

  recalculatePartyBalances(state);
  assert.equal(state.suppliers[0].balance, 1300);

  // 15. General Ledger shows Party Name, Source Document Reference, and Running Balance
  const arLedger = computeGeneralLedger(state, { accountCode: '110301' });
  assert.equal(arLedger.rows.length, 2);
  assert.equal(arLedger.rows[0].partyName, 'شركة المدار التقنية');
  assert.equal(arLedger.rows[0].sourceDocRef, createdInv.invoice.id);
  assert.equal(arLedger.rows[0].runningBalance, 1150);
  assert.equal(arLedger.rows[1].runningBalance, 650);
  assert.equal(arLedger.closingBalance, 650);

  // 16. Customer Statement matches Customer Receivable ledger balance
  const customerStmt = computePartyStatement(state, 'customer', 'CUST-001');
  assert.equal(customerStmt.closingBalance, arLedger.closingBalance);
  assert.equal(customerStmt.closingBalance, 650);
  assert.equal(customerStmt.totalDebit, 1150);
  assert.equal(customerStmt.totalCredit, 500);

  // 17. Supplier Statement matches Supplier Payable ledger balance
  const apLedger = computeGeneralLedger(state, { accountCode: '210101' });
  const supplierStmt = computePartyStatement(state, 'supplier', 'SUP-001');
  assert.equal(supplierStmt.closingBalance, apLedger.closingBalance);
  assert.equal(supplierStmt.closingBalance, 1300);
  assert.equal(supplierStmt.totalCredit, 2300);
  assert.equal(supplierStmt.totalDebit, 1000);
});
