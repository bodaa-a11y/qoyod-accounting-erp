const fs = require('fs');
const html = fs.readFileSync('public/index.html', 'utf8');

const checks = [
  ['html2pdf.bundle.min.js', html.includes('js/html2pdf.bundle.min.js')],
  ['nav-popover removed', !html.includes('.nav-popover {')],
  ['sidebar-sub-item CSS', html.includes('.sidebar-sub-item')],
  ['nav-sales-parent', html.includes('id="nav-sales-parent"')],
  ['sub-sales', html.includes('id="sub-sales"')],
  ['newInvoiceModal with items table', html.includes('id="invoiceItemsTbody"')],
  ['newInvoiceModal with logo thumb', html.includes('id="modalLogoThumb"')],
  ['Save and download PDF button', html.includes('handleSaveAndDownloadInvoicePDF')],
  ['viewInvoiceModal with A4 PDF', html.includes('downloadInvoicePDF(currentViewedInvoiceId)')],
  ['Invoices table PDF button', html.includes('downloadInvoicePDF')],
  ['numberToArabicWords tafqeet function', html.includes('function numberToArabicWords(')],
  ['handleInvoiceLogoFileChange function', html.includes('function handleInvoiceLogoFileChange(')]
];

let allOk = true;
checks.forEach(([name, passed]) => {
  console.log(passed ? '✅' : '❌', name);
  if (!passed) allOk = false;
});

if (!allOk) {
  process.exit(1);
} else {
  console.log('\nAll 12 critical verification checks PASSED successfully!');
}
