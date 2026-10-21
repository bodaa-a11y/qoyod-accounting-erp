'use strict';
const fs = require('fs');

const files = ['public/index.html', 'web/index.html'];

for (const filePath of files) {
  let content = fs.readFileSync(filePath, 'utf8');

  // 1. Add CSS for submenus and flyout popovers
  const customStyles = `
    /* Navigation Flyout Popover & Submenu Styling */
    .nav-popover {
      position: absolute;
      right: 100%;
      top: 0;
      width: 230px;
      background: #ffffff;
      border-radius: 18px;
      box-shadow: 0 14px 40px -10px rgba(55, 32, 131, 0.16), 0 0 1px 1px rgba(0,0,0,0.06);
      border: 1px solid #f1f3f9;
      padding: 8px;
      z-index: 100;
      display: none;
      animation: popoverFadeIn 0.18s cubic-bezier(0.16, 1, 0.3, 1);
    }
    @keyframes popoverFadeIn {
      from { opacity: 0; transform: translateX(8px); }
      to { opacity: 1; transform: translateX(0); }
    }
    .has-popover:hover .nav-popover,
    .has-popover:focus-within .nav-popover {
      display: block;
    }
    .popover-item {
      display: flex;
      align-items: center;
      gap: 10px;
      padding: 10px 14px;
      border-radius: 12px;
      font-size: 13px;
      font-weight: 700;
      color: #334155;
      transition: all 0.15s ease;
      cursor: pointer;
      text-align: right;
      width: 100%;
    }
    .popover-item:hover {
      background: #f5f3ff;
      color: #6d28d9;
      transform: translateX(-3px);
    }
    .popover-item.danger-hover:hover {
      background: #fef2f2;
      color: #dc2626;
    }
    .popover-header {
      padding: 6px 14px 8px;
      font-size: 11px;
      font-weight: 800;
      color: #94a3b8;
      border-bottom: 1px solid #f8fafc;
      margin-bottom: 4px;
    }
    .popover-divider {
      height: 1px;
      background: #f1f5f9;
      margin: 6px 8px;
    }
  `;

  if (!content.includes('nav-popover')) {
    content = content.replace('</style>', customStyles + '\n  </style>');
  }

  // 2. Replace the Sidebar Navigation Items with Popover-enabled Submenus
  const oldNavBlock = `<button onclick="switchView('invoices')" id="nav-invoices" class="sidebar-nav-item w-full flex items-center gap-3.5 px-4 py-3 rounded-xl text-sm font-bold text-slate-600 hover:text-gathern-700 hover:bg-slate-50 transition">
          <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"></path></svg>
          <div class="flex-1 text-right flex items-center justify-between">
            <span>المبيعات والفواتير</span>
            <span id="invoicesCountBadge" class="text-xs bg-slate-100 text-slate-600 px-2 py-0.5 rounded-full font-bold">12</span>
          </div>
        </button>

        <button onclick="switchView('inventory')" id="nav-inventory" class="sidebar-nav-item w-full flex items-center gap-3.5 px-4 py-3 rounded-xl text-sm font-bold text-slate-600 hover:text-gathern-700 hover:bg-slate-50 transition">
          <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4"></path></svg>
          <div class="flex-1 text-right flex items-center justify-between">
            <span>المخزون والأصناف</span>
            <span id="lowStockWarningBadge" class="text-xs bg-red-100 text-red-600 px-2 py-0.5 rounded-full font-bold">2 نقص</span>
          </div>
        </button>

        <button onclick="switchView('purchases')" id="nav-purchases" class="sidebar-nav-item w-full flex items-center gap-3.5 px-4 py-3 rounded-xl text-sm font-bold text-slate-600 hover:text-gathern-700 hover:bg-slate-50 transition">
          <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M16 11V7a4 4 0 00-8 0v4M5 9h14l1 12H4L5 9z"></path></svg>
          <span>المشتريات والموردين</span>
        </button>

        <button onclick="switchView('treasury')" id="nav-treasury" class="sidebar-nav-item w-full flex items-center gap-3.5 px-4 py-3 rounded-xl text-sm font-bold text-slate-600 hover:text-gathern-700 hover:bg-slate-50 transition">
          <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17 9V7a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2m2 4h10a2 2 0 002-2v-6a2 2 0 00-2-2H9a2 2 0 00-2 2v6a2 2 0 002 2zm7-5a2 2 0 11-4 0 2 2 0 014 0z"></path></svg>
          <span>الخزينة والبنوك</span>
        </button>

        <button onclick="switchView('journal')" id="nav-journal" class="sidebar-nav-item w-full flex items-center gap-3.5 px-4 py-3 rounded-xl text-sm font-bold text-slate-600 hover:text-gathern-700 hover:bg-slate-50 transition">
          <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253"></path></svg>
          <span>القيود اليومية والدفاتر</span>
        </button>

        <button onclick="switchView('reports')" id="nav-reports" class="sidebar-nav-item w-full flex items-center gap-3.5 px-4 py-3 rounded-xl text-sm font-bold text-slate-600 hover:text-gathern-700 hover:bg-slate-50 transition">
          <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"></path></svg>
          <span>التقارير المالية والأرباح</span>
        </button>`;

  const newNavBlock = `<!-- المبيعات مع القائمة المنسدلة الجانبية -->
        <div class="relative has-popover">
          <button onclick="switchView('invoices')" id="nav-invoices" class="sidebar-nav-item w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-bold text-slate-600 hover:text-gathern-700 hover:bg-slate-50 transition">
            <svg class="w-5 h-5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-2.293 2.293c-.63.63-.184 1.707.707 1.707H17m0 0a2 2 0 100 4 2 2 0 000-4zm-8 2a2 2 0 11-4 0 2 2 0 014 0z"></path></svg>
            <span class="flex-1 text-right">المبيعات</span>
            <svg class="w-3.5 h-3.5 text-slate-400 transform -rotate-90 group-hover:text-gathern-700 transition" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M19 9l-7 7-7-7"></path></svg>
          </button>
          
          <!-- قائمة المبيعات المنبثقة الجانبية -->
          <div class="nav-popover">
            <button onclick="switchSalesSection('clients')" class="popover-item">
              <span>العملاء</span>
            </button>
            <button onclick="switchSalesSection('quotes')" class="popover-item">
              <span>عروض أسعار و فواتير مبدئية</span>
            </button>
            <button onclick="switchSalesSection('invoices')" class="popover-item text-gathern-800 font-extrabold bg-purple-50/60">
              <span>فواتير بيع</span>
            </button>
            <button onclick="switchSalesSection('customer-receipts')" class="popover-item">
              <span>سندات العملاء</span>
            </button>
            <button onclick="switchSalesSection('recurring')" class="popover-item">
              <span>فواتير مجدولة</span>
            </button>
            <button onclick="switchSalesSection('credit-notes')" class="popover-item">
              <span>إشعارات دائنة</span>
            </button>
            <button onclick="switchSalesSection('cash-invoices')" class="popover-item">
              <span>فواتير نقدية</span>
            </button>
            <div class="popover-divider"></div>
            <button onclick="switchSalesSection('settings')" class="popover-item text-slate-500">
              <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"></path></svg>
              <span>إعداد المبيعات</span>
            </button>
          </div>
        </div>

        <!-- المشتريات مع القائمة المنسدلة الجانبية -->
        <div class="relative has-popover">
          <button onclick="switchView('purchases')" id="nav-purchases" class="sidebar-nav-item w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-bold text-slate-600 hover:text-gathern-700 hover:bg-slate-50 transition">
            <svg class="w-5 h-5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"></path></svg>
            <span class="flex-1 text-right">المشتريات</span>
            <svg class="w-3.5 h-3.5 text-slate-400 transform -rotate-90 group-hover:text-gathern-700 transition" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M19 9l-7 7-7-7"></path></svg>
          </button>
          
          <!-- قائمة المشتريات المنبثقة الجانبية -->
          <div class="nav-popover">
            <button onclick="switchPurchasesSection('suppliers')" class="popover-item">
              <span>الموردون</span>
            </button>
            <button onclick="switchPurchasesSection('bills')" class="popover-item text-gathern-800 font-extrabold bg-purple-50/60">
              <span>فواتير مشتريات</span>
            </button>
            <button onclick="switchPurchasesSection('supplier-receipts')" class="popover-item">
              <span>سندات الموردين</span>
            </button>
            <button onclick="switchPurchasesSection('cash-expenses')" class="popover-item">
              <span>مصروفات نقدية</span>
            </button>
            <button onclick="switchPurchasesSection('debit-notes')" class="popover-item">
              <span>إشعارات مدينة</span>
            </button>
            <button onclick="switchPurchasesSection('purchase-orders')" class="popover-item">
              <span>أوامر شراء</span>
            </button>
          </div>
        </div>

        <!-- المحاسبة مع القائمة المنسدلة الجانبية -->
        <div class="relative has-popover">
          <button onclick="switchView('journal')" id="nav-accounting" class="sidebar-nav-item w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-bold text-slate-600 hover:text-gathern-700 hover:bg-slate-50 transition">
            <svg class="w-5 h-5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 7h6m0 10v-3m-3 3h.01M9 17h.01M9 14h.01M12 14h.01M15 11h.01M12 11h.01M9 11h.01M7 21h10a2 2 0 002-2V5a2 2 0 00-2-2H7a2 2 0 00-2 2v14a2 2 0 002 2z"></path></svg>
            <span class="flex-1 text-right">المحاسبة</span>
            <svg class="w-3.5 h-3.5 text-slate-400 transform -rotate-90 group-hover:text-gathern-700 transition" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M19 9l-7 7-7-7"></path></svg>
          </button>
          
          <!-- قائمة المحاسبة المنبثقة الجانبية -->
          <div class="nav-popover">
            <button onclick="switchAccountingSection('banks')" class="popover-item">
              <span>الحسابات البنكية</span>
            </button>
            <button onclick="switchAccountingSection('manual-journals')" class="popover-item text-gathern-800 font-extrabold bg-purple-50/60">
              <span>القيود اليدوية</span>
            </button>
            <button onclick="switchAccountingSection('batch-recategorize')" class="popover-item">
              <span>إعادة التصنيف الجماعي</span>
            </button>
            <button onclick="switchAccountingSection('chart-of-accounts')" class="popover-item">
              <span>شجرة الحسابات</span>
            </button>
            <button onclick="switchAccountingSection('fixed-assets')" class="popover-item">
              <span>الأصول الثابتة</span>
            </button>
            <div class="popover-divider"></div>
            <button onclick="switchAccountingSection('settings')" class="popover-item text-slate-500">
              <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"></path></svg>
              <span>إعدادات المحاسبة</span>
            </button>
          </div>
        </div>

        <!-- الرواتب والموظفين -->
        <button onclick="switchView('payroll')" id="nav-payroll" class="sidebar-nav-item w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-bold text-slate-600 hover:text-gathern-700 hover:bg-slate-50 transition">
          <svg class="w-5 h-5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z"></path></svg>
          <span class="flex-1 text-right">الرواتب و الموظفين</span>
        </button>

        <!-- المخزون -->
        <button onclick="switchView('inventory')" id="nav-inventory" class="sidebar-nav-item w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-bold text-slate-600 hover:text-gathern-700 hover:bg-slate-50 transition">
          <svg class="w-5 h-5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4"></path></svg>
          <span class="flex-1 text-right">المخزون</span>
        </button>

        <!-- التقارير -->
        <button onclick="switchView('reports')" id="nav-reports" class="sidebar-nav-item w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-bold text-slate-600 hover:text-gathern-700 hover:bg-slate-50 transition">
          <svg class="w-5 h-5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"></path></svg>
          <span class="flex-1 text-right">التقارير</span>
        </button>

        <!-- المساعدة مع شارة منبهة -->
        <div class="relative has-popover">
          <button onclick="showToast('مركز الدعم والمساعدة المباشر متاح 24/7', 'info')" id="nav-help" class="sidebar-nav-item w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-bold text-slate-600 hover:text-gathern-700 hover:bg-slate-50 transition">
            <div class="relative shrink-0">
              <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>
              <span class="absolute -top-1 -right-1 w-2.5 h-2.5 bg-rose-500 rounded-full border-2 border-white"></span>
            </div>
            <span class="flex-1 text-right">المساعدة</span>
            <svg class="w-3.5 h-3.5 text-slate-400 transform -rotate-90 group-hover:text-gathern-700 transition" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M19 9l-7 7-7-7"></path></svg>
          </button>
          <div class="nav-popover">
            <button onclick="showToast('جاري فتح الدليل الإرشادي للنظام...', 'info')" class="popover-item">
              <span>دليل الاستخدام السريع</span>
            </button>
            <button onclick="showToast('الدعم الفني المباشر متصل الآن', 'success')" class="popover-item">
              <span>تواصل مع الدعم الفني</span>
            </button>
          </div>
        </div>`;

  content = content.replace(oldNavBlock, newNavBlock);

  // 3. Add Handler Functions for the submenus
  const workflowHandlers = `
    // مسيرات العمل للأقسام الفرعية - المبيعات
    function switchSalesSection(subSection) {
      switchView('invoices');
      const titleEl = document.querySelector('#view-invoices h2');
      const descEl = document.querySelector('#view-invoices p');
      
      switch(subSection) {
        case 'clients':
          if (titleEl) titleEl.textContent = 'قائمة العملاء والذمم المدينة';
          if (descEl) descEl.textContent = 'بيانات وأرصدة العملاء وسجلات التواصل والفواتير المرتبطة بكل عميل';
          filterInvoicesByClient();
          break;
        case 'quotes':
          if (titleEl) titleEl.textContent = 'عروض الأسعار والفواتير المبدئية (Quotations)';
          if (descEl) descEl.textContent = 'إصدار ومتابعة عروض الأسعار غير الملزمة وتحويلها لفواتير بضغطة واحدة';
          filterInvoicesByStatus('pending');
          break;
        case 'invoices':
          if (titleEl) titleEl.textContent = 'فواتير البيع المعتمدة';
          if (descEl) descEl.textContent = 'إدارة ومتابعة فواتير المبيعات الضريبية المعتمدة ورموز ZATCA QR';
          filterInvoicesByStatus('all');
          break;
        case 'customer-receipts':
          if (titleEl) titleEl.textContent = 'سندات العملاء (سندات القبض)';
          if (descEl) descEl.textContent = 'متابعة سندات القبض والتحصيلات المسجلة من العملاء عبر الحسابات';
          openReceiptModal();
          break;
        case 'recurring':
          if (titleEl) titleEl.textContent = 'الفواتير المجدولة والدورية';
          if (descEl) descEl.textContent = 'جدولة الفواتير والاشتراكات المتكررة شهرياً وسنوياً بشكل آلي';
          showToast('قسم الفواتير المجدولة: تم تفعيل الدورة التلقائية', 'info');
          break;
        case 'credit-notes':
          if (titleEl) titleEl.textContent = 'الإشعارات الدائنة (Credit Notes - مردودات مبيعات)';
          if (descEl) descEl.textContent = 'إصدار إشعارات دائنة لتسوية المرتجعات والتخفيضات الضريبية';
          showToast('الإشعارات الدائنة المعتمدة لدى هيئة الزكاة', 'info');
          break;
        case 'cash-invoices':
          if (titleEl) titleEl.textContent = 'الفواتير النقدية (نقاط البيع والكاش)';
          if (descEl) descEl.textContent = 'فواتير المبيعات المسددة نقداً وفورياً عبر الصناديق ونقاط البيع';
          filterInvoicesByStatus('paid');
          break;
        case 'settings':
          switchView('settings');
          showToast('إعدادات ترقيم وطباعة فواتير المبيعات', 'info');
          break;
      }
    }

    function filterInvoicesByClient() {
      showToast('عرض سجلات العملاء والفواتير المرتبطة بهم', 'info');
    }

    // مسيرات العمل للأقسام الفرعية - المشتريات
    function switchPurchasesSection(subSection) {
      switchView('purchases');
      const titleEl = document.querySelector('#view-purchases h2');
      const descEl = document.querySelector('#view-purchases p');

      switch(subSection) {
        case 'suppliers':
          if (titleEl) titleEl.textContent = 'سجل وبيانات الموردين';
          if (descEl) descEl.textContent = 'قائمة الموردين المعتمدين، أرقامهم الضريبية، وحجم التعاملات';
          showToast('سجل الموردين المعتمدين', 'info');
          break;
        case 'bills':
          if (titleEl) titleEl.textContent = 'فواتير المشتريات والمصروفات';
          if (descEl) descEl.textContent = 'تسجيل فواتير المشتريات واعتماد خصم الضريبة المدخلة للمنشأة';
          break;
        case 'supplier-receipts':
          if (titleEl) titleEl.textContent = 'سندات الموردين (سندات الصرف والمدفوعات)';
          if (descEl) descEl.textContent = 'سندات الصرف المسددة للموردين لتسوية فواتير المشتريات';
          openPaymentModal();
          break;
        case 'cash-expenses':
          if (titleEl) titleEl.textContent = 'المصروفات النقدية والنثرية';
          if (descEl) descEl.textContent = 'صرف العهد والمصاريف التشغيلية اليومية البسيطة من الصناديق';
          openPaymentModal();
          break;
        case 'debit-notes':
          if (titleEl) titleEl.textContent = 'الإشعارات المدينة (Debit Notes - مردودات المشتريات)';
          if (descEl) descEl.textContent = 'إثبات مرتجعات البضائع للموردين وتخفيض الالتزامات';
          showToast('الإشعارات المدينة للموردين', 'info');
          break;
        case 'purchase-orders':
          if (titleEl) titleEl.textContent = 'أوامر الشراء (Purchase Orders)';
          if (descEl) descEl.textContent = 'أوامر الشراء الصادرة قبل استلام البضائع والفواتير النهائية';
          openNewPurchaseModal();
          break;
      }
    }

    // مسيرات العمل للأقسام الفرعية - المحاسبة
    function switchAccountingSection(subSection) {
      switch(subSection) {
        case 'banks':
          switchView('treasury');
          showToast('الحسابات البنكية وحركات التدفق النقدي', 'info');
          break;
        case 'manual-journals':
          switchView('journal');
          showToast('دفتر القيود اليومية اليدوية والمزدوجة', 'info');
          break;
        case 'batch-recategorize':
          switchView('journal');
          showToast('أداة إعادة التصنيف الجماعي للعمليات المحاسبية', 'info');
          break;
        case 'chart-of-accounts':
          switchView('accounts');
          showToast('شجرة الحسابات والدليل المحاسبي الهرمي', 'info');
          break;
        case 'fixed-assets':
          switchView('accounts');
          showToast('سجل الأصول الثابتة وحسابات الإهلاك الدوري', 'info');
          break;
        case 'settings':
          switchView('settings');
          showToast('إعدادات السنة المالية والفترات المحاسبية', 'info');
          break;
      }
    }
  `;

  if (!content.includes('switchSalesSection')) {
    content = content.replace('function switchView(viewName) {', workflowHandlers + '\n    function switchView(viewName) {');
  }

  // 4. Update switchView function to also handle new nav buttons
  const oldSwitchViews = "const views = ['dashboard', 'invoices', 'inventory', 'purchases', 'treasury', 'journal', 'accounts', 'reports', 'zatca', 'branches', 'settings'];";
  const newSwitchViews = "const views = ['dashboard', 'invoices', 'inventory', 'purchases', 'treasury', 'journal', 'accounts', 'reports', 'zatca', 'branches', 'settings', 'payroll'];";
  content = content.replace(oldSwitchViews, newSwitchViews);

  fs.writeFileSync(filePath, content, 'utf8');
  console.log('Updated popover menus & workflow routing in:', filePath);
}
