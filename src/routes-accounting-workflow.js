'use strict';

const express = require('express');
const fs = require('fs');
const path = require('path');
const InvoiceUtils = require('../public/js/invoice-utils');
const { requireAuth } = require('./routes-entities');
const { recalculatePartyBalances, nextNumber } = require('./state-invoices');

const router = express.Router();
const WRITABLE_ROLES = new Set(['admin', 'cfo', 'chief_accountant', 'accountant']);

async function loadState(client) {
  const res = await client.query('SELECT data FROM system_state WHERE key = $1 FOR UPDATE', ['main_state']);
  if (res.rows.length > 0 && res.rows[0].data) {
    return res.rows[0].data;
  }
  const dataFile = path.join(__dirname, '..', 'web', 'data.json');
  if (fs.existsSync(dataFile)) {
    return JSON.parse(fs.readFileSync(dataFile, 'utf8'));
  }
  return {
    branches: [{ id: 'law', name: 'المنشأة الرئيسية' }],
    accounts: [],
    clients: [],
    suppliers: [],
    inventory: [],
    invoices: [],
    purchases: [],
    journals: [],
    vouchers: [],
    treasury: { cash: 0, rajhi: 0, ahli: 0 },
    _revision: 0
  };
}

async function saveState(client, state, userId) {
  state._revision = (Number(state._revision) || 0) + 1;
  state._updatedAt = new Date().toISOString();
  state._updatedBy = userId || 'system';
  await client.query(`
    INSERT INTO system_state (key, data, updated_at)
    VALUES ('main_state', $1, now())
    ON CONFLICT (key) DO UPDATE SET data = EXCLUDED.data, updated_at = now()
  `, [state]);
  return state;
}

function ensureAccountingCollections(state) {
  if (!Array.isArray(state.accounts)) state.accounts = [];
  if (!Array.isArray(state.clients)) state.clients = [];
  if (!Array.isArray(state.suppliers)) state.suppliers = [];
  if (!Array.isArray(state.inventory)) state.inventory = [];
  if (!Array.isArray(state.invoices)) state.invoices = [];
  if (!Array.isArray(state.purchases)) state.purchases = [];
  if (!Array.isArray(state.journals)) state.journals = [];
  if (!Array.isArray(state.vouchers)) state.vouchers = [];
  if (!Array.isArray(state.returns)) state.returns = [];
  if (!state.taxSettings || typeof state.taxSettings !== 'object') {
    state.taxSettings = { ...InvoiceUtils.DEFAULT_TAX_SETTINGS };
  }
  if (!Array.isArray(state.costCenters) || state.costCenters.length === 0) {
    state.costCenters = [
      { code: 'CC-MAIN', name: 'المركز الرئيسي - الإدارة العامة', branch: 'الفرع الرئيسي' },
      { code: 'CC-SALES', name: 'مركز تكلفة المبيعات والتسويق', branch: 'الفرع الرئيسي' },
      { code: 'CC-PROJECTS', name: 'مركز تكلفة المشاريع والتنفيذ', branch: 'الفرع الرئيسي' },
      { code: 'CC-BRANCH-JED', name: 'فرع جدة - المنطقة الغربية', branch: 'فرع جدة' }
    ];
  }
  return state;
}

// 1. GET /api/accounting/config
router.get('/config', requireAuth, async (req, res) => {
  try {
    const { pool } = require('./lib');
    const result = await pool.query('SELECT data FROM system_state WHERE key = $1', ['main_state']);
    const state = ensureAccountingCollections(result.rows.length ? result.rows[0].data : {});
    res.json({
      success: true,
      taxSettings: state.taxSettings,
      costCenters: state.costCenters,
      defaultAccounts: {
        customerReceivable: '110301',
        supplierPayable: '210101',
        salesRevenue: '410101',
        serviceRevenue: '410201',
        inventoryAsset: '110401',
        cogs: '510101',
        outputVat: '210201',
        recoverableInputVat: '110501',
        cash: '110101',
        bank: '110201'
      }
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 2. POST /api/accounting/tax-settings
router.post('/tax-settings', requireAuth, async (req, res) => {
  if (!WRITABLE_ROLES.has(req.user.role)) {
    return res.status(403).json({ error: 'غير مصرح بتعديل إعدادات الضريبة' });
  }
  try {
    const { withTransaction } = require('./lib');
    const updated = await withTransaction(async client => {
      const state = ensureAccountingCollections(await loadState(client));
      const incoming = req.body || {};
      for (const [key, val] of Object.entries(incoming)) {
        if (val && typeof val === 'object' && Number.isFinite(Number(val.rate))) {
          state.taxSettings[key] = {
            ...(state.taxSettings[key] || {}),
            code: key,
            nameAr: val.nameAr || key,
            rate: InvoiceUtils.roundCurrency(val.rate),
            recoverable: val.recoverable !== undefined ? Boolean(val.recoverable) : true
          };
        }
      }
      await saveState(client, state, req.user.id);
      return state.taxSettings;
    });
    res.json({ success: true, taxSettings: updated });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// 3. POST /api/accounting/journals — Create Party-Linked Multi-Line Journal Entry
router.post('/journals', requireAuth, async (req, res) => {
  if (!WRITABLE_ROLES.has(req.user.role)) {
    return res.status(403).json({ error: 'صلاحيتك لا تسمح بإنشاء قيود يومية' });
  }
  try {
    const { withTransaction } = require('./lib');
    const result = await withTransaction(async client => {
      const state = ensureAccountingCollections(await loadState(client));
      const payload = req.body || {};

      if (payload.operationId) {
        const existing = state.journals.find(j => j._operationId === payload.operationId);
        if (existing) return { journal: existing, state, idempotent: true };
      }

      const validation = InvoiceUtils.validateJournalEntry(payload, {
        accounts: state.accounts,
        clients: state.clients,
        suppliers: state.suppliers,
        employees: state.employees
      });

      if (!validation.valid) {
        const err = new Error(validation.errors[0]);
        err.status = 400;
        err.details = validation.errors;
        throw err;
      }

      const date = String(payload.date || new Date().toISOString().slice(0, 10));
      const entity = String(payload.entity || 'law');
      const id = payload.id || await nextNumber(client, 'JRN', entity, date);

      if (state.journals.some(j => j.id === id)) {
        const err = new Error(`القيد رقم ${id} مسجل مسبقاً، لا يمكن تكرار الترحيل`);
        err.status = 409;
        throw err;
      }

      const primaryParty = validation.lines.find(l => l.partyType && l.partyId) || {};
      const journalEntry = {
        id,
        date,
        entity,
        ref: payload.ref || payload.sourceDocRef || id,
        sourceId: payload.sourceId || payload.sourceDocRef || id,
        sourceDocRef: payload.sourceDocRef || payload.ref || id,
        desc: String(payload.desc || payload.description || `قيد يومية ${id}`).trim(),
        partyType: payload.partyType || primaryParty.partyType || null,
        partyId: payload.partyId || primaryParty.partyId || null,
        partyName: payload.partyName || primaryParty.partyName || '',
        costCenter: payload.costCenter || 'CC-MAIN',
        branch: payload.branch || 'الفرع الرئيسي',
        amount: validation.totalDebit,
        totalDebit: validation.totalDebit,
        totalCredit: validation.totalCredit,
        status: 'متزن',
        type: payload.type || 'manual',
        posted: true,
        isLocked: true,
        _operationId: payload.operationId || null,
        debit: validation.lines.length === 2 ? validation.lines.find(l => l.debit > 0)?.account : `${validation.lines.length} حسابات`,
        credit: validation.lines.length === 2 ? validation.lines.find(l => l.credit > 0)?.account : `${validation.lines.length} حسابات`,
        lines: validation.lines,
        createdAt: new Date().toISOString(),
        createdBy: req.user.id
      };

      state.journals.unshift(journalEntry);
      recalculatePartyBalances(state);
      await saveState(client, state, req.user.id);
      return { journal: journalEntry, state, idempotent: false };
    });

    res.status(result.idempotent ? 200 : 201).json({
      success: true,
      journal: result.journal,
      state: result.state,
      idempotent: result.idempotent
    });
  } catch (err) {
    res.status(err.status || 400).json({ error: err.message, details: err.details || [] });
  }
});

// 4. POST /api/accounting/sales-invoices — Full Page-Level Accounting Sales Invoice
router.post('/sales-invoices', requireAuth, async (req, res) => {
  if (!WRITABLE_ROLES.has(req.user.role)) {
    return res.status(403).json({ error: 'صلاحيتك لا تسمح بإصدار فواتير المبيعات' });
  }
  try {
    const { withTransaction } = require('./lib');
    const result = await withTransaction(async client => {
      const state = ensureAccountingCollections(await loadState(client));
      const payload = { ...(req.body || {}) };

      if (payload.operationId) {
        const existing = state.invoices.find(inv => inv._operationId === payload.operationId);
        if (existing) return { invoice: existing, state, idempotent: true };
      }

      // Enrich line items from product catalog if productId is supplied
      if (Array.isArray(payload.items)) {
        payload.items = payload.items.map(item => {
          const prod = (state.inventory || []).find(p =>
            (item.productId && (p.id === item.productId || p.sku === item.productId)) ||
            (item.sku && p.sku === item.sku) ||
            (item.desc && p.name === item.desc)
          );
          if (!prod) return item;
          return {
            ...item,
            productId: prod.id || prod.sku,
            sku: prod.sku || item.sku || '',
            desc: item.desc || prod.name,
            price: item.price !== undefined ? item.price : (prod.price || 0),
            unit: item.unit || prod.defaultUnit || prod.unit || 'وحدة',
            revenueAccount: item.revenueAccount || prod.salesRevenueAccount || '410101',
            inventoryAssetAccount: item.inventoryAssetAccount || prod.inventoryAssetAccount || '110401',
            cogsAccount: item.cogsAccount || prod.cogsAccount || '510101',
            taxCategory: item.taxCategory || prod.vatTreatment || 'standard',
            costPrice: item.costPrice !== undefined ? item.costPrice : (prod.cost || 0)
          };
        });
      }

      const validation = InvoiceUtils.validateInvoicePayload(payload, {
        clients: state.clients,
        taxSettings: state.taxSettings
      });

      if (!validation.valid) {
        const err = new Error(validation.errors[0]);
        err.status = 400;
        err.details = validation.errors;
        throw err;
      }

      const norm = validation.normalized;
      const entity = String(payload.entity || 'law');
      const id = norm.id || await nextNumber(client, 'INV', entity, norm.date);

      if (state.invoices.some(inv => inv.id === id)) {
        const err = new Error(`الفاتورة رقم ${id} مسجلة ومرحلة مسبقاً، لا يمكن تكرار الترحيل`);
        err.status = 409;
        throw err;
      }

      // Ensure client exists in state.clients
      let clientRecord = state.clients.find(c =>
        (norm.customerId && String(c.id) === String(norm.customerId)) || c.name === norm.client
      );
      if (!clientRecord) {
        clientRecord = {
          id: norm.customerId && norm.customerId !== 'CLI-GEN'
            ? norm.customerId
            : `CLI-${String(state.clients.length + 1).padStart(3, '0')}`,
          name: norm.client,
          vat: norm.clientVat || '—',
          addr: norm.clientAddr || 'الرياض',
          arAccount: norm.receivableAccount || '110301',
          defaultRevenueAccount: norm.revenueAccount || '410101',
          paymentTerms: 'net30',
          creditLimit: 100000,
          currency: norm.currency || 'SAR',
          balance: 0
        };
        state.clients.push(clientRecord);
      }
      norm.customerId = clientRecord.id;
      norm.client = clientRecord.name;

      const invoiceRecord = {
        id,
        entity,
        customerId: clientRecord.id,
        client: clientRecord.name,
        clientVat: norm.clientVat,
        clientAddress: norm.clientAddr,
        date: norm.date,
        dueDate: norm.due,
        due: norm.due,
        docType: 'tax_invoice',
        type: norm.type,
        taxMode: norm.taxMode,
        receivableAccount: norm.receivableAccount,
        revenueAccount: norm.revenueAccount,
        outputVatAccount: norm.outputVatAccount,
        revenueAllocations: norm.revenueAllocations,
        warehouse: norm.warehouse,
        costCenter: norm.costCenter,
        branch: norm.branch,
        projectRef: norm.projectRef,
        currency: norm.currency,
        exchangeRate: norm.exchangeRate,
        grossSubtotal: norm.grossSubtotal,
        subtotal: norm.subtotal,
        discount: norm.discountTotal,
        discountTotal: norm.discountTotal,
        vat: norm.vat,
        total: norm.total,
        paymentMethod: norm.paymentMethod,
        paidAmount: norm.paidAmount,
        outstanding: norm.remainingAmount,
        remainingAmount: norm.remainingAmount,
        cashAccount: norm.cashAccount,
        status: norm.status,
        item: norm.items.map(i => i.desc).join(' + '),
        items: norm.items,
        notes: norm.notes,
        internalRef: norm.internalRef,
        _operationId: payload.operationId || null,
        posted: true,
        isLocked: true,
        createdAt: new Date().toISOString(),
        createdBy: req.user.id
      };

      state.invoices.unshift(invoiceRecord);

      // Update inventory stock for physical items
      for (const item of invoiceRecord.items) {
        if (!item.productId) continue;
        const prod = state.inventory.find(p => p.id === item.productId || p.sku === item.productId);
        if (prod && prod.category !== 'خدمات') {
          prod.qty = Math.max(0, Number(prod.qty || 0) - Number(item.qty || 0));
        }
      }

      // Build and post Sales Invoice Journal Entry
      const jrnBuilt = InvoiceUtils.buildSalesInvoiceJournal(invoiceRecord, {
        includeCogs: Boolean(payload.includeCogs)
      });
      const saleJournalId = await nextNumber(client, 'JRN', entity, norm.date);
      const saleJournal = {
        id: saleJournalId,
        entity,
        ...jrnBuilt,
        amount: InvoiceUtils.roundCurrency(jrnBuilt.lines.reduce((s, l) => s + l.debit, 0)),
        totalDebit: InvoiceUtils.roundCurrency(jrnBuilt.lines.reduce((s, l) => s + l.debit, 0)),
        totalCredit: InvoiceUtils.roundCurrency(jrnBuilt.lines.reduce((s, l) => s + l.credit, 0)),
        status: 'متزن',
        isLocked: true,
        debit: `${jrnBuilt.lines.length} حسابات`,
        credit: `${jrnBuilt.lines.length} حسابات`
      };
      state.journals.unshift(saleJournal);

      let receiptJournal = null;
      if (invoiceRecord.paidAmount > 0) {
        const receiptId = await nextNumber(client, 'RC', entity, norm.date);
        const receiptJournalId = await nextNumber(client, 'JRN', entity, norm.date);
        const cashKey = invoiceRecord.cashAccount === '110101' ? 'cash' : 'rajhi';
        const cashLabel = cashKey === 'cash' ? '110101 - الصندوق النقدي الرئيسي' : '110201 - حساب مصرف الراجحي';
        if (!state.treasury) state.treasury = { cash: 0, rajhi: 0, ahli: 0 };
        state.treasury[cashKey] = Number(state.treasury[cashKey] || 0) + invoiceRecord.paidAmount;

        state.vouchers.unshift({
          id: receiptId,
          type: 'قبض',
          entity,
          date: norm.date,
          customerId: clientRecord.id,
          client: clientRecord.name,
          account: cashLabel,
          amount: invoiceRecord.paidAmount,
          notes: `تحصيل فاتورة ${id} من ${clientRecord.name}`,
          invoiceId: id,
          user: req.user.name || req.user.email
        });

        receiptJournal = {
          id: receiptJournalId,
          date: norm.date,
          entity,
          ref: receiptId,
          sourceId: id,
          sourceDocRef: id,
          partyType: 'customer',
          partyId: clientRecord.id,
          partyName: clientRecord.name,
          costCenter: invoiceRecord.costCenter,
          desc: `سند قبض ${receiptId} - تحصيل فاتورة ${id}`,
          amount: invoiceRecord.paidAmount,
          totalDebit: invoiceRecord.paidAmount,
          totalCredit: invoiceRecord.paidAmount,
          status: 'متزن',
          type: 'auto',
          posted: true,
          isLocked: true,
          debit: cashLabel,
          credit: `${invoiceRecord.receivableAccount} - العملاء والمدينون التجاريون`,
          lines: [
            {
              account: cashLabel,
              accountCode: cashKey === 'cash' ? '110101' : '110201',
              accountName: cashKey === 'cash' ? 'الصندوق الرئيسي' : 'مصرف الراجحي',
              debit: invoiceRecord.paidAmount,
              credit: 0,
              partyType: null,
              partyId: null,
              partyName: '',
              costCenter: invoiceRecord.costCenter,
              sourceDocRef: receiptId,
              desc: `تحصيل سند قبض ${receiptId}`
            },
            {
              account: `${invoiceRecord.receivableAccount} - العملاء والمدينون التجاريون`,
              accountCode: invoiceRecord.receivableAccount,
              accountName: 'العملاء (الذمم المدينة)',
              debit: 0,
              credit: invoiceRecord.paidAmount,
              partyType: 'customer',
              partyId: clientRecord.id,
              partyName: clientRecord.name,
              costCenter: invoiceRecord.costCenter,
              sourceDocRef: id,
              desc: `سداد ذمة العميل ${clientRecord.name} عن فاتورة ${id}`
            }
          ]
        };
        state.journals.unshift(receiptJournal);
      }

      recalculatePartyBalances(state);
      await saveState(client, state, req.user.id);
      return { invoice: invoiceRecord, journal: saleJournal, receiptJournal, state, idempotent: false };
    });

    res.status(result.idempotent ? 200 : 201).json({
      success: true,
      invoice: result.invoice,
      journal: result.journal,
      receiptJournal: result.receiptJournal,
      state: result.state,
      idempotent: result.idempotent
    });
  } catch (err) {
    res.status(err.status || 400).json({ error: err.message, details: err.details || [] });
  }
});

// 5. POST /api/accounting/purchase-invoices — Full Page-Level Accounting Purchase Invoice
router.post('/purchase-invoices', requireAuth, async (req, res) => {
  if (!WRITABLE_ROLES.has(req.user.role)) {
    return res.status(403).json({ error: 'صلاحيتك لا تسمحبتسجيل فواتير المشتريات' });
  }
  try {
    const { withTransaction } = require('./lib');
    const result = await withTransaction(async client => {
      const state = ensureAccountingCollections(await loadState(client));
      const payload = { ...(req.body || {}) };

      if (payload.operationId) {
        const existing = state.purchases.find(p => p._operationId === payload.operationId);
        if (existing) return { purchase: existing, state, idempotent: true };
      }

      if (Array.isArray(payload.items)) {
        payload.items = payload.items.map(item => {
          const prod = (state.inventory || []).find(p =>
            (item.productId && (p.id === item.productId || p.sku === item.productId)) ||
            (item.sku && p.sku === item.sku) ||
            (item.desc && p.name === item.desc)
          );
          if (!prod) return item;
          return {
            ...item,
            productId: prod.id || prod.sku,
            sku: prod.sku || item.sku || '',
            desc: item.desc || prod.name,
            price: item.price !== undefined ? item.price : (prod.cost || prod.price || 0),
            unit: item.unit || prod.defaultUnit || prod.unit || 'وحدة',
            expenseAccount: item.expenseAccount || prod.purchaseExpenseAccount || '110401',
            taxCategory: item.taxCategory || prod.vatTreatment || 'standard'
          };
        });
      }

      const validation = InvoiceUtils.validatePurchaseInvoicePayload(payload, {
        suppliers: state.suppliers,
        taxSettings: state.taxSettings
      });

      if (!validation.valid) {
        const err = new Error(validation.errors[0]);
        err.status = 400;
        err.details = validation.errors;
        throw err;
      }

      const norm = validation.normalized;
      const entity = String(payload.entity || 'law');
      const id = norm.id || await nextNumber(client, 'PO', entity, norm.date);

      if (state.purchases.some(p => p.id === id)) {
        const err = new Error(`فاتورة المشتريات رقم ${id} مسجلة ومرحلة مسبقاً`);
        err.status = 409;
        throw err;
      }

      let supplierRecord = state.suppliers.find(s =>
        (norm.supplierId && String(s.id) === String(norm.supplierId)) || s.name === norm.supplier
      );
      if (!supplierRecord) {
        supplierRecord = {
          id: norm.supplierId && norm.supplierId !== 'SUP-GEN'
            ? norm.supplierId
            : `SUP-${String(state.suppliers.length + 1).padStart(3, '0')}`,
          name: norm.supplier,
          vat: norm.supplierVat || '—',
          phone: '0500000000',
          category: 'مورد عام',
          apAccount: norm.payableAccount || '210101',
          defaultExpenseAccount: norm.expenseAccount || '110401',
          paymentTerms: 'net30',
          balance: 0
        };
        state.suppliers.push(supplierRecord);
      }
      norm.supplierId = supplierRecord.id;
      norm.supplier = supplierRecord.name;

      const purchaseRecord = {
        id,
        entity,
        supplierId: supplierRecord.id,
        supplier: supplierRecord.name,
        supplierVat: norm.supplierVat,
        supplierInvoiceNumber: norm.supplierInvoiceNumber,
        date: norm.date,
        dueDate: norm.due,
        due: norm.due,
        taxMode: norm.taxMode,
        payableAccount: norm.payableAccount,
        expenseAccount: norm.expenseAccount,
        recoverableVatAccount: norm.recoverableVatAccount,
        expenseAllocations: norm.expenseAllocations,
        warehouse: norm.warehouse,
        costCenter: norm.costCenter,
        branch: norm.branch,
        projectRef: norm.projectRef,
        grossSubtotal: norm.grossSubtotal,
        subtotal: norm.subtotal,
        discountTotal: norm.discountTotal,
        vat: norm.vat,
        total: norm.total,
        paymentMethod: norm.paymentMethod,
        paidAmount: norm.paidAmount,
        remainingAmount: norm.remainingAmount,
        cashAccount: norm.cashAccount,
        status: norm.status,
        itemsDesc: norm.itemsDesc,
        items: norm.items,
        notes: norm.notes,
        _operationId: payload.operationId || null,
        posted: true,
        isLocked: true,
        createdAt: new Date().toISOString(),
        createdBy: req.user.id
      };

      state.purchases.unshift(purchaseRecord);

      // Update inventory stock if stocked item purchased
      for (const item of purchaseRecord.items) {
        if (!item.productId) continue;
        const prod = state.inventory.find(p => p.id === item.productId || p.sku === item.productId);
        if (prod && prod.category !== 'خدمات') {
          prod.qty = Number(prod.qty || 0) + Number(item.qty || 0);
        }
      }

      const jrnBuilt = InvoiceUtils.buildPurchaseInvoiceJournal(purchaseRecord);
      const purchaseJournalId = await nextNumber(client, 'JRN', entity, norm.date);
      const purchaseJournal = {
        id: purchaseJournalId,
        entity,
        ...jrnBuilt,
        amount: InvoiceUtils.roundCurrency(jrnBuilt.lines.reduce((s, l) => s + l.debit, 0)),
        totalDebit: InvoiceUtils.roundCurrency(jrnBuilt.lines.reduce((s, l) => s + l.debit, 0)),
        totalCredit: InvoiceUtils.roundCurrency(jrnBuilt.lines.reduce((s, l) => s + l.credit, 0)),
        status: 'متزن',
        isLocked: true,
        debit: `${jrnBuilt.lines.length} حسابات`,
        credit: `${jrnBuilt.lines.length} حسابات`
      };
      state.journals.unshift(purchaseJournal);

      let paymentJournal = null;
      if (purchaseRecord.paidAmount > 0) {
        const paymentId = await nextNumber(client, 'PV', entity, norm.date);
        const paymentJournalId = await nextNumber(client, 'JRN', entity, norm.date);
        const cashKey = purchaseRecord.cashAccount === '110101' ? 'cash' : 'rajhi';
        const cashLabel = cashKey === 'cash' ? '110101 - الصندوق النقدي الرئيسي' : '110201 - حساب مصرف الراجحي';
        if (!state.treasury) state.treasury = { cash: 0, rajhi: 0, ahli: 0 };
        state.treasury[cashKey] = Number(state.treasury[cashKey] || 0) - purchaseRecord.paidAmount;

        state.vouchers.unshift({
          id: paymentId,
          type: 'صرف',
          entity,
          date: norm.date,
          supplierId: supplierRecord.id,
          supplier: supplierRecord.name,
          account: cashLabel,
          amount: purchaseRecord.paidAmount,
          notes: `سداد فاتورة مشتريات ${id} للمورد ${supplierRecord.name}`,
          purchaseId: id,
          user: req.user.name || req.user.email
        });

        paymentJournal = {
          id: paymentJournalId,
          date: norm.date,
          entity,
          ref: paymentId,
          sourceId: id,
          sourceDocRef: id,
          partyType: 'supplier',
          partyId: supplierRecord.id,
          partyName: supplierRecord.name,
          costCenter: purchaseRecord.costCenter,
          desc: `سند صرف ${paymentId} - سداد فاتورة مشتريات ${id}`,
          amount: purchaseRecord.paidAmount,
          totalDebit: purchaseRecord.paidAmount,
          totalCredit: purchaseRecord.paidAmount,
          status: 'متزن',
          type: 'auto',
          posted: true,
          isLocked: true,
          debit: `${purchaseRecord.payableAccount} - الموردون والذمم الدائنة`,
          credit: cashLabel,
          lines: [
            {
              account: `${purchaseRecord.payableAccount} - الموردون والذمم الدائنة`,
              accountCode: purchaseRecord.payableAccount,
              accountName: 'الموردون (الذمم الدائنة)',
              debit: purchaseRecord.paidAmount,
              credit: 0,
              partyType: 'supplier',
              partyId: supplierRecord.id,
              partyName: supplierRecord.name,
              costCenter: purchaseRecord.costCenter,
              sourceDocRef: id,
              desc: `سداد ذمة المورد ${supplierRecord.name} عن فاتورة ${id}`
            },
            {
              account: cashLabel,
              accountCode: cashKey === 'cash' ? '110101' : '110201',
              accountName: cashKey === 'cash' ? 'الصندوق الرئيسي' : 'مصرف الراجحي',
              debit: 0,
              credit: purchaseRecord.paidAmount,
              partyType: null,
              partyId: null,
              partyName: '',
              costCenter: purchaseRecord.costCenter,
              sourceDocRef: paymentId,
              desc: `صرف سند ${paymentId}`
            }
          ]
        };
        state.journals.unshift(paymentJournal);
      }

      recalculatePartyBalances(state);
      await saveState(client, state, req.user.id);
      return { purchase: purchaseRecord, journal: purchaseJournal, paymentJournal, state, idempotent: false };
    });

    res.status(result.idempotent ? 200 : 201).json({
      success: true,
      purchase: result.purchase,
      journal: result.journal,
      paymentJournal: result.paymentJournal,
      state: result.state,
      idempotent: result.idempotent
    });
  } catch (err) {
    res.status(err.status || 400).json({ error: err.message, details: err.details || [] });
  }
});

// 6. POST /api/accounting/payments — Record Supplier Payment or Direct Expense Voucher
router.post('/payments', requireAuth, async (req, res) => {
  if (!WRITABLE_ROLES.has(req.user.role)) {
    return res.status(403).json({ error: 'صلاحيتك لا تسمح بإصدار سندات الصرف' });
  }
  try {
    const { withTransaction } = require('./lib');
    const result = await withTransaction(async client => {
      const state = ensureAccountingCollections(await loadState(client));
      const payload = req.body || {};
      const amount = InvoiceUtils.roundCurrency(payload.amount || 0);
      if (amount <= 0) {
        const err = new Error('مبلغ سند الصرف يجب أن يكون أكبر من صفر');
        err.status = 400;
        throw err;
      }

      const date = String(payload.date || new Date().toISOString().slice(0, 10));
      const entity = String(payload.entity || 'law');
      const purchase = payload.purchaseId ? state.purchases.find(p => p.id === payload.purchaseId) : null;
      const supplier = state.suppliers.find(s =>
        (payload.supplierId && s.id === payload.supplierId) ||
        (purchase && s.id === purchase.supplierId) ||
        (payload.supplier && s.name === payload.supplier)
      );

      if (!supplier && !payload.expenseAccount) {
        const err = new Error('يجب تحديد المورد أو حساب المصروف لسند الصرف');
        err.status = 400;
        throw err;
      }

      const cashCode = String(payload.cashAccount || '110201');
      const cashLabel = cashCode === '110101' ? '110101 - الصندوق النقدي الرئيسي' : '110201 - حساب مصرف الراجحي';
      const debitAccountCode = supplier
        ? String((purchase && purchase.payableAccount) || supplier.apAccount || '210101')
        : String(payload.expenseAccount || '520601');

      if (purchase) {
        purchase.paidAmount = InvoiceUtils.roundCurrency((purchase.paidAmount || 0) + amount);
        purchase.remainingAmount = InvoiceUtils.roundCurrency(Math.max(0, purchase.total - purchase.paidAmount));
        purchase.status = purchase.remainingAmount === 0 ? 'paid' : 'partial';
      }

      const paymentId = await nextNumber(client, 'PV', entity, date);
      const journalId = await nextNumber(client, 'JRN', entity, date);

      const voucher = {
        id: paymentId,
        type: 'صرف',
        entity,
        date,
        supplierId: supplier ? supplier.id : null,
        supplier: supplier ? supplier.name : (payload.to || ''),
        account: cashLabel,
        amount,
        purchaseId: purchase ? purchase.id : null,
        notes: String(payload.notes || `سند صرف ${paymentId}`).trim()
      };
      state.vouchers.unshift(voucher);

      const paymentJournal = {
        id: journalId,
        date,
        entity,
        ref: paymentId,
        sourceId: purchase ? purchase.id : paymentId,
        sourceDocRef: purchase ? purchase.id : paymentId,
        partyType: supplier ? 'supplier' : null,
        partyId: supplier ? supplier.id : null,
        partyName: supplier ? supplier.name : '',
        costCenter: payload.costCenter || 'CC-MAIN',
        desc: supplier
          ? `سند صرف ${paymentId} — سداد للمورد ${supplier.name}`
          : `سند صرف مصروفات ${paymentId}`,
        amount,
        totalDebit: amount,
        totalCredit: amount,
        status: 'متزن',
        type: 'auto',
        posted: true,
        isLocked: true,
        lines: [
          {
            account: supplier ? `${debitAccountCode} - الموردون والذمم الدائنة` : `${debitAccountCode} - مصروفات`,
            accountCode: debitAccountCode,
            accountName: supplier ? 'الموردون (الذمم الدائنة)' : 'مصروفات',
            debit: amount,
            credit: 0,
            partyType: supplier ? 'supplier' : null,
            partyId: supplier ? supplier.id : null,
            partyName: supplier ? supplier.name : '',
            costCenter: payload.costCenter || 'CC-MAIN',
            sourceDocRef: purchase ? purchase.id : paymentId,
            desc: voucher.notes
          },
          {
            account: cashLabel,
            accountCode: cashCode,
            accountName: cashCode === '110101' ? 'الصندوق الرئيسي' : 'مصرف الراجحي',
            debit: 0,
            credit: amount,
            partyType: null,
            partyId: null,
            partyName: '',
            costCenter: payload.costCenter || 'CC-MAIN',
            sourceDocRef: paymentId,
            desc: `صرف سند ${paymentId}`
          }
        ]
      };
      state.journals.unshift(paymentJournal);

      recalculatePartyBalances(state);
      await saveState(client, state, req.user.id);
      return { payment: voucher, journal: paymentJournal, purchase, state };
    });

    res.status(201).json({ success: true, ...result });
  } catch (err) {
    res.status(err.status || 400).json({ error: err.message });
  }
});

// 7. PUT /api/accounting/invoices/:id — Prevent direct editing of posted transactions
router.put('/invoices/:id', requireAuth, async (req, res) => {
  try {
    const { pool } = require('./lib');
    const resState = await pool.query('SELECT data FROM system_state WHERE key = $1', ['main_state']);
    const state = resState.rows.length ? resState.rows[0].data : {};
    const inv = (state.invoices || []).find(i => i.id === req.params.id);
    if (!inv) {
      return res.status(404).json({ error: 'الفاتورة غير موجودة' });
    }
    if (inv.posted !== false) {
      return res.status(409).json({
        error: 'لا يمكن تعديل فاتورة مرحلة محاسبياً بشكل مباشر. يجب إصدار إشعار دائن (مرتجع مبيعات) أو قيد عكسي للحفاظ على سلامة المراجعة.'
      });
    }
    res.json({ success: true, invoice: inv });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 8. POST /api/accounting/returns — Sales Return (Credit Note) & Purchase Return (Debit Note)
router.post('/returns', requireAuth, async (req, res) => {
  if (!WRITABLE_ROLES.has(req.user.role)) {
    return res.status(403).json({ error: 'صلاحيتك لا تسمح بإصدار المرتجعات والإشعارات' });
  }
  try {
    const { withTransaction } = require('./lib');
    const result = await withTransaction(async client => {
      const state = ensureAccountingCollections(await loadState(client));
      const payload = req.body || {};
      const returnType = String(payload.returnType || 'sales').toLowerCase();
      const date = String(payload.date || new Date().toISOString().slice(0, 10));
      const entity = String(payload.entity || 'law');

      if (returnType === 'sales') {
        const sourceInv = state.invoices.find(i => i.id === payload.invoiceId);
        if (!sourceInv) {
          const err = new Error('الفاتورة الأصلية غير موجودة لإصدار إشعار دائن');
          err.status = 404;
          throw err;
        }
        const calc = InvoiceUtils.calculateInvoice(payload.items || sourceInv.items, {
          taxMode: payload.taxMode || sourceInv.taxMode || 'exclusive',
          defaultRevenueAccount: sourceInv.revenueAccount || '410101'
        });

        const cnId = `CN-${Date.now().toString().slice(-6)}`;
        const journalId = await nextNumber(client, 'JRN', entity, date);
        const arAcc = sourceInv.receivableAccount || '110301';
        const revAcc = sourceInv.revenueAccount || '410101';
        const vatAcc = sourceInv.outputVatAccount || '210201';

        const lines = [
          {
            account: `${revAcc} - مردودات المبيعات`,
            accountCode: revAcc,
            accountName: 'مردودات المبيعات',
            debit: calc.subtotal,
            credit: 0,
            partyType: 'customer',
            partyId: sourceInv.customerId,
            partyName: sourceInv.client,
            costCenter: sourceInv.costCenter || 'CC-MAIN',
            sourceDocRef: cnId,
            desc: `مردودات مبيعات عن فاتورة ${sourceInv.id}`
          }
        ];
        if (calc.vat > 0) {
          lines.push({
            account: `${vatAcc} - ضريبة القيمة المضافة المخرجة`,
            accountCode: vatAcc,
            accountName: 'ضريبة القيمة المضافة المستحقة',
            debit: calc.vat,
            credit: 0,
            partyType: null,
            partyId: null,
            partyName: '',
            costCenter: sourceInv.costCenter || 'CC-MAIN',
            sourceDocRef: cnId,
            desc: `عكس ضريبة مخرجات عن فاتورة ${sourceInv.id}`
          });
        }
        lines.push({
          account: `${arAcc} - العملاء والمدينون التجاريون`,
          accountCode: arAcc,
          accountName: 'العملاء (الذمم المدينة)',
          debit: 0,
          credit: calc.total,
          partyType: 'customer',
          partyId: sourceInv.customerId,
          partyName: sourceInv.client,
          costCenter: sourceInv.costCenter || 'CC-MAIN',
          sourceDocRef: sourceInv.id,
          desc: `تخفيض ذمة العميل ${sourceInv.client} بإشعار دائن ${cnId}`
        });

        const cnJournal = {
          id: journalId,
          date,
          entity,
          ref: cnId,
          sourceId: sourceInv.id,
          sourceDocRef: cnId,
          partyType: 'customer',
          partyId: sourceInv.customerId,
          partyName: sourceInv.client,
          desc: `إشعار دائن (مرتجع مبيعات) ${cnId} على الفاتورة ${sourceInv.id}`,
          amount: calc.total,
          totalDebit: calc.total,
          totalCredit: calc.total,
          status: 'متزن',
          type: 'auto',
          posted: true,
          isLocked: true,
          lines
        };
        state.journals.unshift(cnJournal);

        sourceInv.outstanding = InvoiceUtils.roundCurrency(Math.max(0, (sourceInv.outstanding ?? sourceInv.remainingAmount ?? sourceInv.total) - calc.total));
        sourceInv.remainingAmount = sourceInv.outstanding;

        const creditNote = {
          id: cnId,
          returnType: 'sales',
          invoiceId: sourceInv.id,
          customerId: sourceInv.customerId,
          client: sourceInv.client,
          date,
          subtotal: calc.subtotal,
          vat: calc.vat,
          total: calc.total,
          reason: payload.reason || 'مرتجع مبيعات',
          journalId
        };
        state.returns.unshift(creditNote);
        recalculatePartyBalances(state);
        await saveState(client, state, req.user.id);
        return { creditNote, journal: cnJournal, state };
      } else {
        const sourcePo = state.purchases.find(p => p.id === payload.purchaseId);
        if (!sourcePo) {
          const err = new Error('فاتورة الشراء الأصلية غير موجودة لإصدار إشعار مدين');
          err.status = 404;
          throw err;
        }
        const calc = InvoiceUtils.calculateInvoice(payload.items || sourcePo.items, {
          taxMode: payload.taxMode || sourcePo.taxMode || 'exclusive',
          defaultExpenseAccount: sourcePo.expenseAccount || '110401'
        });

        const dnId = `DN-${Date.now().toString().slice(-6)}`;
        const journalId = await nextNumber(client, 'JRN', entity, date);
        const apAcc = sourcePo.payableAccount || '210101';
        const expAcc = sourcePo.expenseAccount || '110401';
        const vatAcc = sourcePo.recoverableVatAccount || '110501';

        const lines = [
          {
            account: `${apAcc} - الموردون والذمم الدائنة`,
            accountCode: apAcc,
            accountName: 'الموردون (الذمم الدائنة)',
            debit: calc.total,
            credit: 0,
            partyType: 'supplier',
            partyId: sourcePo.supplierId,
            partyName: sourcePo.supplier,
            costCenter: sourcePo.costCenter || 'CC-MAIN',
            sourceDocRef: sourcePo.id,
            desc: `تخفيض ذمة المورد ${sourcePo.supplier} بإشعار مدين ${dnId}`
          },
          {
            account: `${expAcc} - مردودات المشتريات`,
            accountCode: expAcc,
            accountName: 'المخزون / مردودات المشتريات',
            debit: 0,
            credit: calc.subtotal,
            partyType: 'supplier',
            partyId: sourcePo.supplierId,
            partyName: sourcePo.supplier,
            costCenter: sourcePo.costCenter || 'CC-MAIN',
            sourceDocRef: dnId,
            desc: `مردودات مشتريات عن فاتورة ${sourcePo.id}`
          }
        ];
        if (calc.vat > 0) {
          lines.push({
            account: `${vatAcc} - ضريبة القيمة المضافة المدخلات`,
            accountCode: vatAcc,
            accountName: 'ضريبة المدخلات',
            debit: 0,
            credit: calc.vat,
            partyType: null,
            partyId: null,
            partyName: '',
            costCenter: sourcePo.costCenter || 'CC-MAIN',
            sourceDocRef: dnId,
            desc: `عكس ضريبة مدخلات عن فاتورة ${sourcePo.id}`
          });
        }

        const dnJournal = {
          id: journalId,
          date,
          entity,
          ref: dnId,
          sourceId: sourcePo.id,
          sourceDocRef: dnId,
          partyType: 'supplier',
          partyId: sourcePo.supplierId,
          partyName: sourcePo.supplier,
          desc: `إشعار مدين (مرتجع مشتريات) ${dnId} على الفاتورة ${sourcePo.id}`,
          amount: calc.total,
          totalDebit: calc.total,
          totalCredit: calc.total,
          status: 'متزن',
          type: 'auto',
          posted: true,
          isLocked: true,
          lines
        };
        state.journals.unshift(dnJournal);
        sourcePo.remainingAmount = InvoiceUtils.roundCurrency(Math.max(0, (sourcePo.remainingAmount ?? sourcePo.total) - calc.total));

        const debitNote = {
          id: dnId,
          returnType: 'purchase',
          purchaseId: sourcePo.id,
          supplierId: sourcePo.supplierId,
          supplier: sourcePo.supplier,
          date,
          subtotal: calc.subtotal,
          vat: calc.vat,
          total: calc.total,
          reason: payload.reason || 'مرتجع مشتريات',
          journalId
        };
        state.returns.unshift(debitNote);
        recalculatePartyBalances(state);
        await saveState(client, state, req.user.id);
        return { debitNote, journal: dnJournal, state };
      }
    });

    res.status(201).json({ success: true, ...result });
  } catch (err) {
    res.status(err.status || 400).json({ error: err.message });
  }
});

// 9. GET /api/accounting/general-ledger — Filterable General Ledger with Running Balance
router.get('/general-ledger', requireAuth, async (req, res) => {
  try {
    const { pool } = require('./lib');
    const resState = await pool.query('SELECT data FROM system_state WHERE key = $1', ['main_state']);
    const state = ensureAccountingCollections(resState.rows.length ? resState.rows[0].data : {});
    const ledger = InvoiceUtils.computeGeneralLedger({
      accountCode: req.query.accountCode || req.query.account,
      partyType: req.query.partyType,
      partyId: req.query.partyId,
      partyName: req.query.partyName,
      costCenter: req.query.costCenter,
      fromDate: req.query.fromDate || req.query.from,
      toDate: req.query.toDate || req.query.to
    }, state);

    res.json({ success: true, ...ledger });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 10. GET /api/accounting/statements/:partyType/:partyId — Detailed Customer or Supplier Statement
router.get('/statements/:partyType/:partyId', requireAuth, async (req, res) => {
  try {
    const { pool } = require('./lib');
    const resState = await pool.query('SELECT data FROM system_state WHERE key = $1', ['main_state']);
    const state = ensureAccountingCollections(resState.rows.length ? resState.rows[0].data : {});
    const statement = InvoiceUtils.computePartyStatement(
      req.params.partyType,
      req.params.partyId,
      state,
      { fromDate: req.query.fromDate, toDate: req.query.toDate }
    );
    res.json({ success: true, ...statement });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
