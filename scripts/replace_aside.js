'use strict';
const fs = require('fs');

const asideHtml = `<aside class="w-full md:w-64 lg:w-72 bg-white border-l border-slate-200 shrink-0 py-6 px-3 flex flex-col justify-between select-none relative z-30">
      <div class="space-y-1.5">
        
        <!-- Active Entity Pill Indicator -->
        <div class="px-3 pb-4 mb-2 border-b border-slate-100 flex items-center justify-between">
          <span class="text-xs font-bold text-slate-400">النشاط المحدد:</span>
          <span id="currentEntityBadge" class="text-xs font-bold px-2.5 py-1 rounded-lg bg-gathern-50 text-gathern-800 border border-gathern-200">
            الرئيسية (المجمع العام)
          </span>
        </div>

        <!-- الوكيل تجريبي -->
        <div class="flex items-center justify-between px-3 py-2 text-xs font-bold text-slate-600 hover:text-purple-700 cursor-pointer rounded-xl hover:bg-slate-50 transition">
          <span class="px-2 py-0.5 rounded-md bg-purple-600 text-white text-[10px] font-black">تجريبي</span>
          <div class="flex items-center gap-2">
            <span>الوكيل</span>
            <svg class="w-4 h-4 text-purple-600" fill="currentColor" viewBox="0 0 24 24"><path d="M12 2L14.5 9.5L22 12L14.5 14.5L12 22L9.5 14.5L2 12L9.5 9.5L12 2Z"></path></svg>
          </div>
        </div>

        <!-- البريد الوارد -->
        <button onclick="showToast('لا توجد رسائل جديدة في صندوق البريد', 'info')" class="w-full flex items-center justify-between px-3 py-2 text-xs font-bold text-slate-600 hover:text-purple-700 rounded-xl hover:bg-slate-50 transition">
          <span class="text-[11px] text-slate-400 font-normal">0</span>
          <div class="flex items-center gap-2.5">
            <span>البريد الوارد</span>
            <svg class="w-4 h-4 text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"></path></svg>
          </div>
        </button>

        <!-- لوحة البيانات -->
        <button onclick="switchView('dashboard')" id="nav-dashboard" class="sidebar-nav-item w-full flex items-center justify-between px-4 py-3 rounded-xl text-sm font-bold transition sidebar-active">
          <span></span>
          <div class="flex items-center gap-3">
            <span>لوحة البيانات</span>
            <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM14 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zM14 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z"></path></svg>
          </div>
        </button>

        <!-- التقارير -->
        <button onclick="switchView('reports')" id="nav-reports" class="sidebar-nav-item w-full flex items-center justify-between px-4 py-3 rounded-xl text-sm font-bold text-slate-600 hover:text-purple-700 hover:bg-slate-50 transition">
          <span></span>
          <div class="flex items-center gap-3">
            <span>التقارير</span>
            <svg class="w-5 h-5 text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"></path></svg>
          </div>
        </button>

        <!-- المبيعات مع القائمة المنسدلة الجانبية -->
        <div class="relative has-popover">
          <button onclick="switchView('invoices')" id="nav-invoices" class="sidebar-nav-item w-full flex items-center justify-between px-4 py-3 rounded-xl text-sm font-bold text-slate-600 hover:text-purple-700 hover:bg-slate-50 transition">
            <svg class="w-4 h-4 text-purple-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M15 19l-7-7 7-7"></path></svg>
            <div class="flex items-center gap-3">
              <span>المبيعات</span>
              <svg class="w-5 h-5 text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-2.293 2.293c-.63.63-.184 1.707.707 1.707H17m0 0a2 2 0 100 4 2 2 0 000-4zm-8 2a2 2 0 11-4 0 2 2 0 014 0z"></path></svg>
            </div>
          </button>
          
          <!-- قائمة المبيعات المنسدلة المرفقة بالصورة -->
          <div class="nav-popover">
            <button onclick="switchSalesSection('clients')" class="popover-item">
              <span>العملاء</span>
            </button>
            <button onclick="switchSalesSection('quotes')" class="popover-item">
              <span>عروض أسعار و فواتير مبدئية</span>
            </button>
            <button onclick="switchSalesSection('invoices')" class="popover-item font-black text-purple-700 bg-purple-50">
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
              <svg class="w-4 h-4 ml-1.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"></path></svg>
              <span>إعداد المبيعات</span>
            </button>
          </div>
        </div>

        <!-- المشتريات مع القائمة المنسدلة الجانبية -->
        <div class="relative has-popover">
          <button onclick="switchView('purchases')" id="nav-purchases" class="sidebar-nav-item w-full flex items-center justify-between px-4 py-3 rounded-xl text-sm font-bold text-slate-600 hover:text-purple-700 hover:bg-slate-50 transition">
            <svg class="w-4 h-4 text-purple-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M15 19l-7-7 7-7"></path></svg>
            <div class="flex items-center gap-3">
              <span>المشتريات</span>
              <svg class="w-5 h-5 text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"></path></svg>
            </div>
          </button>
          
          <!-- قائمة المشتريات المنسدلة المرفقة بالصورة -->
          <div class="nav-popover">
            <button onclick="switchPurchasesSection('suppliers')" class="popover-item">
              <span>الموردون</span>
            </button>
            <button onclick="switchPurchasesSection('bills')" class="popover-item font-black text-purple-700 bg-purple-50">
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
          <button onclick="switchView('journal')" id="nav-accounting" class="sidebar-nav-item w-full flex items-center justify-between px-4 py-3 rounded-xl text-sm font-bold text-slate-600 hover:text-purple-700 hover:bg-slate-50 transition">
            <svg class="w-4 h-4 text-purple-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M15 19l-7-7 7-7"></path></svg>
            <div class="flex items-center gap-3">
              <span>المحاسبة</span>
              <svg class="w-5 h-5 text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 7h6m0 10v-3m-3 3h.01M9 17h.01M9 14h.01M12 14h.01M15 11h.01M12 11h.01M9 11h.01M7 21h10a2 2 0 002-2V5a2 2 0 00-2-2H7a2 2 0 00-2 2v14a2 2 0 002 2z"></path></svg>
            </div>
          </button>
          
          <!-- قائمة المحاسبة المنسدلة المرفقة بالصورة -->
          <div class="nav-popover">
            <button onclick="switchAccountingSection('banks')" class="popover-item">
              <span>الحسابات البنكية</span>
            </button>
            <button onclick="switchAccountingSection('manual-journals')" class="popover-item font-black text-purple-700 bg-purple-50">
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
              <svg class="w-4 h-4 ml-1.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"></path></svg>
              <span>إعدادات المحاسبة</span>
            </button>
          </div>
        </div>

        <!-- الرواتب و الموظفين -->
        <button onclick="switchView('payroll')" id="nav-payroll" class="sidebar-nav-item w-full flex items-center justify-between px-4 py-3 rounded-xl text-sm font-bold text-slate-600 hover:text-purple-700 hover:bg-slate-50 transition">
          <span></span>
          <div class="flex items-center gap-3">
            <span>الرواتب و الموظفين</span>
            <svg class="w-5 h-5 text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z"></path></svg>
          </div>
        </button>

        <!-- المخزون -->
        <button onclick="switchView('inventory')" id="nav-inventory" class="sidebar-nav-item w-full flex items-center justify-between px-4 py-3 rounded-xl text-sm font-bold text-slate-600 hover:text-purple-700 hover:bg-slate-50 transition">
          <span></span>
          <div class="flex items-center gap-3">
            <span>المخزون</span>
            <svg class="w-5 h-5 text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4"></path></svg>
          </div>
        </button>

        <!-- المساعدة -->
        <button onclick="showToast('مركز المساعدة والدعم الفني متصل دائماً', 'info')" id="nav-help" class="sidebar-nav-item w-full flex items-center justify-between px-4 py-3 rounded-xl text-sm font-bold text-slate-600 hover:text-purple-700 hover:bg-slate-50 transition">
          <svg class="w-4 h-4 text-purple-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M15 19l-7-7 7-7"></path></svg>
          <div class="flex items-center gap-3">
            <span>المساعدة</span>
            <div class="relative">
              <svg class="w-5 h-5 text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>
              <span class="absolute -top-1 -right-1 w-2 h-2 bg-rose-500 rounded-full"></span>
            </div>
          </div>
        </button>

        <!-- الإعدادات -->
        <button onclick="switchView('settings')" id="nav-settings" class="sidebar-nav-item w-full flex items-center justify-between px-4 py-3 rounded-xl text-sm font-bold text-slate-600 hover:text-purple-700 hover:bg-slate-50 transition">
          <span></span>
          <div class="flex items-center gap-3">
            <span>الإعدادات</span>
            <svg class="w-5 h-5 text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"></path><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"></path></svg>
          </div>
        </button>

      </div>

      <!-- أسفل القائمة: اللغة والمستخدم -->
      <div class="pt-4 border-t border-slate-100 flex flex-col items-center gap-3">
        <span class="text-xs font-bold text-slate-500 hover:text-purple-700 cursor-pointer">English</span>
      </div>
    </aside>`;

['public/index.html', 'web/index.html'].forEach(f => {
  let fileContent = fs.readFileSync(f, 'utf8');
  fileContent = fileContent.replace(/<aside[\s\S]*?<\/aside>/, asideHtml);
  fs.writeFileSync(f, fileContent, 'utf8');
  console.log('Done updating aside in:', f);
});
