'use strict';
const fs = require('fs');
const path = require('path');

function overhaulHTML(filePath) {
  console.log(`Processing ${filePath}...`);
  let content = fs.readFileSync(filePath, 'utf8');

  // 1. Update Sidebar Navigation to 12 Enterprise Sections
  const asideStart = content.indexOf('<aside');
  const asideEnd = content.indexOf('</aside>') + '</aside>'.length;

  if (asideStart === -1 || asideEnd === -1) {
    throw new Error('Could not find <aside> in ' + filePath);
  }

  const newSidebar = `    <aside class="w-full md:w-64 lg:w-72 bg-white border-l border-slate-200 shrink-0 py-5 px-3 flex flex-col justify-between select-none relative z-30 overflow-y-auto max-h-screen">
      <div class="space-y-1">
        
        <!-- Active Entity Pill Indicator -->
        <div class="px-3 pb-3 mb-2 border-b border-slate-100 flex items-center justify-between">
          <span class="text-[11px] font-black text-slate-400">النشاط المحدد:</span>
          <span id="currentEntityBadge" class="text-xs font-black px-2.5 py-1 rounded-lg bg-emerald-50 text-emerald-800 border border-emerald-200">
            الرئيسية (المجمع العام)
          </span>
        </div>

        <!-- 1. لوحة التحكم (Dashboard) -->
        <button onclick="switchView('dashboard')" id="nav-dashboard" class="sidebar-nav-item w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl text-xs font-black transition sidebar-active">
          <span class="text-[10px] bg-slate-100 text-slate-600 px-1.5 py-0.5 rounded font-mono">KPI</span>
          <div class="flex items-center gap-2.5">
            <span>لوحة التحكم</span>
            <svg class="w-4 h-4 text-purple-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM14 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zM14 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z"></path></svg>
          </div>
        </button>

        <!-- 2. إدارة المبيعات (Sales Management) -->
        <div class="relative has-popover" id="popover-sales">
          <button onclick="toggleNavPopover('popover-sales', event); switchView('invoices');" id="nav-invoices" class="sidebar-nav-item w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl text-xs font-black text-slate-700 hover:text-purple-700 hover:bg-slate-50 transition">
            <svg class="w-3.5 h-3.5 text-purple-600 hover:scale-125 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M15 19l-7-7 7-7"></path></svg>
            <div class="flex items-center gap-2.5">
              <span>إدارة المبيعات</span>
              <svg class="w-4 h-4 text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-2.293 2.293c-.63.63-.184 1.707.707 1.707H17m0 0a2 2 0 100 4 2 2 0 000-4zm-8 2a2 2 0 11-4 0 2 2 0 014 0z"></path></svg>
            </div>
          </button>
          <div class="nav-popover">
            <button onclick="switchView('clients'); closeAllNavPopovers();" class="popover-item">
              <span>👥 العملاء (Customers)</span>
            </button>
            <button onclick="switchView('crm-leads'); closeAllNavPopovers();" class="popover-item">
              <span>🎯 العملاء المحتملين (Leads CRM)</span>
            </button>
            <button onclick="switchView('crm-deals'); closeAllNavPopovers();" class="popover-item">
              <span>📊 مسار الصفقات (Pipeline)</span>
            </button>
            <button onclick="switchView('quotes'); closeAllNavPopovers();" class="popover-item">
              <span>📄 عروض الأسعار وفواتير مبدئية</span>
            </button>
            <button onclick="openNewInvoiceModal(); closeAllNavPopovers();" class="popover-item font-black text-purple-700 bg-purple-50/90 border border-purple-200 shadow-2xs flex items-center justify-between">
              <span>+ إصدار فاتورة مبيعات</span>
              <span class="text-[9px] bg-purple-700 text-white px-1.5 py-0.5 rounded font-bold">فاتورة</span>
            </button>
            <button onclick="switchView('invoices'); closeAllNavPopovers();" class="popover-item">
              <span>📑 فواتير البيع (Invoices)</span>
            </button>
            <button onclick="switchSalesSection('customer-receipts'); closeAllNavPopovers();" class="popover-item">
              <span>💵 سندات قبض العملاء</span>
            </button>
            <button onclick="switchSalesSection('credit-notes'); closeAllNavPopovers();" class="popover-item">
              <span>🔄 إشعارات دائنة ومرتجعات</span>
            </button>
          </div>
        </div>

        <!-- 3. إدارة المشتريات (Purchase Management) -->
        <div class="relative has-popover" id="popover-purchases">
          <button onclick="toggleNavPopover('popover-purchases', event); switchView('purchases');" id="nav-purchases" class="sidebar-nav-item w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl text-xs font-black text-slate-700 hover:text-purple-700 hover:bg-slate-50 transition">
            <svg class="w-3.5 h-3.5 text-purple-600 hover:scale-125 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M15 19l-7-7 7-7"></path></svg>
            <div class="flex items-center gap-2.5">
              <span>إدارة المشتريات</span>
              <svg class="w-4 h-4 text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"></path></svg>
            </div>
          </button>
          <div class="nav-popover">
            <button onclick="switchView('suppliers'); closeAllNavPopovers();" class="popover-item">
              <span>🏢 الموردون (Suppliers)</span>
            </button>
            <button onclick="openNewPurchaseModal(); closeAllNavPopovers();" class="popover-item font-black text-emerald-700 bg-emerald-50/90 border border-emerald-200 shadow-2xs flex items-center justify-between">
              <span>+ تسجيل فاتورة شراء</span>
              <span class="text-[9px] bg-emerald-700 text-white px-1.5 py-0.5 rounded font-bold">شراء</span>
            </button>
            <button onclick="switchPurchasesSection('bills'); closeAllNavPopovers();" class="popover-item">
              <span>📑 فواتير المشتريات</span>
            </button>
            <button onclick="switchPurchasesSection('purchase-orders'); closeAllNavPopovers();" class="popover-item">
              <span>📋 أوامر الشراء (Purchase Orders)</span>
            </button>
            <button onclick="switchPurchasesSection('supplier-receipts'); closeAllNavPopovers();" class="popover-item">
              <span>💸 سندات صرف الموردين</span>
            </button>
            <button onclick="switchPurchasesSection('debit-notes'); closeAllNavPopovers();" class="popover-item">
              <span>🔄 إشعارات مدينة ومرتجعات</span>
            </button>
          </div>
        </div>

        <!-- 4. المخزون والمنتجات (Inventory Management) -->
        <button onclick="switchView('inventory')" id="nav-inventory" class="sidebar-nav-item w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl text-xs font-black text-slate-700 hover:text-purple-700 hover:bg-slate-50 transition">
          <span class="text-[10px] text-slate-400 font-bold">مستودع</span>
          <div class="flex items-center gap-2.5">
            <span>المخزون والمنتجات</span>
            <svg class="w-4 h-4 text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4"></path></svg>
          </div>
        </button>

        <!-- 5. الخزينة والبنوك (Treasury & Banking) -->
        <button onclick="switchView('treasury')" id="nav-treasury" class="sidebar-nav-item w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl text-xs font-black text-slate-700 hover:text-purple-700 hover:bg-slate-50 transition">
          <span class="text-[10px] text-slate-400 font-bold">نقدية</span>
          <div class="flex items-center gap-2.5">
            <span>الخزينة والبنوك</span>
            <svg class="w-4 h-4 text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>
          </div>
        </button>

        <!-- 6. الحسابات العامة (Accounting & Finance) -->
        <div class="relative has-popover" id="popover-accounting">
          <button onclick="toggleNavPopover('popover-accounting', event); switchView('journal');" id="nav-accounting" class="sidebar-nav-item w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl text-xs font-black text-slate-700 hover:text-purple-700 hover:bg-slate-50 transition">
            <svg class="w-3.5 h-3.5 text-purple-600 hover:scale-125 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M15 19l-7-7 7-7"></path></svg>
            <div class="flex items-center gap-2.5">
              <span>الحسابات العامة</span>
              <svg class="w-4 h-4 text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 7h6m0 10v-3m-3 3h.01M9 17h.01M9 14h.01M12 14h.01M15 11h.01M12 11h.01M9 11h.01M7 21h10a2 2 0 002-2V5a2 2 0 00-2-2H7a2 2 0 00-2 2v14a2 2 0 002 2z"></path></svg>
            </div>
          </button>
          <div class="nav-popover">
            <button onclick="switchView('accounts'); closeAllNavPopovers();" class="popover-item">
              <span>🌳 شجرة الحسابات (COA)</span>
            </button>
            <button onclick="switchView('journal'); closeAllNavPopovers();" class="popover-item font-black text-purple-700 bg-purple-50">
              <span>✍️ دفتر القيود اليومية</span>
            </button>
            <button onclick="openNewJournalModal(); closeAllNavPopovers();" class="popover-item font-bold text-emerald-700">
              <span>+ إضافة قيد يومية يدوي</span>
            </button>
            <button onclick="switchView('fixed-assets'); closeAllNavPopovers();" class="popover-item">
              <span>🏛️ الأصول الثابتة والإهلاك</span>
            </button>
            <button onclick="openOpeningBalancesModal(); closeAllNavPopovers();" class="popover-item">
              <span>⚖️ الأرصدة الافتتاحية</span>
            </button>
          </div>
        </div>

        <!-- 7. التقارير المالية (Financial Reports) -->
        <button onclick="switchView('reports')" id="nav-reports" class="sidebar-nav-item w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl text-xs font-black text-slate-700 hover:text-purple-700 hover:bg-slate-50 transition">
          <span class="text-[10px] text-slate-400 font-bold">تقارير</span>
          <div class="flex items-center gap-2.5">
            <span>التقارير المالية</span>
            <svg class="w-4 h-4 text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"></path></svg>
          </div>
        </button>

        <!-- 8. الضرائب والفوترة الإلكترونية (Tax & ZATCA) -->
        <button onclick="switchView('zatca')" id="nav-zatca" class="sidebar-nav-item w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl text-xs font-black text-slate-700 hover:text-purple-700 hover:bg-slate-50 transition">
          <span class="text-[9px] bg-emerald-100 text-emerald-800 px-1.5 py-0.5 rounded-full font-black">ZATCA</span>
          <div class="flex items-center gap-2.5">
            <span>الفوترة والضرائب</span>
            <svg class="w-4 h-4 text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z"></path></svg>
          </div>
        </button>

        <!-- 9. الموارد البشرية والرواتب (HR & Payroll) -->
        <button onclick="switchView('payroll')" id="nav-payroll" class="sidebar-nav-item w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl text-xs font-black text-slate-700 hover:text-purple-700 hover:bg-slate-50 transition">
          <span class="text-[10px] text-slate-400 font-bold">WPS</span>
          <div class="flex items-center gap-2.5">
            <span>الموارد البشرية</span>
            <svg class="w-4 h-4 text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z"></path></svg>
          </div>
        </button>

        <!-- 10. إدارة العمليات والموافقات (Workflow & Approvals) -->
        <button onclick="switchView('approvals')" id="nav-approvals" class="sidebar-nav-item w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl text-xs font-black text-slate-700 hover:text-purple-700 hover:bg-slate-50 transition">
          <span id="badge-pending-approvals" class="text-[9px] bg-amber-100 text-amber-800 px-1.5 py-0.5 rounded-full font-black">اعتمادات</span>
          <div class="flex items-center gap-2.5">
            <span>إدارة الموافقات</span>
            <svg class="w-4 h-4 text-amber-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4"></path></svg>
          </div>
        </button>

        <!-- 11. المستخدمون والصلاحيات (Users & RBAC) -->
        <button onclick="switchView('users')" id="nav-users" class="sidebar-nav-item w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl text-xs font-black text-slate-700 hover:text-purple-700 hover:bg-slate-50 transition">
          <span class="text-[10px] text-slate-400 font-bold">RBAC</span>
          <div class="flex items-center gap-2.5">
            <span>المستخدمين والأدوار</span>
            <svg class="w-4 h-4 text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z"></path></svg>
          </div>
        </button>

        <!-- 12. إعدادات النظام والفروع (System Settings) -->
        <div class="relative has-popover" id="popover-settings">
          <button onclick="toggleNavPopover('popover-settings', event); switchView('settings');" id="nav-settings" class="sidebar-nav-item w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl text-xs font-black text-slate-700 hover:text-purple-700 hover:bg-slate-50 transition">
            <svg class="w-3.5 h-3.5 text-purple-600 hover:scale-125 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M15 19l-7-7 7-7"></path></svg>
            <div class="flex items-center gap-2.5">
              <span>إعدادات النظام</span>
              <svg class="w-4 h-4 text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"></path></svg>
            </div>
          </button>
          <div class="nav-popover">
            <button onclick="switchView('settings'); closeAllNavPopovers();" class="popover-item">
              <span>⚙️ بيانات الشركة والشعار</span>
            </button>
            <button onclick="switchView('branches'); closeAllNavPopovers();" class="popover-item">
              <span>🏢 الفروع والأنشطة (5 أنشطة)</span>
            </button>
          </div>
        </div>

        <!-- المساعدة والدعم (Help & Docs) -->
        <div class="relative has-popover" id="popover-help">
          <button onclick="toggleNavPopover('popover-help', event); switchView('help');" id="nav-help" class="sidebar-nav-item w-full flex items-center justify-between px-3.5 py-2 rounded-xl text-xs font-black text-slate-500 hover:text-purple-700 hover:bg-slate-50 transition">
            <svg class="w-3.5 h-3.5 text-purple-600 hover:scale-125 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M15 19l-7-7 7-7"></path></svg>
            <div class="flex items-center gap-2.5">
              <span>المساعدة والدعم</span>
              <svg class="w-4 h-4 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>
            </div>
          </button>
          <div class="nav-popover">
            <button onclick="switchView('help'); closeAllNavPopovers();" class="popover-item">
              <span>❓ مركز المساعدة ودليل النظام</span>
            </button>
            <button onclick="showToast('فريق الدعم متواجد لخدمتكم 24/7', 'info'); closeAllNavPopovers();" class="popover-item">
              <span>💬 الدعم الفني المباشر</span>
            </button>
          </div>
        </div>

      </div>

      <!-- أسفل القائمة: اللغة والمستخدم النشط -->
      <div class="pt-3 border-t border-slate-100 flex items-center justify-between text-xs font-black text-slate-500">
        <button onclick="toggleLanguage()" class="hover:text-purple-700 transition flex items-center gap-1">
          <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 5h12M9 3v2m1.048 9.5A18.022 18.022 0 016.412 9m6.088 9h7M11 21l5-10 5 10M12.751 5C11.783 10.77 8.07 15.61 3 18.129"></path></svg>
          <span id="langLabel">English</span>
        </button>
        <span class="text-[10px] text-slate-400 font-mono">v2.4 Pro</span>
      </div>
    </aside>`;

  content = content.slice(0, asideStart) + newSidebar + content.slice(asideEnd);

  // 2. Add #view-approvals and #view-users if not already present
  if (!content.includes('id="view-approvals"')) {
    const helpViewIndex = content.indexOf('<div id="view-help"');
    if (helpViewIndex !== -1) {
      const viewsToAdd = `
    <!-- ================= VIEW: WORKFLOW & APPROVALS ================= -->
    <div id="view-approvals" class="space-y-6 hidden">
      <div class="flex flex-wrap items-center justify-between gap-4 bg-white p-5 rounded-2xl border border-slate-200 shadow-xs">
        <div>
          <h2 class="text-xl font-black text-slate-900 flex items-center gap-2.5">
            <span class="w-8 h-8 rounded-xl bg-amber-50 text-amber-600 flex items-center justify-center">
              <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4"></path></svg>
            </span>
            إدارة العمليات والاعتمادات (Workflow & Approvals)
          </h2>
          <p class="text-xs text-slate-500 font-semibold mt-1">مسار اعتماد المستندات المالية (فواتير، مشتريات، عروض أسعار، قيود) وسجل التدقيق</p>
        </div>
        <div class="flex items-center gap-2">
          <button onclick="loadWorkflowApprovals()" class="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-black transition flex items-center gap-1.5">
            <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"></path></svg>
            <span>تحديث الطلبات</span>
          </button>
        </div>
      </div>

      <!-- Stat Cards -->
      <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div class="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs flex items-center justify-between">
          <div>
            <div class="text-[11px] font-bold text-slate-400">بانتظار الاعتماد</div>
            <div id="stat-approvals-pending" class="text-2xl font-black text-amber-600 mt-1">0</div>
          </div>
          <span class="w-10 h-10 rounded-xl bg-amber-50 text-amber-600 flex items-center justify-center font-black">⏳</span>
        </div>
        <div class="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs flex items-center justify-between">
          <div>
            <div class="text-[11px] font-bold text-slate-400">معتمدة ومرحّلة</div>
            <div id="stat-approvals-approved" class="text-2xl font-black text-emerald-600 mt-1">0</div>
          </div>
          <span class="w-10 h-10 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center font-black">✓</span>
        </div>
        <div class="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs flex items-center justify-between">
          <div>
            <div class="text-[11px] font-bold text-slate-400">مرفوضة / ملغاة</div>
            <div id="stat-approvals-rejected" class="text-2xl font-black text-rose-600 mt-1">0</div>
          </div>
          <span class="w-10 h-10 rounded-xl bg-rose-50 text-rose-600 flex items-center justify-center font-black">✕</span>
        </div>
        <div class="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs flex items-center justify-between">
          <div>
            <div class="text-[11px] font-bold text-slate-400">إجمالي طلبات الفترة</div>
            <div id="stat-approvals-total" class="text-2xl font-black text-purple-600 mt-1">0</div>
          </div>
          <span class="w-10 h-10 rounded-xl bg-purple-50 text-purple-600 flex items-center justify-center font-black">📋</span>
        </div>
      </div>

      <!-- Filter and Approvals Table -->
      <div class="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
        <div class="p-4 border-b border-slate-100 flex flex-wrap items-center justify-between gap-3">
          <div class="flex items-center gap-2">
            <span class="text-xs font-black text-slate-700">تصفية الطلبات:</span>
            <select id="filterApprovalStatus" onchange="loadWorkflowApprovals()" class="px-3 py-1.5 text-xs font-bold border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-purple-500">
              <option value="all">جميع الحالات</option>
              <option value="pending" selected>بانتظار الاعتماد فقط</option>
              <option value="approved">المعتمدة</option>
              <option value="rejected">المرفوضة</option>
            </select>
          </div>
          <input type="text" id="searchApprovalsInput" onkeyup="filterApprovalsTable()" placeholder="بحث برقم المستند أو مقدم الطلب..." class="px-3 py-1.5 text-xs border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-purple-500 w-64">
        </div>

        <div class="overflow-x-auto">
          <table class="w-full text-right text-xs">
            <thead class="bg-slate-50 text-slate-600 font-black border-b border-slate-200">
              <tr>
                <th class="p-3">نوع المستند</th>
                <th class="p-3">رقم المستند</th>
                <th class="p-3">المبلغ</th>
                <th class="p-3">مقدم الطلب</th>
                <th class="p-3">التاريخ</th>
                <th class="p-3">الحالة</th>
                <th class="p-3 text-center">الإجراءات والقرار</th>
              </tr>
            </thead>
            <tbody id="workflowApprovalsTableBody" class="divide-y divide-slate-100 font-semibold text-slate-700">
              <tr>
                <td colspan="7" class="text-center py-8 text-slate-400 font-bold">جاري تحميل طلبات الاعتماد...</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>

    <!-- ================= VIEW: USERS & ROLES ================= -->
    <div id="view-users" class="space-y-6 hidden">
      <div class="flex flex-wrap items-center justify-between gap-4 bg-white p-5 rounded-2xl border border-slate-200 shadow-xs">
        <div>
          <h2 class="text-xl font-black text-slate-900 flex items-center gap-2.5">
            <span class="w-8 h-8 rounded-xl bg-purple-50 text-purple-600 flex items-center justify-center">
              <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z"></path></svg>
            </span>
            المستخدمون والصلاحيات وإدارة الوصول (Users & Permissions)
          </h2>
          <p class="text-xs text-slate-500 font-semibold mt-1">إدارة حسابات الفريق المالي، الأدوار الوظيفية (RBAC)، وسجل تسجيل الدخول</p>
        </div>
        <div class="flex items-center gap-2">
          <button onclick="loadUsersList()" class="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-black transition flex items-center gap-1.5">
            <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"></path></svg>
            <span>تحديث المستخدمين</span>
          </button>
        </div>
      </div>

      <!-- Users Table -->
      <div class="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
        <div class="overflow-x-auto">
          <table class="w-full text-right text-xs">
            <thead class="bg-slate-50 text-slate-600 font-black border-b border-slate-200">
              <tr>
                <th class="p-3">الاسم والملف</th>
                <th class="p-3">اسم الدخول / البريد</th>
                <th class="p-3">المستوى والدور (Role)</th>
                <th class="p-3">الصلاحيات المالية</th>
                <th class="p-3">الحالة</th>
                <th class="p-3 text-center">الإجراء</th>
              </tr>
            </thead>
            <tbody id="usersListTableBody" class="divide-y divide-slate-100 font-semibold text-slate-700">
              <tr>
                <td colspan="6" class="text-center py-8 text-slate-400 font-bold">جاري تحميل قائمة المستخدمين...</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
`;
      content = content.slice(0, helpViewIndex) + viewsToAdd + content.slice(helpViewIndex);
    }
  }

  fs.writeFileSync(filePath, content, 'utf8');
  console.log(`Successfully updated ${filePath}`);
}

['public/index.html', 'web/index.html', 'index.html'].forEach(f => {
  const full = path.join(__dirname, '..', f);
  if (fs.existsSync(full)) {
    overhaulHTML(full);
  }
});
