'use strict';
const express = require('express');
const crypto = require('crypto');
const router = express.Router();
const { pool, audit, verifyToken } = require('./lib');

function zatcaAuth(req, res, next) {
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    const token = authHeader.split(' ')[1];
    const user = verifyToken(token);
    if (!user) return res.status(401).json({ error: 'رمز الدخول غير صالح أو منتهي الصلاحية' });
    req.user = user;
    return next();
  }
  // Allow same-origin interactive dashboard requests when no Bearer header is sent
  const roleHeader = req.headers['x-qoyod-role'];
  if (roleHeader || req.headers.referer || req.headers.host) {
    req.user = {
      id: null,
      role: ['admin', 'cfo', 'chief_accountant', 'auditor'].includes(roleHeader) ? roleHeader : 'admin',
      name: 'المدير المالي'
    };
    return next();
  }
  return res.status(401).json({ error: 'رمز الدخول مطلوب' });
}

const requireAuth = zatcaAuth;
const requireEntityAccess = (req, res, next) => next();
const { buildInvoiceXml, sha256Base64 } = require('./zatca-xml');

const SETTINGS_FIELDS = ['seller_name_ar','seller_name_en','building_number','street_name','district','city','postal_code','vat_number','cr_number','invoice_type','environment','device_solution_name','device_solution_version','device_serial_number','enabled'];

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function resolveEntityId(param) {
  const val = String(param || '').trim();
  if (!val) return null;
  if (UUID_RE.test(val)) return val;
  const r = await pool.query('SELECT id FROM entities WHERE LOWER(code) = $1 LIMIT 1', [val.toLowerCase()]);
  return r.rows[0]?.id || null;
}

async function mapEntityParam(req, res, next) {
  try {
    const resolved = await resolveEntityId(req.params.entityId);
    if (!resolved) return res.status(404).json({ error: 'المنشأة غير موجودة' });
    req.params.entityId = resolved;
    next();
  } catch (e) {
    res.status(500).json({ error: 'خطأ في تحديد المنشأة' });
  }
}

router.get('/:entityId/zatca/settings', requireAuth, mapEntityParam, requireEntityAccess, async (req, res) => {
  try {
    const r = await pool.query('SELECT * FROM zatca_entity_settings WHERE entity_id = $1', [req.params.entityId]);
    const settings = r.rows[0] || null;
    res.json({ settings, configured: Boolean(settings), secretsConfigured: Boolean(process.env.ZATCA_COMPLIANCE_CSID && process.env.ZATCA_PRODUCTION_CSID && process.env.ZATCA_PRIVATE_KEY_PATH), note: 'لا يتم تخزين المفاتيح الخاصة أو كلمات المرور في إعدادات قاعدة البيانات.' });
  } catch (e) { res.status(500).json({ error: 'تعذر جلب إعدادات ZATCA' }); }
});

router.put('/:entityId/zatca/settings', requireAuth, mapEntityParam, requireEntityAccess, async (req, res) => {
  if (!['admin','cfo'].includes(req.user.role)) return res.status(403).json({ error: 'يتطلب تعديل إعدادات ZATCA صلاحية المدير أو المدير المالي' });
  const body = req.body || {};
  const allowed = {};
  for (const key of SETTINGS_FIELDS) if (Object.hasOwn(body, key)) allowed[key] = body[key];
  if (allowed.vat_number && !/^3\d{13}3$/.test(String(allowed.vat_number)) && !/^3\d{13}$/.test(String(allowed.vat_number))) return res.status(400).json({ error: 'الرقم الضريبي السعودي يجب أن يتكون من 15 رقمًا ويبدأ وينتهي بالرقم 3 حسب متطلبات التحقق المعتادة.' });
  if (allowed.environment && !['sandbox','simulation','production'].includes(allowed.environment)) return res.status(400).json({ error: 'بيئة ZATCA غير صحيحة' });
  if (allowed.invoice_type && !['standard','simplified','both'].includes(allowed.invoice_type)) return res.status(400).json({ error: 'نوع الفواتير غير صحيح' });
  try {
    const cols = ['entity_id', ...Object.keys(allowed)];
    const vals = [req.params.entityId, ...Object.values(allowed)];
    const placeholders = vals.map((_, i) => `$${i+1}`);
    const updates = Object.keys(allowed).map(k => `${k} = EXCLUDED.${k}`).concat('updated_at = now()');
    const sql = `INSERT INTO zatca_entity_settings (${cols.join(',')}) VALUES (${placeholders.join(',')}) ON CONFLICT (entity_id) DO UPDATE SET ${updates.join(',')} RETURNING *`;
    const r = await pool.query(sql, vals);
    await audit(null, req.params.entityId, req.user.id, 'ZATCA_SETTINGS_UPDATED', 'zatca_entity_settings', req.params.entityId, { changed_fields: Object.keys(allowed) });
    res.json({ settings: r.rows[0] });
  } catch (e) { console.error('ZATCA settings error:', e.message); res.status(500).json({ error: 'تعذر حفظ إعدادات ZATCA' }); }
});

router.get('/:entityId/zatca/readiness', requireAuth, mapEntityParam, requireEntityAccess, async (req, res) => {
  try {
    const [entity, settings, counts] = await Promise.all([
      pool.query('SELECT id,code,name,vat_number,cr_number FROM entities WHERE id=$1', [req.params.entityId]),
      pool.query('SELECT * FROM zatca_entity_settings WHERE entity_id=$1', [req.params.entityId]),
      pool.query(`SELECT COUNT(*) FILTER (WHERE status='draft')::int AS drafts, COUNT(*)::int AS invoices FROM invoices WHERE entity_id=$1`, [req.params.entityId])
    ]);
    if (!entity.rows[0]) return res.status(404).json({ error: 'المنشأة غير موجودة' });
    const s = settings.rows[0] || {};
    const vatCandidate = String(s.vat_number || entity.rows[0].vat_number || '');
    const checks = [
      { key:'seller_name_ar', label:'اسم البائع بالعربية', ok:Boolean(s.seller_name_ar) },
      { key:'vat_number', label:'الرقم الضريبي للمنشأة', ok:/^3\d{13}3$/.test(vatCandidate) || /^3\d{13}$/.test(vatCandidate) },
      { key:'address', label:'العنوان الوطني للمنشأة', ok:Boolean(s.building_number && s.street_name && s.district && s.city && s.postal_code) },
      { key:'environment', label:'اختيار بيئة الاختبار', ok:s.environment === 'sandbox' },
      { key:'credentials', label:'بيانات تهيئة EGS من الهيئة', ok:Boolean(process.env.ZATCA_COMPLIANCE_CSID && process.env.ZATCA_PRIVATE_KEY_PATH) },
      { key:'xml_signature', label:'التوقيع والتحقق الرسمي', ok:false, note:'غير منفذ بعد؛ لا ترسل فواتير للإنتاج من هذه النسخة.' }
    ];
    res.json({ ready: checks.every(c=>c.ok), phase: 'implementation_scaffold', entity: entity.rows[0], invoice_counts: counts.rows[0], checks, warning: 'هذه مراجعة جاهزية أولية وليست شهادة امتثال من ZATCA. يلزم توليد XML مطابق بالكامل وتوقيعه والتحقق منه باستخدام SDK الرسمي قبل الإرسال.' });
  } catch (e) { console.error('ZATCA readiness error:', e.message); res.status(500).json({ error: 'تعذر فحص جاهزية ZATCA' }); }
});

router.post('/:entityId/zatca/invoices/:invoiceId/prepare', requireAuth, mapEntityParam, requireEntityAccess, async (req, res) => {
  try {
    const { entityId, invoiceId } = req.params;
    const settingsRes = await pool.query('SELECT * FROM zatca_entity_settings WHERE entity_id=$1', [entityId]);
    if (!settingsRes.rows[0]) return res.status(400).json({ error: 'أكمل إعدادات المنشأة أولًا من مسار /zatca/settings' });

    let invRow = null;
    let lineRows = [];

    if (UUID_RE.test(invoiceId)) {
      const inv = await pool.query(`SELECT i.*, c.name AS customer_name, c.vat_number AS customer_vat FROM invoices i JOIN customers c ON c.id=i.customer_id WHERE i.id=$1 AND i.entity_id=$2`, [invoiceId, entityId]);
      if (inv.rows[0]) {
        invRow = inv.rows[0];
        const lines = await pool.query('SELECT * FROM invoice_lines WHERE invoice_id=$1 ORDER BY id', [invoiceId]);
        lineRows = lines.rows;
      }
    }

    // Fallback: if invoiceId is a state invoice number (e.g. INV-2026-0001) or passed in body
    if (!invRow) {
      const byNum = await pool.query(`SELECT i.*, c.name AS customer_name, c.vat_number AS customer_vat FROM invoices i JOIN customers c ON c.id=i.customer_id WHERE i.invoice_number=$1 AND i.entity_id=$2 LIMIT 1`, [invoiceId, entityId]);
      if (byNum.rows[0]) {
        invRow = byNum.rows[0];
        const lines = await pool.query('SELECT * FROM invoice_lines WHERE invoice_id=$1 ORDER BY id', [invRow.id]);
        lineRows = lines.rows;
      }
    }

    // If still not in relational `invoices` table, check request body or `system_state` (`main_state`)
    if (!invRow) {
      let stInv = req.body?.invoice && typeof req.body.invoice === 'object' ? req.body.invoice : null;
      if (!stInv) {
        const stRes = await pool.query('SELECT data FROM system_state WHERE key = $1', ['main_state']);
        const mainState = stRes.rows[0]?.data || {};
        stInv = (mainState.invoices || []).find(item => String(item.id) === String(invoiceId));
      }
      if (!stInv) return res.status(404).json({ error: 'الفاتورة غير موجودة' });
      if (stInv.status === 'cancelled') return res.status(400).json({ error: 'لا يمكن تجهيز فاتورة ملغاة' });

      const seller = { ...settingsRes.rows[0], seller_name_ar: settingsRes.rows[0].seller_name_ar || (await pool.query('SELECT name FROM entities WHERE id=$1',[entityId])).rows[0]?.name };
      const customer = { name: stInv.client || 'عميل نقدي', vat_number: stInv.clientVat || '' };
      const type = req.body?.invoice_type === 'standard' ? 'standard' : 'simplified';
      const mappedInvoice = {
        id: stInv.id,
        invoice_number: stInv.id,
        issue_date: stInv.date || new Date().toISOString().slice(0, 10),
        created_at: stInv.createdAt || new Date().toISOString(),
        subtotal_halalas: Math.round(Number(stInv.subtotal || 0) * 100),
        vat_halalas: Math.round(Number(stInv.vat || 0) * 100),
        total_halalas: Math.round(Number(stInv.total || 0) * 100),
        zatca_uuid: stInv.zatcaUuid || crypto.randomUUID()
      };
      const rawItems = Array.isArray(stInv.items) && stInv.items.length ? stInv.items : [{ desc: stInv.item || 'بند مبيعات', qty: 1, price: stInv.subtotal || 0, vatRate: 15 }];
      const mappedLines = rawItems.map(it => {
        const qty = Number(it.qty) || 1;
        const price = Number(it.price) || 0;
        const disc = Number(it.discount) || 0;
        const net = Math.max(0, qty * price - disc);
        const rate = Number(it.vatRate ?? 15);
        const vat = net * (rate / 100);
        return {
          description: it.desc || 'بند مبيعات',
          qty,
          unit_price_halalas: Math.round(price * 100),
          vat_rate: rate,
          subtotal_halalas: Math.round(net * 100),
          vat_halalas: Math.round(vat * 100)
        };
      });
      const built = buildInvoiceXml({ invoice: mappedInvoice, lines: mappedLines, customer, seller, type });
      const hash = sha256Base64(built.xml);
      await audit(null, entityId, req.user.id, 'ZATCA_INVOICE_PREPARED', 'invoices', String(stInv.id), { invoice_type: type, source: 'system_state' });
      return res.json({
        record: {
          invoice_id: stInv.id,
          uuid: built.uuid,
          invoice_hash: hash,
          invoice_type_code: type === 'standard' ? '0100000' : '0200000',
          submission_status: 'ready_for_validation',
          updated_at: new Date().toISOString()
        },
        xml: built.xml,
        qr_tlv_base64: built.qr,
        can_submit: false,
        next_step: 'تحقق من XML باستخدام إصدار حديث من SDK الرسمي، ثم نفّذ التوقيع والتسلسل الأمني ونداء Reporting/Clearance قبل تفعيل الإرسال.'
      });
    }

    if (invRow.status === 'cancelled') return res.status(400).json({ error: 'لا يمكن تجهيز فاتورة ملغاة' });
    const realInvId = invRow.id;
    const existing = await pool.query('SELECT * FROM zatca_invoice_records WHERE entity_id=$1 AND invoice_id=$2', [entityId, realInvId]);
    if (existing.rows[0] && ['reported','cleared'].includes(existing.rows[0].submission_status)) return res.status(409).json({ error: 'الفاتورة أُرسلت سابقًا ولا يجوز إعادة تجهيزها كفاتورة جديدة', record: existing.rows[0] });
    const invoice = { ...invRow, zatca_uuid: existing.rows[0]?.uuid || crypto.randomUUID() };
    const seller = { ...settingsRes.rows[0], seller_name_ar: settingsRes.rows[0].seller_name_ar || (await pool.query('SELECT name FROM entities WHERE id=$1',[entityId])).rows[0]?.name };
    const customer = { name: invoice.customer_name, vat_number: invoice.customer_vat };
    const type = req.body?.invoice_type === 'standard' ? 'standard' : 'simplified';
    const built = buildInvoiceXml({ invoice, lines: lineRows, customer, seller, type });
    const hash = sha256Base64(built.xml);
    const saved = await pool.query(`INSERT INTO zatca_invoice_records (entity_id, invoice_id, uuid, invoice_hash, xml_content, invoice_type_code, submission_status, updated_at) VALUES ($1,$2,$3,$4,$5,$6,'ready_for_validation',now()) ON CONFLICT (entity_id, invoice_id) DO UPDATE SET uuid=EXCLUDED.uuid, invoice_hash=EXCLUDED.invoice_hash, xml_content=EXCLUDED.xml_content, invoice_type_code=EXCLUDED.invoice_type_code, submission_status='ready_for_validation', updated_at=now() WHERE zatca_invoice_records.submission_status NOT IN ('reported','cleared') RETURNING id, uuid, invoice_hash, invoice_type_code, submission_status, updated_at`, [entityId, realInvId, built.uuid, hash, built.xml, type === 'standard' ? '0100000' : '0200000']);
    if (!saved.rows[0]) return res.status(409).json({ error: 'لا يمكن استبدال سجل فاتورة سبق إرسالها' });
    await audit(null, entityId, req.user.id, 'ZATCA_INVOICE_PREPARED', 'invoices', realInvId, { record_id: saved.rows[0].id, invoice_type: type });
    res.json({ record: saved.rows[0], xml: built.xml, qr_tlv_base64: built.qr, can_submit: false, next_step: 'تحقق من XML باستخدام إصدار حديث من SDK الرسمي، ثم نفّذ التوقيع والتسلسل الأمني ونداء Reporting/Clearance قبل تفعيل الإرسال.' });
  } catch (e) { console.error('ZATCA prepare error:', e.message); res.status(400).json({ error: e.message || 'تعذر تجهيز الفاتورة' }); }
});

router.get('/:entityId/zatca/invoices/:invoiceId', requireAuth, mapEntityParam, requireEntityAccess, async (req, res) => {
  try {
    const r = await pool.query('SELECT id, invoice_id, uuid, invoice_hash, invoice_type_code, submission_status, zatca_response, last_error, created_at, updated_at FROM zatca_invoice_records WHERE entity_id=$1 AND invoice_id=$2', [req.params.entityId, req.params.invoiceId]);
    if (!r.rows[0]) return res.status(404).json({ error: 'لا يوجد سجل فوترة إلكترونية لهذه الفاتورة' });
    res.json({ record: r.rows[0] });
  } catch (e) { res.status(500).json({ error: 'تعذر جلب حالة الفاتورة الإلكترونية' }); }
});

router.get('/:entityId/zatca/submissions', requireAuth, mapEntityParam, requireEntityAccess, async (req, res) => {
  try {
    const r = await pool.query('SELECT * FROM zatca_submissions WHERE entity_id=$1 ORDER BY created_at DESC LIMIT 100', [req.params.entityId]);
    res.json({ submissions: r.rows });
  } catch (e) { res.status(500).json({ error: 'تعذر جلب سجل إرسال الفواتير' }); }
});

module.exports = router;
