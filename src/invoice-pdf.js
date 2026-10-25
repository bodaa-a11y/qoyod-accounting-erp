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

function resolveEntityMeta(invoice, entity = {}) {
  const entityNames = {
    law: {
      ar: 'شركة حجاج عبدالرحمن الضويحي للمحاماة والاستشارات القانونية',
      en: 'Hajjaj Abdulrahman Al-Dhuwaihi Law Firm and Legal Consultations',
      cr: '1011149366',
      vat: '311228238200003',
      addrAr: '3754، طريق الملك عبدالله، الورود، الخرج، 16278، المملكة العربية السعودية',
      addrEn: '3754, طريق الملك عبدالله, الورود, الخرج, 16278, Kingdom of Saudi Arabia',
      email: 'hajaj.alduwaihi@gmail.com',
      phone: '0555102509'
    },
    restaurant: {
      ar: 'مطعم مذاق البخاري والشاورما',
      en: 'Mazaq Al Bukhari Restaurant',
      cr: '1010765432',
      vat: '310987654300003',
      addrAr: 'الرياض، المملكة العربية السعودية',
      addrEn: 'Riyadh, Kingdom of Saudi Arabia',
      email: '',
      phone: ''
    },
    farm: {
      ar: 'مزرعة الواحة الخضراء للمنتجات الزراعية',
      en: 'Green Oasis Farm',
      cr: '1010543210',
      vat: '310654321000003',
      addrAr: 'الخرج، المملكة العربية السعودية',
      addrEn: 'Al-Kharj, Kingdom of Saudi Arabia',
      email: '',
      phone: ''
    },
    barber: {
      ar: 'صالون الأناقة الرجالي',
      en: 'Elegance Men Salon',
      cr: '1010432109',
      vat: '310432109800003',
      addrAr: 'الرياض، المملكة العربية السعودية',
      addrEn: 'Riyadh, Kingdom of Saudi Arabia',
      email: '',
      phone: ''
    },
    home: {
      ar: 'الذمة المالية الشخصية والمنزلية',
      en: 'Personal Household',
      cr: '-',
      vat: '-',
      addrAr: 'المملكة العربية السعودية',
      addrEn: 'Kingdom of Saudi Arabia',
      email: '',
      phone: ''
    }
  };
  const key = invoice?.entity || entity?.id || 'law';
  const base = entityNames[key] || entityNames.law;
  return {
    ar: entity?.ar || entity?.name || base.ar,
    en: entity?.en || base.en,
    cr: entity?.cr || base.cr,
    vat: entity?.vat || base.vat,
    addrAr: entity?.addrAr || base.addrAr,
    addrEn: entity?.addrEn || base.addrEn,
    email: entity?.email ?? base.email,
    phone: entity?.phone ?? base.phone
  };
}

async function buildInvoiceHtml(invoice, entity, options = {}) {
  const ent = resolveEntityMeta(invoice, entity);
  const items = Array.isArray(invoice.items) && invoice.items.length
    ? invoice.items
    : [{ desc: invoice.item || 'استشارة قانونية', qty: 1, price: invoice.subtotal || 0, discount: 0, vatRate: 15 }];
  const logo = options.logoData || defaultLogoData();
  const dateStr = invoice.date || new Date().toISOString().slice(0, 10);
  const timestamp = `${dateStr}T12:00:00Z`;
  const payload = Buffer.concat([
    tlv(1, ent.ar || ''),
    tlv(2, ent.vat || ''),
    tlv(3, timestamp),
    tlv(4, Number(invoice.total || 0).toFixed(2)),
    tlv(5, Number(invoice.vat || 0).toFixed(2))
  ]).toString('base64');
  const qr = await QRCode.toDataURL(payload, { width: 112, margin: 0, errorCorrectionLevel: 'M' });

  const docTitles = {
    tax_invoice: ['فاتورة ضريبية', 'Tax Invoice'],
    simplified: ['فاتورة ضريبية مبسطة', 'Simplified Tax Invoice'],
    quote: ['عرض سعر', 'Quotation'],
    proforma: ['فاتورة مبدئية', 'Proforma Invoice']
  };
  const [titleAr, titleEn] = docTitles[invoice.docType] || docTitles.tax_invoice;

  const rows = items.map((item, idx) => {
    const qty = Number(item.qty) || 1;
    const price = Number(item.price) || 0;
    const disc = Number(item.discount) || 0;
    const net = Math.max(0, qty * price - disc);
    const vatRate = Number(item.vatRate ?? 15);
    const vatAmt = net * (vatRate / 100);
    const lineTotal = net + vatAmt;
    const rawDesc = String(item.desc || 'استشارة قانونية').trim();
    const parts = rawDesc.split(/\n|\s*-\s*/);
    const mainTitle = parts[0] || rawDesc;
    const subTitle = parts.slice(1).join(' - ') || (item.subDesc || '');
    return `<tr style="${idx === 0 ? '' : 'border-top:1px solid #d8e1eb;'}">
      <td style="padding:12px 8px;text-align:center;vertical-align:top;color:#2b3a4f;">${money(lineTotal)}</td>
      <td style="padding:12px 8px;text-align:center;vertical-align:top;color:#2b3a4f;line-height:1.35;">${money(vatAmt)}<br><span style="color:#4a5568;">${vatRate}%</span></td>
      <td style="padding:12px 8px;text-align:center;vertical-align:top;color:#2b3a4f;">${money(net)}</td>
      <td style="padding:12px 8px;text-align:center;vertical-align:top;color:#2b3a4f;">${money(price)}${disc > 0 ? `<br><span style="color:#e53e3e;font-size:9px;">-${money(disc)}</span>` : ''}</td>
      <td style="padding:12px 8px;text-align:center;vertical-align:top;color:#2b3a4f;">${qty}</td>
      <td dir="rtl" style="padding:12px 10px;text-align:right;vertical-align:top;direction:rtl;line-height:1.4;">
        <div style="font-weight:800;color:#2b3a4f;">${escapeHtml(mainTitle)}</div>
        ${subTitle ? `<div style="font-weight:400;color:#4a5568;font-size:10px;">${escapeHtml(subTitle)}</div>` : ''}
      </td>
      <td style="padding:12px 8px;text-align:right;vertical-align:top;color:#2b3a4f;">${idx + 1}</td>
    </tr>`;
  }).join('');

  const hasDiscount = Number(invoice.discount) > 0 || items.some(i => Number(i.discount) > 0);
  const hasCustomClientVat = invoice.clientVat && invoice.clientVat !== '300000000000003';

  return `<!doctype html>
<html lang="ar" dir="ltr">
<head>
  <meta charset="utf-8">
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Cairo:wght@400;600;700;800&display=swap" rel="stylesheet">
  <style>
    @page { size: A4; margin: 0; }
    * { box-sizing: border-box; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    html, body { margin: 0; padding: 0; width: 210mm; min-height: 297mm; background: #fff; color: #2b3a4f; font-family: 'Cairo', 'Segoe UI', Tahoma, sans-serif; font-size: 11px; direction: ltr; }
    .page { width: 210mm; min-height: 297mm; padding: 14mm 14mm 11mm; display: flex; flex-direction: column; box-sizing: border-box; }
  </style>
</head>
<body>
  <div class="page">
    <!-- Header: English (LEFT) | Logo (CENTER) | Arabic (RIGHT) -->
    <table dir="ltr" style="width:100%;border-collapse:collapse;direction:ltr;table-layout:fixed;">
      <tbody>
        <tr>
          <td dir="ltr" style="width:39%;vertical-align:top;text-align:left;direction:ltr;line-height:1.55;padding:0;">
            <div style="font-size:16.5px;font-weight:800;line-height:1.35;margin-bottom:6px;color:#2b3a4f;">${escapeHtml(ent.en)}</div>
            <div style="font-size:10px;color:#3b4a5e;">${escapeHtml(ent.addrEn)}</div>
            ${ent.email ? `<div style="font-size:10px;color:#3b4a5e;">${escapeHtml(ent.email)}</div>` : ''}
            ${ent.phone ? `<div style="font-size:10px;color:#3b4a5e;">${escapeHtml(ent.phone)}</div>` : ''}
            <div style="font-size:10px;color:#3b4a5e;">VAT number ${escapeHtml(ent.vat)}</div>
            <div style="font-size:10px;color:#3b4a5e;">CR Number ${escapeHtml(ent.cr)}</div>
          </td>
          <td style="width:22%;vertical-align:middle;text-align:center;padding:8px 10px 0;">
            ${logo ? `<img src="${logo}" alt="Logo" style="max-height:66px;max-width:140px;object-fit:contain;display:inline-block;">` : ''}
          </td>
          <td dir="rtl" style="width:39%;vertical-align:top;text-align:right;direction:rtl;line-height:1.55;padding:0;">
            <div style="font-size:16.5px;font-weight:800;line-height:1.38;margin-bottom:6px;color:#2b3a4f;">${escapeHtml(ent.ar)}</div>
            <div style="font-size:10px;color:#3b4a5e;">${escapeHtml(ent.addrAr)}</div>
            ${ent.email ? `<div style="font-size:10px;color:#3b4a5e;" dir="ltr">${escapeHtml(ent.email)}</div>` : ''}
            ${ent.phone ? `<div style="font-size:10px;color:#3b4a5e;" dir="ltr">${escapeHtml(ent.phone)}</div>` : ''}
            <div style="font-size:10px;color:#3b4a5e;">رقم التسجيل الضريبي <span dir="ltr">${escapeHtml(ent.vat)}</span></div>
            <div style="font-size:10px;color:#3b4a5e;">رقم السجل التجاري <span dir="ltr">${escapeHtml(ent.cr)}</span></div>
          </td>
        </tr>
      </tbody>
    </table>

    <div style="border-top:1.5px solid #c5d1de;margin:14px 0 14px;"></div>

    <!-- Title -->
    <div dir="ltr" style="text-align:center;font-size:25px;font-weight:800;color:#2b3a4f;margin-bottom:16px;line-height:1.3;direction:ltr;">
      <span>${escapeHtml(titleEn)}</span>&nbsp;&nbsp;<span dir="rtl">${escapeHtml(titleAr)}</span>
    </div>

    <!-- Customer / Invoice Meta Table -->
    <table dir="ltr" style="width:100%;border-collapse:collapse;border:1px solid #c5d1de;font-size:10.5px;margin-bottom:22px;direction:ltr;table-layout:fixed;">
      <tbody>
        <tr style="border-bottom:1px solid #d8e1eb;">
          <td dir="ltr" style="width:16%;padding:5px 10px;font-weight:800;text-align:left;color:#2b3a4f;">Customer</td>
          <td dir="rtl" colspan="4" style="width:68%;padding:5px 10px;text-align:center;color:#2b3a4f;font-weight:600;">${escapeHtml(invoice.client || '')}</td>
          <td dir="rtl" style="width:16%;padding:5px 10px;font-weight:800;text-align:right;color:#2b3a4f;">العميل</td>
        </tr>
        <tr style="border-bottom:1px solid #d8e1eb;">
          <td dir="ltr" style="padding:5px 10px;font-weight:800;text-align:left;color:#2b3a4f;">Address</td>
          <td dir="rtl" colspan="4" style="padding:5px 10px;text-align:center;color:#2b3a4f;">${escapeHtml(invoice.clientAddress || 'المملكة العربية السعودية ،الخرج')}</td>
          <td dir="rtl" style="padding:5px 10px;font-weight:800;text-align:right;color:#2b3a4f;">العنوان</td>
        </tr>
        ${hasCustomClientVat ? `<tr style="border-bottom:1px solid #d8e1eb;">
          <td dir="ltr" style="padding:5px 10px;font-weight:800;text-align:left;color:#2b3a4f;">VAT number</td>
          <td dir="ltr" colspan="4" style="padding:5px 10px;text-align:center;color:#2b3a4f;">${escapeHtml(invoice.clientVat)}</td>
          <td dir="rtl" style="padding:5px 10px;font-weight:800;text-align:right;color:#2b3a4f;">الرقم الضريبي</td>
        </tr>` : ''}
        <tr>
          <td dir="ltr" style="width:16%;padding:5px 10px;font-weight:800;text-align:left;color:#2b3a4f;">Invoice number</td>
          <td dir="ltr" style="width:21%;padding:5px 10px;text-align:center;color:#2b3a4f;">${escapeHtml(invoice.id || '')}</td>
          <td dir="rtl" style="width:13%;padding:5px 10px;font-weight:800;text-align:right;border-right:1px solid #c5d1de;color:#2b3a4f;">رقم الفاتورة</td>
          <td dir="ltr" style="width:10%;padding:5px 10px;font-weight:800;text-align:left;color:#2b3a4f;">Date</td>
          <td dir="ltr" style="width:24%;padding:5px 10px;text-align:center;color:#2b3a4f;">${escapeHtml(dateStr)}</td>
          <td dir="rtl" style="width:16%;padding:5px 10px;font-weight:800;text-align:right;color:#2b3a4f;">التاريخ</td>
        </tr>
      </tbody>
    </table>

    <!-- Line Items Table -->
    <table dir="ltr" style="width:100%;border-collapse:collapse;border:1px solid #c5d1de;font-size:10.5px;direction:ltr;table-layout:fixed;">
      <thead>
        <tr style="border-bottom:1px solid #c5d1de;color:#2b3a4f;">
          <th style="width:14%;padding:8px 8px;text-align:center;font-weight:800;line-height:1.35;">
            <div dir="rtl">المجموع</div>
            <div dir="ltr">Line amount</div>
          </th>
          <th style="width:14%;padding:8px 8px;text-align:center;font-weight:800;line-height:1.35;">
            <div dir="rtl">القيمة المضافة</div>
            <div dir="ltr">VAT amount</div>
          </th>
          <th style="width:18%;padding:8px 8px;text-align:center;font-weight:800;line-height:1.35;">
            <div dir="rtl">المبلغ الخاضع للضريبة</div>
            <div dir="ltr">Taxable amount</div>
          </th>
          <th style="width:11%;padding:8px 8px;text-align:center;font-weight:800;line-height:1.35;">
            <div dir="rtl">السعر</div>
            <div dir="ltr">Price</div>
          </th>
          <th style="width:9%;padding:8px 8px;text-align:center;font-weight:800;line-height:1.35;">
            <div dir="rtl">الكمية</div>
            <div dir="ltr">Qty</div>
          </th>
          <th style="width:29%;padding:8px 10px;text-align:right;font-weight:800;line-height:1.35;">
            <div dir="rtl">الوصف</div>
            <div dir="ltr" style="text-align:right;">Description</div>
          </th>
          <th style="width:5%;padding:8px 8px;text-align:right;font-weight:800;vertical-align:top;">#</th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>

    <!-- Bottom Section: Totals on LEFT | ZATCA QR on RIGHT -->
    <table dir="ltr" style="width:100%;border-collapse:collapse;margin-top:14px;direction:ltr;table-layout:fixed;">
      <tbody>
        <tr>
          <td style="width:58%;vertical-align:top;padding:4px 0 0 28px;">
            <table dir="ltr" style="border-collapse:collapse;font-size:10.5px;color:#2b3a4f;direction:ltr;">
              <tbody>
                <tr>
                  <td style="padding:6px 12px 6px 0;font-weight:800;text-align:left;min-width:68px;">${money(invoice.subtotal)}</td>
                  <td style="padding:6px 26px 6px 4px;font-weight:800;text-align:left;">&#65020;</td>
                  <td style="padding:6px 0;font-weight:800;text-align:left;">Subtotal <span dir="rtl">المجموع الفرعي</span></td>
                </tr>
                ${hasDiscount ? `<tr>
                  <td style="padding:6px 12px 6px 0;font-weight:800;text-align:left;">${money(invoice.discount)}</td>
                  <td style="padding:6px 26px 6px 4px;font-weight:800;text-align:left;">&#65020;</td>
                  <td style="padding:6px 0;font-weight:800;text-align:left;">Discount <span dir="rtl">إجمالي الخصم</span></td>
                </tr>` : ''}
                <tr>
                  <td style="padding:6px 12px 6px 0;font-weight:800;text-align:left;">${money(invoice.vat)}</td>
                  <td style="padding:6px 26px 6px 4px;font-weight:800;text-align:left;">&#65020;</td>
                  <td style="padding:6px 0;font-weight:800;text-align:left;">Total VAT <span dir="rtl">إجمالي ضريبة القيمة المضافة</span></td>
                </tr>
                <tr>
                  <td style="padding:6px 12px 6px 0;font-weight:800;text-align:left;">${money(invoice.total)}</td>
                  <td style="padding:6px 26px 6px 4px;font-weight:800;text-align:left;">&#65020;</td>
                  <td style="padding:6px 0;font-weight:800;text-align:left;">Total <span dir="rtl">المجموع شامل القيمة المضافة</span></td>
                </tr>
              </tbody>
            </table>
            ${invoice.notes ? `<div style="margin-top:8px;font-size:9.5px;color:#64748b;direction:rtl;text-align:right;">${escapeHtml(invoice.notes)}</div>` : ''}
          </td>
          <td style="width:42%;vertical-align:top;text-align:right;padding-top:2px;">
            <img src="${qr}" alt="ZATCA QR" style="width:108px;height:108px;display:inline-block;">
            <div style="font-size:7px;line-height:1.45;color:#4a5568;margin-top:3px;text-align:right;">
              <div dir="rtl">تم ترميز هذا الرمز وفقاً لمتطلبات هيئة الزكاة والضريبة والجمارك للفوترة الإلكترونية</div>
              <div dir="ltr">This QR code is encoded as per ZATCA e-invoicing requirements</div>
            </div>
          </td>
        </tr>
      </tbody>
    </table>

    <!-- Bottom Page Footer -->
    <table dir="ltr" style="width:100%;border-collapse:collapse;margin-top:auto;padding-top:28px;font-size:8.5px;color:#2b3a4f;direction:ltr;table-layout:fixed;">
      <tbody>
        <tr>
          <td style="width:58%;text-align:center;line-height:1.45;color:#4a5568;">
            <div dir="ltr">${escapeHtml(ent.en)}</div>
            <div dir="rtl">${escapeHtml(ent.ar)}</div>
          </td>
          <td style="width:22%;text-align:center;vertical-align:bottom;font-weight:700;">Page 1 of 1 -</td>
          <td style="width:20%;text-align:right;vertical-align:bottom;font-weight:700;">${escapeHtml(invoice.id || '')}</td>
        </tr>
      </tbody>
    </table>
  </div>
</body>
</html>`;
}

function findBrowserExecutable() {
  const candidates = [
    process.env.CHROMIUM_PATH,
    'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
    'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
    '/usr/bin/chromium',
    '/usr/bin/chromium-browser',
    '/usr/bin/google-chrome'
  ].filter(Boolean);
  return candidates.find(p => fs.existsSync(p));
}

async function generateInvoicePdf(invoice, entity, options = {}) {
  const puppeteer = require('puppeteer-core');
  const executablePath = findBrowserExecutable();
  if (!executablePath) throw new Error('لم يتم العثور على متصفح Chromium/Edge لتوليد PDF');
  const html = await buildInvoiceHtml(invoice, entity, options);
  const browser = await puppeteer.launch({
    executablePath,
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--font-render-hinting=none']
  });
  try {
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: 'networkidle0', timeout: 30000 });
    await page.evaluateHandle('document.fonts.ready');
    return await page.pdf({
      format: 'A4',
      printBackground: true,
      preferCSSPageSize: true,
      margin: { top: '0mm', right: '0mm', bottom: '0mm', left: '0mm' }
    });
  } finally {
    await browser.close();
  }
}

function defaultLogoData() {
  const logoPath = path.join(__dirname, '..', 'public', 'logo.png');
  if (!fs.existsSync(logoPath)) return '';
  return `data:image/png;base64,${fs.readFileSync(logoPath).toString('base64')}`;
}

module.exports = { buildInvoiceHtml, generateInvoicePdf, defaultLogoData, escapeHtml };
