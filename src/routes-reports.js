'use strict';
const express = require('express');
const router = express.Router();
const { pool, toRiyals } = require('./lib');
const { requireAuth, requireEntityAccess } = require('./routes-entities');

// ---------------- TRIAL BALANCE (ميزان المراجعة) ----------------
router.get('/:entityId/reports/trial-balance', requireAuth, requireEntityAccess, async (req, res) => {
  try {
    const { entityId } = req.params;

    // Fetch all accounts and aggregate posted journal movements
    const q = `
      SELECT 
        a.id, a.code, a.name, a.type, a.nature, a.is_group,
        COALESCE(SUM(CASE WHEN j.id IS NOT NULL THEN jl.debit_halalas ELSE 0 END), 0)::BIGINT AS total_debit,
        COALESCE(SUM(CASE WHEN j.id IS NOT NULL THEN jl.credit_halalas ELSE 0 END), 0)::BIGINT AS total_credit
      FROM accounts a
      LEFT JOIN journal_lines jl ON jl.account_id = a.id
      LEFT JOIN journals j ON j.id = jl.journal_id AND j.status = 'posted'
      WHERE a.entity_id = $1
      GROUP BY a.id, a.code, a.name, a.type, a.nature, a.is_group
      ORDER BY a.code ASC
    `;

    const result = await pool.query(q, [entityId]);
    const allAccounts = result.rows;

    let grandDebitMoves = 0;
    let grandCreditMoves = 0;
    let grandDebitBalance = 0;
    let grandCreditBalance = 0;

    const reportAccounts = allAccounts.filter(a => !a.is_group).map(a => {
      const debitMoves = Number(a.total_debit) || 0;
      const creditMoves = Number(a.total_credit) || 0;

      grandDebitMoves += debitMoves;
      grandCreditMoves += creditMoves;

      let netDebit = 0;
      let netCredit = 0;

      if (a.nature === 'debit') {
        const net = debitMoves - creditMoves;
        if (net >= 0) netDebit = net;
        else netCredit = Math.abs(net);
      } else {
        const net = creditMoves - debitMoves;
        if (net >= 0) netCredit = net;
        else netDebit = Math.abs(net);
      }

      grandDebitBalance += netDebit;
      grandCreditBalance += netCredit;

      return {
        id: a.id,
        code: a.code,
        name: a.name,
        type: a.type,
        nature: a.nature,
        debitMoves,
        creditMoves,
        netDebit,
        netCredit,
        debitFormatted: toRiyals(netDebit),
        creditFormatted: toRiyals(netCredit)
      };
    });

    const isBalanced = grandDebitBalance === grandCreditBalance;

    res.json({
      accounts: reportAccounts,
      totals: {
        balanced: isBalanced,
        totalDebitMoves: grandDebitMoves,
        totalCreditMoves: grandCreditMoves,
        totalDebitBalance: grandDebitBalance,
        totalCreditBalance: grandCreditBalance,
        debitFormatted: toRiyals(grandDebitBalance),
        creditFormatted: toRiyals(grandCreditBalance),
        difference: Math.abs(grandDebitBalance - grandCreditBalance)
      }
    });
  } catch (err) {
    console.error('Trial balance report error:', err);
    res.status(500).json({ error: 'خطأ في توليد ميزان المراجعة' });
  }
});

// ---------------- BALANCE SHEET (قائمة المركز المالي) ----------------
router.get('/:entityId/reports/balance-sheet', requireAuth, requireEntityAccess, async (req, res) => {
  try {
    const { entityId } = req.params;
    const { as_of } = req.query;

    const dateFilter = as_of ? 'AND j.date <= $2' : '';
    const params = as_of ? [entityId, as_of] : [entityId];

    const q = `
      SELECT 
        a.id, a.code, a.name, a.type, a.nature, a.is_group,
        COALESCE(SUM(CASE WHEN j.id IS NOT NULL THEN jl.debit_halalas ELSE 0 END), 0)::BIGINT AS total_debit,
        COALESCE(SUM(CASE WHEN j.id IS NOT NULL THEN jl.credit_halalas ELSE 0 END), 0)::BIGINT AS total_credit
      FROM accounts a
      LEFT JOIN journal_lines jl ON jl.account_id = a.id
      LEFT JOIN journals j ON j.id = jl.journal_id AND j.status = 'posted' ${dateFilter}
      WHERE a.entity_id = $1
      GROUP BY a.id, a.code, a.name, a.type, a.nature, a.is_group
      ORDER BY a.code ASC
    `;

    const result = await pool.query(q, params);
    const rows = result.rows.filter(a => !a.is_group);

    let totalAssets = 0;
    let totalLiabilities = 0;
    let totalEquity = 0;
    let totalRevenue = 0;
    let totalExpenses = 0;

    const assets = [];
    const liabilities = [];
    const equity = [];

    rows.forEach(a => {
      const d = Number(a.total_debit) || 0;
      const c = Number(a.total_credit) || 0;
      const balance = a.nature === 'debit' ? (d - c) : (c - d);

      if (a.type === 'asset') {
        totalAssets += balance;
        assets.push({ ...a, balance, formatted: toRiyals(balance) });
      } else if (a.type === 'liability') {
        totalLiabilities += balance;
        liabilities.push({ ...a, balance, formatted: toRiyals(balance) });
      } else if (a.type === 'equity') {
        totalEquity += balance;
        equity.push({ ...a, balance, formatted: toRiyals(balance) });
      } else if (a.type === 'revenue') {
        totalRevenue += balance;
      } else if (a.type === 'expense') {
        totalExpenses += balance;
      }
    });

    // Current period earnings
    const currentEarnings = totalRevenue - totalExpenses;
    const totalLiabilitiesAndEquity = totalLiabilities + totalEquity + currentEarnings;

    const isBalanced = totalAssets === totalLiabilitiesAndEquity;

    res.json({
      assets,
      liabilities,
      equity,
      currentEarnings,
      totals: {
        balanced: isBalanced,
        totalAssets,
        totalLiabilities,
        totalEquity,
        currentEarnings,
        totalLiabilitiesAndEquity,
        assetsFormatted: toRiyals(totalAssets),
        liabilitiesAndEquityFormatted: toRiyals(totalLiabilitiesAndEquity),
        difference: Math.abs(totalAssets - totalLiabilitiesAndEquity)
      }
    });
  } catch (err) {
    console.error('Balance sheet error:', err);
    res.status(500).json({ error: 'خطأ في توليد قائمة المركز المالي' });
  }
});

// ---------------- INCOME STATEMENT (قائمة الدخل والأرباح) ----------------
router.get('/:entityId/reports/income-statement', requireAuth, requireEntityAccess, async (req, res) => {
  try {
    const { entityId } = req.params;
    const { from, to } = req.query;

    let dateCond = '';
    const params = [entityId];
    if (from && to) {
      dateCond = 'AND j.date >= $2 AND j.date <= $3';
      params.push(from, to);
    }

    const q = `
      SELECT 
        a.id, a.code, a.name, a.type, a.nature, a.sub_type,
        COALESCE(SUM(CASE WHEN j.id IS NOT NULL THEN jl.debit_halalas ELSE 0 END), 0)::BIGINT AS total_debit,
        COALESCE(SUM(CASE WHEN j.id IS NOT NULL THEN jl.credit_halalas ELSE 0 END), 0)::BIGINT AS total_credit
      FROM accounts a
      LEFT JOIN journal_lines jl ON jl.account_id = a.id
      LEFT JOIN journals j ON j.id = jl.journal_id AND j.status = 'posted' ${dateCond}
      WHERE a.entity_id = $1 AND a.type IN ('revenue', 'expense') AND a.is_group = false
      GROUP BY a.id, a.code, a.name, a.type, a.nature, a.sub_type
      ORDER BY a.code ASC
    `;

    const result = await pool.query(q, params);
    const rows = result.rows;

    let totalRevenue = 0;
    let totalCOGS = 0;
    let totalOPEX = 0;

    const revenues = [];
    const expenses = [];

    rows.forEach(a => {
      const d = Number(a.total_debit) || 0;
      const c = Number(a.total_credit) || 0;

      if (a.type === 'revenue') {
        const bal = c - d;
        totalRevenue += bal;
        revenues.push({ ...a, balance: bal, formatted: toRiyals(bal) });
      } else {
        const bal = d - c;
        if (a.sub_type === 'cogs') totalCOGS += bal;
        else totalOPEX += bal;
        expenses.push({ ...a, balance: bal, formatted: toRiyals(bal) });
      }
    });

    const grossProfit = totalRevenue - totalCOGS;
    const netProfit = grossProfit - totalOPEX;

    res.json({
      revenues,
      expenses,
      totals: {
        totalRevenue,
        totalCOGS,
        grossProfit,
        totalOPEX,
        netProfit,
        revenueFormatted: toRiyals(totalRevenue),
        cogsFormatted: toRiyals(totalCOGS),
        grossFormatted: toRiyals(grossProfit),
        opexFormatted: toRiyals(totalOPEX),
        netFormatted: toRiyals(netProfit)
      }
    });
  } catch (err) {
    console.error('Income statement error:', err);
    res.status(500).json({ error: 'خطأ في توليد قائمة الدخل' });
  }
});

// ---------------- AUDIT LOG (سجل التدقيق الأمني) ----------------
router.get('/:entityId/audit-log', requireAuth, requireEntityAccess, async (req, res) => {
  try {
    const { entityId } = req.params;
    const result = await pool.query(`
      SELECT al.*, u.full_name AS user_name, u.email AS user_email
      FROM audit_log al
      LEFT JOIN users u ON u.id = al.user_id
      WHERE al.entity_id = $1
      ORDER BY al.created_at DESC
      LIMIT 100
    `, [entityId]);

    res.json({ audit: result.rows });
  } catch (err) {
    res.status(500).json({ error: 'خطأ في جلب سجل التدقيق' });
  }
});

module.exports = router;
