'use strict';
const fs = require('fs');

const files = ['public/index.html', 'web/index.html'];

for (const filePath of files) {
  let content = fs.readFileSync(filePath, 'utf8');

  // Replace QRCode generation inside renderStudioLivePreview with a try/catch wrapper
  const oldQrBlock = `      const qrDiv = document.getElementById('studioLiveQrContainer');
    if (qrDiv) {
      qrDiv.innerHTML = '';
      const zatcaPayload = \`Seller:\${curEnt.ar}|VAT:\${curEnt.vat}|Time:\${date}T12:00:00Z|Total:\${grand}|VAT:\${vat}\`;
      new QRCode(qrDiv, {
        text: zatcaPayload,
        width: 70,
        height: 70,
        colorDark: "#1e1b4b",
        colorLight: "#ffffff",
        correctLevel: QRCode.CorrectLevel.M
      });
    }`;

  const newQrBlock = `      const qrDiv = document.getElementById('studioLiveQrContainer');
    if (qrDiv) {
      qrDiv.innerHTML = '';
      const zatcaPayload = \`Seller:\${curEnt.ar}|VAT:\${curEnt.vat}|Time:\${date}T12:00:00Z|Total:\${grand}|VAT:\${vat}\`;
      try {
        if (typeof QRCode !== 'undefined') {
          new QRCode(qrDiv, {
            text: zatcaPayload,
            width: 70,
            height: 70,
            colorDark: "#1e1b4b",
            colorLight: "#ffffff",
            correctLevel: QRCode.CorrectLevel ? QRCode.CorrectLevel.M : 0
          });
        }
      } catch (qrErr) {
        console.warn('QR render postponed:', qrErr);
      }
    }`;

  content = content.replace(oldQrBlock, newQrBlock);

  // In openNewInvoiceModal, ensure openModal is called FIRST before heavy rendering, so the user sees it immediately
  const oldOpenFn = `  // Override openNewInvoiceModal to launch Studio
  function openNewInvoiceModal() {
    const today = new Date().toISOString().substring(0, 10);
    const d1 = document.getElementById('studio-date');
    const d2 = document.getElementById('studio-due-date');
    if (d1) d1.value = today;
    if (d2) d2.value = today;

    const numInput = document.getElementById('studio-doc-number');
    if (numInput) numInput.value = 'INV-2026-' + String(state.invoices.length + 1).padStart(3, '0');

    if (state.currentEntity && state.currentEntity !== 'all') {
      const ent = document.getElementById('studio-entity');
      if (ent) ent.value = state.currentEntity;
    }

    const logoImg = document.getElementById('studioPreviewLogo');
    if (logoImg) logoImg.src = currentCustomLogo;

    renderStudioEditorRows();
    onStudioEntityChange();
    renderStudioLivePreview();
    openModal('newInvoiceModal');
  }`;

  const newOpenFn = `  // Override openNewInvoiceModal to launch Studio
  function openNewInvoiceModal() {
    try {
      openModal('newInvoiceModal');
      
      const today = new Date().toISOString().substring(0, 10);
      const d1 = document.getElementById('studio-date');
      const d2 = document.getElementById('studio-due-date');
      if (d1 && !d1.value) d1.value = today;
      if (d2 && !d2.value) d2.value = today;

      const numInput = document.getElementById('studio-doc-number');
      if (numInput && (!numInput.value || numInput.value === 'INV-2026-001')) {
        const invLen = (state && state.invoices) ? state.invoices.length + 1 : 1;
        numInput.value = 'INV-2026-' + String(invLen).padStart(3, '0');
      }

      if (state && state.currentEntity && state.currentEntity !== 'all') {
        const ent = document.getElementById('studio-entity');
        if (ent) ent.value = state.currentEntity;
      }

      const logoImg = document.getElementById('studioPreviewLogo');
      if (logoImg && currentCustomLogo) logoImg.src = currentCustomLogo;

      renderStudioEditorRows();
      onStudioEntityChange();
      renderStudioLivePreview();
    } catch (e) {
      console.error('Error opening studio modal:', e);
      openModal('newInvoiceModal');
    }
  }`;

  content = content.replace(oldOpenFn, newOpenFn);

  // Also in switchSalesSection('invoices') and other buttons, let's make sure we have an easy shortcut
  fs.writeFileSync(filePath, content, 'utf8');
  console.log('Fixed QRCode safe guard and early open in:', filePath);
}
