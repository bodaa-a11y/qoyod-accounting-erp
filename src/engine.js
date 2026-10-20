'use strict';
const { toHalalas, toRiyals, vatOf, audit, nextDocNumber } = require('./lib');

// Helper to find an active postable account by code in entity
async function getAccountByCode(client, entityId, code) {
  const res = await client.query(
    'SELECT * FROM accounts WHERE entity_id = $1 AND code = $2',
    [entityId, code]
  );
  if (res.rows.length === 0) {
    throw new Error(`الحساب المطلوب برمز (${code}) غير موجود بالدليل`);
  }
  const acc = res.rows[0];
  if (acc.is_group) {
    throw new Error(`الحساب (${code} - ${acc.name}) حساب رئيسي تجميعي ولا يقبل ترحيل القيود المباشرة`);
  }
  if (acc.status === 'inactive') {
    throw new Error(`الحساب (${code} - ${acc.name}) موقوف ومعطل`);
  }
  return acc;
}

// 1. Double-Entry Journal Posting Engine
async function createJournal(client, entityId, { date, description, lines, source_type = 'manual', source_id = null }) {
  if (!lines || !Array.isArray(lines) || lines.length < 2) {
    throw new Error('يجب أن يحتوي القيد على طرفين على الأقل (طرف مدين وطرف دائن)');
  }

  let totalDebit = 0;
  let totalCredit = 0;
  const processedLines = [];

  for (const line of lines) {
    const accountId = line.accountId || line.account_id;
    if (!accountId) {
      throw new Error('معرف الحساب مطلوب لكل طرف من أطراف القيد');
    }

    // Verify account exists, belongs to entity, and is not a group or inactive
    const accRes = await client.query(
      'SELECT id, code, name, is_group, status FROM accounts WHERE id = $1 AND entity_id = $2',
      [accountId, entityId]
    );

    if (accRes.rows.length === 0) {
      throw new Error(`الحساب ذو المعرف (${accountId}) غير موجود في هذه المنشأة`);
    }

    const acc = accRes.rows[0];
    if (acc.is_group) {
      throw new Error(`الحساب (${acc.code} - ${acc.name}) حساب رئيسي تجميعي لا يقبل قيود اليومية`);
    }
    if (acc.status === 'inactive') {
      throw new Error(`الحساب (${acc.code} - ${acc.name}) معطل`);
    }

    const dVal = line.debit !== undefined ? (typeof line.debit === 'number' ? line.debit : toHalalas(line.debit)) : (line.debit_halalas || 0);
    const cVal = line.credit !== undefined ? (typeof line.credit === 'number' ? line.credit : toHalalas(line.credit)) : (line.credit_halalas || 0);

    const debitHalalas = dVal || 0;
    const creditHalalas = cVal || 0;

    if (debitHalalas < 0 || creditHalalas < 0) {
      throw new Error('لا يسمح بإدخال مبالغ سالبة في أطراف القيد');
    }
    if (debitHalalas === 0 && creditHalalas === 0) {
      throw new Error('يجب إدخال مبلغ مدين أو دائن أكبر من الصفر');
    }

    totalDebit += debitHalalas;
    totalCredit += creditHalalas;

    processedLines.push({
      accountId: acc.id,
      debitHalalas,
      creditHalalas,
      description: line.description || description
    });
  }

  // Strict double entry check
  if (totalDebit !== totalCredit || totalDebit <= 0) {
    throw new Error(`القيد غير متزن: إجمالي المدين (${toRiyals(totalDebit)}) لا يساوي إجمالي الدائن (${toRiyals(totalCredit)})`);
  }

  const journalNumber = await nextDocNumber(client, entityId, 'JRN');

  const jRes = await client.query(`
    INSERT INTO journals (entity_id, journal_number, date, description, status, source_type, source_id, total_halalas)
    VALUES ($1, $2, $3, $4, 'posted', $5, $6, $7)
    RETURNING *
  `, [entityId, journalNumber, date, description, source_type, source_id, totalDebit]);

  const journal = jRes.rows[0];

  for (const pl of processedLines) {
    await client.query(`
      INSERT INTO journal_lines (journal_id, account_id, debit_halalas, credit_halalas, description)
      VALUES ($1, $2, $3, $4, $5)
    `, [journal.id, pl.accountId, pl.debitHalalas, pl.creditHalalas, pl.description]);
  }

  return { ...journal, totalHalalas: totalDebit, lines: processedLines };
}

// 2. Reverse Journal Entry with Audit Trail
async function reverseJournal(client, entityId, journalId, { reason = 'تصحيح محاسبي', userId = null }) {
  const jRes = await client.query(`
    SELECT * FROM journals WHERE id = $1 AND entity_id = $2 FOR UPDATE
  `, [journalId, entityId]);

  if (jRes.rows.length === 0) {
    throw new Error('قيد اليومية غير موجود');
  }

  const original = jRes.rows[0];
  if (original.status === 'reversed') {
    throw new Error('تم عكس هذا القيد مسبقاً ولا يمكن عكسه مجدداً');
  }

  const linesRes = await client.query(`
    SELECT * FROM journal_lines WHERE journal_id = $1
  `, [journalId]);

  // Flip debits and credits
  const reversalLines = linesRes.rows.map(line => ({
    accountId: line.account_id,
    debit: line.credit_halalas,
    credit: line.debit_halalas,
    description: `عكس قيد رقم ${original.journal_number}: ${line.description || ''}`
  }));

  const today = new Date().toISOString().substring(0, 10);
  const reversalJournal = await createJournal(client, entityId, {
    date: today,
    description: `عكس القيد ${original.journal_number} - السبب: ${reason}`,
    lines: reversalLines,
    source_type: 'reversal',
    source_id: original.id
  });

  // Mark original as reversed
  await client.query(`
    UPDATE journals
    SET status = 'reversed', reversed_by_id = $1, reverse_reason = $2
    WHERE id = $3
  `, [reversalJournal.id, reason, original.id]);

  await audit(client, entityId, userId, 'JOURNAL_REVERSED', 'journals', original.id, {
    originalNumber: original.journal_number,
    reversalNumber: reversalJournal.journal_number,
    reason
  });

  return reversalJournal;
}

// 3. Post Sales Invoice (Creates AR, Revenue & VAT Posting)
async function postInvoice(client, entityId, invoiceId, userId = null) {
  const invRes = await client.query(`
    SELECT * FROM invoices WHERE id = $1 AND entity_id = $2 FOR UPDATE
  `, [invoiceId, entityId]);

  if (invRes.rows.length === 0) {
    throw new Error('الفاتورة غير موجودة');
  }

  const invoice = invRes.rows[0];
  if (invoice.status !== 'draft') {
    throw new Error(`لا يمكن ترحيل الفاتورة؛ حالتها الحالية (${invoice.status}) وليست مسودة`);
  }

  const linesRes = await client.query(`
    SELECT * FROM invoice_lines WHERE invoice_id = $1
  `, [invoiceId]);

  if (linesRes.rows.length === 0) {
    throw new Error('لا يمكن ترحيل فاتورة فارغة بدون بنود');
  }

  // Mandatory Correction 3:
  // In postInvoice, change defaultAccountId(client, entityId, '1103') to '110301'
  const receivableAccount = await getAccountByCode(client, entityId, '110301');

  // Output VAT account 210201 if VAT > 0
  let vatAccount = null;
  if (invoice.vat_halalas > 0) {
    vatAccount = await getAccountByCode(client, entityId, '210201');
  }

  const journalLines = [];

  // Debit: Accounts Receivable for the grand total
  journalLines.push({
    accountId: receivableAccount.id,
    debit: invoice.total_halalas,
    credit: 0,
    description: `استحقاق فاتورة مبيعات رقم ${invoice.invoice_number}`
  });

  // Credit: Revenue per line item
  for (const line of linesRes.rows) {
    journalLines.push({
      accountId: line.revenue_account_id,
      debit: 0,
      credit: line.subtotal_halalas,
      description: `إيراد بند: ${line.description}`
    });
  }

  // Credit: Output VAT
  if (invoice.vat_halalas > 0 && vatAccount) {
    journalLines.push({
      accountId: vatAccount.id,
      debit: 0,
      credit: invoice.vat_halalas,
      description: `ضريبة القيمة المضافة المستحقة (15%) لفاتورة ${invoice.invoice_number}`
    });
  }

  // Post Journal
  const journal = await createJournal(client, entityId, {
    date: invoice.issue_date,
    description: `ترحيل فاتورة مبيعات رقم ${invoice.invoice_number}`,
    lines: journalLines,
    source_type: 'invoice',
    source_id: invoice.id
  });

  // Update Invoice
  await client.query(`
    UPDATE invoices
    SET status = 'posted', journal_id = $1, updated_at = now()
    WHERE id = $2
  `, [journal.id, invoice.id]);

  await audit(client, entityId, userId, 'INVOICE_POSTED', 'invoices', invoice.id, {
    invoiceNumber: invoice.invoice_number,
    totalHalalas: invoice.total_halalas,
    journalId: journal.id
  });

  return { invoice: { ...invoice, status: 'posted', journal_id: journal.id }, journal };
}

// 4. Post Receipt Voucher
async function postReceipt(client, entityId, receiptId, userId = null) {
  const rcRes = await client.query(`
    SELECT * FROM receipts WHERE id = $1 AND entity_id = $2 FOR UPDATE
  `, [receiptId, entityId]);

  if (rcRes.rows.length === 0) {
    throw new Error('سند القبض غير موجود');
  }

  const receipt = rcRes.rows[0];
  const invRes = await client.query(`
    SELECT * FROM invoices WHERE id = $1 AND entity_id = $2 FOR UPDATE
  `, [receipt.invoice_id, entityId]);

  if (invRes.rows.length === 0) {
    throw new Error('الفاتورة المرتبطة بالسند غير موجودة');
  }

  const invoice = invRes.rows[0];
  if (invoice.status !== 'posted') {
    throw new Error('يجب ترحيل الفاتورة أولاً قبل تسجيل سداد عليها');
  }

  const currentPaid = Number(invoice.paid_halalas) || 0;
  const newTotalPaid = currentPaid + Number(receipt.amount_halalas);

  if (newTotalPaid > Number(invoice.total_halalas)) {
    throw new Error('المبلغ المحصل يتجاوز الرصيد المتبقي على الفاتورة');
  }

  // Mandatory Correction 3: Receivable account is 110301
  const receivableAccount = await getAccountByCode(client, entityId, '110301');

  // Cash / Bank Account
  const cashAccRes = await client.query(
    'SELECT id, code, name, is_group, status FROM accounts WHERE id = $1 AND entity_id = $2',
    [receipt.cash_account_id, entityId]
  );
  if (cashAccRes.rows.length === 0) {
    throw new Error('حساب الصندوق / البنك غير موجود');
  }
  const cashAcc = cashAccRes.rows[0];
  if (cashAcc.is_group || cashAcc.status === 'inactive') {
    throw new Error('لا يمكن الإيداع في حساب تجميعي أو معطل');
  }

  // Journal: Debit Cash, Credit Receivable
  const today = new Date().toISOString().substring(0, 10);
  const journal = await createJournal(client, entityId, {
    date: today,
    description: `سند قبض رقم ${receipt.receipt_number} سداداً للفاتورة ${invoice.invoice_number}`,
    lines: [
      {
        accountId: cashAcc.id,
        debit: receipt.amount_halalas,
        credit: 0,
        description: `إيداع نقدي / بنكي (${cashAcc.name})`
      },
      {
        accountId: receivableAccount.id,
        debit: 0,
        credit: receipt.amount_halalas,
        description: `تسوية ذمة العميل عن الفاتورة ${invoice.invoice_number}`
      }
    ],
    source_type: 'receipt',
    source_id: receipt.id
  });

  // Update Invoice Paid Amount and Status
  const isFullyPaid = newTotalPaid >= Number(invoice.total_halalas);
  const newStatus = isFullyPaid ? 'paid' : 'posted';

  await client.query(`
    UPDATE invoices
    SET paid_halalas = $1, status = $2, updated_at = now()
    WHERE id = $3
  `, [newTotalPaid, newStatus, invoice.id]);

  await client.query(`
    UPDATE receipts
    SET journal_id = $1
    WHERE id = $2
  `, [journal.id, receipt.id]);

  await audit(client, entityId, userId, 'RECEIPT_POSTED', 'receipts', receipt.id, {
    receiptNumber: receipt.receipt_number,
    amountHalalas: receipt.amount_halalas,
    invoiceId: invoice.id,
    newInvoiceStatus: newStatus
  });

  return { receipt: { ...receipt, journal_id: journal.id }, invoiceStatus: newStatus, journal };
}

module.exports = {
  createJournal,
  reverseJournal,
  postInvoice,
  postReceipt,
  getAccountByCode
};
