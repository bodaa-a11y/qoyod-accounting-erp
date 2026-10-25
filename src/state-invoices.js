'use strict';

const { calculateInvoice, toHalalas } = require('../public/js/invoice-utils');

const DOC_TYPES = {
  tax_invoice: { prefix: 'INV', posted: true },
  simplified: { prefix: 'INV', posted: true },
  quote: { prefix: 'QUO', posted: false },
  proforma: { prefix: 'PRO', posted: false }
};
const REVENUE_ACCOUNTS = {
  law: '410101 - إيرادات أتعاب القضايا والاستشارات',
  restaurant: '410102 - إيرادات مبيعات الوجبات والطلبات',
  farm: '410103 - إيرادات مبيعات التمور والمحاصيل',
  barber: '410104 - إيرادات خدمات الحلاقة والعناية',
  home: '410105 - إيرادات مبيعات وخدمات عامة أخرى'
};

function text(value, label, max = 300, required = false) {
  const result = String(value ?? '').trim();
  if ((required && !result) || result.length > max) {
    const error = new Error(required ? `${label} مطلوب` : `${label} يتجاوز الحد المسموح`);
    error.status = 400;
    throw error;
  }
  return result;
}

function isoDate(value, label) {
  const result = text(value, label, 10, true);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(result) || Number.isNaN(Date.parse(`${result}T00:00:00Z`))) {
    const error = new Error(`${label} غير صالح`);
    error.status = 400;
    throw error;
  }
  return result;
}

async function nextNumber(client, docType, entity, date) {
  const year = Number(String(date).slice(0, 4)) || new Date().getUTCFullYear();
  const key = `document-sequence:${docType}:${entity}:${year}`;
  const found = await client.query('SELECT data FROM system_state WHERE key = $1 FOR UPDATE', [key]);
  const value = found.rows.length ? (Number(found.rows[0].data.value) || 0) + 1 : 1;
  await client.query(`
    INSERT INTO system_state (key, data, updated_at) VALUES ($1, $2, now())
    ON CONFLICT (key) DO UPDATE SET data = EXCLUDED.data, updated_at = now()
  `, [key, { value }]);
  return `${docType}-${year}-${String(value).padStart(4, '0')}`;
}

function journal(id, date, entity, desc, lines, sourceId) {
  const debit = lines.reduce((sum, line) => sum + line.debit, 0);
  const credit = lines.reduce((sum, line) => sum + line.credit, 0);
  if (Math.round(debit * 100) !== Math.round(credit * 100) || debit <= 0) {
    const error = new Error('فشل التحقق من توازن القيد المحاسبي');
    error.status = 500;
    throw error;
  }
  return {
    id, date, entity, desc, lines, amount: debit, status: 'متزن',
    sourceId, posted: true,
    debit: lines.length === 2 ? lines.find(line => line.debit > 0)?.account : `${lines.length} حسابات`,
    credit: lines.length === 2 ? lines.find(line => line.credit > 0)?.account : `${lines.length} حسابات`
  };
}

async function createStateInvoice({ body, user, withTransaction }) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    const error = new Error('بيانات الفاتورة غير صالحة');
    error.status = 400;
    throw error;
  }
  const operationId = text(body.operationId, 'معرّف العملية', 80, true);
  if (!/^[a-zA-Z0-9_-]{8,80}$/.test(operationId)) {
    const error = new Error('معرّف العملية غير صالح');
    error.status = 400;
    throw error;
  }
  const docType = text(body.docType || 'tax_invoice', 'نوع الوثيقة', 30, true);
  const type = DOC_TYPES[docType];
  if (!type) {
    const error = new Error('نوع الوثيقة غير مدعوم');
    error.status = 400;
    throw error;
  }
  const entity = text(body.entity, 'المنشأة', 50, true);
  const date = isoDate(body.date, 'تاريخ الإصدار');
  const dueDate = isoDate(body.dueDate || body.date, 'تاريخ الاستحقاق');
  if (dueDate < date) {
    const error = new Error('تاريخ الاستحقاق لا يمكن أن يسبق تاريخ الإصدار');
    error.status = 400;
    throw error;
  }
  const status = body.status === 'paid' ? 'paid' : 'unpaid';
  if (!type.posted && status === 'paid') {
    const error = new Error('عروض الأسعار والفواتير المبدئية لا تنشئ سداداً أو قيوداً محاسبية');
    error.status = 400;
    throw error;
  }
  let calculation;
  try {
    calculation = calculateInvoice(body.items);
  } catch (cause) {
    const error = new Error(cause.message || 'تعذر حساب الفاتورة');
    error.status = 400;
    throw error;
  }
  const clientName = text(body.client, 'اسم العميل', 200, true);
  const method = text(body.method || 'تحويل بنكي', 'طريقة السداد', 80, true);

  return withTransaction(async client => {
    const currentRes = await client.query('SELECT data FROM system_state WHERE key = $1 FOR UPDATE', ['main_state']);
    const current = currentRes.rows.length ? currentRes.rows[0].data : {};
    const existing = [...(current.invoices || []), ...(current.quotes || [])]
      .find(item => item._operationId === operationId);
    if (existing) return { state: current, invoice: existing, idempotent: true };
    if (!(current.branches || []).some(branch => branch.id === entity)) {
      const error = new Error('المنشأة المحددة غير موجودة');
      error.status = 400;
      throw error;
    }

    const convertedQuoteId = text(body.convertedQuoteId, 'عرض السعر المصدر', 80);
    let convertedQuote = null;
    if (convertedQuoteId) {
      if (!type.posted) { const error = new Error('التحويل يجب أن يكون إلى فاتورة مترحلة'); error.status = 400; throw error; }
      convertedQuote = (current.quotes || []).find(quote => quote.id === convertedQuoteId);
      if (!convertedQuote || convertedQuote.status === 'تم التحويل لفاتورة') {
        const error = new Error('عرض السعر غير موجود أو تم تحويله مسبقاً'); error.status = 409; throw error;
      }
    }
    const id = await nextNumber(client, type.prefix, entity, date);
    const paidAmount = type.posted && status === 'paid' ? calculation.grand : 0;
    const invoice = {
      id, entity, client: clientName,
      clientVat: text(body.clientVat, 'الرقم الضريبي للعميل', 30),
      clientAddress: text(body.clientAddress, 'عنوان العميل', 400),
      date, dueDate, docType,
      grossSubtotal: calculation.grossSubtotal,
      subtotal: calculation.subtotal,
      discount: calculation.discount,
      vat: calculation.vat,
      total: calculation.grand,
      method, status: type.posted ? status : 'quote',
      paidAmount, outstanding: calculation.grand - paidAmount,
      item: calculation.lines.map(line => line.desc).join(' + '),
      items: calculation.lines,
      notes: text(body.notes, 'الملاحظات', 2000),
      _operationId: operationId,
      posted: type.posted,
      createdAt: new Date().toISOString(),
      createdBy: user.id
    };

    const next = {
      ...current,
      invoices: Array.isArray(current.invoices) ? [...current.invoices] : [],
      quotes: Array.isArray(current.quotes) ? [...current.quotes] : [],
      journals: Array.isArray(current.journals) ? [...current.journals] : [],
      vouchers: Array.isArray(current.vouchers) ? [...current.vouchers] : [],
      treasury: { cash: 0, rajhi: 0, ahli: 0, ...(current.treasury || {}) }
    };
    if (type.posted) {
      next.invoices.unshift(invoice);
      if (convertedQuote) {
        next.quotes = next.quotes.map(quote => quote.id === convertedQuoteId
          ? { ...quote, status: 'تم التحويل لفاتورة', convertedInvoiceId: id }
          : quote);
      }
      const saleJournalId = await nextNumber(client, 'JRN', entity, date);
      next.journals.unshift(journal(
        saleJournalId, date, entity, `ترحيل فاتورة مبيعات ${id} - ${clientName}`,
        [
          { account: '110301 - العملاء والمدينون التجاريون', debit: calculation.grand, credit: 0 },
          { account: REVENUE_ACCOUNTS[entity] || REVENUE_ACCOUNTS.home, debit: 0, credit: calculation.subtotal },
          { account: '210201 - ضريبة القيمة المضافة المخرجة', debit: 0, credit: calculation.vat }
        ], id
      ));
      if (status === 'paid') {
        const cashKey = method === 'نقداً' ? 'cash' : 'rajhi';
        const cashAccount = cashKey === 'cash'
          ? '110101 - الصندوق النقدي الرئيسي'
          : '110201 - حساب مصرف الراجحي';
        const receiptId = await nextNumber(client, 'RC', entity, date);
        const receiptJournalId = await nextNumber(client, 'JRN', entity, date);
        next.treasury[cashKey] = Number(next.treasury[cashKey] || 0) + calculation.grand;
        next.vouchers.unshift({
          id: receiptId, type: 'قبض', entity, date,
          account: cashAccount, amount: calculation.grand,
          notes: `تحصيل فاتورة ${id} من ${clientName}`,
          invoiceId: id, user: user.name || user.email
        });
        next.journals.unshift(journal(
          receiptJournalId, date, entity, `تحصيل فاتورة ${id} - ${receiptId}`,
          [
            { account: cashAccount, debit: calculation.grand, credit: 0 },
            { account: '110301 - العملاء والمدينون التجاريون', debit: 0, credit: calculation.grand }
          ], id
        ));
      }
    } else {
      next.quotes.unshift(invoice);
    }

    next._revision = (Number(current._revision) || 0) + 1;
    next._updatedAt = new Date().toISOString();
    next._updatedBy = user.id;
    await client.query(`
      INSERT INTO system_state (key, data, updated_at) VALUES ('main_state', $1, now())
      ON CONFLICT (key) DO UPDATE SET data = EXCLUDED.data, updated_at = now()
    `, [next]);
    return { state: next, invoice, idempotent: false };
  });
}

async function recordInvoiceReceipt({ invoiceId, body, user, withTransaction }) {
  const operationId = text(body?.operationId, 'معرّف العملية', 80, true);
  if (!/^[a-zA-Z0-9_-]{8,80}$/.test(operationId)) {
    const error = new Error('معرّف العملية غير صالح'); error.status = 400; throw error;
  }
  const amountHalalas = toHalalas(body?.amount);
  if (amountHalalas === null || amountHalalas <= 0) {
    const error = new Error('مبلغ التحصيل يجب أن يكون أكبر من صفر'); error.status = 400; throw error;
  }
  const amount = amountHalalas / 100;
  const date = isoDate(body?.date, 'تاريخ السند');
  const method = text(body?.method || 'تحويل بنكي', 'طريقة السداد', 80, true);
  return withTransaction(async client => {
    const currentRes = await client.query('SELECT data FROM system_state WHERE key = $1 FOR UPDATE', ['main_state']);
    const current = currentRes.rows.length ? currentRes.rows[0].data : {};
    const existing = (current.vouchers || []).find(voucher => voucher._operationId === operationId);
    if (existing) return { state: current, receipt: existing, idempotent: true };
    const invoice = (current.invoices || []).find(item => item.id === invoiceId);
    if (!invoice || invoice.status === 'cancelled') {
      const error = new Error('الفاتورة غير موجودة أو ملغاة'); error.status = 404; throw error;
    }
    const outstanding = Number(invoice.outstanding ?? Math.max(0, invoice.total - (invoice.paidAmount || 0)));
    if (amountHalalas > Math.round(outstanding * 100)) {
      const error = new Error('مبلغ التحصيل يتجاوز الرصيد المتبقي للفاتورة'); error.status = 400; throw error;
    }
    const next = {
      ...current,
      invoices: current.invoices.map(item => item.id === invoiceId ? { ...item } : item),
      journals: [...(current.journals || [])], vouchers: [...(current.vouchers || [])],
      treasury: { cash: 0, rajhi: 0, ahli: 0, ...(current.treasury || {}) }
    };
    const target = next.invoices.find(item => item.id === invoiceId);
    const cashKey = method === 'نقداً' ? 'cash' : method.includes('الأهلي') ? 'ahli' : 'rajhi';
    const cashAccount = cashKey === 'cash' ? '110101 - الصندوق النقدي الرئيسي' : cashKey === 'ahli' ? '110202 - حساب البنك الأهلي التجاري' : '110201 - حساب مصرف الراجحي';
    const receiptId = await nextNumber(client, 'RC', invoice.entity, date);
    const journalId = await nextNumber(client, 'JRN', invoice.entity, date);
    const receipt = {
      id: receiptId, type: 'قبض', entity: invoice.entity, date, account: cashAccount,
      amount, notes: text(body?.notes, 'البيان', 500) || `تحصيل فاتورة ${invoiceId} من ${invoice.client}`,
      invoiceId, user: user.name || user.email, _operationId: operationId
    };
    next.vouchers.unshift(receipt);
    next.treasury[cashKey] = Number(next.treasury[cashKey] || 0) + amount;
    next.journals.unshift(journal(journalId, date, invoice.entity, `تحصيل فاتورة ${invoiceId} - ${receiptId}`, [
      { account: cashAccount, debit: amount, credit: 0 },
      { account: '110301 - العملاء والمدينون التجاريون', debit: 0, credit: amount }
    ], invoiceId));
    target.paidAmount = Math.round((Number(target.paidAmount || 0) + amount) * 100) / 100;
    target.outstanding = Math.round((outstanding - amount) * 100) / 100;
    target.status = target.outstanding === 0 ? 'paid' : 'partial';
    next._revision = (Number(current._revision) || 0) + 1;
    next._updatedAt = new Date().toISOString(); next._updatedBy = user.id;
    await client.query(`INSERT INTO system_state (key, data, updated_at) VALUES ('main_state', $1, now())
      ON CONFLICT (key) DO UPDATE SET data = EXCLUDED.data, updated_at = now()`, [next]);
    return { state: next, receipt, idempotent: false };
  });
}

async function cancelStateInvoice({ invoiceId, body, user, withTransaction }) {
  const reason = text(body?.reason, 'سبب الإلغاء', 500, true);
  const date = isoDate(body?.date || new Date().toISOString().slice(0, 10), 'تاريخ الإلغاء');
  return withTransaction(async client => {
    const currentRes = await client.query('SELECT data FROM system_state WHERE key = $1 FOR UPDATE', ['main_state']);
    const current = currentRes.rows.length ? currentRes.rows[0].data : {};
    const invoice = (current.invoices || []).find(item => item.id === invoiceId);
    if (!invoice) { const error = new Error('الفاتورة غير موجودة'); error.status = 404; throw error; }
    if (invoice.status === 'cancelled') return { state: current, invoice, idempotent: true };
    const next = {
      ...current,
      invoices: current.invoices.map(item => item.id === invoiceId ? { ...item } : item),
      journals: [...(current.journals || [])], vouchers: [...(current.vouchers || [])],
      treasury: { cash: 0, rajhi: 0, ahli: 0, ...(current.treasury || {}) }
    };
    const sourceJournals = next.journals.filter(entry => entry.sourceId === invoiceId && !entry.reversedBy);
    for (const source of sourceJournals) {
      const reversalId = await nextNumber(client, 'JRN', invoice.entity, date);
      const lines = (source.lines || [
        { account: source.debit, debit: source.amount, credit: 0 },
        { account: source.credit, debit: 0, credit: source.amount }
      ]).map(line => ({ account: line.account, debit: line.credit, credit: line.debit }));
      const reversal = journal(reversalId, date, invoice.entity, `عكس ${source.desc} — ${reason}`, lines, invoiceId);
      reversal.reverses = source.id;
      source.status = 'معكوس'; source.reversedBy = reversalId;
      next.journals.unshift(reversal);
    }
    const receipts = next.vouchers.filter(voucher => voucher.invoiceId === invoiceId && voucher.type === 'قبض' && !voucher.reversedAt);
    for (const receipt of receipts) {
      const cashKey = String(receipt.account).includes('110101') ? 'cash' : String(receipt.account).includes('110202') ? 'ahli' : 'rajhi';
      next.treasury[cashKey] = Number(next.treasury[cashKey] || 0) - Number(receipt.amount || 0);
      receipt.reversedAt = new Date().toISOString();
      next.vouchers.unshift({ ...receipt, id: await nextNumber(client, 'PV', invoice.entity, date), type: 'صرف', notes: `عكس ${receipt.notes} — ${reason}`, reversedAt: undefined });
    }
    const target = next.invoices.find(item => item.id === invoiceId);
    Object.assign(target, { status: 'cancelled', outstanding: 0, cancellationReason: reason, cancelledAt: new Date().toISOString(), cancelledBy: user.id });
    next._revision = (Number(current._revision) || 0) + 1;
    next._updatedAt = new Date().toISOString(); next._updatedBy = user.id;
    await client.query(`INSERT INTO system_state (key, data, updated_at) VALUES ('main_state', $1, now())
      ON CONFLICT (key) DO UPDATE SET data = EXCLUDED.data, updated_at = now()`, [next]);
    return { state: next, invoice: target, idempotent: false };
  });
}

module.exports = { createStateInvoice, recordInvoiceReceipt, cancelStateInvoice, nextNumber, DOC_TYPES };
