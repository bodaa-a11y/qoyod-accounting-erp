'use strict';
require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs'); // FIX: was missing — caused ReferenceError on /api/state fallback

const authRoutes = require('./routes-auth');
const { router: entityRoutes, requireAuth } = require('./routes-entities');
const salesRoutes = require('./routes-sales');
const reportsRoutes = require('./routes-reports');
const { generateInvoicePdf, defaultLogoData } = require('./invoice-pdf');
const { createStateInvoice, recordInvoiceReceipt, cancelStateInvoice } = require('./state-invoices');

const app = express();
const PORT = process.env.PORT || 3000;

// Security & Parsing Middleware
const allowedOrigins = process.env.CORS_ORIGINS ? process.env.CORS_ORIGINS.split(',') : '*';
app.use(cors({ origin: allowedOrigins }));
app.use(express.json({ limit: '10mb' }));

// Health Check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', time: new Date().toISOString() });
});

// Authenticated legacy application-state API with optimistic concurrency.
// Normalized accounting endpoints remain available under /api/entities.
const WRITABLE_STATE_ROLES = new Set(['admin', 'cfo', 'chief_accountant', 'accountant']);

async function readMainState(client) {
  const result = await client.query('SELECT data FROM system_state WHERE key = $1', ['main_state']);
  if (result.rows.length > 0) return result.rows[0].data;
  const dataFile = path.join(__dirname, '..', 'web', 'data.json');
  if (fs.existsSync(dataFile)) return JSON.parse(fs.readFileSync(dataFile, 'utf8'));
  return {};
}

app.get('/api/state', requireAuth, async (req, res) => {
  try {
    const { pool } = require('./lib');
    res.json(await readMainState(pool));
  } catch (err) {
    console.error('State GET error:', err);
    res.status(500).json({ error: 'تعذر جلب بيانات النظام. يرجى المحاولة مرة أخرى.' });
  }
});

app.post('/api/state', requireAuth, async (req, res) => {
  if (!WRITABLE_STATE_ROLES.has(req.user.role)) {
    return res.status(403).json({ error: 'صلاحيتك للقراءة فقط ولا تسمح بتعديل البيانات المالية' });
  }
  const newState = req.body;
  if (!newState || Array.isArray(newState) || typeof newState !== 'object') {
    return res.status(400).json({ error: 'صيغة البيانات المرسلة غير صالحة' });
  }

  try {
    const { withTransaction } = require('./lib');
    const saved = await withTransaction(async client => {
      const currentRes = await client.query('SELECT data FROM system_state WHERE key = $1 FOR UPDATE', ['main_state']);
      const current = currentRes.rows.length ? currentRes.rows[0].data : {};
      const currentRevision = Number(current._revision) || 0;
      const incomingRevision = Number(newState._revision) || 0;
      if (currentRes.rows.length && currentRevision !== incomingRevision) {
        return { conflict: true, current };
      }
      if (currentRes.rows.length) {
        const incomingInvoices = Array.isArray(newState.invoices) ? newState.invoices : [];
        const incomingJournals = Array.isArray(newState.journals) ? newState.journals : [];
        const invoiceChanged = (current.invoices || []).some(invoice => {
          const incoming = incomingInvoices.find(item => item.id === invoice.id);
          return !incoming || JSON.stringify(incoming) !== JSON.stringify(invoice);
        });
        const journalChanged = (current.journals || []).some(entry => {
          const incoming = incomingJournals.find(item => item.id === entry.id);
          return !incoming || JSON.stringify(incoming) !== JSON.stringify(entry);
        });
        if (invoiceChanged || journalChanged || incomingInvoices.length > (current.invoices || []).length) {
          return { financialConflict: true, current };
        }
      }
      const next = {
        ...newState,
        _revision: currentRevision + 1,
        _updatedAt: new Date().toISOString(),
        _updatedBy: req.user.id
      };
      await client.query(`
        INSERT INTO system_state (key, data, updated_at)
        VALUES ('main_state', $1, now())
        ON CONFLICT (key) DO UPDATE SET data = EXCLUDED.data, updated_at = now()
      `, [next]);
      return { state: next };
    });
    if (saved.conflict) {
      return res.status(409).json({ error: 'تغيرت البيانات بواسطة مستخدم آخر. أعد تحميلها قبل الحفظ.', state: saved.current });
    }
    if (saved.financialConflict) {
      return res.status(409).json({ error: 'الفواتير والقيود المرحلة محمية. استخدم التحصيل أو الإلغاء بعكس القيد بدلاً من تعديلها أو حذفها.', state: saved.current });
    }
    res.json({ success: true, state: saved.state, revision: saved.state._revision });
  } catch (err) {
    console.error('State POST error:', err);
    res.status(500).json({ error: 'تعذر حفظ البيانات في قاعدة البيانات. لم يتم تأكيد العملية.' });
  }
});

app.post('/api/state/next-number', requireAuth, async (req, res) => {
  if (!WRITABLE_STATE_ROLES.has(req.user.role)) {
    return res.status(403).json({ error: 'صلاحيتك لا تسمح بإصدار مستندات جديدة' });
  }
  const docType = String(req.body?.docType || '').toUpperCase();
  const entity = String(req.body?.entity || '').toLowerCase();
  if (!/^(INV|QUO|PRO|PO|RC|PV|JRN)$/.test(docType) || !/^[a-z0-9_-]{1,50}$/.test(entity)) {
    return res.status(400).json({ error: 'نوع المستند أو المنشأة غير صالح' });
  }
  try {
    const { withTransaction } = require('./lib');
    const result = await withTransaction(async client => {
      const year = new Date().getUTCFullYear();
      const key = `document-sequence:${docType}:${entity}:${year}`;
      const found = await client.query('SELECT data FROM system_state WHERE key = $1 FOR UPDATE', [key]);
      const nextNumber = found.rows.length ? (Number(found.rows[0].data.value) || 0) + 1 : 1;
      await client.query(`
        INSERT INTO system_state (key, data, updated_at) VALUES ($1, $2, now())
        ON CONFLICT (key) DO UPDATE SET data = EXCLUDED.data, updated_at = now()
      `, [key, { value: nextNumber }]);
      return `${docType}-${year}-${String(nextNumber).padStart(4, '0')}`;
    });
    res.json({ success: true, number: result });
  } catch (err) {
    console.error('Document numbering error:', err);
    res.status(500).json({ error: 'تعذر توليد رقم مستند آمن' });
  }
});

app.post('/api/state/invoices', requireAuth, async (req, res) => {
  if (!WRITABLE_STATE_ROLES.has(req.user.role)) {
    return res.status(403).json({ error: 'صلاحيتك لا تسمح بإصدار مستندات جديدة' });
  }
  try {
    const { withTransaction } = require('./lib');
    const result = await createStateInvoice({ body: req.body, user: req.user, withTransaction });
    res.status(result.idempotent ? 200 : 201).json({
      success: true,
      invoice: result.invoice,
      state: result.state,
      idempotent: result.idempotent
    });
  } catch (err) {
    const status = Number(err.status) || 500;
    if (status >= 500) console.error('State invoice creation error:', err);
    res.status(status).json({ error: status >= 500 ? 'تعذر حفظ الفاتورة وترحيلها. لم يتم تأكيد العملية.' : err.message });
  }
});

app.post('/api/state/invoices/:invoiceId/receipts', requireAuth, async (req, res) => {
  if (!WRITABLE_STATE_ROLES.has(req.user.role)) return res.status(403).json({ error: 'صلاحيتك لا تسمح بتسجيل التحصيل' });
  try {
    const { withTransaction } = require('./lib');
    const result = await recordInvoiceReceipt({ invoiceId: req.params.invoiceId, body: req.body, user: req.user, withTransaction });
    res.status(result.idempotent ? 200 : 201).json({ success: true, ...result });
  } catch (err) {
    const status = Number(err.status) || 500;
    if (status >= 500) console.error('Invoice receipt error:', err);
    res.status(status).json({ error: status >= 500 ? 'تعذر تسجيل التحصيل' : err.message });
  }
});

app.post('/api/state/invoices/:invoiceId/cancel', requireAuth, async (req, res) => {
  if (!WRITABLE_STATE_ROLES.has(req.user.role)) return res.status(403).json({ error: 'صلاحيتك لا تسمح بإلغاء الفواتير' });
  try {
    const { withTransaction } = require('./lib');
    const result = await cancelStateInvoice({ invoiceId: req.params.invoiceId, body: req.body, user: req.user, withTransaction });
    res.json({ success: true, ...result });
  } catch (err) {
    const status = Number(err.status) || 500;
    if (status >= 500) console.error('Invoice cancellation error:', err);
    res.status(status).json({ error: status >= 500 ? 'تعذر إلغاء الفاتورة وعكس قيودها' : err.message });
  }
});

app.get('/api/state/invoices/:invoiceId/pdf', requireAuth, async (req, res) => {
  try {
    const { pool } = require('./lib');
    const state = await readMainState(pool);
    const invoice = (state.invoices || []).find(item => String(item.id) === String(req.params.invoiceId));
    if (!invoice) return res.status(404).json({ error: 'الفاتورة غير موجودة' });
    const entity = (state.branches || []).find(item => item.id === invoice.entity) || { name: invoice.entity || 'المنشأة' };
    const pdf = await generateInvoicePdf(invoice, entity, { logoData: state.invoiceLogo || defaultLogoData() });
    const filename = `invoice-${invoice.id}.pdf`;
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Length', pdf.length);
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"; filename*=UTF-8''${encodeURIComponent(`فاتورة_${invoice.id}.pdf`)}`);
    res.send(pdf);
  } catch (err) {
    console.error('Invoice PDF error:', err);
    res.status(500).json({ error: 'تعذر إنشاء ملف PDF للفاتورة' });
  }
});

// FIX: requireAuth + admin/cfo only — previously exposed the full user list to anyone
app.get('/api/auth/users', requireAuth, async (req, res) => {
  try {
    if (req.user.role !== 'admin' && req.user.role !== 'cfo') {
      return res.status(403).json({ error: 'غير مصرح لك بعرض قائمة المستخدمين' });
    }
    const { pool } = require('./lib');
    const result = await pool.query('SELECT id, email, full_name, role FROM users');
    const roleTitles = {
      'cfo': 'المدير المالي العام (CFO)',
      'chief_accountant': 'رئيس الحسابات (Chief Accountant)',
      'auditor': 'مراجع مالي ومدقق داخلي (Internal Auditor)',
      'admin': 'المدير العام'
    };
    const users = result.rows.map(u => ({
      id: u.id,
      name: u.full_name,
      email: u.email,
      role: u.role,
      roleTitle: roleTitles[u.role] || u.role
    }));
    res.json({ success: true, users });
  } catch (err) {
    res.status(500).json({ error: 'خطأ في جلب قائمة المستخدمين' });
  }
});

// Mount API Routes
app.use('/api/auth', authRoutes);
app.use('/api/entities', entityRoutes);
app.use('/api/entities', salesRoutes);
app.use('/api/entities', reportsRoutes);

// Serve Frontend SPA
const publicDir = path.join(__dirname, '..', 'public');
app.use(express.static(publicDir));
app.use((req, res, next) => {
  if (req.method !== 'GET') return next();
  if (req.path.startsWith('/api/')) {
    return res.status(404).json({ error: 'المسار البرمجي غير موجود' });
  }
  res.sendFile(path.join(publicDir, 'index.html'));
});

// Centralized Error Handling Middleware
app.use((err, req, res, next) => {
  console.error('Unhandled Server Error:', err);
  const status = err.status || 500;
  const message = process.env.NODE_ENV === 'production'
    ? 'حدث خطأ داخلي في معالجة الطلب'
    : (err.message || 'خطأ غير متوقع');
  res.status(status).json({ error: message });
});

let server = null;
if (process.env.NODE_ENV !== 'test_skip_listen') {
  server = app.listen(PORT, () => {
    console.log(`🚀 Qoyod ERP Server listening on port ${PORT}`);
  });
}

module.exports = app;
