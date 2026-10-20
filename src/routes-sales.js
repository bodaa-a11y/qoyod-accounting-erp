'use strict';
const express = require('express');
const router = express.Router();
const { pool, withTransaction, toHalalas, toRiyals, vatOf, audit, nextDocNumber } = require('./lib');
const { createJournal, reverseJournal, postInvoice, postReceipt } = require('./engine');
const { requireAuth, requireEntityAccess } = require('./routes-entities');

// ---------------- INVOICES ----------------

// POST /api/entities/:entityId/invoices
router.post('/:entityId/invoices', requireAuth, requireEntityAccess, async (req, res) => {
  try {
    const { entityId } = req.params;
    const { customer_id, issue_date, due_date, lines, idempotency_key } = req.body || {};

    if (!customer_id || !issue_date || !lines || !Array.isArray(lines) || lines.length === 0) {
      return res.status(400).json({ error: 'العميل وتاريخ الفاتورة والبنود مطلوبة' });
    }

    // Check idempotency key if provided
    if (idempotency_key) {
      const existingRes = await pool.query(
        'SELECT * FROM invoices WHERE entity_id = $1 AND idempotency_key = $2',
        [entityId, idempotency_key]
      );
      if (existingRes.rows.length > 0) {
        return res.status(200).json({ invoice: existingRes.rows[0], idempotent: true });
      }
    }

    const result = await withTransaction(async (client) => {
      const invoiceNumber = await nextDocNumber(client, entityId, 'INV');

      let subtotalHalalas = 0;
      let vatHalalas = 0;
      let totalHalalas = 0;

      const processedLines = [];

      for (const line of lines) {
        const revAccId = line.revenue_account_id;
        if (!revAccId) {
          throw new Error('حساب الإيراد مطلوب لكل بند');
        }
        const qty = parseFloat(line.qty) || 1;
        const unitPriceHalalas = typeof line.unit_price === 'number' ? Math.round(line.unit_price * 100) : toHalalas(line.unit_price);
        if (unitPriceHalalas === null || unitPriceHalalas < 0) {
          throw new Error('سعر الوحدة غير صالح');
        }
        const vatRate = line.vat_rate !== undefined ? parseFloat(line.vat_rate) : 15;

        const lineSubtotal = Math.round(qty * unitPriceHalalas);
        const lineVat = vatOf(lineSubtotal, vatRate);
        const lineTotal = lineSubtotal + lineVat;

        subtotalHalalas += lineSubtotal;
        vatHalalas += lineVat;
        totalHalalas += lineTotal;

        processedLines.push({
          revenue_account_id: revAccId,
          description: line.description || 'بند مبيعات',
          qty,
          unit_price_halalas: unitPriceHalalas,
          vat_rate: vatRate,
          subtotal_halalas: lineSubtotal,
          vat_halalas: lineVat,
          total_halalas: lineTotal
        });
      }

      const invRes = await client.query(`
        INSERT INTO invoices (
          entity_id, customer_id, invoice_number, issue_date, due_date, status,
          subtotal_halalas, vat_halalas, total_halalas, idempotency_key
        )
        VALUES ($1, $2, $3, $4, $5, 'draft', $6, $7, $8, $9)
        RETURNING *
      `, [entityId, customer_id, invoiceNumber, issue_date, due_date || issue_date, subtotalHalalas, vatHalalas, totalHalalas, idempotency_key || null]);

      const invoice = invRes.rows[0];

      for (const pl of processedLines) {
        await client.query(`
          INSERT INTO invoice_lines (
            invoice_id, revenue_account_id, description, qty, unit_price_halalas, vat_rate, subtotal_halalas, vat_halalas, total_halalas
          )
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
        `, [invoice.id, pl.revenue_account_id, pl.description, pl.qty, pl.unit_price_halalas, pl.vat_rate, pl.subtotal_halalas, pl.vat_halalas, pl.total_halalas]);
      }

      await audit(client, entityId, req.user.id, 'INVOICE_CREATED', 'invoices', invoice.id, {
        invoiceNumber,
        totalHalalas
      });

      return invoice;
    });

    res.status(201).json({ invoice: result });
  } catch (err) {
    console.error('Create invoice error:', err);
    res.status(400).json({ error: err.message || 'خطأ أثناء إنشاء الفاتورة' });
  }
});

// GET /api/entities/:entityId/invoices
router.get('/:entityId/invoices', requireAuth, requireEntityAccess, async (req, res) => {
  try {
    const { entityId } = req.params;
    const result = await pool.query(`
      SELECT i.*, c.name AS customer_name
      FROM invoices i
      JOIN customers c ON c.id = i.customer_id
      WHERE i.entity_id = $1
      ORDER BY i.created_at DESC
    `, [entityId]);
    res.json({ invoices: result.rows });
  } catch (err) {
    res.status(500).json({ error: 'خطأ في جلب الفواتير' });
  }
});

// GET /api/entities/:entityId/invoices/:id
router.get('/:entityId/invoices/:id', requireAuth, requireEntityAccess, async (req, res) => {
  try {
    const { entityId, id } = req.params;
    const invRes = await pool.query(`
      SELECT i.*, c.name AS customer_name, c.vat_number AS customer_vat
      FROM invoices i
      JOIN customers c ON c.id = i.customer_id
      WHERE i.id = $1 AND i.entity_id = $2
    `, [id, entityId]);

    if (invRes.rows.length === 0) {
      return res.status(404).json({ error: 'الفاتورة غير موجودة' });
    }

    const linesRes = await pool.query(
      'SELECT * FROM invoice_lines WHERE invoice_id = $1',
      [id]
    );

    res.json({ invoice: invRes.rows[0], lines: linesRes.rows });
  } catch (err) {
    res.status(500).json({ error: 'خطأ في جلب تفاصيل الفاتورة' });
  }
});

// POST /api/entities/:entityId/invoices/:id/post
router.post('/:entityId/invoices/:id/post', requireAuth, requireEntityAccess, async (req, res) => {
  try {
    const { entityId, id } = req.params;
    const result = await withTransaction(async (client) => {
      return await postInvoice(client, entityId, id, req.user.id);
    });
    res.status(200).json(result);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// ---------------- RECEIPTS ----------------

// POST /api/entities/:entityId/receipts
router.post('/:entityId/receipts', requireAuth, requireEntityAccess, async (req, res) => {
  try {
    const { entityId } = req.params;
    const { invoice_id, amount, cash_account_id, method = 'cash', notes } = req.body || {};

    if (!invoice_id || !amount || !cash_account_id) {
      return res.status(400).json({ error: 'الفاتورة والمبلغ وحساب الصندوق مطلوبان' });
    }

    const amountHalalas = typeof amount === 'number' ? Math.round(amount * 100) : toHalalas(amount);
    if (!amountHalalas || amountHalalas <= 0) {
      return res.status(400).json({ error: 'مبلغ سند القبض يجب أن يكون أكبر من الصفر' });
    }

    const result = await withTransaction(async (client) => {
      const receiptNumber = await nextDocNumber(client, entityId, 'RC');

      const rcRes = await client.query(`
        INSERT INTO receipts (entity_id, invoice_id, receipt_number, amount_halalas, cash_account_id, method, notes)
        VALUES ($1, $2, $3, $4, $5, $6, $7)
        RETURNING *
      `, [entityId, invoice_id, receiptNumber, amountHalalas, cash_account_id, method, notes || null]);

      const receipt = rcRes.rows[0];
      return await postReceipt(client, entityId, receipt.id, req.user.id);
    });

    res.status(201).json(result);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// ---------------- JOURNALS ----------------

// POST /api/entities/:entityId/journals
router.post('/:entityId/journals', requireAuth, requireEntityAccess, async (req, res) => {
  try {
    const { entityId } = req.params;
    const { date, description, lines } = req.body || {};

    if (!date || !description || !lines) {
      return res.status(400).json({ error: 'التاريخ والوصف وأطراف القيد مطلوبة' });
    }

    const j = await withTransaction(async (client) => {
      return await createJournal(client, entityId, {
        date,
        description,
        lines,
        source_type: 'manual'
      });
    });

    // Mandatory Correction 2:
    // replace `total_halalas: j.totalHalacas ?? j.totalHalalas` with `total_halalas: j.totalHalalas`
    res.status(201).json({
      journal: {
        ...j,
        total_halalas: j.totalHalalas
      }
    });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// GET /api/entities/:entityId/journals
router.get('/:entityId/journals', requireAuth, requireEntityAccess, async (req, res) => {
  try {
    const { entityId } = req.params;
    const result = await pool.query(`
      SELECT * FROM journals
      WHERE entity_id = $1
      ORDER BY date DESC, created_at DESC
    `, [entityId]);
    res.json({ journals: result.rows });
  } catch (err) {
    res.status(500).json({ error: 'خطأ في جلب قيود اليومية' });
  }
});

// POST /api/entities/:entityId/journals/:id/reverse
router.post('/:entityId/journals/:id/reverse', requireAuth, requireEntityAccess, async (req, res) => {
  try {
    const { entityId, id } = req.params;
    const { reason = 'تصحيح محاسبي' } = req.body || {};

    const reversal = await withTransaction(async (client) => {
      return await reverseJournal(client, entityId, id, {
        reason,
        userId: req.user.id
      });
    });

    res.status(200).json({ success: true, reversalJournal: reversal });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

module.exports = router;
