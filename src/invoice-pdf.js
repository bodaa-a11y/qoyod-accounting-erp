'use strict';
const fs = require('fs');
const path = require('path');
const QRCode = require('qrcode');

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>'"]/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[ch]));
}

function money(value) {
  return (Number(value) || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function tlv(tag, value) {
  const bytes = Buffer.from(String(value ?? ''), 'utf8');
  return Buffer.concat([Buffer.from([tag, bytes.length]), bytes]);
}

async function buildInvoiceHtml(invoice, entity, options = {}) {
  const items = Array.isArray(invoice.items) && invoice.items.length
    ? invoice.items
    : [{ desc: invoice.item || 'بند فاتورة', qty: 1, price: invoice.subtotal || 0, discount: 0, vatRate: 15 }];
  const logo = options.logoData || '';
  const timestamp = new Date(`${invoice.date}T12:00:00Z`).toISOString();
  const payload = Buffer.concat([
    tlv(1, entity.name || ''),
    tlv(2, entity.vat || ''),
    tlv(3, timestamp),
    tlv(4, Number(invoice.total || 0).toFixed(2)),
    tlv(5, Number(invoice.vat || 0).toFixed(2))
  ]).toString('base64');
  const qr = await QRCode.toDataURL(payload, { width: 116, margin: 1, errorCorrectionLevel: 'M' });
  const status = invoice.status === 'paid' ? 'مسددة' : invoice.status === 'cancelled' ? 'ملغاة' : invoice.status === 'overdue' ? 'متأخرة' : invoice.status === 'quote' ? 'غير مترحلة' : 'غير مسددة';
  const paidAmount = Number(invoice.paidAmount ?? (invoice.status === 'paid' ? invoice.total : 0)) || 0;
  const rows = items.map((item, index) => {
    const gross = (Number(item.qty) || 0) * (Number(item.price) || 0);
    const net = Math.max(0, gross - (Number(item.discount) || 0));
    const total = net * (1 + (Number(item.vatRate ?? 15) / 100));
    return `<tr>
      <td class="center muted">${index + 1}</td>
      <td>${escapeHtml(item.desc || 'بند فاتورة')}</td>
      <td class="center">${escapeHtml(item.qty ?? 1)}</td>
      <td class="num">${money(item.price)}</td>
      <td class="num">${money(item.discount)}</td>
      <td class="center">${money(item.vatRate ?? 15)}%</td>
      <td class="num strong">${money(total)}</td>
    </tr>`;
  }).join('');

  return `<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8">
  <style>
    @page { size: A4; margin: 12mm; }
    * { box-sizing: border-box; }
    body { margin: 0; color: #172033; background: #fff; font-family: "Noto Sans Arabic", "Noto Naskh Arabic", "DejaVu Sans", sans-serif; font-size: 11px; line-height: 1.65; }
    header { display: flex; justify-content: space-between; align-items: flex-start; padding-bottom: 16px; border-bottom: 2px solid #0064e6; }
    .brand { display: flex; gap: 12px; align-items: center; }
    .logo { width: 64px; height: 64px; object-fit: contain; }
    h1 { margin: 0 0 4px; font-size: 23px; color: #10213a; }
    h2 { margin: 0; font-size: 17px; }
    .muted { color: #64748b; }
    .meta { text-align: left; direction: rtl; }
    .meta .number { direction: ltr; display: inline-block; font-weight: 700; color: #0064e6; font-size: 14px; }
    .parties { display: grid; grid-template-columns: 1fr 1fr; gap: 24px; margin: 20px 0; }
    .party h3 { margin: 0 0 6px; font-size: 11px; color: #0064e6; }
    .party p { margin: 2px 0; }
    table { width: 100%; border-collapse: collapse; table-layout: fixed; }
    thead { display: table-header-group; }
    th { background: #edf4fc; color: #19324f; padding: 8px 6px; border: 1px solid #d7e1ec; font-size: 10px; }
    td { padding: 8px 6px; border: 1px solid #dfe6ee; vertical-align: top; overflow-wrap: anywhere; }
    tr { break-inside: avoid; page-break-inside: avoid; }
    .center { text-align: center; }
    .num { text-align: left; direction: ltr; white-space: nowrap; }
    .strong { font-weight: 700; }
    .summary { display: grid; grid-template-columns: 1fr 250px; gap: 24px; margin-top: 18px; break-inside: avoid; page-break-inside: avoid; }
    .qr { width: 104px; height: 104px; }
    .totals { break-inside: avoid; }
    .total-row { display: flex; justify-content: space-between; padding: 5px 0; border-bottom: 1px solid #e6ebf1; }
    .grand { color: #0064e6; font-size: 15px; font-weight: 700; border-bottom: 2px solid #0064e6; }
    .notes { margin-top: 18px; padding-top: 10px; border-top: 1px solid #dfe6ee; break-inside: avoid; }
    footer { margin-top: 18px; text-align: center; color: #64748b; font-size: 9px; }
  </style></head><body>
  <header>
    <div class="brand">${logo ? `<img class="logo" src="${logo}" alt="">` : ''}<div><h2>${escapeHtml(entity.name)}</h2><div>سجل تجاري: ${escapeHtml(entity.cr || '—')}</div><div>رقم ضريبي: ${escapeHtml(entity.vat || '—')}</div><div class="muted">${escapeHtml(entity.desc || '')}</div></div></div>
    <div class="meta"><h1>فاتورة ضريبية</h1><div class="number">${escapeHtml(invoice.id)}</div><div>تاريخ الإصدار: ${escapeHtml(invoice.date)}</div><div>تاريخ الاستحقاق: ${escapeHtml(invoice.dueDate || invoice.date)}</div><div>الحالة: ${status}</div></div>
  </header>
  <section class="parties"><div class="party"><h3>بيانات العميل</h3><p><strong>${escapeHtml(invoice.client)}</strong></p><p>الرقم الضريبي: ${escapeHtml(invoice.clientVat || '—')}</p><p>${escapeHtml(invoice.clientAddress || '—')}</p></div><div class="party"><h3>بيانات السداد</h3><p>طريقة السداد: ${escapeHtml(invoice.method || '—')}</p><p>المبلغ المسدد: ${money(paidAmount)} ر.س</p><p>الرصيد المتبقي: ${money(invoice.outstanding ?? Math.max(0, Number(invoice.total || 0) - paidAmount))} ر.س</p></div></section>
  <table><thead><tr><th style="width:5%">#</th><th style="width:33%">الوصف</th><th style="width:8%">الكمية</th><th style="width:12%">سعر الوحدة</th><th style="width:11%">الخصم</th><th style="width:9%">الضريبة</th><th style="width:15%">الإجمالي</th></tr></thead><tbody>${rows}</tbody></table>
  <section class="summary"><div><img class="qr" src="${qr}" alt="رمز الفاتورة"><div class="muted">رمز تحقق بيانات الفاتورة</div></div><div class="totals"><div class="total-row"><span>الإجمالي قبل الخصم</span><span class="num">${money(invoice.grossSubtotal ?? ((Number(invoice.subtotal) || 0) + (Number(invoice.discount) || 0)))} ر.س</span></div><div class="total-row"><span>الخصم</span><span class="num">${money(invoice.discount)} ر.س</span></div><div class="total-row"><span>صافي خاضع للضريبة</span><span class="num">${money(invoice.subtotal)} ر.س</span></div><div class="total-row"><span>ضريبة القيمة المضافة</span><span class="num">${money(invoice.vat)} ر.س</span></div><div class="total-row grand"><span>الإجمالي المستحق</span><span class="num">${money(invoice.total)} ر.س</span></div></div></section>
  <section class="notes"><strong>ملاحظات</strong><div>${escapeHtml(invoice.notes || 'شكراً لتعاملكم معنا.')}</div></section>
  <footer>أُنشئت هذه الفاتورة إلكترونياً بواسطة نظام قيد المحاسبي</footer>
  </body></html>`;
}

async function generateInvoicePdf(invoice, entity, options = {}) {
  const puppeteer = require('puppeteer-core');
  const executablePath = process.env.CHROMIUM_PATH || ['/usr/bin/chromium', '/usr/bin/chromium-browser', '/usr/bin/google-chrome'].find(fs.existsSync);
  if (!executablePath) throw new Error('لم يتم العثور على متصفح Chromium لتوليد PDF');
  const html = await buildInvoiceHtml(invoice, entity, options);
  const browser = await puppeteer.launch({ executablePath, headless: true, args: ['--no-sandbox', '--disable-setuid-sandbox', '--font-render-hinting=none'] });
  try {
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: 'networkidle0' });
    return await page.pdf({
      format: 'A4',
      printBackground: true,
      preferCSSPageSize: true,
      displayHeaderFooter: true,
      headerTemplate: '<span></span>',
      footerTemplate: '<div style="width:100%;text-align:center;font-size:8px;color:#64748b"><span class="pageNumber"></span> / <span class="totalPages"></span></div>',
      margin: { top: '12mm', right: '12mm', bottom: '16mm', left: '12mm' }
    });
  } finally {
    await browser.close();
  }
}

function defaultLogoData() {
  const logoPath = path.join(__dirname, '..', 'public', 'logo.png');
  return `data:image/png;base64,${fs.readFileSync(logoPath).toString('base64')}`;
}

module.exports = { buildInvoiceHtml, generateInvoicePdf, defaultLogoData, escapeHtml };
