(function (root, factory) {
  const utils = factory();
  if (typeof module === 'object' && module.exports) {
    module.exports = utils;
  } else {
    root.InvoiceUtils = utils;
  }
})(typeof self !== 'undefined' ? self : (typeof globalThis !== 'undefined' ? globalThis : this), function () {
  const DEFAULT_TAX_RATE = 15;
  const VALID_PAYMENT_METHODS = ['cash', 'credit', 'partial'];
  const VALID_TAX_MODES = ['exclusive', 'inclusive'];

  const DEFAULT_TAX_SETTINGS = Object.freeze({
    standard: { code: 'standard', nameAr: 'خاضع للضريبة الأساسية (15%)', rate: 15, recoverable: true },
    zero: { code: 'zero', nameAr: 'خاضع لنسبة الصفر (0%)', rate: 0, recoverable: true },
    exempt: { code: 'exempt', nameAr: 'معفى من الضريبة', rate: 0, recoverable: false },
    out_of_scope: { code: 'out_of_scope', nameAr: 'خارج نطاق الضريبة', rate: 0, recoverable: false }
  });

  function roundCurrency(value) {
    const num = Number(value) || 0;
    return Math.round((num + Number.EPSILON) * 100) / 100;
  }

  function toHalalas(value) {
    if (value === null || value === undefined || value === '') return null;
    const normalized = String(value).trim()
      .replace(/[٠-٩]/g, d => String('٠١٢٣٤٥٦٧٨٩'.indexOf(d)))
      .replace(/[٬,\s]/g, '').replace('٫', '.');
    if (!/^-?\d+(\.\d{1,2})?$/.test(normalized)) return null;
    const amount = Number(normalized);
    return Number.isFinite(amount) ? Math.round(amount * 100) : null;
  }

  function escapeHtml(value) {
    return String(value ?? '').replace(/[&<>'"]/g, ch => ({
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      "'": '&#39;',
      '"': '&quot;'
    }[ch]));
  }

  function resolveTaxRate(taxCategory, explicitTaxRate, taxSettings) {
    const settings = Object.assign({}, DEFAULT_TAX_SETTINGS, taxSettings || {});
    if (taxCategory && settings[taxCategory] && typeof settings[taxCategory].rate === 'number') {
      if (taxCategory !== 'standard') {
        return roundCurrency(settings[taxCategory].rate);
      }
      if (explicitTaxRate === undefined || explicitTaxRate === null || explicitTaxRate === '') {
        return roundCurrency(settings[taxCategory].rate);
      }
    }
    if (explicitTaxRate !== undefined && explicitTaxRate !== null && explicitTaxRate !== '') {
      const parsed = Number(explicitTaxRate);
      if (Number.isFinite(parsed)) return roundCurrency(parsed);
    }
    if (taxCategory && settings[taxCategory]) {
      return roundCurrency(settings[taxCategory].rate);
    }
    return DEFAULT_TAX_RATE;
  }

  function calculateInvoice(rows, options = {}) {
    if (!Array.isArray(rows) || rows.length === 0) {
      throw new Error('أضف بنداً واحداً على الأقل');
    }

    const taxMode = VALID_TAX_MODES.includes(String(options.taxMode || 'exclusive').toLowerCase())
      ? String(options.taxMode || 'exclusive').toLowerCase()
      : 'exclusive';

    let grossSubtotalHalalas = 0;
    let subtotalHalalas = 0;
    let discountHalalas = 0;
    let vatHalalas = 0;
    const revenueAllocationsHalalas = {};
    const expenseAllocationsHalalas = {};

    const lines = rows.map((row, index) => {
      const desc = String(row.desc ?? row.description ?? row.name ?? '').trim();
      const qty = Number(row.qty ?? row.quantity);
      const unitPrice = toHalalas(row.price ?? row.unitPrice);
      const lineDiscount = toHalalas(row.discount ?? 0);
      const taxCategory = String(row.taxCategory || row.vatTreatment || 'standard').trim() || 'standard';
      const explicitRate = row.vatRate !== undefined ? row.vatRate : row.taxRate;
      const vatRate = resolveTaxRate(taxCategory, explicitRate, options.taxSettings);

      if (!desc) throw new Error(`وصف البند ${index + 1} مطلوب`);
      if (!Number.isFinite(qty) || qty <= 0 || qty > 1000000) throw new Error(`كمية البند ${index + 1} غير صالحة`);
      if (unitPrice === null || unitPrice < 0) throw new Error(`سعر البند ${index + 1} غير صالح`);
      if (lineDiscount === null || lineDiscount < 0) throw new Error(`خصم البند ${index + 1} غير صالح`);
      if (!Number.isFinite(vatRate) || vatRate < 0 || vatRate > 100) throw new Error(`نسبة ضريبة البند ${index + 1} غير صالحة`);

      const gross = Math.round(qty * unitPrice);
      if (lineDiscount > gross) throw new Error(`خصم البند ${index + 1} يتجاوز قيمته قبل الضريبة`);
      const afterDiscount = gross - lineDiscount;

      let net = 0;
      let tax = 0;
      let lineTotal = 0;

      if (taxMode === 'inclusive') {
        // Option B — VAT Inclusive: Price already includes VAT; extract net and VAT without double-counting
        lineTotal = afterDiscount;
        if (vatRate > 0) {
          net = Math.round((lineTotal * 100) / (100 + vatRate));
          tax = lineTotal - net;
        } else {
          net = lineTotal;
          tax = 0;
        }
      } else {
        // Option A — VAT Exclusive: VAT added on top of net
        net = afterDiscount;
        tax = Math.round((net * vatRate) / 100);
        lineTotal = net + tax;
      }

      grossSubtotalHalalas += gross;
      subtotalHalalas += net;
      discountHalalas += lineDiscount;
      vatHalalas += tax;

      const revenueAccount = String(row.revenueAccount || row.accountCode || options.defaultRevenueAccount || '410101').trim();
      const expenseAccount = String(row.expenseAccount || row.accountCode || options.defaultExpenseAccount || '510101').trim();

      if (revenueAccount) {
        revenueAllocationsHalalas[revenueAccount] = (revenueAllocationsHalalas[revenueAccount] || 0) + net;
      }
      if (expenseAccount) {
        expenseAllocationsHalalas[expenseAccount] = (expenseAllocationsHalalas[expenseAccount] || 0) + net;
      }

      return {
        productId: row.productId || row.itemId || null,
        sku: row.sku || '',
        desc,
        unit: row.unit || 'وحدة',
        qty,
        price: unitPrice / 100,
        discount: lineDiscount / 100,
        taxCategory,
        vatRate,
        taxRate: vatRate,
        taxMode,
        revenueAccount,
        expenseAccount,
        inventoryAssetAccount: String(row.inventoryAssetAccount || '110401').trim(),
        cogsAccount: String(row.cogsAccount || '510101').trim(),
        recoverableVatAccount: String(row.recoverableVatAccount || '110501').trim(),
        costCenter: String(row.costCenter || options.defaultCostCenter || 'CC-MAIN').trim(),
        warehouse: String(row.warehouse || options.defaultWarehouse || 'المستودع الرئيسي').trim(),
        costPrice: roundCurrency(row.costPrice || row.cost || 0),
        gross: gross / 100,
        net: net / 100,
        subtotal: net / 100,
        vat: tax / 100,
        total: lineTotal / 100
      };
    });

    const totalHalalas = subtotalHalalas + vatHalalas;
    if (totalHalalas <= 0) throw new Error('يجب أن يكون إجمالي الفاتورة أكبر من صفر');

    const revenueAllocations = {};
    for (const [acc, hal] of Object.entries(revenueAllocationsHalalas)) {
      revenueAllocations[acc] = hal / 100;
    }

    const expenseAllocations = {};
    for (const [acc, hal] of Object.entries(expenseAllocationsHalalas)) {
      expenseAllocations[acc] = hal / 100;
    }

    return {
      taxMode,
      lines,
      items: lines,
      grossSubtotal: grossSubtotalHalalas / 100,
      subtotal: subtotalHalalas / 100,
      discount: discountHalalas / 100,
      discountTotal: discountHalalas / 100,
      vat: vatHalalas / 100,
      grand: totalHalalas / 100,
      total: totalHalalas / 100,
      revenueAllocations,
      expenseAllocations
    };
  }

  function resolvePaymentBreakdown(totalValue, paymentMethod = 'credit', paidAmountInput = 0, cashAccount = '110101') {
    const total = roundCurrency(totalValue);
    const method = VALID_PAYMENT_METHODS.includes(paymentMethod) ? paymentMethod : 'credit';

    if (total <= 0) {
      return {
        paymentMethod: method,
        paidAmount: 0,
        remainingAmount: 0,
        status: 'unpaid',
        cashAccount: String(cashAccount || '110101')
      };
    }

    if (method === 'cash') {
      return {
        paymentMethod: 'cash',
        paidAmount: total,
        remainingAmount: 0,
        status: 'paid',
        cashAccount: String(cashAccount || '110101')
      };
    }

    if (method === 'credit') {
      return {
        paymentMethod: 'credit',
        paidAmount: 0,
        remainingAmount: total,
        status: 'unpaid',
        cashAccount: String(cashAccount || '110101')
      };
    }

    const paidRaw = roundCurrency(paidAmountInput);
    const paidAmount = Math.max(0, Math.min(paidRaw, total));
    const remainingAmount = roundCurrency(total - paidAmount);
    const status = remainingAmount === 0 ? 'paid' : (paidAmount > 0 ? 'partial' : 'unpaid');

    return {
      paymentMethod: 'partial',
      paidAmount,
      remainingAmount,
      status,
      cashAccount: String(cashAccount || '110101')
    };
  }

  function isReceivableAccount(accountCode, accountObj) {
    const code = String(accountCode || (accountObj && accountObj.code) || '').trim();
    const subType = String((accountObj && (accountObj.sub_type || accountObj.subType)) || '').toLowerCase();
    const nameAr = String((accountObj && (accountObj.name || accountObj.name_ar)) || '');
    return code.startsWith('1103') || subType === 'receivable' || nameAr.includes('العملاء') || nameAr.includes('ذمم مدينة');
  }

  function isPayableAccount(accountCode, accountObj) {
    const code = String(accountCode || (accountObj && accountObj.code) || '').trim();
    const subType = String((accountObj && (accountObj.sub_type || accountObj.subType)) || '').toLowerCase();
    const nameAr = String((accountObj && (accountObj.name || accountObj.name_ar)) || '');
    return code.startsWith('2101') || subType === 'payable' || nameAr.includes('الموردين') || nameAr.includes('الموردون') || nameAr.includes('ذمم دائنة');
  }

  function validateJournalEntry(payload = {}, context = {}) {
    const errors = [];
    const lines = Array.isArray(payload.lines) ? payload.lines : [];
    const accounts = Array.isArray(context.accounts) ? context.accounts : (Array.isArray(context.chartOfAccounts) ? context.chartOfAccounts : []);
    const clients = Array.isArray(context.clients) ? context.clients : (Array.isArray(context.customers) ? context.customers : []);
    const suppliers = Array.isArray(context.suppliers) ? context.suppliers : [];
    const employees = Array.isArray(context.employees) ? context.employees : [];

    if (lines.length < 2) {
      errors.push('يجب أن يحتوي القيد المحاسبي على سطرين على الأقل (مدين ودائن).');
    }

    let totalDebit = 0;
    let totalCredit = 0;
    const normalizedLines = [];

    lines.forEach((line, idx) => {
      const lineNo = idx + 1;
      const rawAcc = String(line.accountCode || line.account || line.account_code || '').trim();
      const accountCode = rawAcc.includes(' - ') ? rawAcc.split(' - ')[0].trim() : rawAcc;
      const debit = roundCurrency(line.debit || 0);
      const credit = roundCurrency(line.credit || 0);
      const accountObj = accounts.find(a => String(a.code) === accountCode || String(a.id) === String(line.account_id || ''));

      if (!accountCode && !line.account_id) {
        errors.push(`السطر ${lineNo}: يجب تحديد الحساب المحاسبي.`);
      }
      if (debit < 0 || credit < 0) {
        errors.push(`السطر ${lineNo}: لا تقبل المبالغ السالبة في المدين أو الدائن.`);
      }
      if (debit === 0 && credit === 0) {
        errors.push(`السطر ${lineNo}: يجب إدخال قيمة في المدين أو الدائن.`);
      }
      if (debit > 0 && credit > 0) {
        errors.push(`السطر ${lineNo}: لا يمكن أن يكون نفس السطر مديناً ودائناً في آن واحد.`);
      }

      let partyType = line.partyType ?? line.party_type ?? payload.partyType ?? payload.party_type ?? null;
      let partyId = line.partyId ?? line.party_id ?? payload.partyId ?? payload.party_id ?? null;
      let partyName = String(line.partyName || line.party_name || payload.partyName || payload.party_name || '').trim();

      if (partyType) partyType = String(partyType).toLowerCase().trim();
      if (partyType === 'none' || partyType === 'general' || partyType === '') partyType = null;

      const requiresCustomer = isReceivableAccount(accountCode, accountObj);
      const requiresSupplier = isPayableAccount(accountCode, accountObj);

      if (requiresCustomer) {
        if (partyType && partyType !== 'customer') {
          errors.push(`السطر ${lineNo} (${accountCode}): حساب العملاء يتطلب أن يكون نوع الطرف "عميل" (Customer) وليس "${partyType}".`);
        }
        partyType = 'customer';
        if (!partyId) {
          errors.push(`السطر ${lineNo} (${accountCode}): اختيار حساب ذمم العملاء يتطلب تحديد عميل مرتبط من قاعدة البيانات.`);
        } else {
          const foundClient = clients.find(c => String(c.id) === String(partyId) || c.name === partyId);
          if (clients.length > 0 && !foundClient) {
            errors.push(`السطر ${lineNo} (${accountCode}): العميل المحدد (${partyId}) غير موجود في سجل العملاء.`);
          } else if (foundClient) {
            partyId = foundClient.id;
            partyName = foundClient.name;
          }
        }
      } else if (requiresSupplier) {
        if (partyType && partyType !== 'supplier') {
          errors.push(`السطر ${lineNo} (${accountCode}): حساب الموردين يتطلب أن يكون نوع الطرف "مورد" (Supplier) وليس "${partyType}".`);
        }
        partyType = 'supplier';
        if (!partyId) {
          errors.push(`السطر ${lineNo} (${accountCode}): اختيار حساب ذمم الموردين يتطلب تحديد مورد مرتبط من قاعدة البيانات.`);
        } else {
          const foundSupplier = suppliers.find(s => String(s.id) === String(partyId) || s.name === partyId);
          if (suppliers.length > 0 && !foundSupplier) {
            errors.push(`السطر ${lineNo} (${accountCode}): المورد المحدد (${partyId}) غير موجود في سجل الموردين.`);
          } else if (foundSupplier) {
            partyId = foundSupplier.id;
            partyName = foundSupplier.name;
          }
        }
      } else if (partyType === 'customer' && partyId) {
        const foundClient = clients.find(c => String(c.id) === String(partyId) || c.name === partyId);
        if (foundClient) {
          partyId = foundClient.id;
          partyName = foundClient.name;
        }
      } else if (partyType === 'supplier' && partyId) {
        const foundSupplier = suppliers.find(s => String(s.id) === String(partyId) || s.name === partyId);
        if (foundSupplier) {
          partyId = foundSupplier.id;
          partyName = foundSupplier.name;
        }
      } else if (partyType === 'employee' && partyId) {
        const foundEmp = employees.find(e => String(e.id) === String(partyId) || e.name === partyId);
        if (foundEmp) {
          partyId = foundEmp.id;
          partyName = foundEmp.name;
        }
      }

      totalDebit = roundCurrency(totalDebit + debit);
      totalCredit = roundCurrency(totalCredit + credit);

      const accName = (accountObj && (accountObj.name || accountObj.name_ar)) || line.accountName || rawAcc || accountCode;
      normalizedLines.push({
        account: rawAcc.includes(' - ') ? rawAcc : `${accountCode} - ${accName}`,
        accountCode,
        accountName: accName,
        debit,
        credit,
        partyType: partyType || null,
        partyId: partyId || null,
        partyName: partyName || '',
        costCenter: String(line.costCenter || line.cost_center || payload.costCenter || 'CC-MAIN').trim(),
        branch: String(line.branch || payload.branch || 'الفرع الرئيسي').trim(),
        projectRef: String(line.projectRef || line.project_ref || payload.projectRef || '').trim(),
        sourceDocRef: String(line.sourceDocRef || line.source_doc_ref || payload.ref || payload.sourceDocRef || '').trim(),
        desc: String(line.desc || line.description || payload.desc || '').trim()
      });
    });

    if (totalDebit <= 0 || totalCredit <= 0) {
      errors.push('إجمالي القيد يجب أن يكون أكبر من صفر.');
    }
    if (roundCurrency(totalDebit - totalCredit) !== 0) {
      errors.push(`القيد غير متوازن: إجمالي المدين (${totalDebit.toFixed(2)}) لا يساوي إجمالي الدائن (${totalCredit.toFixed(2)}).`);
    }

    return {
      valid: errors.length === 0,
      error: errors[0] || null,
      errors,
      totalDebit,
      totalCredit,
      balanced: roundCurrency(totalDebit - totalCredit) === 0 && totalDebit > 0,
      lines: normalizedLines,
      normalizedLines
    };
  }

  function validateInvoicePayload(payload = {}, context = {}) {
    const errors = [];
    const client = String(payload.client ?? '').trim();
    const customerId = payload.customerId || payload.customer_id || null;
    const date = String(payload.date || new Date().toISOString().slice(0, 10)).trim();
    const due = String(payload.due || payload.dueDate || date).trim();
    const paymentMethod = String(payload.paymentMethod || (payload.status === 'paid' ? 'cash' : 'credit')).trim();
    const taxMode = VALID_TAX_MODES.includes(String(payload.taxMode || 'exclusive').toLowerCase())
      ? String(payload.taxMode || 'exclusive').toLowerCase()
      : 'exclusive';

    const clients = Array.isArray(context.clients) ? context.clients : (Array.isArray(context.customers) ? context.customers : []);
    const matchedClient = clients.find(c =>
      (customerId && String(c.id) === String(customerId)) ||
      (client && c.name === client)
    );

    if (!client && !matchedClient) {
      errors.push('اسم العميل مطلوب ويجب اختياره من سجل العملاء.');
    }
    if (!date) {
      errors.push('تاريخ الإصدار مطلوب.');
    }
    if (!due) {
      errors.push('تاريخ الاستحقاق مطلوب.');
    }
    if (date && due && due < date) {
      errors.push('تاريخ الاستحقاق لا يمكن أن يكون قبل تاريخ الإصدار.');
    }

    const receivableAccount = String(
      payload.receivableAccount ||
      (matchedClient && matchedClient.arAccount) ||
      '110301'
    ).trim();

    if (receivableAccount.startsWith('4')) {
      errors.push('خطأ محاسبي: لا يمكن استخدام حساب إيرادات المبيعات كحساب ذمم العملاء.');
    }

    const defaultRevenueAccount = String(
      payload.revenueAccount ||
      (matchedClient && matchedClient.defaultRevenueAccount) ||
      '410101'
    ).trim();

    let calc = {
      taxMode,
      items: [],
      grossSubtotal: 0,
      discountTotal: 0,
      subtotal: 0,
      vat: 0,
      total: 0,
      revenueAllocations: {}
    };

    try {
      calc = calculateInvoice(payload.items || [], {
        taxMode,
        taxSettings: context.taxSettings,
        defaultRevenueAccount,
        defaultCostCenter: payload.costCenter || 'CC-MAIN',
        defaultWarehouse: payload.warehouse || 'المستودع الرئيسي'
      });
    } catch (calcErr) {
      errors.push(calcErr.message);
    }

    calc.items.forEach((item, idx) => {
      if (!item.revenueAccount) {
        errors.push(`البند ${idx + 1}: يجب تحديد حساب الإيراد.`);
      } else if (isReceivableAccount(item.revenueAccount)) {
        errors.push(`البند ${idx + 1}: لا يجوز اختيار حساب العملاء (${item.revenueAccount}) كحساب إيراد للبند.`);
      }
    });

    const payment = resolvePaymentBreakdown(
      calc.total,
      paymentMethod,
      payload.paidAmount,
      payload.cashAccount
    );

    if (paymentMethod === 'partial') {
      const rawPaid = Number(payload.paidAmount);
      if (!Number.isFinite(rawPaid) || rawPaid <= 0) {
        errors.push('في الدفع الجزئي يجب إدخال مبلغ محصل أكبر من صفر.');
      }
      if (Number.isFinite(rawPaid) && rawPaid > calc.total) {
        errors.push('المبلغ المحصل لا يمكن أن يتجاوز إجمالي الفاتورة.');
      }
    }

    return {
      valid: errors.length === 0,
      error: errors[0] || null,
      errors,
      customer: matchedClient || (client ? { id: customerId || 'CLI-GEN', name: client } : null),
      calc,
      normalized: {
        id: payload.id ? String(payload.id).trim() : '',
        customerId: matchedClient ? matchedClient.id : (customerId || 'CLI-GEN'),
        client: matchedClient ? matchedClient.name : client,
        clientVat: String(payload.clientVat ?? (matchedClient && matchedClient.vat) ?? '').trim(),
        clientAddr: String(payload.clientAddr ?? payload.clientAddress ?? (matchedClient && matchedClient.addr) ?? '').trim(),
        date,
        due,
        type: String(payload.type || 'فاتورة ضريبية'),
        taxMode,
        receivableAccount,
        revenueAccount: defaultRevenueAccount,
        outputVatAccount: String(payload.outputVatAccount || '210201').trim(),
        warehouse: String(payload.warehouse || 'المستودع الرئيسي').trim(),
        costCenter: String(payload.costCenter || 'CC-MAIN').trim(),
        branch: String(payload.branch || 'الفرع الرئيسي').trim(),
        projectRef: String(payload.projectRef || '').trim(),
        currency: String(payload.currency || 'SAR').trim(),
        exchangeRate: roundCurrency(payload.exchangeRate || 1) || 1,
        notes: String(payload.notes ?? '').trim(),
        internalRef: String(payload.internalRef ?? '').trim(),
        items: calc.items,
        grossSubtotal: calc.grossSubtotal,
        discountTotal: calc.discountTotal,
        subtotal: calc.subtotal,
        vat: calc.vat,
        total: calc.total,
        revenueAllocations: calc.revenueAllocations,
        ...payment
      }
    };
  }

  function validatePurchaseInvoicePayload(payload = {}, context = {}) {
    const errors = [];
    const supplier = String(payload.supplier ?? payload.supplierName ?? '').trim();
    const supplierId = payload.supplierId || payload.supplier_id || null;
    const date = String(payload.date || new Date().toISOString().slice(0, 10)).trim();
    const due = String(payload.due || payload.dueDate || date).trim();
    const paymentMethod = String(payload.paymentMethod || (payload.status === 'paid' ? 'cash' : 'credit')).trim();
    const taxMode = VALID_TAX_MODES.includes(String(payload.taxMode || 'exclusive').toLowerCase())
      ? String(payload.taxMode || 'exclusive').toLowerCase()
      : 'exclusive';

    const suppliers = Array.isArray(context.suppliers) ? context.suppliers : [];
    const matchedSupplier = suppliers.find(s =>
      (supplierId && String(s.id) === String(supplierId)) ||
      (supplier && s.name === supplier)
    );

    if (!supplier && !matchedSupplier) {
      errors.push('اسم المورد مطلوب ويجب اختياره من سجل الموردين.');
    }
    if (!date) {
      errors.push('تاريخ الفاتورة مطلوب.');
    }

    const payableAccount = String(
      payload.payableAccount ||
      (matchedSupplier && matchedSupplier.apAccount) ||
      '210101'
    ).trim();

    const defaultExpenseAccount = String(
      payload.expenseAccount ||
      (matchedSupplier && matchedSupplier.defaultExpenseAccount) ||
      '110401'
    ).trim();

    const rawItems = Array.isArray(payload.items) && payload.items.length > 0
      ? payload.items
      : (payload.itemsDesc ? [{
          desc: payload.itemsDesc,
          qty: 1,
          price: Number(payload.subtotal || payload.amount || 0),
          taxCategory: payload.taxCategory || 'standard',
          taxRate: payload.taxRate ?? 15,
          expenseAccount: defaultExpenseAccount
        }] : []);

    let calc = {
      taxMode,
      items: [],
      grossSubtotal: 0,
      discountTotal: 0,
      subtotal: 0,
      vat: 0,
      total: 0,
      expenseAllocations: {}
    };

    try {
      calc = calculateInvoice(rawItems, {
        taxMode,
        taxSettings: context.taxSettings,
        defaultExpenseAccount,
        defaultCostCenter: payload.costCenter || 'CC-MAIN',
        defaultWarehouse: payload.warehouse || 'المستودع الرئيسي'
      });
    } catch (calcErr) {
      errors.push(calcErr.message);
    }

    calc.items.forEach((item, idx) => {
      if (!item.expenseAccount) {
        errors.push(`البند ${idx + 1}: يجب تحديد حساب المصروف أو المخزون.`);
      } else if (isPayableAccount(item.expenseAccount)) {
        errors.push(`البند ${idx + 1}: لا يجوز اختيار حساب ذمم الموردين (${item.expenseAccount}) كحساب مصروف/مخزون للبند.`);
      }
    });

    const payment = resolvePaymentBreakdown(
      calc.total,
      paymentMethod,
      payload.paidAmount,
      payload.cashAccount
    );

    return {
      valid: errors.length === 0,
      error: errors[0] || null,
      errors,
      supplier: matchedSupplier || (supplier ? { id: supplierId || 'SUP-GEN', name: supplier } : null),
      calc,
      normalized: {
        id: payload.id ? String(payload.id).trim() : '',
        supplierId: matchedSupplier ? matchedSupplier.id : (supplierId || 'SUP-GEN'),
        supplier: matchedSupplier ? matchedSupplier.name : supplier,
        supplierVat: String(payload.supplierVat ?? (matchedSupplier && matchedSupplier.vat) ?? '').trim(),
        supplierInvoiceNumber: String(payload.supplierInvoiceNumber || payload.vendorInvoiceNo || '').trim(),
        date,
        due,
        taxMode,
        payableAccount,
        expenseAccount: defaultExpenseAccount,
        recoverableVatAccount: String(payload.recoverableVatAccount || '110501').trim(),
        warehouse: String(payload.warehouse || 'المستودع الرئيسي').trim(),
        costCenter: String(payload.costCenter || 'CC-MAIN').trim(),
        branch: String(payload.branch || 'الفرع الرئيسي').trim(),
        projectRef: String(payload.projectRef || '').trim(),
        notes: String(payload.notes ?? '').trim(),
        items: calc.items,
        itemsDesc: calc.items.map(i => i.desc).join(' + '),
        grossSubtotal: calc.grossSubtotal,
        discountTotal: calc.discountTotal,
        subtotal: calc.subtotal,
        vat: calc.vat,
        total: calc.total,
        expenseAllocations: calc.expenseAllocations,
        ...payment
      }
    };
  }

  function buildSalesInvoiceJournal(invoice, options = {}) {
    const arAccount = String(invoice.receivableAccount || '110301');
    const outputVatAccount = String(invoice.outputVatAccount || '210201');
    const clientName = invoice.client || invoice.customerName || '';
    const invTotal = roundCurrency(invoice.total ?? (invoice.calc && invoice.calc.total) ?? 0);
    const invSubtotal = roundCurrency(invoice.subtotal ?? (invoice.calc && invoice.calc.subtotal) ?? 0);
    const invVat = roundCurrency(invoice.vat ?? (invoice.calc && invoice.calc.vat) ?? 0);
    const rawAllocations = invoice.revenueAllocations || (invoice.calc && invoice.calc.revenueAllocations) || {};
    const lines = [];

    lines.push({
      account: `${arAccount} - العملاء والمدينون التجاريون`,
      accountCode: arAccount,
      accountName: 'العملاء (الذمم المدينة)',
      debit: invTotal,
      credit: 0,
      partyType: 'customer',
      partyId: invoice.customerId || null,
      partyName: clientName,
      costCenter: invoice.costCenter || 'CC-MAIN',
      branch: invoice.branch || 'الفرع الرئيسي',
      sourceDocRef: invoice.id,
      desc: `إثبات استحقاق فاتورة مبيعات ${invoice.id} - ${clientName}`
    });

    const allocations = Object.keys(rawAllocations).length > 0
      ? rawAllocations
      : { [invoice.revenueAccount || '410101']: invSubtotal };

    for (const [revAccount, netAmt] of Object.entries(allocations)) {
      if (roundCurrency(netAmt) > 0) {
        const revCode = revAccount.includes(' - ') ? revAccount.split(' - ')[0].trim() : revAccount;
        const revName = revCode === '410201' ? 'إيرادات الخدمات والاستشارات' : 'إيرادات المبيعات';
        lines.push({
          account: revAccount.includes(' - ') ? revAccount : `${revCode} - ${revName}`,
          accountCode: revCode,
          accountName: revName,
          debit: 0,
          credit: roundCurrency(netAmt),
          partyType: 'customer',
          partyId: invoice.customerId || null,
          partyName: clientName,
          costCenter: invoice.costCenter || 'CC-MAIN',
          branch: invoice.branch || 'الفرع الرئيسي',
          sourceDocRef: invoice.id,
          desc: `إيراد فاتورة مبيعات ${invoice.id} (${revCode})`
        });
      }
    }

    if (invVat > 0) {
      lines.push({
        account: `${outputVatAccount} - ضريبة القيمة المضافة المخرجة`,
        accountCode: outputVatAccount,
        accountName: 'ضريبة القيمة المضافة المستحقة (مخرجات)',
        debit: 0,
        credit: invVat,
        partyType: null,
        partyId: null,
        partyName: '',
        costCenter: invoice.costCenter || 'CC-MAIN',
        branch: invoice.branch || 'الفرع الرئيسي',
        sourceDocRef: invoice.id,
        desc: `ضريبة مخرجات فاتورة مبيعات ${invoice.id}`
      });
    }

    if (options.includeCogs && Array.isArray(invoice.items)) {
      for (const item of invoice.items) {
        const totalCost = roundCurrency((item.costPrice || 0) * (item.qty || 0));
        if (totalCost > 0) {
          const cogsCode = item.cogsAccount || '510101';
          const invCode = item.inventoryAssetAccount || '110401';
          lines.push({
            account: `${cogsCode} - تكلفة البضاعة المباعة`,
            accountCode: cogsCode,
            accountName: 'تكلفة البضاعة المباعة',
            debit: totalCost,
            credit: 0,
            partyType: null,
            partyId: null,
            partyName: '',
            costCenter: item.costCenter || invoice.costCenter || 'CC-MAIN',
            branch: invoice.branch || 'الفرع الرئيسي',
            sourceDocRef: invoice.id,
            desc: `تكلفة مبيعات الصنف ${item.desc} - فاتورة ${invoice.id}`
          });
          lines.push({
            account: `${invCode} - المخزون`,
            accountCode: invCode,
            accountName: 'المخزون',
            debit: 0,
            credit: totalCost,
            partyType: null,
            partyId: null,
            partyName: '',
            costCenter: item.costCenter || invoice.costCenter || 'CC-MAIN',
            branch: invoice.branch || 'الفرع الرئيسي',
            sourceDocRef: invoice.id,
            desc: `صرف مخزني للصنف ${item.desc} - فاتورة ${invoice.id}`
          });
        }
      }
    }

    return {
      date: invoice.date,
      ref: invoice.id,
      sourceId: invoice.id,
      sourceDocRef: invoice.id,
      partyType: 'customer',
      partyId: invoice.customerId || null,
      partyName: clientName,
      desc: `قيد فاتورة مبيعات ${invoice.id} - ${clientName} (${invoice.taxMode === 'inclusive' ? 'شامل الضريبة' : 'غير شامل الضريبة'})`,
      type: 'auto',
      posted: true,
      lines
    };
  }

  function buildPurchaseInvoiceJournal(purchase) {
    const apAccount = String(purchase.payableAccount || '210101');
    const recoverableVatAccount = String(purchase.recoverableVatAccount || '110501');
    const supplierName = purchase.supplier || purchase.supplierName || '';
    const purTotal = roundCurrency(purchase.total ?? (purchase.calc && purchase.calc.total) ?? 0);
    const purSubtotal = roundCurrency(purchase.subtotal ?? (purchase.calc && purchase.calc.subtotal) ?? 0);
    const purVat = roundCurrency(purchase.vat ?? (purchase.calc && purchase.calc.vat) ?? 0);
    const rawAllocations = purchase.expenseAllocations || (purchase.calc && purchase.calc.expenseAllocations) || {};
    const lines = [];

    const allocations = Object.keys(rawAllocations).length > 0
      ? rawAllocations
      : { [purchase.expenseAccount || '110401']: purSubtotal };

    for (const [expAccount, netAmt] of Object.entries(allocations)) {
      if (roundCurrency(netAmt) > 0) {
        const expCode = expAccount.includes(' - ') ? expAccount.split(' - ')[0].trim() : expAccount;
        const expName = expCode.startsWith('1104') ? 'المخزون' : 'مصروفات ومشتريات';
        lines.push({
          account: expAccount.includes(' - ') ? expAccount : `${expCode} - ${expName}`,
          accountCode: expCode,
          accountName: expName,
          debit: roundCurrency(netAmt),
          credit: 0,
          partyType: 'supplier',
          partyId: purchase.supplierId || null,
          partyName: supplierName,
          costCenter: purchase.costCenter || 'CC-MAIN',
          branch: purchase.branch || 'الفرع الرئيسي',
          sourceDocRef: purchase.id,
          desc: `مشتريات/مصروفات فاتورة ${purchase.id} (${expCode})`
        });
      }
    }

    if (purVat > 0) {
      lines.push({
        account: `${recoverableVatAccount} - ضريبة القيمة المضافة المدخلات`,
        accountCode: recoverableVatAccount,
        accountName: 'ضريبة القيمة المضافة المدخلات (قابلة للاسترداد)',
        debit: purVat,
        credit: 0,
        partyType: null,
        partyId: null,
        partyName: '',
        costCenter: purchase.costCenter || 'CC-MAIN',
        branch: purchase.branch || 'الفرع الرئيسي',
        sourceDocRef: purchase.id,
        desc: `ضريبة مدخلات فاتورة مشتريات ${purchase.id}`
      });
    }

    lines.push({
      account: `${apAccount} - الموردون والذمم الدائنة`,
      accountCode: apAccount,
      accountName: 'الموردون (الذمم الدائنة)',
      debit: 0,
      credit: purTotal,
      partyType: 'supplier',
      partyId: purchase.supplierId || null,
      partyName: supplierName,
      costCenter: purchase.costCenter || 'CC-MAIN',
      branch: purchase.branch || 'الفرع الرئيسي',
      sourceDocRef: purchase.id,
      desc: `إثبات استحقاق فاتورة مشتريات ${purchase.id} - ${supplierName}`
    });

    return {
      date: purchase.date,
      ref: purchase.id,
      sourceId: purchase.id,
      sourceDocRef: purchase.id,
      partyType: 'supplier',
      partyId: purchase.supplierId || null,
      partyName: supplierName,
      desc: `قيد فاتورة مشتريات ${purchase.id} - ${supplierName} (${purchase.taxMode === 'inclusive' ? 'شامل الضريبة' : 'غير شامل الضريبة'})`,
      type: 'auto',
      posted: true,
      lines
    };
  }

  function computeGeneralLedger(arg1 = {}, arg2 = {}) {
    const isStateFirst = arg1 && Array.isArray(arg1.journals);
    const filters = isStateFirst ? arg2 : arg1;
    const state = isStateFirst ? arg1 : arg2;
    const journals = Array.isArray(state.journals) ? state.journals : [];
    const accounts = Array.isArray(state.accounts) ? state.accounts : (Array.isArray(state.chartOfAccounts) ? state.chartOfAccounts : []);
    const accountFilter = filters.accountCode ? String(filters.accountCode).trim() : null;
    const partyTypeFilter = filters.partyType ? String(filters.partyType).toLowerCase().trim() : null;
    const partyIdFilter = filters.partyId ? String(filters.partyId).trim() : null;
    const partyNameFilter = filters.partyName ? String(filters.partyName).trim() : null;
    const costCenterFilter = filters.costCenter ? String(filters.costCenter).trim() : null;
    const fromDate = filters.fromDate ? String(filters.fromDate).trim() : null;
    const toDate = filters.toDate ? String(filters.toDate).trim() : null;

    const sortedJournals = [...journals]
      .filter(j => j && j.status !== 'void' && j.status !== 'cancelled' && j.status !== 'معكوس')
      .sort((a, b) => String(a.date || '').localeCompare(String(b.date || '')) || String(a.id || '').localeCompare(String(b.id || '')));

    let openingDebit = 0;
    let openingCredit = 0;
    const rawEntries = [];

    for (const jrn of sortedJournals) {
      const jDate = String(jrn.date || '');
      const jLines = Array.isArray(jrn.lines) ? jrn.lines : [];

      for (const line of jLines) {
        const rawAcc = String(line.accountCode || line.account || '').trim();
        const lineAcc = rawAcc.includes(' - ') ? rawAcc.split(' - ')[0].trim() : rawAcc;
        const linePartyType = String(line.partyType || jrn.partyType || '').toLowerCase().trim();
        const linePartyId = String(line.partyId || jrn.partyId || '').trim();
        const linePartyName = String(line.partyName || jrn.partyName || '').trim();
        const lineCostCenter = String(line.costCenter || jrn.costCenter || 'CC-MAIN').trim();

        if (accountFilter && lineAcc !== accountFilter && !lineAcc.startsWith(accountFilter)) continue;
        if (partyTypeFilter && linePartyType !== partyTypeFilter) continue;
        if (partyIdFilter && linePartyId !== partyIdFilter && linePartyName !== partyIdFilter) continue;
        if (partyNameFilter && !linePartyName.includes(partyNameFilter)) continue;
        if (costCenterFilter && lineCostCenter !== costCenterFilter) continue;

        const debit = roundCurrency(line.debit || 0);
        const credit = roundCurrency(line.credit || 0);

        if (fromDate && jDate < fromDate) {
          openingDebit = roundCurrency(openingDebit + debit);
          openingCredit = roundCurrency(openingCredit + credit);
          continue;
        }
        if (toDate && jDate > toDate) continue;

        const accObj = accounts.find(a => String(a.code) === lineAcc);
        const docRef = line.sourceDocRef || jrn.sourceDocRef || jrn.sourceId || jrn.ref || jrn.id;
        rawEntries.push({
          journalId: jrn.id,
          date: jDate,
          ref: docRef,
          sourceDocRef: docRef,
          accountCode: lineAcc,
          accountName: (accObj && accObj.name) || line.accountName || rawAcc || lineAcc,
          accountType: (accObj && accObj.type) || 'asset',
          partyType: linePartyType || null,
          partyId: linePartyId || null,
          partyName: linePartyName || '',
          costCenter: lineCostCenter,
          description: line.desc || jrn.desc || '',
          debit,
          credit
        });
      }
    }

    const isCreditNormal = partyTypeFilter === 'supplier' ||
      (accountFilter && (accountFilter.startsWith('2') || accountFilter.startsWith('3') || accountFilter.startsWith('4')));

    const openingBalance = isCreditNormal
      ? roundCurrency(openingCredit - openingDebit)
      : roundCurrency(openingDebit - openingCredit);

    let runningBalance = openingBalance;
    let periodDebit = 0;
    let periodCredit = 0;

    const entries = rawEntries.map(entry => {
      periodDebit = roundCurrency(periodDebit + entry.debit);
      periodCredit = roundCurrency(periodCredit + entry.credit);
      runningBalance = isCreditNormal
        ? roundCurrency(runningBalance + entry.credit - entry.debit)
        : roundCurrency(runningBalance + entry.debit - entry.credit);
      return {
        ...entry,
        runningBalance
      };
    });

    return {
      filters: { accountCode: accountFilter, partyType: partyTypeFilter, partyId: partyIdFilter, costCenter: costCenterFilter, fromDate, toDate },
      normalSide: isCreditNormal ? 'credit' : 'debit',
      openingBalance,
      totalDebit: periodDebit,
      totalCredit: periodCredit,
      closingBalance: runningBalance,
      entries,
      rows: entries
    };
  }

  function computePartyStatement(arg1, arg2, arg3 = {}, arg4 = {}) {
    const isStateFirst = arg1 && typeof arg1 === 'object';
    const state = isStateFirst ? arg1 : arg3;
    const partyType = isStateFirst ? arg2 : arg1;
    const partyIdOrName = isStateFirst ? arg3 : arg2;
    const dateFilter = isStateFirst ? arg4 : arg4;

    const normalizedType = String(partyType || 'customer').toLowerCase().trim();
    const list = normalizedType === 'supplier'
      ? (state.suppliers || [])
      : (Array.isArray(state.clients) ? state.clients : (Array.isArray(state.customers) ? state.customers : []));
    const party = list.find(p => String(p.id) === String(partyIdOrName) || p.name === partyIdOrName);
    const controlPrefix = normalizedType === 'supplier'
      ? (party && party.apAccount ? party.apAccount : '2101')
      : (party && party.arAccount ? party.arAccount : '1103');

    const ledger = computeGeneralLedger({
      accountCode: controlPrefix,
      partyType: normalizedType,
      partyId: party ? party.id : partyIdOrName,
      fromDate: dateFilter.fromDate,
      toDate: dateFilter.toDate
    }, state);

    if (ledger.entries.length === 0 && party) {
      const fallbackLedger = computeGeneralLedger({
        accountCode: controlPrefix.slice(0, 4),
        partyName: party.name,
        fromDate: dateFilter.fromDate,
        toDate: dateFilter.toDate
      }, state);
      return {
        partyType: normalizedType,
        partyId: party.id,
        partyName: party.name,
        controlAccount: controlPrefix,
        ...fallbackLedger
      };
    }

    return {
      partyType: normalizedType,
      partyId: party ? party.id : partyIdOrName,
      partyName: party ? party.name : String(partyIdOrName),
      controlAccount: controlPrefix,
      ...ledger
    };
  }

  return {
    DEFAULT_TAX_RATE,
    DEFAULT_TAX_SETTINGS,
    VALID_PAYMENT_METHODS,
    VALID_TAX_MODES,
    roundCurrency,
    toHalalas,
    escapeHtml,
    resolveTaxRate,
    calculateInvoice,
    resolvePaymentBreakdown,
    isReceivableAccount,
    isPayableAccount,
    validateJournalEntry,
    validateInvoicePayload,
    validatePurchaseInvoicePayload,
    buildSalesInvoiceJournal,
    buildPurchaseInvoiceJournal,
    computeGeneralLedger,
    computePartyStatement
  };
});
