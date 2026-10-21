'use strict';
const fs = require('fs');

const bundle = JSON.parse(fs.readFileSync('scripts/views_bundle.js', 'utf8'));
const files = ['public/index.html', 'web/index.html'];

for (const filePath of files) {
  let content = fs.readFileSync(filePath, 'utf8');

  // 1. Inject the new views before </main>
  if (!content.includes('id="view-clients"')) {
    content = content.replace('</main>', bundle.views + '\n    </main>');
    console.log('Injected missing views in:', filePath);
  }

  // 2. Inject helper modals before </body>
  if (!content.includes('id="newClientModal"')) {
    content = content.replace('</body>', bundle.modals + '\n</body>');
    console.log('Injected helper modals in:', filePath);
  }

  // 3. Inject modules logic before switchView definition
  if (!content.includes('function renderClientsTable()')) {
    content = content.replace('function switchView(viewName) {', bundle.logic + '\n\n    function switchView(viewName) {');
    console.log('Injected modules logic in:', filePath);
  }

  // 4. Update switchView valid views array to include all new views
  const oldSwitchArray = "const views = ['dashboard', 'invoices', 'inventory', 'purchases', 'treasury', 'journal', 'accounts', 'reports', 'zatca', 'branches', 'settings', 'payroll'];";
  const newSwitchArray = "const views = ['dashboard', 'invoices', 'inventory', 'purchases', 'treasury', 'journal', 'accounts', 'reports', 'zatca', 'branches', 'settings', 'payroll', 'clients', 'quotes', 'suppliers', 'fixed-assets', 'help'];";
  content = content.replace(oldSwitchArray, newSwitchArray);

  // 5. Update renderAll to render all extended tables
  const oldRenderAllEnd = "updateCharts();";
  const newRenderAllEnd = `updateCharts();
      if (typeof renderClientsTable === 'function') renderClientsTable();
      if (typeof renderSuppliersTable === 'function') renderSuppliersTable();
      if (typeof renderEmployeesTable === 'function') renderEmployeesTable();
      if (typeof renderFixedAssetsTable === 'function') renderFixedAssetsTable();
      if (typeof renderQuotesTable === 'function') renderQuotesTable();`;
  content = content.replace(oldRenderAllEnd, newRenderAllEnd);

  // 6. Connect sidebar submenu handlers to their new dedicated views
  content = content.replace("switchSalesSection(subSection) {\n      switchView('invoices');", "switchSalesSection(subSection) {");
  content = content.replace("case 'clients':\n          if (titleEl) titleEl.textContent = 'قائمة العملاء والذمم المدينة';\n          if (descEl) descEl.textContent = 'بيانات وأرصدة العملاء وسجلات التواصل والفواتير المرتبطة بكل عميل';\n          filterInvoicesByClient();\n          break;", "case 'clients':\n          switchView('clients');\n          break;");
  content = content.replace("case 'quotes':\n          if (titleEl) titleEl.textContent = 'عروض الأسعار والفواتير المبدئية (Quotations)';\n          if (descEl) descEl.textContent = 'إصدار ومتابعة عروض الأسعار غير الملزمة وتحويلها لفواتير بضغطة واحدة';\n          filterInvoicesByStatus('pending');\n          break;", "case 'quotes':\n          switchView('quotes');\n          break;");

  content = content.replace("switchPurchasesSection(subSection) {\n      switchView('purchases');", "switchPurchasesSection(subSection) {");
  content = content.replace("case 'suppliers':\n          if (titleEl) titleEl.textContent = 'سجل وبيانات الموردين';\n          if (descEl) descEl.textContent = 'قائمة الموردين المعتمدين، أرقامهم الضريبية، وحجم التعاملات';\n          showToast('سجل الموردين المعتمدين', 'info');\n          break;", "case 'suppliers':\n          switchView('suppliers');\n          break;");

  content = content.replace("case 'fixed-assets':\n          switchView('accounts');\n          showToast('سجل الأصول الثابتة وحسابات الإهلاك الدوري', 'info');\n          break;", "case 'fixed-assets':\n          switchView('fixed-assets');\n          break;");

  // Connect help buttons
  content = content.replace("id=\"nav-help\" onclick=\"showToast('مركز المساعدة والدعم الفني متصل دائماً', 'info')\"", "id=\"nav-help\" onclick=\"switchView('help')\"");
  content = content.replace("onclick=\"switchAccountingSection('batch-recategorize')\" class=\"popover-item\"", "onclick=\"switchView('journal'); showToast('تم تفعيل وضع تصنيف القيود المزدوجة', 'info');\" class=\"popover-item\"");
  content = content.replace("onclick=\"showToast('جاري فتح الدليل الإرشادي للنظام...', 'info')\" class=\"popover-item\"", "onclick=\"switchView('help')\" class=\"popover-item\"");
  content = content.replace("onclick=\"showToast('الدعم الفني المباشر متصل الآن', 'success')\" class=\"popover-item\"", "onclick=\"switchView('help')\" class=\"popover-item\"");

  fs.writeFileSync(filePath, content, 'utf8');
  console.log('Successfully applied all enterprise views to:', filePath);
}
