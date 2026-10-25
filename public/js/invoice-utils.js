(function (root, factory) {
  const utils = factory();
  if (typeof module === 'object' && module.exports) module.exports = utils;
  else root.InvoiceUtils = utils;
})(typeof self !== 'undefined' ? self : this, function () {
  function toHalalas(value) {
    if (value === null || value === undefined || value === '') return null;
    const normalized = String(value).trim()
      .replace(/[٠-٩]/g, d => String('٠١٢٣٤٥٦٧٨٩'.indexOf(d)))
      .replace(/[٬,\s]/g, '').replace('٫', '.');
    if (!/^-?\d+(\.\d{1,2})?$/.test(normalized)) return null;
    const amount = Number(normalized);
    return Number.isFinite(amount) ? Math.round(amount * 100) : null;
  }

  function calculateInvoice(rows) {
    if (!Array.isArray(rows) || rows.length === 0) throw new Error('أضف بنداً واحداً على الأقل');
    let grossSubtotal = 0;
    let subtotal = 0;
    let discount = 0;
    let vat = 0;
    const lines = rows.map((row, index) => {
      const qty = Number(row.qty);
      const unitPrice = toHalalas(row.price);
      const lineDiscount = toHalalas(row.discount || 0);
      const vatRate = row.vatRate === undefined ? 15 : Number(row.vatRate);
      if (!String(row.desc || '').trim()) throw new Error(`وصف البند ${index + 1} مطلوب`);
      if (!Number.isFinite(qty) || qty <= 0 || qty > 1000000) throw new Error(`كمية البند ${index + 1} غير صالحة`);
      if (unitPrice === null || unitPrice < 0) throw new Error(`سعر البند ${index + 1} غير صالح`);
      if (lineDiscount === null || lineDiscount < 0) throw new Error(`خصم البند ${index + 1} غير صالح`);
      if (!Number.isFinite(vatRate) || vatRate < 0 || vatRate > 100) throw new Error(`نسبة ضريبة البند ${index + 1} غير صالحة`);
      const gross = Math.round(qty * unitPrice);
      if (lineDiscount > gross) throw new Error(`خصم البند ${index + 1} يتجاوز قيمته قبل الضريبة`);
      const net = gross - lineDiscount;
      const tax = Math.round(net * vatRate / 100);
      grossSubtotal += gross;
      subtotal += net;
      discount += lineDiscount;
      vat += tax;
      return {
        desc: String(row.desc).trim(), qty, price: unitPrice / 100,
        discount: lineDiscount / 100, vatRate,
        gross: gross / 100, net: net / 100,
        vat: tax / 100, total: (net + tax) / 100
      };
    });
    const total = subtotal + vat;
    if (total <= 0) throw new Error('يجب أن يكون إجمالي الفاتورة أكبر من صفر');
    return {
      lines,
      grossSubtotal: grossSubtotal / 100,
      subtotal: subtotal / 100,
      discount: discount / 100,
      vat: vat / 100,
      grand: total / 100
    };
  }

  function escapeHtml(value) {
    return String(value ?? '').replace(/[&<>'"]/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[ch]));
  }

  return { toHalalas, calculateInvoice, escapeHtml };
});
