'use strict';

const InvoiceUtils = require('../public/js/invoice-utils');
const { calculateInvoice, toHalalas } = InvoiceUtils;

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

function journal(id, date, entity, desc, lines, sourceId, partyMeta = {}) {
  const debit = lines.reduce((sum, line) => sum + Number(line.debit || 0), 0);
  const credit = lines.reduce((sum, line) => sum + Number(line.credit || 0), 0);
  if (Math.round(debit * 100) !== Math.round(credit * 100) || debit <= 0) {
    const error = new Error('فشل التحقق من توازن القيد المحاسبي');
    error.status = 500;
    throw error;
  }
  const normalizedLines = lines.map(l => {
    const rawAcc = String(l.account || l.accountCode || '').trim();
    const accCode = l.accountCode || (rawAcc.includes(' - ') ? rawAcc.split(' - ')[0].trim() : rawAcc);
    return {
      ...l,
      account: rawAcc || accCode,
      accountCode: accCode,
      partyType: l.partyType ?? partyMeta.partyType ?? null,
      partyId: l.partyId ?? partyMeta.partyId ?? null,
      partyName: l.partyName ?? partyMeta.partyName ?? '',
      costCenter: l.costCenter || partyMeta.costCenter || 'CC-MAIN',
      sourceDocRef: l.sourceDocRef || sourceId || id
    };
  });
  return {
    id,
    date,
    entity,
    desc,
    ref: sourceId || id,
    sourceId,
    sourceDocRef: sourceId || id,
    partyType: partyMeta.partyType || null,
    partyId: partyMeta.partyId || null,
    partyName: partyMeta.partyName || '',
    costCenter: partyMeta.costCenter || 'CC-MAIN',
    lines: normalizedLines,
    amount: InvoiceUtils.roundCurrency(debit),
    totalDebit: InvoiceUtils.roundCurrency(debit),
    totalCredit: InvoiceUtils.roundCurrency(credit),
    status: 'متزن',
    posted: true,
    isLocked: true,
    debit: normalizedLines.length === 2 ? normalizedLines.find(line => line.debit > 0)?.account : `${normalizedLines.length} حسابات`,
    credit: normalizedLines.length === 2 ? normalizedLines.find(line => line.credit > 0)?.account : `${normalizedLines.length} حسابات`
  };
}

function recalculatePartyBalances(state) {
  if (!state || typeof state !== 'object') return;
  const customerList = Array.isArray(state.clients) ? state.clients : (Array.isArray(state.customers) ? state.customers : null);
  if (customerList) {
    for (const client of customerList) {
      const stmt = InvoiceUtils.computePartyStatement('customer', client.id || client.name, state);
      if (stmt && Array.isArray(stmt.entries) && stmt.entries.length > 0) {
        client.balance = InvoiceUtils.roundCurrency(stmt.closingBalance);
      } else if (Array.isArray(state.invoices)) {
        const invBal = state.invoices
          .filter(inv => (inv.customerId === client.id || inv.client === client.name) && inv.status !== 'cancelled' && inv.status !== 'void')
          .reduce((sum, inv) => sum + Number(inv.outstanding ?? inv.remainingAmount ?? (inv.status === 'paid' ? 0 : inv.total) ?? 0), 0);
        client.balance = InvoiceUtils.roundCurrency(invBal);
      }
    }
  }
  if (Array.isArray(state.suppliers)) {
    for (const supplier of state.suppliers) {
      const stmt = InvoiceUtils.computePartyStatement('supplier', supplier.id || supplier.name, state);
      if (stmt && Array.isArray(stmt.entries) && stmt.entries.length > 0) {
        supplier.balance = InvoiceUtils.roundCurrency(stmt.closingBalance);
      } else if (Array.isArray(state.purchases)) {
        const poBal = state.purchases
          .filter(po => (po.supplierId === supplier.id || po.supplier === supplier.name) && po.status !== 'cancelled' && po.status !== 'void')
          .reduce((sum, po) => sum + Number(po.remainingAmount ?? (po.status === 'paid' ? 0 : po.total) ?? 0), 0);
        supplier.balance = InvoiceUtils.roundCurrency(poBal);
      }
    }
  }
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
  const entity = text(body.entity || 'main', 'المنشأة', 50, true);
  const date = isoDate(body.date, 'تاريخ الإصدار');
  const dueDate = isoDate(body.dueDate || body.due || body.date, 'تاريخ الاستحقاق');
  if (dueDate < date) {
    const error = new Error('تاريخ الاستحقاق لا يمكن أن يسبق تاريخ الإصدار');
    error.status = 400;
    throw error;
  }
  const status = body.status === 'paid' ? 'paid' : (body.status === 'partial' ? 'partial' : 'unpaid');
  if (!type.posted && status === 'paid') {
    const error = new Error('عروض الأسعار والفواتير المبدئية لا تنشئ سداداً أو قيوداً محاسبية');
    error.status = 400;
    throw error;
  }

  const taxMode = body.taxMode === 'inclusive' ? 'inclusive' : 'exclusive';
  const defaultRevAcc = body.revenueAccount || (REVENUE_ACCOUNTS[entity] ? REVENUE_ACCOUNTS[entity].split(' - ')[0] : '410101');

  let calculation;
  try {
    calculation = calculateInvoice(body.items, {
      taxMode,
      defaultRevenueAccount: defaultRevAcc,
      defaultCostCenter: body.costCenter || 'CC-MAIN',
      defaultWarehouse: body.warehouse || 'المستودع الرئيسي'
    });
  } catch (cause) {
    const error = new Error(cause.message || 'تعذر حساب الفاتورة');
    error.status = 400;
    throw error;
  }

  const clientName = text(body.client, 'اسم العميل', 200, true);
  const method = text(body.method || 'تحويل بنكي', 'طريقة السداد', 80, true);
  const receivableAccount = String(body.receivableAccount || '110301').trim();

  if (receivableAccount.startsWith('4')) {
    const error = new Error('لا يمكن استخدام حساب الإيرادات كحساب ذمم العملاء');
    error.status = 400;
    throw error;
  }

  return withTransaction(async client => {
    const currentRes = await client.query('SELECT data FROM system_state WHERE key = $1 FOR UPDATE', ['main_state']);
    const current = currentRes.rows.length ? currentRes.rows[0].data : {};
    const existing = [...(current.invoices || []), ...(current.quotes || [])]
      .find(item => item._operationId === operationId);
    if (existing) return { state: current, invoice: existing, idempotent: true };
    if (Array.isArray(current.branches) && current.branches.length > 0 && !current.branches.some(branch => branch.id === entity)) {
      const error = new Error('المنشأة المحددة غير موجودة');
      error.status = 400;
      throw error;
    }

    const convertedQuoteId = text(body.convertedQuoteId, 'عرض السعر المصدر', 80);
    let convertedQuote = null;
    if (convertedQuoteId) {
      if (!type.posted) {
        const error = new Error('التحويل يجب أن يكون إلى فاتورة مترحلة');
        error.status = 400;
        throw error;
      }
      convertedQuote = (current.quotes || []).find(quote => quote.id === convertedQuoteId);
      if (!convertedQuote || convertedQuote.status === 'تم التحويل لفاتورة') {
        const error = new Error('عرض السعر غير موجود أو تم تحويله مسبقاً');
        error.status = 409;
        throw error;
      }
    }

    const id = await nextNumber(client, type.prefix, entity, date);
    const paidAmount = type.posted && status === 'paid'
      ? calculation.grand
      : (type.posted && status === 'partial' ? Math.min(Number(body.paidAmount || 0), calculation.grand) : 0);

    const matchedClient = (current.clients || []).find(c =>
      (body.customerId && c.id === body.customerId) || c.name === clientName
    );
    const customerId = matchedClient ? matchedClient.id : (body.customerId || `CLI-${String((current.clients || []).length + 1).padStart(3, '0')}`);

    const invoice = {
      id,
      entity,
      customerId,
      client: clientName,
      clientVat: text(body.clientVat, 'الرقم الضريبي للعميل', 30),
      clientAddress: text(body.clientAddress || body.clientAddr, 'عنوان العميل', 400),
      date,
      dueDate,
      due: dueDate,
      docType,
      taxMode,
      receivableAccount,
      revenueAccount: defaultRevAcc,
      revenueAllocations: calculation.revenueAllocations,
      warehouse: body.warehouse || 'المستودع الرئيسي',
      costCenter: body.costCenter || 'CC-MAIN',
      grossSubtotal: calculation.grossSubtotal,
      subtotal: calculation.subtotal,
      discount: calculation.discount,
      vat: calculation.vat,
      total: calculation.grand,
      method,
      status: type.posted ? status : 'quote',
      paidAmount,
      outstanding: InvoiceUtils.roundCurrency(calculation.grand - paidAmount),
      remainingAmount: InvoiceUtils.roundCurrency(calculation.grand - paidAmount),
      item: calculation.lines.map(line => line.desc).join(' + '),
      items: calculation.lines,
      notes: text(body.notes, 'الملاحظات', 2000),
      _operationId: operationId,
      posted: type.posted,
      isLocked: type.posted,
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
      const saleLines = [
        {
          account: `${receivableAccount} - العملاء والمدينون التجاريون`,
          accountCode: receivableAccount,
          debit: calculation.grand,
          credit: 0,
          partyType: 'customer',
          partyId: customerId,
          partyName: clientName,
          costCenter: invoice.costCenter
        }
      ];

      const hasCustomLineRevenue = Array.isArray(body.items) && body.items.some(i => i.revenueAccount);
      if (hasCustomLineRevenue && Object.keys(calculation.revenueAllocations).length > 0) {
        for (const [revCode, revNet] of Object.entries(calculation.revenueAllocations)) {
          if (revNet > 0) {
            saleLines.push({
              account: `${revCode} - إيرادات المبيعات`,
              accountCode: revCode,
              debit: 0,
              credit: revNet,
              partyType: 'customer',
              partyId: customerId,
              partyName: clientName,
              costCenter: invoice.costCenter
            });
          }
        }
      } else {
        saleLines.push({
          account: REVENUE_ACCOUNTS[entity] || REVENUE_ACCOUNTS.home,
          accountCode: defaultRevAcc,
          debit: 0,
          credit: calculation.subtotal,
          partyType: 'customer',
          partyId: customerId,
          partyName: clientName,
          costCenter: invoice.costCenter
        });
      }

      if (calculation.vat > 0) {
        saleLines.push({
          account: '210201 - ضريبة القيمة المضافة المخرجة',
          accountCode: '210201',
          debit: 0,
          credit: calculation.vat,
          partyType: null,
          partyId: null,
          partyName: '',
          costCenter: invoice.costCenter
        });
      }

      next.journals.unshift(journal(
        saleJournalId,
        date,
        entity,
        `ترحيل فاتورة مبيعات ${id} - ${clientName}`,
        saleLines,
        id,
        { partyType: 'customer', partyId: customerId, partyName: clientName, costCenter: invoice.costCenter }
      ));

      if (paidAmount > 0) {
        const cashKey = method === 'نقداً' ? 'cash' : 'rajhi';
        const cashAccount = cashKey === 'cash'
          ? '110101 - الصندوق النقدي الرئيسي'
          : '110201 - حساب مصرف الراجحي';
        const receiptId = await nextNumber(client, 'RC', entity, date);
        const receiptJournalId = await nextNumber(client, 'JRN', entity, date);
        next.treasury[cashKey] = Number(next.treasury[cashKey] || 0) + paidAmount;
        next.vouchers.unshift({
          id: receiptId,
          type: 'قبض',
          entity,
          date,
          customerId,
          client: clientName,
          account: cashAccount,
          amount: paidAmount,
          notes: `تحصيل فاتورة ${id} من ${clientName}`,
          invoiceId: id,
          user: user.name || user.email
        });
        next.journals.unshift(journal(
          receiptJournalId,
          date,
          entity,
          `تحصيل فاتورة ${id} - ${receiptId}`,
          [
            { account: cashAccount, accountCode: cashKey === 'cash' ? '110101' : '110201', debit: paidAmount, credit: 0 },
            {
              account: `${receivableAccount} - العملاء والمدينون التجاريون`,
              accountCode: receivableAccount,
              debit: 0,
              credit: paidAmount,
              partyType: 'customer',
              partyId: customerId,
              partyName: clientName
            }
          ],
          id,
          { partyType: 'customer', partyId: customerId, partyName: clientName, costCenter: invoice.costCenter }
        ));
      }
    } else {
      next.quotes.unshift(invoice);
    }

    recalculatePartyBalances(next);
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
    const error = new Error('معرّف العملية غير صالح');
    error.status = 400;
    throw error;
  }
  const amountHalalas = toHalalas(body?.amount);
  if (amountHalalas === null || amountHalalas <= 0) {
    const error = new Error('مبلغ التحصيل يجب أن يكون أكبر من صفر');
    error.status = 400;
    throw error;
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
      const error = new Error('الفاتورة غير موجودة أو ملغاة');
      error.status = 404;
      throw error;
    }
    const outstanding = Number(invoice.outstanding ?? invoice.remainingAmount ?? Math.max(0, invoice.total - (invoice.paidAmount || 0)));
    if (amountHalalas > Math.round(outstanding * 100)) {
      const error = new Error('مبلغ التحصيل يتجاوز الرصيد المتبقي للفاتورة');
      error.status = 400;
      throw error;
    }
    const next = {
      ...current,
      invoices: current.invoices.map(item => item.id === invoiceId ? { ...item } : item),
      journals: [...(current.journals || [])],
      vouchers: [...(current.vouchers || [])],
      treasury: { cash: 0, rajhi: 0, ahli: 0, ...(current.treasury || {}) }
    };
    const target = next.invoices.find(item => item.id === invoiceId);
    const cashKey = method === 'نقداً' ? 'cash' : method.includes('الأهلي') ? 'ahli' : 'rajhi';
    const cashAccount = cashKey === 'cash'
      ? '110101 - الصندوق النقدي الرئيسي'
      : cashKey === 'ahli'
        ? '110202 - حساب البنك الأهلي التجاري'
        : '110201 - حساب مصرف الراجحي';
    const receiptId = await nextNumber(client, 'RC', invoice.entity || 'main', date);
    const journalId = await nextNumber(client, 'JRN', invoice.entity || 'main', date);
    const receipt = {
      id: receiptId,
      type: 'قبض',
      entity: invoice.entity || 'main',
      date,
      customerId: invoice.customerId || null,
      client: invoice.client,
      account: cashAccount,
      amount,
      notes: text(body?.notes, 'البيان', 500) || `تحصيل فاتورة ${invoiceId} من ${invoice.client}`,
      invoiceId,
      user: user.name || user.email,
      _operationId: operationId
    };
    next.vouchers.unshift(receipt);
    next.treasury[cashKey] = Number(next.treasury[cashKey] || 0) + amount;
    const arAcc = invoice.receivableAccount || '110301';
    next.journals.unshift(journal(
      journalId,
      date,
      invoice.entity || 'main',
      `تحصيل فاتورة ${invoiceId} - ${receiptId}`,
      [
        { account: cashAccount, accountCode: cashKey === 'cash' ? '110101' : '110201', debit: amount, credit: 0 },
        {
          account: `${arAcc} - العملاء والمدينون التجاريون`,
          accountCode: arAcc,
          debit: 0,
          credit: amount,
          partyType: 'customer',
          partyId: invoice.customerId || null,
          partyName: invoice.client
        }
      ],
      invoiceId,
      { partyType: 'customer', partyId: invoice.customerId || null, partyName: invoice.client }
    ));
    target.paidAmount = Math.round((Number(target.paidAmount || 0) + amount) * 100) / 100;
    target.outstanding = Math.round((outstanding - amount) * 100) / 100;
    target.remainingAmount = target.outstanding;
    target.status = target.outstanding === 0 ? 'paid' : 'partial';
    recalculatePartyBalances(next);
    next._revision = (Number(current._revision) || 0) + 1;
    next._updatedAt = new Date().toISOString();
    next._updatedBy = user.id;
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
    if (!invoice) {
      const error = new Error('الفاتورة غير موجودة');
      error.status = 404;
      throw error;
    }
    if (invoice.status === 'cancelled') return { state: current, invoice, idempotent: true };
    const next = {
      ...current,
      invoices: current.invoices.map(item => item.id === invoiceId ? { ...item } : item),
      journals: [...(current.journals || [])],
      vouchers: [...(current.vouchers || [])],
      treasury: { cash: 0, rajhi: 0, ahli: 0, ...(current.treasury || {}) }
    };
    const sourceJournals = next.journals.filter(entry => (entry.sourceId === invoiceId || entry.ref === invoiceId) && !entry.reversedBy);
    for (const source of sourceJournals) {
      const reversalId = await nextNumber(client, 'JRN', invoice.entity || 'main', date);
      const lines = (source.lines || [
        { account: source.debit, debit: source.amount, credit: 0 },
        { account: source.credit, debit: 0, credit: source.amount }
      ]).map(line => ({
        ...line,
        account: line.account,
        debit: line.credit,
        credit: line.debit
      }));
      const reversal = journal(
        reversalId,
        date,
        invoice.entity || 'main',
        `عكس ${source.desc} — ${reason}`,
        lines,
        invoiceId,
        { partyType: 'customer', partyId: invoice.customerId || null, partyName: invoice.client }
      );
      reversal.reverses = source.id;
      source.status = 'معكوس';
      source.reversedBy = reversalId;
      next.journals.unshift(reversal);
    }
    const receipts = next.vouchers.filter(voucher => voucher.invoiceId === invoiceId && voucher.type === 'قبض' && !voucher.reversedAt);
    for (const receipt of receipts) {
      const cashKey = String(receipt.account).includes('110101') ? 'cash' : String(receipt.account).includes('110202') ? 'ahli' : 'rajhi';
      next.treasury[cashKey] = Number(next.treasury[cashKey] || 0) - Number(receipt.amount || 0);
      receipt.reversedAt = new Date().toISOString();
      next.vouchers.unshift({
        ...receipt,
        id: await nextNumber(client, 'PV', invoice.entity || 'main', date),
        type: 'صرف',
        notes: `عكس ${receipt.notes} — ${reason}`,
        reversedAt: undefined
      });
    }
    const target = next.invoices.find(item => item.id === invoiceId);
    Object.assign(target, {
      status: 'cancelled',
      outstanding: 0,
      remainingAmount: 0,
      cancellationReason: reason,
      cancelledAt: new Date().toISOString(),
      cancelledBy: user.id
    });
    recalculatePartyBalances(next);
    next._revision = (Number(current._revision) || 0) + 1;
    next._updatedAt = new Date().toISOString();
    next._updatedBy = user.id;
    await client.query(`INSERT INTO system_state (key, data, updated_at) VALUES ('main_state', $1, now())
      ON CONFLICT (key) DO UPDATE SET data = EXCLUDED.data, updated_at = now()`, [next]);
    return { state: next, invoice: target, idempotent: false };
  });
}

module.exports = {
  createStateInvoice,
  recordInvoiceReceipt,
  cancelStateInvoice,
  recalculatePartyBalances,
  nextNumber,
  DOC_TYPES
};
