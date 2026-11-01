'use strict';
const express = require('express');
const router = express.Router();
const { pool, toHalalas, toRiyals, withTransaction, nextDocNumber } = require('./lib');
const { requireAuth, requireEntityAccess } = require('./routes-entities');
const { getAccountByCode } = require('./engine');

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function resolveEntityId(raw) {
  if (!raw) return null;
  if (UUID_RE.test(raw)) return raw;
  const res = await pool.query(
    'SELECT id FROM entities WHERE LOWER(code) = LOWER($1) OR LOWER(name) LIKE LOWER($2) LIMIT 1',
    [raw, `%${raw}%`]
  );
  if (res.rows.length > 0) return res.rows[0].id;
  const any = await pool.query('SELECT id FROM entities ORDER BY created_at ASC LIMIT 1');
  return any.rows[0] ? any.rows[0].id : null;
}

// ==========================================
// 1. LIVE DASHBOARD KPIS (Database-backed)
// ==========================================
router.get('/:entityId/dashboard/live-kpis', requireAuth, requireEntityAccess, async (req, res) => {
  try {
    const entityId = await resolveEntityId(req.params.entityId);
    const { period = 'month' } = req.query;

    // Determine date filter
    let dateFilter = "AND issue_date >= date_trunc('month', CURRENT_DATE)";
    if (period === 'today') {
      dateFilter = "AND issue_date = CURRENT_DATE";
    } else if (period === 'week') {
      dateFilter = "AND issue_date >= date_trunc('week', CURRENT_DATE)";
    } else if (period === 'year') {
      dateFilter = "AND issue_date >= date_trunc('year', CURRENT_DATE)";
    } else if (period === 'all') {
      dateFilter = "";
    }

    // Sales Aggregates
    const salesRes = await pool.query(`
      SELECT 
        COALESCE(SUM(total_halalas), 0) AS total_sales_halalas,
        COALESCE(SUM(paid_halalas), 0) AS total_paid_sales_halalas,
        COALESCE(SUM(total_halalas - paid_halalas), 0) AS outstanding_ar_halalas,
        COUNT(id) AS invoice_count
      FROM invoices
      WHERE entity_id = $1 AND status != 'cancelled' ${dateFilter}
    `, [entityId]);

    // Purchases Aggregates
    const purchRes = await pool.query(`
      SELECT 
        COALESCE(SUM(total_halalas), 0) AS total_purchases_halalas,
        COALESCE(SUM(paid_halalas), 0) AS total_paid_purch_halalas,
        COALESCE(SUM(total_halalas - paid_halalas), 0) AS outstanding_ap_halalas,
        COUNT(id) AS purchase_count
      FROM purchase_invoices
      WHERE entity_id = $1 AND status != 'cancelled' ${dateFilter}
    `, [entityId]);

    // Inventory Value from inventory movements
    const invRes = await pool.query(`
      SELECT 
        COALESCE(SUM(im.qty * im.unit_cost_halalas), 0) AS inventory_val_halalas,
        COUNT(DISTINCT p.id) AS total_products
      FROM products p
      LEFT JOIN inventory_movements im ON p.id = im.product_id
      WHERE p.entity_id = $1
    `, [entityId]);

    // Pending Approvals Count
    const appRes = await pool.query(`
      SELECT COUNT(id) AS pending_approvals_count
      FROM workflow_approvals
      WHERE entity_id = $1 AND status = 'pending'
    `, [entityId]);

    // Cash & Bank Balances from Accounts
    const accountsRes = await pool.query(`
      SELECT a.code, a.name,
        COALESCE(SUM(jl.debit_halalas - jl.credit_halalas), 0) AS balance_halalas
      FROM accounts a
      LEFT JOIN journal_lines jl ON a.id = jl.account_id
      LEFT JOIN journals j ON jl.journal_id = j.id AND j.status = 'posted'
      WHERE a.entity_id = $1 AND a.code LIKE '1101%'
      GROUP BY a.id, a.code, a.name
    `, [entityId]);

    let cashHalalas = 0;
    let bankHalalas = 0;
    accountsRes.rows.forEach(r => {
      const bal = parseInt(r.balance_halalas, 10);
      if (r.code.startsWith('110101')) cashHalalas += bal;
      else bankHalalas += bal;
    });

    const salesHalalas = parseInt(salesRes.rows[0].total_sales_halalas, 10);
    const purchHalalas = parseInt(purchRes.rows[0].total_purchases_halalas, 10);
    const netProfitHalalas = salesHalalas - purchHalalas;

    return res.json({
      success: true,
      period,
      kpis: {
        totalSales: toRiyals(salesHalalas),
        totalPurchases: toRiyals(purchHalalas),
        netProfit: toRiyals(netProfitHalalas),
        receivables: toRiyals(parseInt(salesRes.rows[0].outstanding_ar_halalas, 10)),
        payables: toRiyals(parseInt(purchRes.rows[0].outstanding_ap_halalas, 10)),
        cashBalance: toRiyals(cashHalalas),
        bankBalance: toRiyals(bankHalalas),
        inventoryValue: toRiyals(parseInt(invRes.rows[0].inventory_val_halalas, 10)),
        lowStockCount: parseInt(invRes.rows[0].low_stock_count, 10),
        pendingApprovalsCount: parseInt(appRes.rows[0].pending_approvals_count, 10),
        invoiceCount: parseInt(salesRes.rows[0].invoice_count, 10),
        purchaseCount: parseInt(purchRes.rows[0].purchase_count, 10)
      }
    });
  } catch (err) {
    console.error('Error fetching live KPIs:', err);
    return res.status(500).json({ error: err.message || 'فشل في جلب إحصائيات لوحة التحكم' });
  }
});

// ==========================================
// 2. WORKFLOW APPROVALS QUEUE
// ==========================================
router.get('/:entityId/workflows/approvals', requireAuth, requireEntityAccess, async (req, res) => {
  try {
    const entityId = await resolveEntityId(req.params.entityId);
    const { status = 'all' } = req.query;

    let query = `
      SELECT * FROM workflow_approvals
      WHERE entity_id = $1
    `;
    const params = [entityId];

    if (status !== 'all') {
      params.push(status);
      query += ` AND status = $2`;
    }
    query += ` ORDER BY created_at DESC LIMIT 100`;

    const result = await pool.query(query, params);
    const formatted = result.rows.map(r => ({
      id: r.id,
      docType: r.doc_type,
      docId: r.doc_id,
      docNumber: r.doc_number,
      amount: toRiyals(r.amount_halalas),
      requestedBy: r.requested_by,
      status: r.status,
      notes: r.notes,
      actionBy: r.action_by,
      actionAt: r.action_at,
      createdAt: r.created_at
    }));

    return res.json({ success: true, count: formatted.length, approvals: formatted });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

router.post('/:entityId/workflows/submit', requireAuth, requireEntityAccess, async (req, res) => {
  try {
    const entityId = await resolveEntityId(req.params.entityId);
    const { docType, docId, docNumber, amount = 0, notes } = req.body;

    if (!docType || !docId || !docNumber) {
      return res.status(400).json({ error: 'نوع المستند ومعرفه ورقمه مطلوبة لطلب الاعتماد' });
    }

    const amountHalalas = toHalalas(amount);
    const result = await pool.query(`
      INSERT INTO workflow_approvals 
        (entity_id, doc_type, doc_id, doc_number, amount_halalas, requested_by, notes)
      VALUES ($1, $2, $3, $4, $5, $6, $7)
      RETURNING *
    `, [entityId, docType, docId, docNumber, amountHalalas, req.user.full_name || req.user.email, notes || null]);

    // Also update document status if it is an invoice or purchase
    if (docType === 'invoice') {
      await pool.query("UPDATE invoices SET status = 'pending_approval' WHERE id = $1 AND entity_id = $2", [docId, entityId]);
    } else if (docType === 'purchase') {
      await pool.query("UPDATE purchase_invoices SET status = 'pending_approval' WHERE id = $1 AND entity_id = $2", [docId, entityId]);
    } else if (docType === 'quote') {
      await pool.query("UPDATE quotes_proformas SET status = 'pending_approval' WHERE id = $1 AND entity_id = $2", [docId, entityId]);
    }

    return res.status(201).json({ success: true, approval: result.rows[0] });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

router.post('/:entityId/workflows/approvals/:id/action', requireAuth, requireEntityAccess, async (req, res) => {
  try {
    const entityId = await resolveEntityId(req.params.entityId);
    const { id } = req.params;
    const { action, notes } = req.body; // action: 'approve' or 'reject'

    if (!['approve', 'reject'].includes(action)) {
      return res.status(400).json({ error: 'الإجراء يجب أن يكون اعتماد (approve) أو رفض (reject)' });
    }

    const newStatus = action === 'approve' ? 'approved' : 'rejected';
    const actionBy = req.user.full_name || req.user.email;

    const result = await withTransaction(async (client) => {
      const appRes = await client.query(`
        SELECT * FROM workflow_approvals 
        WHERE id = $1 AND entity_id = $2 FOR UPDATE
      `, [id, entityId]);

      if (appRes.rows.length === 0) {
        throw new Error('طلب الاعتماد غير موجود');
      }

      const approval = appRes.rows[0];
      if (approval.status !== 'pending') {
        throw new Error(`تم البت في هذا الطلب مسبقاً (${approval.status})`);
      }

      const updated = await client.query(`
        UPDATE workflow_approvals
        SET status = $1, action_by = $2, action_at = now(), notes = COALESCE($3, notes)
        WHERE id = $4
        RETURNING *
      `, [newStatus, actionBy, notes || null, id]);

      // Reflect on source document
      if (approval.doc_type === 'invoice') {
        await client.query(`
          UPDATE invoices 
          SET status = $1, approved_by = $2, approved_at = now()
          WHERE id = $3 AND entity_id = $4
        `, [newStatus, actionBy, approval.doc_id, entityId]);
      } else if (approval.doc_type === 'purchase') {
        await client.query(`
          UPDATE purchase_invoices 
          SET status = $1, approved_by = $2, approved_at = now()
          WHERE id = $3 AND entity_id = $4
        `, [newStatus, actionBy, approval.doc_id, entityId]);
      } else if (approval.doc_type === 'quote') {
        await client.query(`
          UPDATE quotes_proformas 
          SET status = $1
          WHERE id = $3 AND entity_id = $4
        `, [newStatus, approval.doc_id, entityId]);
      }

      return updated.rows[0];
    });

    return res.json({ success: true, message: `تم ${action === 'approve' ? 'اعتماد' : 'رفض'} المستند بنجاح`, approval: result });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

// ==========================================
// 3. QUOTATIONS WORKFLOW
// ==========================================
router.get('/:entityId/quotes', requireAuth, requireEntityAccess, async (req, res) => {
  try {
    const entityId = await resolveEntityId(req.params.entityId);
    const result = await pool.query(`
      SELECT q.*, c.name AS customer_name, c.vat_number AS customer_vat
      FROM quotes_proformas q
      LEFT JOIN customers c ON q.customer_id = c.id
      WHERE q.entity_id = $1
      ORDER BY q.created_at DESC
    `, [entityId]);

    const quotes = result.rows.map(r => ({
      id: r.id,
      code: r.code,
      docType: r.doc_type,
      customerId: r.customer_id,
      customerName: r.customer_name || 'عميل نقدي',
      issueDate: r.issue_date,
      validUntil: r.valid_until,
      status: r.status,
      subtotal: toRiyals(r.subtotal_halalas),
      vat: toRiyals(r.vat_halalas),
      total: toRiyals(r.total_halalas),
      convertedToInvoiceId: r.converted_to_invoice_id,
      notes: r.notes
    }));

    return res.json({ success: true, count: quotes.length, quotes });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

router.post('/:entityId/quotes', requireAuth, requireEntityAccess, async (req, res) => {
  try {
    const entityId = await resolveEntityId(req.params.entityId);
    const { customerId, docType = 'quote', validDays = 15, subtotal = 0, vat = 0, total = 0, notes } = req.body;

    const code = await nextDocNumber(pool, entityId, 'quote');
    const subHalalas = toHalalas(subtotal);
    const vatHalalas = toHalalas(vat);
    const totalHalalas = toHalalas(total);

    const result = await pool.query(`
      INSERT INTO quotes_proformas 
        (entity_id, customer_id, doc_type, code, issue_date, valid_until, status, subtotal_halalas, vat_halalas, total_halalas, notes)
      VALUES ($1, $2, $3, $4, CURRENT_DATE, CURRENT_DATE + $5::INT, 'draft', $6, $7, $8, $9)
      RETURNING *
    `, [entityId, customerId || null, docType, code, parseInt(validDays, 10), subHalalas, vatHalalas, totalHalalas, notes || null]);

    return res.status(201).json({ success: true, quote: result.rows[0] });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

// Convert Quote to Sales Invoice
router.post('/:entityId/quotes/:id/convert-to-invoice', requireAuth, requireEntityAccess, async (req, res) => {
  try {
    const entityId = await resolveEntityId(req.params.entityId);
    const { id } = req.params;

    const result = await withTransaction(async (client) => {
      const qRes = await client.query(`
        SELECT * FROM quotes_proformas WHERE id = $1 AND entity_id = $2 FOR UPDATE
      `, [id, entityId]);

      if (qRes.rows.length === 0) throw new Error('عرض السعر غير موجود');
      const quote = qRes.rows[0];

      if (quote.converted_to_invoice_id) {
        throw new Error('تم تحويل هذا العرض إلى فاتورة مبيعات مسبقاً');
      }

      // Resolve or create default customer if none assigned
      let customerId = quote.customer_id;
      if (!customerId) {
        const custRes = await client.query('SELECT id FROM customers WHERE entity_id = $1 LIMIT 1', [entityId]);
        if (custRes.rows.length > 0) {
          customerId = custRes.rows[0].id;
        } else {
          const newCust = await client.query(
            'INSERT INTO customers (entity_id, name) VALUES ($1, $2) RETURNING id',
            [entityId, 'عميل نقدي عام']
          );
          customerId = newCust.rows[0].id;
        }
      }

      // Generate Invoice Number
      const invNumber = await nextDocNumber(client, entityId, 'invoice');

      // Create Invoice
      const invRes = await client.query(`
        INSERT INTO invoices 
          (entity_id, customer_id, invoice_number, issue_date, status, subtotal_halalas, vat_halalas, total_halalas, paid_halalas, quote_id, notes)
        VALUES ($1, $2, $3, CURRENT_DATE, 'draft', $4, $5, $6, 0, $7, $8)
        RETURNING *
      `, [entityId, customerId, invNumber, quote.subtotal_halalas, quote.vat_halalas, quote.total_halalas, quote.id, `محولة تلقائياً من عرض السعر رقم ${quote.code}`]);

      const invoice = invRes.rows[0];

      // Create default invoice line so the converted invoice can be posted to General Ledger
      const revAccRes = await client.query(`
        SELECT id FROM accounts 
        WHERE entity_id = $1 AND type = 'revenue' AND is_group = false 
        ORDER BY code ASC LIMIT 1
      `, [entityId]);

      if (revAccRes.rows.length > 0) {
        await client.query(`
          INSERT INTO invoice_lines 
            (invoice_id, revenue_account_id, description, qty, unit_price_halalas, vat_rate, subtotal_halalas, vat_halalas, total_halalas)
          VALUES ($1, $2, $3, 1, $4, 15, $5, $6, $7)
        `, [
          invoice.id,
          revAccRes.rows[0].id,
          quote.notes || `بنود محولة من عرض السعر ${quote.code}`,
          quote.subtotal_halalas,
          quote.subtotal_halalas,
          quote.vat_halalas,
          quote.total_halalas
        ]);
      }

      // Mark Quote as Converted
      await client.query(`
        UPDATE quotes_proformas
        SET status = 'converted', converted_to_invoice_id = $1
        WHERE id = $2
      `, [invoice.id, quote.id]);

      return invoice;
    });

    return res.status(201).json({
      success: true,
      message: `تم تحويل عرض السعر بنجاح إلى فاتورة مبيعات رقم ${result.invoice_number}`,
      invoice: result
    });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

// ==========================================
// 4. INVENTORY TRANSFERS & ADJUSTMENTS
// ==========================================
router.get('/:entityId/inventory/transfers', requireAuth, requireEntityAccess, async (req, res) => {
  try {
    const entityId = await resolveEntityId(req.params.entityId);
    const result = await pool.query(`
      SELECT * FROM stock_transfers WHERE entity_id = $1 ORDER BY created_at DESC
    `, [entityId]);
    return res.json({ success: true, count: result.rows.length, transfers: result.rows });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

router.post('/:entityId/inventory/transfers', requireAuth, requireEntityAccess, async (req, res) => {
  try {
    const entityId = await resolveEntityId(req.params.entityId);
    const { fromWarehouse = 'المستودع الرئيسي', toWarehouse = 'مستودع المعرض', notes } = req.body;
    const transferNum = await nextDocNumber(pool, entityId, 'transfer');

    const result = await pool.query(`
      INSERT INTO stock_transfers (entity_id, transfer_number, from_warehouse, to_warehouse, status, notes)
      VALUES ($1, $2, $3, $4, 'completed', $5)
      RETURNING *
    `, [entityId, transferNum, fromWarehouse, toWarehouse, notes || null]);

    return res.status(201).json({ success: true, transfer: result.rows[0] });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

router.get('/:entityId/inventory/adjustments', requireAuth, requireEntityAccess, async (req, res) => {
  try {
    const entityId = await resolveEntityId(req.params.entityId);
    const result = await pool.query(`
      SELECT a.*, p.name AS product_name, p.sku
      FROM stock_adjustments a
      LEFT JOIN products p ON a.product_id = p.id
      WHERE a.entity_id = $1
      ORDER BY a.created_at DESC
    `, [entityId]);
    return res.json({ success: true, count: result.rows.length, adjustments: result.rows });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

router.post('/:entityId/inventory/adjustments', requireAuth, requireEntityAccess, async (req, res) => {
  try {
    const entityId = await resolveEntityId(req.params.entityId);
    const { productId, actualQty, reason = 'تسوية جرد فعلي' } = req.body;

    if (!productId || actualQty === undefined) {
      return res.status(400).json({ error: 'المنتج والكمية الفعلية مطلوبة' });
    }

    const result = await withTransaction(async (client) => {
      const pRes = await client.query('SELECT * FROM products WHERE id = $1 AND entity_id = $2 FOR UPDATE', [productId, entityId]);
      if (pRes.rows.length === 0) throw new Error('المنتج غير موجود');
      const prod = pRes.rows[0];

      const qtyRes = await client.query(`
        SELECT COALESCE(SUM(qty), 0) AS current_stock
        FROM inventory_movements WHERE product_id = $1
      `, [productId]);
      const systemQty = parseFloat(qtyRes.rows[0].current_stock || 0);
      const targetQty = parseFloat(actualQty);
      const diffQty = targetQty - systemQty;

      // Record movement
      if (diffQty !== 0) {
        await client.query(`
          INSERT INTO inventory_movements 
            (entity_id, product_id, qty, unit_cost_halalas, source_type)
          VALUES ($1, $2, $3, 0, 'adjustment')
        `, [entityId, productId, diffQty]);
      }

      // Record adjustment document
      const adjNum = 'ADJ-' + Date.now().toString().slice(-6);
      const adjRes = await client.query(`
        INSERT INTO stock_adjustments 
          (entity_id, adjustment_number, product_id, system_qty, actual_qty, diff_qty, reason, status)
        VALUES ($1, $2, $3, $4, $5, $6, $7, 'posted')
        RETURNING *
      `, [entityId, adjNum, productId, systemQty, targetQty, diffQty, reason]);

      return adjRes.rows[0];
    });

    return res.status(201).json({ success: true, adjustment: result });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

module.exports = router;
