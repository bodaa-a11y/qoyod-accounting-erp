const fs = require('fs');
const html = fs.readFileSync('public/index.html', 'utf8');

const checks = [
  ['.nav-popover CSS exists', html.includes('.nav-popover {')],
  ['has-popover class exists', html.includes('class="relative has-popover"')],
  ['toggleNavPopover onclick exists', html.includes('toggleNavPopover')],
  ['popover-sales exists', html.includes('id="popover-sales"')],
  ['popover-purchases exists', html.includes('id="popover-purchases"')],
  ['popover-accounting exists', html.includes('id="popover-accounting"')],
  ['popover-help exists', html.includes('id="popover-help"')],
  ['newInvoiceModal with items table', html.includes('id="invoiceItemsTbody"')],
  ['PDF export script', html.includes('downloadInvoicePDF')],
  ['router.js included', html.includes('src="js/router.js"')]
];

let allOk = true;
checks.forEach(([name, passed]) => {
  console.log(passed ? '✅' : '❌', name);
  if (!passed) allOk = false;
});

if (!allOk) {
  process.exit(1);
} else {
  console.log('\nAll 10 verification checks PASSED successfully!');
}
