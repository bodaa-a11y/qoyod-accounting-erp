'use strict';
const fs = require('fs');
const path = require('path');

function overhaulHTML(filePath) {
  console.log(`Updating sidebar & arrows in ${filePath}...`);
  let content = fs.readFileSync(filePath, 'utf8');

  const asideStart = content.indexOf('<aside');
  const asideEnd = content.indexOf('</aside>') + '</aside>'.length;

  if (asideStart === -1 || asideEnd === -1) {
    throw new Error('Could not find <aside> in ' + filePath);
  }

  // Note: In RTL (dir="rtl"), the FIRST flex child is on the RIGHT (Icon + Label),
  // and the SECOND flex child is on the LEFT (Arrow '<' or Badge).
  // CRITICAL: Do NOT put overflow-y-auto or overflow-hidden on <aside>, so .nav-popover (right: 100%) is never clipped!
  const newSidebar = `    <aside class="w-full md:w-64 lg:w-72 bg-white border-l border-slate-200 shrink-0 py-5 px-3 flex flex-col justify-between select-none relative z-40" style="overflow: visible !important;">
      <div class="space-y-1.5" style="overflow: visible !important;">
        
        <!-- Active Entity Pill Indicator -->
        <div class="px-3 pb-3 mb-2 border-b border-slate-100 flex items-center justify-between">
          <span class="text-[11px] font-black text-slate-400">النشاط المحدد:</span>
          <span id="currentEntityBadge" class="text-xs font-black px-2.5 py-1 rounded-lg bg-emerald-50 text-emerald-800 border border-emerald-200">
            الرئيسية (المجمع العام)
          </span>
        </div>

        <!-- 1. لوحة التحكم (Dashboard) -->
        <button onclick="switchView('dashboard')" id="nav-dashboard" class="sidebar-nav-item w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl text-xs font-black transition sidebar-active">
          <div class="flex items-center gap-2.5">
            <svg class="w-4 h-4 text-purple-600 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM14 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zM14 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z"></path></svg>
            <span>لوحة التحكم</span>
          </div>
          <span class="text-[10px] bg-purple-100 text-purple-700 px-2 py-0.5 rounded-md font-mono font-black">KPI</span>
        </button>

        <!-- 2. إدارة المبيعات (Sales Management) -->
        <div class="relative has-popover" id="popover-sales">
          <button onclick="toggleNavPopover('popover-sales', event); switchView('invoices');" id="nav-invoices" class="sidebar-nav-item w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl text-xs font-black text-slate-700 hover:text-purple-700 hover:bg-slate-50 transition">
            <div class="flex items-center gap-2.5">
              <svg class="w-4 h-4 text-slate-500 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-2.293 2.293c-.63.63-.184 1.707.707 1.707H17m0 0a2 2 0 100 4 2 2 0 000-4zm-8 2a2 2 0 11-4 0 2 2 0 014 0z"></path></svg>
              <span>إدارة المبيعات</span>
            </div>
            <span class="w-6 h-6 rounded-lg bg-purple-50 text-purple-700 flex items-center justify-center border border-purple-200/60 shadow-2xs">
              <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M15 19l-7-7 7-7"></path></svg>
            </span>
          </button>
          <div class="nav-popover">
            <div class="popover-header">دورة المبيعات والعملاء</div>
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
              <span class="text-[9px] bg-purple-700 text-white px-1.5 py-0.5 rounded font-bold">جديد</span>
            </button>
            <button onclick="switchView('invoices'); closeAllNavPopovers();" class="popover-item">
              <span>📑 فواتير البيع (Sales Invoices)</span>
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
            <div class="flex items-center gap-2.5">
              <svg class="w-4 h-4 text-slate-500 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"></path></svg>
              <span>إدارة المشتريات</span>
            </div>
            <span class="w-6 h-6 rounded-lg bg-purple-50 text-purple-700 flex items-center justify-center border border-purple-200/60 shadow-2xs">
              <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M15 19l-7-7 7-7"></path></svg>
            </span>
          </button>
          <div class="nav-popover">
            <div class="popover-header">دورة المشتريات والموردين</div>
            <button onclick="switchView('suppliers'); closeAllNavPopovers();" class="popover-item">
              <span>🏢 الموردون (Suppliers)</span>
            </button>
            <button onclick="openNewPurchaseModal(); closeAllNavPopovers();" class="popover-item font-black text-emerald-700 bg-emerald-50/90 border border-emerald-200 shadow-2xs flex items-center justify-between">
              <span>+ تسجيل فاتورة شراء</span>
              <span class="text-[9px] bg-emerald-700 text-white px-1.5 py-0.5 rounded font-bold">جديد</span>
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
        <div class="relative has-popover" id="popover-inventory">
          <button onclick="toggleNavPopover('popover-inventory', event); switchView('inventory');" id="nav-inventory" class="sidebar-nav-item w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl text-xs font-black text-slate-700 hover:text-purple-700 hover:bg-slate-50 transition">
            <div class="flex items-center gap-2.5">
              <svg class="w-4 h-4 text-slate-500 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4"></path></svg>
              <span>المخزون والمنتجات</span>
            </div>
            <span class="w-6 h-6 rounded-lg bg-purple-50 text-purple-700 flex items-center justify-center border border-purple-200/60 shadow-2xs">
              <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M15 19l-7-7 7-7"></path></svg>
            </span>
          </button>
          <div class="nav-popover">
            <div class="popover-header">إدارة المستودعات والأصناف</div>
            <button onclick="switchView('inventory'); closeAllNavPopovers();" class="popover-item">
              <span>📦 دليل الأصناف والمنتجات</span>
            </button>
            <button onclick="openModal('newItemModal'); closeAllNavPopovers();" class="popover-item font-black text-purple-700 bg-purple-50/90 border border-purple-200 flex items-center justify-between">
              <span>+ إضافة صنف أو منتج</span>
              <span class="text-[9px] bg-purple-700 text-white px-1.5 py-0.5 rounded font-bold">مخزون</span>
            </button>
            <button onclick="switchView('inventory'); showToast('عرض أرصدة المستودعات وحركة الأصناف', 'info'); closeAllNavPopovers();" class="popover-item">
              <span>🏢 المستودعات والتحويلات</span>
            </button>
            <button onclick="switchView('inventory'); showToast('وضع الجرد الفعلي وتسوية الكميات', 'info'); closeAllNavPopovers();" class="popover-item">
              <span>⚖️ تسوية وجرد المخزون</span>
            </button>
          </div>
        </div>

        <!-- 5. الخزينة والبنوك (Treasury & Banking) -->
        <div class="relative has-popover" id="popover-treasury">
          <button onclick="toggleNavPopover('popover-treasury', event); switchView('treasury');" id="nav-treasury" class="sidebar-nav-item w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl text-xs font-black text-slate-700 hover:text-purple-700 hover:bg-slate-50 transition">
            <div class="flex items-center gap-2.5">
              <svg class="w-4 h-4 text-slate-500 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>
              <span>الخزينة والبنوك</span>
            </div>
            <span class="w-6 h-6 rounded-lg bg-purple-50 text-purple-700 flex items-center justify-center border border-purple-200/60 shadow-2xs">
              <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M15 19l-7-7 7-7"></path></svg>
            </span>
          </button>
          <div class="nav-popover">
            <div class="popover-header">إدارة النقدية والحسابات البنكية</div>
            <button onclick="switchView('treasury'); closeAllNavPopovers();" class="popover-item">
              <span>🏦 الصناديق والحسابات البنكية</span>
            </button>
            <button onclick="openModal('receiptModal'); closeAllNavPopovers();" class="popover-item font-black text-emerald-700 bg-emerald-50 border border-emerald-200">
              <span>📥 + سند قبض مالي</span>
            </button>
            <button onclick="openModal('paymentModal'); closeAllNavPopovers();" class="popover-item font-black text-rose-700 bg-rose-50 border border-rose-200">
              <span>📤 + سند صرف مالي</span>
            </button>
            <button onclick="switchView('treasury'); closeAllNavPopovers();" class="popover-item">
              <span>⚖️ التسوية البنكية وحركة النقد</span>
            </button>
          </div>
        </div>

        <!-- 6. الحسابات العامة (Accounting & Finance) -->
        <div class="relative has-popover" id="popover-accounting">
          <button onclick="toggleNavPopover('popover-accounting', event); switchView('journal');" id="nav-accounting" class="sidebar-nav-item w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl text-xs font-black text-slate-700 hover:text-purple-700 hover:bg-slate-50 transition">
            <div class="flex items-center gap-2.5">
              <svg class="w-4 h-4 text-slate-500 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 7h6m0 10v-3m-3 3h.01M9 17h.01M9 14h.01M12 14h.01M15 11h.01M12 11h.01M9 11h.01M7 21h10a2 2 0 002-2V5a2 2 0 00-2-2H7a2 2 0 00-2 2v14a2 2 0 002 2z"></path></svg>
              <span>الحسابات العامة</span>
            </div>
            <span class="w-6 h-6 rounded-lg bg-purple-50 text-purple-700 flex items-center justify-center border border-purple-200/60 shadow-2xs">
              <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M15 19l-7-7 7-7"></path></svg>
            </span>
          </button>
          <div class="nav-popover">
            <div class="popover-header">المحاسبة المالية والأستاذ العام</div>
            <button onclick="switchView('accounts'); closeAllNavPopovers();" class="popover-item">
              <span>🌳 شجرة الحسابات (Chart of Accounts)</span>
            </button>
            <button onclick="switchView('journal'); closeAllNavPopovers();" class="popover-item font-black text-purple-700 bg-purple-50">
              <span>✍️ دفتر القيود اليومية</span>
            </button>
            <button onclick="openModal('newJournalModal'); closeAllNavPopovers();" class="popover-item font-bold text-emerald-700">
              <span>+ إضافة قيد يومية يدوي</span>
            </button>
            <button onclick="switchView('fixed-assets'); closeAllNavPopovers();" class="popover-item">
              <span>🏛️ الأصول الثابتة والإهلاك</span>
            </button>
            <button onclick="openModal('openingBalancesModal'); closeAllNavPopovers();" class="popover-item">
              <span>⚖️ الأرصدة الافتتاحية</span>
            </button>
          </div>
        </div>

        <!-- 7. التقارير المالية (Financial Reports) -->
        <div class="relative has-popover" id="popover-reports">
          <button onclick="toggleNavPopover('popover-reports', event); switchView('reports');" id="nav-reports" class="sidebar-nav-item w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl text-xs font-black text-slate-700 hover:text-purple-700 hover:bg-slate-50 transition">
            <div class="flex items-center gap-2.5">
              <svg class="w-4 h-4 text-slate-500 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"></path></svg>
              <span>التقارير المالية</span>
            </div>
            <span class="w-6 h-6 rounded-lg bg-purple-50 text-purple-700 flex items-center justify-center border border-purple-200/60 shadow-2xs">
              <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M15 19l-7-7 7-7"></path></svg>
            </span>
          </button>
          <div class="nav-popover">
            <div class="popover-header">القوائم والتقارير الختامية</div>
            <button onclick="switchView('reports'); closeAllNavPopovers();" class="popover-item">
              <span>📈 قائمة الدخل (الأرباح والخسائر)</span>
            </button>
            <button onclick="switchView('reports'); closeAllNavPopovers();" class="popover-item">
              <span>🏛️ الميزانية العمومية (المركز المالي)</span>
            </button>
            <button onclick="switchView('reports'); closeAllNavPopovers();" class="popover-item">
              <span>⚖️ ميزان المراجعة (Trial Balance)</span>
            </button>
            <button onclick="switchView('reports'); closeAllNavPopovers();" class="popover-item">
              <span>📑 تقارير الضرائب وأعمار الديون</span>
            </button>
          </div>
        </div>

        <!-- 8. الضرائب والفوترة الإلكترونية (Tax & ZATCA) -->
        <button onclick="switchView('zatca')" id="nav-zatca" class="sidebar-nav-item w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl text-xs font-black text-slate-700 hover:text-purple-700 hover:bg-slate-50 transition">
          <div class="flex items-center gap-2.5">
            <svg class="w-4 h-4 text-slate-500 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z"></path></svg>
            <span>الفوترة والضرائب</span>
          </div>
          <span class="text-[9px] bg-emerald-100 text-emerald-800 px-2 py-0.5 rounded-full font-black">ZATCA</span>
        </button>

        <!-- 9. الموارد البشرية والرواتب (HR & Payroll) -->
        <button onclick="switchView('payroll')" id="nav-payroll" class="sidebar-nav-item w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl text-xs font-black text-slate-700 hover:text-purple-700 hover:bg-slate-50 transition">
          <div class="flex items-center gap-2.5">
            <svg class="w-4 h-4 text-slate-500 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z"></path></svg>
            <span>الموارد البشرية</span>
          </div>
          <span class="text-[10px] text-slate-400 font-bold">WPS</span>
        </button>

        <!-- 10. إدارة العمليات والموافقات (Workflow & Approvals) -->
        <button onclick="switchView('approvals')" id="nav-approvals" class="sidebar-nav-item w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl text-xs font-black text-slate-700 hover:text-purple-700 hover:bg-slate-50 transition">
          <div class="flex items-center gap-2.5">
            <svg class="w-4 h-4 text-amber-600 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4"></path></svg>
            <span>إدارة الموافقات</span>
          </div>
          <span id="badge-pending-approvals" class="text-[9px] bg-amber-100 text-amber-800 px-2 py-0.5 rounded-full font-black">اعتمادات</span>
        </button>

        <!-- 11. المستخدمون والصلاحيات (Users & RBAC) -->
        <button onclick="switchView('users')" id="nav-users" class="sidebar-nav-item w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl text-xs font-black text-slate-700 hover:text-purple-700 hover:bg-slate-50 transition">
          <div class="flex items-center gap-2.5">
            <svg class="w-4 h-4 text-slate-500 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z"></path></svg>
            <span>المستخدمين والأدوار</span>
          </div>
          <span class="text-[10px] text-slate-400 font-bold">RBAC</span>
        </button>

        <!-- 12. إعدادات النظام والفروع (System Settings) -->
        <div class="relative has-popover" id="popover-settings">
          <button onclick="toggleNavPopover('popover-settings', event); switchView('settings');" id="nav-settings" class="sidebar-nav-item w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl text-xs font-black text-slate-700 hover:text-purple-700 hover:bg-slate-50 transition">
            <div class="flex items-center gap-2.5">
              <svg class="w-4 h-4 text-slate-500 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"></path></svg>
              <span>إعدادات النظام</span>
            </div>
            <span class="w-6 h-6 rounded-lg bg-purple-50 text-purple-700 flex items-center justify-center border border-purple-200/60 shadow-2xs">
              <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M15 19l-7-7 7-7"></path></svg>
            </span>
          </button>
          <div class="nav-popover">
            <div class="popover-header">إعدادات المنشأة والكيانات</div>
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
            <div class="flex items-center gap-2.5">
              <svg class="w-4 h-4 text-slate-400 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>
              <span>المساعدة والدعم</span>
            </div>
            <span class="w-6 h-6 rounded-lg bg-slate-100 text-slate-600 flex items-center justify-center">
              <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M15 19l-7-7 7-7"></path></svg>
            </span>
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
  fs.writeFileSync(filePath, content, 'utf8');
  console.log(`Successfully updated ${filePath}`);
}

['public/index.html', 'web/index.html', 'index.html'].forEach(f => {
  const full = path.join(__dirname, '..', f);
  if (fs.existsSync(full)) {
    overhaulHTML(full);
  }
});
