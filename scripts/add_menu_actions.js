'use strict';
const fs = require('fs');

const files = ['public/index.html', 'web/index.html'];

for (const filePath of files) {
  let content = fs.readFileSync(filePath, 'utf8');

  // Let's inspect switchSalesSection
  const oldCase = `        case 'invoices':
          if (titleEl) titleEl.textContent = 'فواتير البيع المعتمدة';
          if (descEl) descEl.textContent = 'إدارة ومتابعة فواتير المبيعات الضريبية المعتمدة ورموز ZATCA QR';
          filterInvoicesByStatus('all');
          break;`;

  const newCase = `        case 'invoices':
          if (titleEl) titleEl.textContent = 'فواتير البيع المعتمدة';
          if (descEl) descEl.textContent = 'إدارة ومتابعة فواتير المبيعات الضريبية المعتمدة ورموز ZATCA QR';
          filterInvoicesByStatus('all');
          break;
        case 'new-invoice':
          openNewInvoiceModal();
          break;`;

  content = content.replace(oldCase, newCase);

  // In the sales submenu, add "+ إنشاء فاتورة جديدة" button directly to make it 1-click reachable
  const oldMenuInvoices = `<button onclick="switchSalesSection('invoices')" class="popover-item font-black text-purple-700 bg-purple-50">
              <span>فواتير بيع</span>
            </button>`;

  const newMenuInvoices = `<button onclick="openNewInvoiceModal()" class="popover-item font-black text-purple-700 bg-purple-50/90 border border-purple-200 shadow-2xs flex items-center justify-between">
              <span>+ إنشاء فاتورة مبيعات</span>
              <span class="text-[10px] bg-purple-700 text-white px-1.5 py-0.5 rounded">جديد</span>
            </button>
            <button onclick="switchSalesSection('invoices')" class="popover-item">
              <span>فواتير بيع</span>
            </button>`;

  content = content.replace(oldMenuInvoices, newMenuInvoices);

  // In the purchases submenu, add "+ إنشاء فاتورة شراء"
  const oldMenuBills = `<button onclick="switchPurchasesSection('bills')" class="popover-item font-black text-purple-700 bg-purple-50">
              <span>فواتير مشتريات</span>
            </button>`;

  const newMenuBills = `<button onclick="openNewPurchaseModal()" class="popover-item font-black text-purple-700 bg-purple-50/90 border border-purple-200 shadow-2xs flex items-center justify-between">
              <span>+ تسجيل فاتورة شراء</span>
              <span class="text-[10px] bg-purple-700 text-white px-1.5 py-0.5 rounded">جديد</span>
            </button>
            <button onclick="switchPurchasesSection('bills')" class="popover-item">
              <span>فواتير مشتريات</span>
            </button>`;

  content = content.replace(oldMenuBills, newMenuBills);

  fs.writeFileSync(filePath, content, 'utf8');
  console.log('Updated submenus with direct action items in:', filePath);
}
