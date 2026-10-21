'use strict';
const fs = require('fs');

console.log('Generating full enterprise HTML views for missing modules...');

// 1. View Clients
const viewClientsHtml = `
      <!-- View: CLIENTS (إدارة العملاء والذمم المدينة) -->
      <div id="view-clients" class="space-y-6 hidden">
        <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-6 rounded-2xl border border-slate-200/80 shadow-xs">
          <div>
            <div class="flex items-center gap-2 mb-1">
              <h2 class="text-xl font-black text-slate-800">قائمة العملاء والذمم المدينة</h2>
              <span class="text-xs px-2.5 py-0.5 rounded-full bg-purple-50 text-purple-700 font-bold border border-purple-200">سجل العملاء المعتمدين</span>
            </div>
            <p class="text-xs text-slate-400 font-medium">إدارة بيانات العملاء، الأرقام الضريبية، السجلات التجارية، وأرصدة المديونيات</p>
          </div>
          <button onclick="openNewClientModal()" class="gathern-gradient-btn text-white px-4 py-2.5 rounded-xl text-xs font-black flex items-center gap-2 transition">
            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4"></path></svg>
            <span>+ إضافة عميل جديد</span>
          </button>
        </div>

        <div class="bg-white p-4 rounded-xl border border-slate-200/80 shadow-xs flex flex-wrap items-center justify-between gap-3 text-xs">
          <div class="flex items-center gap-2">
            <span class="font-bold text-slate-500">إجمالي العملاء:</span>
            <span id="clientsCountSpan" class="px-2.5 py-0.5 rounded-md bg-purple-100 text-purple-800 font-black">0</span>
          </div>
          <div class="flex items-center gap-2">
            <input type="text" id="clientSearchInput" onkeyup="renderClientsTable()" placeholder="بحث بالاسم أو الهاتف أو السجل..." class="px-3 py-1.5 border border-slate-200 rounded-lg text-xs focus:outline-none focus:border-purple-600 w-64">
          </div>
        </div>

        <div class="bg-white rounded-2xl border border-slate-200/80 shadow-xs overflow-hidden">
          <div class="overflow-x-auto">
            <table class="w-full text-right text-xs">
              <thead class="bg-slate-50 text-slate-500 font-bold border-b border-slate-200">
                <tr>
                  <th class="p-4">اسم العميل / المنشأة</th>
                  <th class="p-4">النشاط التابع</th>
                  <th class="p-4">رقم الهاتف</th>
                  <th class="p-4">الرقم الضريبي / السجل</th>
                  <th class="p-4">الرصيد المستحق</th>
                  <th class="p-4">الحالة</th>
                  <th class="p-4 text-center">إجراءات</th>
                </tr>
              </thead>
              <tbody id="clientsTableBody" class="divide-y divide-slate-100 font-medium"></tbody>
            </table>
          </div>
        </div>
      </div>
`;

// 2. View Quotes (عروض الأسعار)
const viewQuotesHtml = `
      <!-- View: QUOTES (عروض الأسعار والفواتير المبدئية) -->
      <div id="view-quotes" class="space-y-6 hidden">
        <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-6 rounded-2xl border border-slate-200/80 shadow-xs">
          <div>
            <div class="flex items-center gap-2 mb-1">
              <h2 class="text-xl font-black text-slate-800">عروض الأسعار والفواتير المبدئية (Quotations)</h2>
              <span class="text-xs px-2.5 py-0.5 rounded-full bg-purple-50 text-purple-700 font-bold border border-purple-200">عروض غير ملزمة</span>
            </div>
            <p class="text-xs text-slate-400 font-medium">إصدار ومتابعة عروض الأسعار وفترات صلاحيتها وتحويلها لفواتير بيع معتمدة بنقرة واحدة</p>
          </div>
          <button onclick="openNewQuoteModal()" class="gathern-gradient-btn text-white px-4 py-2.5 rounded-xl text-xs font-black flex items-center gap-2 transition">
            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4"></path></svg>
            <span>+ إنشاء عرض سعر جديد</span>
          </button>
        </div>

        <div class="bg-white rounded-2xl border border-slate-200/80 shadow-xs overflow-hidden">
          <div class="overflow-x-auto">
            <table class="w-full text-right text-xs">
              <thead class="bg-slate-50 text-slate-500 font-bold border-b border-slate-200">
                <tr>
                  <th class="p-4">رقم العرض</th>
                  <th class="p-4">العميل</th>
                  <th class="p-4">النشاط</th>
                  <th class="p-4">تاريخ العرض</th>
                  <th class="p-4">صالح حتى</th>
                  <th class="p-4">المبلغ الإجمالي</th>
                  <th class="p-4">الحالة</th>
                  <th class="p-4 text-center">إجراءات</th>
                </tr>
              </thead>
              <tbody id="quotesTableBody" class="divide-y divide-slate-100 font-medium"></tbody>
            </table>
          </div>
        </div>
      </div>
`;

// 3. View Suppliers (الموردون)
const viewSuppliersHtml = `
      <!-- View: SUPPLIERS (الموردون وجهات التوريد) -->
      <div id="view-suppliers" class="space-y-6 hidden">
        <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-6 rounded-2xl border border-slate-200/80 shadow-xs">
          <div>
            <div class="flex items-center gap-2 mb-1">
              <h2 class="text-xl font-black text-slate-800">قائمة الموردين وجهات التوريد</h2>
              <span class="text-xs px-2.5 py-0.5 rounded-full bg-purple-50 text-purple-700 font-bold border border-purple-200">الموردون المعتمدون</span>
            </div>
            <p class="text-xs text-slate-400 font-medium">إدارة بيانات الموردين، حسابات المديونية والدائنية، وأوامر الشراء المرتبطة</p>
          </div>
          <button onclick="openNewSupplierModal()" class="gathern-gradient-btn text-white px-4 py-2.5 rounded-xl text-xs font-black flex items-center gap-2 transition">
            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4"></path></svg>
            <span>+ إضافة مورد جديد</span>
          </button>
        </div>

        <div class="bg-white rounded-2xl border border-slate-200/80 shadow-xs overflow-hidden">
          <div class="overflow-x-auto">
            <table class="w-full text-right text-xs">
              <thead class="bg-slate-50 text-slate-500 font-bold border-b border-slate-200">
                <tr>
                  <th class="p-4">اسم المورد / الشركة</th>
                  <th class="p-4">النشاط التابع</th>
                  <th class="p-4">رقم الهاتف</th>
                  <th class="p-4">الرقم الضريبي</th>
                  <th class="p-4">الرصيد الدائن المستحق له</th>
                  <th class="p-4">الحالة</th>
                  <th class="p-4 text-center">إجراءات</th>
                </tr>
              </thead>
              <tbody id="suppliersTableBody" class="divide-y divide-slate-100 font-medium"></tbody>
            </table>
          </div>
        </div>
      </div>
`;

// 4. View Payroll & Employees (الرواتب والموظفين)
const viewPayrollHtml = `
      <!-- View: PAYROLL (الرواتب والموظفون ومسير الأجور) -->
      <div id="view-payroll" class="space-y-6 hidden">
        <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-6 rounded-2xl border border-slate-200/80 shadow-xs">
          <div>
            <div class="flex items-center gap-2 mb-1">
              <h2 class="text-xl font-black text-slate-800">إدارة الرواتب والموظفين ومسير الأجور (WPS)</h2>
              <span class="text-xs px-2.5 py-0.5 rounded-full bg-emerald-50 text-emerald-800 font-bold border border-emerald-200">متوافق مع حماية الأجور</span>
            </div>
            <p class="text-xs text-slate-400 font-medium">سجل الموظفين، عقود العمل، البدلات والخصميات، وترحيل مسير الرواتب الشهري آلياً للقيود</p>
          </div>
          <div class="flex items-center gap-2">
            <button onclick="openRunPayrollModal()" class="px-4 py-2.5 rounded-xl border border-purple-200 bg-purple-50 text-purple-800 text-xs font-bold hover:bg-purple-100 transition flex items-center gap-1.5">
              <span>⚡ ترحيل مسير الشهر</span>
            </button>
            <button onclick="openNewEmployeeModal()" class="gathern-gradient-btn text-white px-4 py-2.5 rounded-xl text-xs font-black flex items-center gap-2 transition">
              <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4"></path></svg>
              <span>+ إضافة موظف جديد</span>
            </button>
          </div>
        </div>

        <div class="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs font-bold">
          <div class="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-xs flex items-center justify-between">
            <div>
              <span class="text-slate-400 block mb-1">إجمالي الكادر الوظيفي</span>
              <span id="totalEmployeesCount" class="text-2xl font-black text-slate-800">0</span>
            </div>
            <div class="w-12 h-12 rounded-xl bg-purple-50 text-purple-700 flex items-center justify-center text-xl">👥</div>
          </div>
          <div class="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-xs flex items-center justify-between">
            <div>
              <span class="text-slate-400 block mb-1">إجمالي الرواتب الأساسية</span>
              <span id="totalSalariesSpan" class="text-2xl font-black text-purple-900">0.00 ر.س</span>
            </div>
            <div class="w-12 h-12 rounded-xl bg-emerald-50 text-emerald-700 flex items-center justify-center text-xl">💵</div>
          </div>
          <div class="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-xs flex items-center justify-between">
            <div>
              <span class="text-slate-400 block mb-1">حالة مسير الشهر الحالي</span>
              <span class="text-sm font-black text-emerald-600">جاهز للترحيل</span>
            </div>
            <div class="w-12 h-12 rounded-xl bg-blue-50 text-blue-700 flex items-center justify-center text-xl">📋</div>
          </div>
        </div>

        <div class="bg-white rounded-2xl border border-slate-200/80 shadow-xs overflow-hidden">
          <div class="overflow-x-auto">
            <table class="w-full text-right text-xs">
              <thead class="bg-slate-50 text-slate-500 font-bold border-b border-slate-200">
                <tr>
                  <th class="p-4">اسم الموظف</th>
                  <th class="p-4">النشاط التابع</th>
                  <th class="p-4">المسمى الوظيفي</th>
                  <th class="p-4">الهوية / الإقامة</th>
                  <th class="p-4">الراتب الأساسي</th>
                  <th class="p-4">البدلات</th>
                  <th class="p-4">صافي الراتب</th>
                  <th class="p-4">الحالة</th>
                  <th class="p-4 text-center">إجراءات</th>
                </tr>
              </thead>
              <tbody id="employeesTableBody" class="divide-y divide-slate-100 font-medium"></tbody>
            </table>
          </div>
        </div>
      </div>
`;

// 5. View Fixed Assets (الأصول الثابتة)
const viewFixedAssetsHtml = `
      <!-- View: FIXED ASSETS (الأصول الثابتة والإهلاك) -->
      <div id="view-fixed-assets" class="space-y-6 hidden">
        <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-6 rounded-2xl border border-slate-200/80 shadow-xs">
          <div>
            <div class="flex items-center gap-2 mb-1">
              <h2 class="text-xl font-black text-slate-800">سجل الأصول الثابتة ومخصصات الإهلاك</h2>
              <span class="text-xs px-2.5 py-0.5 rounded-full bg-purple-50 text-purple-700 font-bold border border-purple-200">إهلاك دوري معتمد</span>
            </div>
            <p class="text-xs text-slate-400 font-medium">حصر وإثبات الأصول الثابتة (أجهزة، سيارات، معدات مطعم ومزرعة)، وحساب مجمع الإهلاك السنوي آلياً</p>
          </div>
          <button onclick="openNewAssetModal()" class="gathern-gradient-btn text-white px-4 py-2.5 rounded-xl text-xs font-black flex items-center gap-2 transition">
            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4"></path></svg>
            <span>+ إضافة أصل ثابت</span>
          </button>
        </div>

        <div class="bg-white rounded-2xl border border-slate-200/80 shadow-xs overflow-hidden">
          <div class="overflow-x-auto">
            <table class="w-full text-right text-xs">
              <thead class="bg-slate-50 text-slate-500 font-bold border-b border-slate-200">
                <tr>
                  <th class="p-4">كود الأصل</th>
                  <th class="p-4">اسم الأصل والبيان</th>
                  <th class="p-4">النشاط التابع</th>
                  <th class="p-4">تاريخ الشراء</th>
                  <th class="p-4">تكلفة الاقتناء</th>
                  <th class="p-4">معدل الإهلاك</th>
                  <th class="p-4">مجمع الإهلاك</th>
                  <th class="p-4">القيمة الدفترية الحالية</th>
                  <th class="p-4 text-center">إجراءات</th>
                </tr>
              </thead>
              <tbody id="fixedAssetsTableBody" class="divide-y divide-slate-100 font-medium"></tbody>
            </table>
          </div>
        </div>
      </div>
`;

// 6. View Help & Knowledgebase (مركز المساعدة والدعم)
const viewHelpHtml = `
      <!-- View: HELP (مركز المساعدة والدليل الإرشادي) -->
      <div id="view-help" class="space-y-6 hidden">
        <div class="bg-gradient-to-r from-purple-900 to-indigo-800 text-white p-8 rounded-3xl shadow-lg relative overflow-hidden">
          <div class="relative z-10 max-w-2xl space-y-3">
            <span class="px-3 py-1 bg-white/20 text-white rounded-full text-xs font-bold backdrop-blur-xs">مركز دعم ومساعدة قـيـد 24/7</span>
            <h2 class="text-2xl font-black">كيف يمكننا مساعدتك اليوم؟</h2>
            <p class="text-xs text-purple-200 leading-relaxed">دليل متكامل لإدارة المحاسبة المزدوجة، الفوترة الإلكترونية المعتمدة من هيئة الزكاة (ZATCA)، ومتابعة الأنشطة المتعددة وحركة الخزينة.</p>
          </div>
        </div>

        <div class="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div class="bg-white p-6 rounded-2xl border border-slate-200 shadow-xs space-y-3">
            <div class="w-10 h-10 rounded-xl bg-purple-100 text-purple-700 flex items-center justify-center font-bold text-lg">📖</div>
            <h3 class="font-extrabold text-sm text-slate-800">دليل الفوترة والربط مع ZATCA</h3>
            <p class="text-xs text-slate-400">شرح إنشاء الفواتير الضريبية المبسطة وتوليد رمز الاستجابة السريع QR المشفر بالمواصفات الرسمية.</p>
          </div>
          <div class="bg-white p-6 rounded-2xl border border-slate-200 shadow-xs space-y-3">
            <div class="w-10 h-10 rounded-xl bg-emerald-100 text-emerald-700 flex items-center justify-center font-bold text-lg">⚖️</div>
            <h3 class="font-extrabold text-sm text-slate-800">قواعد القيد المزدوج المحاسبي</h3>
            <p class="text-xs text-slate-400">دليل القيود اليومية التلقائية واليدوية وضمان توازن ميزان المراجعة والمركز المالي.</p>
          </div>
          <div class="bg-white p-6 rounded-2xl border border-slate-200 shadow-xs space-y-3">
            <div class="w-10 h-10 rounded-xl bg-blue-100 text-blue-700 flex items-center justify-center font-bold text-lg">📞</div>
            <h3 class="font-extrabold text-sm text-slate-800">تواصل مع المستشار المحاسبي</h3>
            <p class="text-xs text-slate-400">فريق الدعم المالي والتقني متصل وجاهز للإجابة على استفساراتكم الضريبية والمحاسبية.</p>
          </div>
        </div>
      </div>
`;

// Helper Modals (Client, Supplier, Employee, Asset, Quote)
const helperModalsHtml = `
  <!-- MODAL: ADD CLIENT -->
  <div id="newClientModal" class="fixed inset-0 bg-slate-900/50 backdrop-blur-xs z-50 flex items-center justify-center p-4 hidden">
    <div class="bg-white rounded-2xl max-w-lg w-full p-6 shadow-xl border border-slate-200 space-y-4">
      <div class="flex items-center justify-between border-b border-slate-100 pb-3">
        <h3 class="text-base font-black text-slate-800">+ إضافة عميل جديد</h3>
        <button onclick="closeModal('newClientModal')" class="text-slate-400 hover:text-slate-600 font-bold">&times;</button>
      </div>
      <form onsubmit="handleCreateClient(event)" class="space-y-4 text-xs">
        <div>
          <label class="block font-bold text-slate-700 mb-1">النشاط التابع له العميل:</label>
          <select id="client-entity" class="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl font-bold">
            <option value="law">🏢 شركة المحاماة</option>
            <option value="restaurant">🍔 المطعم</option>
            <option value="farm">🌾 المزرعة</option>
            <option value="barber">✂️ الحلاق</option>
          </select>
        </div>
        <div>
          <label class="block font-bold text-slate-700 mb-1">اسم العميل / الشركة:*</label>
          <input type="text" id="client-name" required placeholder="مثال: شركة التطوير العقاري" class="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl font-bold">
        </div>
        <div class="grid grid-cols-2 gap-3">
          <div>
            <label class="block font-bold text-slate-700 mb-1">رقم الهاتف / الجوال:</label>
            <input type="text" id="client-phone" placeholder="05xxxxxxxx" class="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl">
          </div>
          <div>
            <label class="block font-bold text-slate-700 mb-1">الرقم الضريبي:</label>
            <input type="text" id="client-vat" placeholder="300xxxxxxxxx" class="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl">
          </div>
        </div>
        <div class="flex items-center justify-end gap-3 pt-3 border-t border-slate-100">
          <button type="button" onclick="closeModal('newClientModal')" class="px-4 py-2 text-slate-500 font-bold">إلغاء</button>
          <button type="submit" class="gathern-gradient-btn text-white px-5 py-2.5 rounded-xl font-black">حفظ العميل</button>
        </div>
      </form>
    </div>
  </div>

  <!-- MODAL: ADD SUPPLIER -->
  <div id="newSupplierModal" class="fixed inset-0 bg-slate-900/50 backdrop-blur-xs z-50 flex items-center justify-center p-4 hidden">
    <div class="bg-white rounded-2xl max-w-lg w-full p-6 shadow-xl border border-slate-200 space-y-4">
      <div class="flex items-center justify-between border-b border-slate-100 pb-3">
        <h3 class="text-base font-black text-slate-800">+ إضافة مورد جديد</h3>
        <button onclick="closeModal('newSupplierModal')" class="text-slate-400 hover:text-slate-600 font-bold">&times;</button>
      </div>
      <form onsubmit="handleCreateSupplier(event)" class="space-y-4 text-xs">
        <div>
          <label class="block font-bold text-slate-700 mb-1">النشاط التابع له المورد:</label>
          <select id="supplier-entity" class="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl font-bold">
            <option value="restaurant">🍔 المطعم (موردي اللحوم والخضار)</option>
            <option value="farm">🌾 المزرعة (موردي الأسمدة والأعلاف)</option>
            <option value="barber">✂️ الحلاق (موردي الشفرات والمستحضرات)</option>
            <option value="law">🏢 شركة المحاماة (موردي القرطاسية والأنظمة)</option>
          </select>
        </div>
        <div>
          <label class="block font-bold text-slate-700 mb-1">اسم المورد / المؤسسة:*</label>
          <input type="text" id="supplier-name" required placeholder="مثال: شركة التموين الغذائي الحديثة" class="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl font-bold">
        </div>
        <div class="grid grid-cols-2 gap-3">
          <div>
            <label class="block font-bold text-slate-700 mb-1">رقم الهاتف:</label>
            <input type="text" id="supplier-phone" placeholder="011xxxxxxx" class="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl">
          </div>
          <div>
            <label class="block font-bold text-slate-700 mb-1">الرقم الضريبي للمورد:</label>
            <input type="text" id="supplier-vat" placeholder="310xxxxxxxxx" class="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl">
          </div>
        </div>
        <div class="flex items-center justify-end gap-3 pt-3 border-t border-slate-100">
          <button type="button" onclick="closeModal('newSupplierModal')" class="px-4 py-2 text-slate-500 font-bold">إلغاء</button>
          <button type="submit" class="gathern-gradient-btn text-white px-5 py-2.5 rounded-xl font-black">حفظ المورد</button>
        </div>
      </form>
    </div>
  </div>

  <!-- MODAL: ADD EMPLOYEE -->
  <div id="newEmployeeModal" class="fixed inset-0 bg-slate-900/50 backdrop-blur-xs z-50 flex items-center justify-center p-4 hidden">
    <div class="bg-white rounded-2xl max-w-lg w-full p-6 shadow-xl border border-slate-200 space-y-4">
      <div class="flex items-center justify-between border-b border-slate-100 pb-3">
        <h3 class="text-base font-black text-slate-800">+ إضافة موظف جديد</h3>
        <button onclick="closeModal('newEmployeeModal')" class="text-slate-400 hover:text-slate-600 font-bold">&times;</button>
      </div>
      <form onsubmit="handleCreateEmployee(event)" class="space-y-4 text-xs">
        <div>
          <label class="block font-bold text-slate-700 mb-1">النشاط التابع له الموظف:</label>
          <select id="emp-entity" class="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl font-bold">
            <option value="law">🏢 شركة المحاماة</option>
            <option value="restaurant">🍔 المطعم</option>
            <option value="farm">🌾 المزرعة</option>
            <option value="barber">✂️ الحلاق</option>
          </select>
        </div>
        <div>
          <label class="block font-bold text-slate-700 mb-1">الاسم الكامل للموظف:*</label>
          <input type="text" id="emp-name" required placeholder="مثال: عبدالعزيز الشمري" class="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl font-bold">
        </div>
        <div class="grid grid-cols-2 gap-3">
          <div>
            <label class="block font-bold text-slate-700 mb-1">المسمى الوظيفي:</label>
            <input type="text" id="emp-title" required placeholder="مثال: محاسب قانوني" class="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl">
          </div>
          <div>
            <label class="block font-bold text-slate-700 mb-1">رقم الهوية / الإقامة:</label>
            <input type="text" id="emp-nid" required placeholder="10xxxxxxxx" class="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl">
          </div>
        </div>
        <div class="grid grid-cols-2 gap-3">
          <div>
            <label class="block font-bold text-slate-700 mb-1">الراتب الأساسي (ر.س):*</label>
            <input type="number" id="emp-salary" required min="1000" step="100" value="5000" class="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl font-bold">
          </div>
          <div>
            <label class="block font-bold text-slate-700 mb-1">البدلات (سكن/مواصلات):</label>
            <input type="number" id="emp-allowance" min="0" step="50" value="1000" class="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl">
          </div>
        </div>
        <div class="flex items-center justify-end gap-3 pt-3 border-t border-slate-100">
          <button type="button" onclick="closeModal('newEmployeeModal')" class="px-4 py-2 text-slate-500 font-bold">إلغاء</button>
          <button type="submit" class="gathern-gradient-btn text-white px-5 py-2.5 rounded-xl font-black">حفظ الموظف</button>
        </div>
      </form>
    </div>
  </div>

  <!-- MODAL: ADD ASSET -->
  <div id="newAssetModal" class="fixed inset-0 bg-slate-900/50 backdrop-blur-xs z-50 flex items-center justify-center p-4 hidden">
    <div class="bg-white rounded-2xl max-w-lg w-full p-6 shadow-xl border border-slate-200 space-y-4">
      <div class="flex items-center justify-between border-b border-slate-100 pb-3">
        <h3 class="text-base font-black text-slate-800">+ إضافة أصل ثابت جديد</h3>
        <button onclick="closeModal('newAssetModal')" class="text-slate-400 hover:text-slate-600 font-bold">&times;</button>
      </div>
      <form onsubmit="handleCreateAsset(event)" class="space-y-4 text-xs">
        <div>
          <label class="block font-bold text-slate-700 mb-1">النشاط التابع له الأصل:</label>
          <select id="asset-entity" class="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl font-bold">
            <option value="restaurant">🍔 المطعم (أفران ومعدات طبخ)</option>
            <option value="farm">🌾 المزرعة (معدات ري وحصاد ومضخات)</option>
            <option value="barber">✂️ الحلاق (كراسي وأجهزة حلاقة)</option>
            <option value="law">🏢 شركة المحاماة (أجهزة حاسب وأثاث مكتبي)</option>
          </select>
        </div>
        <div>
          <label class="block font-bold text-slate-700 mb-1">اسم الأصل الثابت:*</label>
          <input type="text" id="asset-name" required placeholder="مثال: سيارة توصيل تويوتا هايلاكس" class="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl font-bold">
        </div>
        <div class="grid grid-cols-2 gap-3">
          <div>
            <label class="block font-bold text-slate-700 mb-1">تكلفة الشراء (ر.س):*</label>
            <input type="number" id="asset-cost" required min="100" step="100" value="85000" class="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl font-bold">
          </div>
          <div>
            <label class="block font-bold text-slate-700 mb-1">نسبة الإهلاك السنوي:</label>
            <select id="asset-rate" class="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl font-bold">
              <option value="20">20% (سيارات ومركبات - 5 سنوات)</option>
              <option value="15">15% (آلات ومعدات - 6.6 سنوات)</option>
              <option value="25">25% (أجهزة حاسب وتقنية - 4 سنوات)</option>
              <option value="10">10% (أثاث ومفروشات - 10 سنوات)</option>
            </select>
          </div>
        </div>
        <div class="flex items-center justify-end gap-3 pt-3 border-t border-slate-100">
          <button type="button" onclick="closeModal('newAssetModal')" class="px-4 py-2 text-slate-500 font-bold">إلغاء</button>
          <button type="submit" class="gathern-gradient-btn text-white px-5 py-2.5 rounded-xl font-black">إثبات الأصل وقيده</button>
        </div>
      </form>
    </div>
  </div>
`;

// Helper JavaScript for state, rendering, and actions for all modules
const modulesLogicJs = `
  // ================= EXTENDED ERP MODULES LOGIC =================
  // Initialize extended collections in state if missing
  function ensureExtendedState() {
    if (!state.clients) state.clients = [
      { id: 'CLI-001', name: 'شركة الفيصلية القابضة', entity: 'law', phone: '0501234567', vat: '300123456700003', balance: 12500, status: 'نشط' },
      { id: 'CLI-002', name: 'مجموعة الميرا للاستثمار', entity: 'law', phone: '0559876543', vat: '300987654300003', balance: 0, status: 'نشط' },
      { id: 'CLI-003', name: 'شركة الأغذية الطازجة', entity: 'restaurant', phone: '0543219876', vat: '300456789000003', balance: 4500, status: 'نشط' }
    ];
    if (!state.suppliers) state.suppliers = [
      { id: 'SUP-001', name: 'شركة التموين الزراعي والمواشي', entity: 'farm', phone: '0112345678', vat: '310456789000003', balance: 18000, status: 'معتمد' },
      { id: 'SUP-002', name: 'مؤسسة بهارات وتوابل الشرق', entity: 'restaurant', phone: '0119876543', vat: '310987654300003', balance: 6200, status: 'معتمد' },
      { id: 'SUP-003', name: 'شركة التجهيزات الرجالية والتعقيم', entity: 'barber', phone: '0115554433', vat: '310555443300003', balance: 1400, status: 'معتمد' }
    ];
    if (!state.employees) state.employees = [
      { id: 'EMP-001', name: 'أحمد محمود النادي', entity: 'law', title: 'رئيس حسابات أول', nid: '1088765432', salary: 12000, allowance: 2500, status: 'نشط' },
      { id: 'EMP-002', name: 'محمد عثمان بابكر', entity: 'law', title: 'المدير المالي العام CFO', nid: '1099876543', salary: 18000, allowance: 4000, status: 'نشط' },
      { id: 'EMP-003', name: 'شيف رضوان القحطاني', entity: 'restaurant', title: 'كبير الطهاة والمشرف', nid: '1077654321', salary: 7500, allowance: 1500, status: 'نشط' },
      { id: 'EMP-004', name: 'سالم الدوسري', entity: 'farm', title: 'مدير عمليات الري والإنتاج', nid: '1066543210', salary: 6000, allowance: 1000, status: 'نشط' }
    ];
    if (!state.fixedAssets) state.fixedAssets = [
      { id: 'AST-001', name: 'أفران ومعدات مطعم الشاورما الإيطالية', entity: 'restaurant', date: '2025-01-15', cost: 120000, rate: 15, accDep: 18000, bookValue: 102000 },
      { id: 'AST-002', name: 'شبكة ومضخات الري المحوري الذكية', entity: 'farm', date: '2024-06-10', cost: 240000, rate: 15, accDep: 45000, bookValue: 195000 },
      { id: 'AST-003', name: 'أجهزة حواسب وسيرفرات مكتب المحاماة', entity: 'law', date: '2025-03-01', cost: 65000, rate: 25, accDep: 12000, bookValue: 53000 }
    ];
    if (!state.quotes) state.quotes = [
      { id: 'QUO-000100', client: 'شركة حجاج للمحاماة', entity: 'law', date: '2026-10-21', validUntil: '2026-11-21', total: 15000, status: 'مبدئي' }
    ];
  }

  // --- Render Functions ---
  function renderClientsTable() {
    ensureExtendedState();
    const tbody = document.getElementById('clientsTableBody');
    if (!tbody) return;
    tbody.innerHTML = '';
    const q = (document.getElementById('clientSearchInput')?.value || '').toLowerCase().trim();
    
    let list = getFilteredList(state.clients);
    if (q) list = list.filter(c => c.name.toLowerCase().includes(q) || c.phone.includes(q) || (c.vat && c.vat.includes(q)));

    const countSpan = document.getElementById('clientsCountSpan');
    if (countSpan) countSpan.textContent = list.length;

    if (list.length === 0) {
      tbody.innerHTML = '<tr><td colspan="7" class="py-8 text-center text-slate-400 font-bold">لا يوجد عملاء مسجلين بهذا النشاط</td></tr>';
      return;
    }

    list.forEach(c => {
      const tr = document.createElement('tr');
      tr.className = 'hover:bg-slate-50/80 transition';
      tr.innerHTML = \`
        <td class="p-4 font-black text-slate-800">\${c.name}</td>
        <td class="p-4">\${ENTITY_BADGES[c.entity] || c.entity}</td>
        <td class="p-4 font-mono text-slate-600">\${c.phone || '-'}</td>
        <td class="p-4 font-mono text-slate-500">\${c.vat || '-'}</td>
        <td class="p-4 font-black \${c.balance > 0 ? 'text-amber-700' : 'text-emerald-700'}">\${formatSAR(c.balance)} ر.س</td>
        <td class="p-4"><span class="px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 text-[10px] font-bold">\${c.status}</span></td>
        <td class="p-4 text-center">
          <button onclick="openNewInvoiceModalForClient('\${c.name}', '\${c.entity}')" class="px-2.5 py-1 rounded-lg bg-purple-50 text-purple-700 hover:bg-purple-100 font-bold text-[11px] transition">+ فاتورة</button>
        </td>
      \`;
      tbody.appendChild(tr);
    });
  }

  function renderSuppliersTable() {
    ensureExtendedState();
    const tbody = document.getElementById('suppliersTableBody');
    if (!tbody) return;
    tbody.innerHTML = '';
    const list = getFilteredList(state.suppliers);

    if (list.length === 0) {
      tbody.innerHTML = '<tr><td colspan="7" class="py-8 text-center text-slate-400 font-bold">لا يوجد موردون مسجلون</td></tr>';
      return;
    }

    list.forEach(s => {
      const tr = document.createElement('tr');
      tr.className = 'hover:bg-slate-50/80 transition';
      tr.innerHTML = \`
        <td class="p-4 font-black text-slate-800">\${s.name}</td>
        <td class="p-4">\${ENTITY_BADGES[s.entity] || s.entity}</td>
        <td class="p-4 font-mono text-slate-600">\${s.phone || '-'}</td>
        <td class="p-4 font-mono text-slate-500">\${s.vat || '-'}</td>
        <td class="p-4 font-black text-rose-700">\${formatSAR(s.balance)} ر.س</td>
        <td class="p-4"><span class="px-2 py-0.5 rounded-full bg-blue-100 text-blue-800 text-[10px] font-bold">\${s.status}</span></td>
        <td class="p-4 text-center">
          <button onclick="openPaymentModalForSupplier('\${s.name}')" class="px-2.5 py-1 rounded-lg bg-emerald-50 text-emerald-700 hover:bg-emerald-100 font-bold text-[11px] transition">سداد سند</button>
        </td>
      \`;
      tbody.appendChild(tr);
    });
  }

  function renderEmployeesTable() {
    ensureExtendedState();
    const tbody = document.getElementById('employeesTableBody');
    if (!tbody) return;
    tbody.innerHTML = '';
    const list = getFilteredList(state.employees);

    let totalSal = 0;
    list.forEach(e => totalSal += (e.salary + (e.allowance || 0)));
    const totCount = document.getElementById('totalEmployeesCount');
    const totSpan = document.getElementById('totalSalariesSpan');
    if (totCount) totCount.textContent = list.length;
    if (totSpan) totSpan.textContent = formatSAR(totalSal) + ' ر.س';

    if (list.length === 0) {
      tbody.innerHTML = '<tr><td colspan="9" class="py-8 text-center text-slate-400 font-bold">لا يوجد موظفون مسجلون</td></tr>';
      return;
    }

    list.forEach(e => {
      const net = (e.salary || 0) + (e.allowance || 0);
      const tr = document.createElement('tr');
      tr.className = 'hover:bg-slate-50/80 transition';
      tr.innerHTML = \`
        <td class="p-4 font-black text-slate-800">\${e.name}</td>
        <td class="p-4">\${ENTITY_BADGES[e.entity] || e.entity}</td>
        <td class="p-4 font-bold text-slate-600">\${e.title}</td>
        <td class="p-4 font-mono text-slate-500">\${e.nid}</td>
        <td class="p-4 font-black text-slate-800">\${formatSAR(e.salary)} ر.س</td>
        <td class="p-4 font-semibold text-slate-500">\${formatSAR(e.allowance || 0)} ر.س</td>
        <td class="p-4 font-black text-purple-900">\${formatSAR(net)} ر.س</td>
        <td class="p-4"><span class="px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 text-[10px] font-bold">\${e.status}</span></td>
        <td class="p-4 text-center">
          <button onclick="showToast('تم إرسال قسيمة راتب للموظف \${e.name}', 'success')" class="px-2 py-1 rounded bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-[10px]">قسيمة راتب</button>
        </td>
      \`;
      tbody.appendChild(tr);
    });
  }

  function renderFixedAssetsTable() {
    ensureExtendedState();
    const tbody = document.getElementById('fixedAssetsTableBody');
    if (!tbody) return;
    tbody.innerHTML = '';
    const list = getFilteredList(state.fixedAssets);

    if (list.length === 0) {
      tbody.innerHTML = '<tr><td colspan="9" class="py-8 text-center text-slate-400 font-bold">لا توجد أصول ثابتة مسجلة</td></tr>';
      return;
    }

    list.forEach(a => {
      const tr = document.createElement('tr');
      tr.className = 'hover:bg-slate-50/80 transition';
      tr.innerHTML = \`
        <td class="p-4 font-black text-purple-800 font-mono">\${a.id}</td>
        <td class="p-4 font-bold text-slate-800">\${a.name}</td>
        <td class="p-4">\${ENTITY_BADGES[a.entity] || a.entity}</td>
        <td class="p-4 text-slate-500">\${a.date}</td>
        <td class="p-4 font-black text-slate-900">\${formatSAR(a.cost)} ر.س</td>
        <td class="p-4 font-bold text-slate-600">\${a.rate}% سنوي</td>
        <td class="p-4 font-bold text-rose-700">\${formatSAR(a.accDep)} ر.س</td>
        <td class="p-4 font-black text-emerald-700">\${formatSAR(a.bookValue)} ر.س</td>
        <td class="p-4 text-center">
          <button onclick="calculateAssetDepreciation('\${a.id}')" class="px-2.5 py-1 rounded-lg bg-purple-50 text-purple-700 hover:bg-purple-100 font-bold text-[11px] transition">قيد إهلاك</button>
        </td>
      \`;
      tbody.appendChild(tr);
    });
  }

  function renderQuotesTable() {
    ensureExtendedState();
    const tbody = document.getElementById('quotesTableBody');
    if (!tbody) return;
    tbody.innerHTML = '';
    const list = getFilteredList(state.quotes);

    if (list.length === 0) {
      tbody.innerHTML = '<tr><td colspan="8" class="py-8 text-center text-slate-400 font-bold">لا توجد عروض أسعار مسجلة حالياً</td></tr>';
      return;
    }

    list.forEach(q => {
      const tr = document.createElement('tr');
      tr.className = 'hover:bg-slate-50/80 transition';
      tr.innerHTML = \`
        <td class="p-4 font-black text-purple-800 font-mono">\${q.id}</td>
        <td class="p-4 font-bold text-slate-800">\${q.client}</td>
        <td class="p-4">\${ENTITY_BADGES[q.entity] || q.entity}</td>
        <td class="p-4 text-slate-500">\${q.date}</td>
        <td class="p-4 text-slate-500">\${q.validUntil}</td>
        <td class="p-4 font-black text-slate-900">\${formatSAR(q.total)} ر.س</td>
        <td class="p-4"><span class="px-2 py-0.5 rounded-full bg-amber-100 text-amber-800 text-[10px] font-bold">\${q.status}</span></td>
        <td class="p-4 text-center">
          <button onclick="convertQuoteToInvoice('\${q.id}')" class="px-2.5 py-1 rounded-lg bg-emerald-50 text-emerald-700 hover:bg-emerald-100 font-bold text-[11px] transition">تحويل لفاتورة ✓</button>
        </td>
      \`;
      tbody.appendChild(tr);
    });
  }

  // --- Handlers & Helpers ---
  function openNewClientModal() { openModal('newClientModal'); }
  function handleCreateClient(e) {
    e.preventDefault();
    ensureExtendedState();
    const entity = document.getElementById('client-entity').value;
    const name = document.getElementById('client-name').value.trim();
    const phone = document.getElementById('client-phone').value.trim();
    const vat = document.getElementById('client-vat').value.trim();

    state.clients.unshift({
      id: 'CLI-' + String(state.clients.length + 101),
      name, entity, phone, vat, balance: 0, status: 'نشط'
    });
    saveState();
    closeModal('newClientModal');
    renderClientsTable();
    showToast('تمت إضافة العميل بنجاح!', 'success');
  }

  function openNewSupplierModal() { openModal('newSupplierModal'); }
  function handleCreateSupplier(e) {
    e.preventDefault();
    ensureExtendedState();
    const entity = document.getElementById('supplier-entity').value;
    const name = document.getElementById('supplier-name').value.trim();
    const phone = document.getElementById('supplier-phone').value.trim();
    const vat = document.getElementById('supplier-vat').value.trim();

    state.suppliers.unshift({
      id: 'SUP-' + String(state.suppliers.length + 101),
      name, entity, phone, vat, balance: 0, status: 'معتمد'
    });
    saveState();
    closeModal('newSupplierModal');
    renderSuppliersTable();
    showToast('تمت إضافة المورد بنجاح!', 'success');
  }

  function openNewEmployeeModal() { openModal('newEmployeeModal'); }
  function handleCreateEmployee(e) {
    e.preventDefault();
    ensureExtendedState();
    const entity = document.getElementById('emp-entity').value;
    const name = document.getElementById('emp-name').value.trim();
    const title = document.getElementById('emp-title').value.trim();
    const nid = document.getElementById('emp-nid').value.trim();
    const salary = parseFloat(document.getElementById('emp-salary').value) || 0;
    const allowance = parseFloat(document.getElementById('emp-allowance').value) || 0;

    state.employees.unshift({
      id: 'EMP-' + String(state.employees.length + 101),
      name, entity, title, nid, salary, allowance, status: 'نشط'
    });
    saveState();
    closeModal('newEmployeeModal');
    renderEmployeesTable();
    showToast('تمت إضافة الموظف الجديد بنجاح!', 'success');
  }

  function openNewAssetModal() { openModal('newAssetModal'); }
  function handleCreateAsset(e) {
    e.preventDefault();
    ensureExtendedState();
    const entity = document.getElementById('asset-entity').value;
    const name = document.getElementById('asset-name').value.trim();
    const cost = parseFloat(document.getElementById('asset-cost').value) || 0;
    const rate = parseFloat(document.getElementById('asset-rate').value) || 20;
    const date = new Date().toISOString().substring(0, 10);

    const assetId = 'AST-' + String(state.fixedAssets.length + 101);
    state.fixedAssets.unshift({
      id: assetId,
      name, entity, date, cost, rate, accDep: 0, bookValue: cost
    });

    // Create journal entry for asset capitalization
    state.journals.unshift({
      id: 'JRN-' + String(state.journals.length + 1).padStart(3, '0'),
      date, entity,
      desc: 'إثبات شراء أصل ثابت: ' + name,
      debit: '1105 - أصول وممتلكات ومعدات',
      credit: '1002 - مصرف الراجحي',
      amount: cost,
      status: 'متزن'
    });

    saveState();
    closeModal('newAssetModal');
    renderFixedAssetsTable();
    showToast('تم إثبات الأصل الثابت وترحيل القيد بنجاح!', 'success');
  }

  function calculateAssetDepreciation(assetId) {
    ensureExtendedState();
    const a = state.fixedAssets.find(x => x.id === assetId);
    if (!a) return;
    const annualDep = (a.cost * a.rate) / 100;
    a.accDep += annualDep;
    a.bookValue = Math.max(0, a.cost - a.accDep);

    state.journals.unshift({
      id: 'JRN-' + String(state.journals.length + 1).padStart(3, '0'),
      date: new Date().toISOString().substring(0, 10),
      entity: a.entity,
      desc: 'قيد إهلاك دوري للأصل: ' + a.name,
      debit: '5201 - مصروفات الإهلاك',
      credit: '1106 - مجمع إهلاك الأصول الثابتة',
      amount: annualDep,
      status: 'متزن'
    });

    saveState();
    renderFixedAssetsTable();
    showToast('تم حساب وترحيل قيد إهلاك الأصل ' + a.name + ' بمبلغ ' + formatSAR(annualDep) + ' ر.س', 'success');
  }

  function openRunPayrollModal() {
    ensureExtendedState();
    let totalSal = 0;
    state.employees.forEach(e => totalSal += (e.salary + (e.allowance || 0)));

    if (!confirm('هل ترغب في اعتماد وترحيل مسير رواتب الشهر الحالي بإجمالي (' + formatSAR(totalSal) + ' ر.س)؟')) return;

    state.journals.unshift({
      id: 'JRN-' + String(state.journals.length + 1).padStart(3, '0'),
      date: new Date().toISOString().substring(0, 10),
      entity: 'all',
      desc: 'ترحيل مسير الرواتب الشهري لحماية الأجور WPS',
      debit: '5101 - مصروفات الرواتب والأجور',
      credit: '1002 - مصرف الراجحي (تحويل رواتب)',
      amount: totalSal,
      status: 'متزن'
    });
    if (state.treasury && state.treasury.rajhi) state.treasury.rajhi -= totalSal;

    saveState();
    renderAll();
    showToast('تم ترحيل مسير الرواتب وخصمه من الحساب البنكي بنجاح!', 'success');
  }

  function openNewQuoteModal() {
    openNewInvoiceModal();
    const docType = document.getElementById('studio-doc-type');
    if (docType) {
      docType.value = 'quotation';
      updateStudioDocType();
    }
  }

  function convertQuoteToInvoice(quoteId) {
    ensureExtendedState();
    const q = state.quotes.find(x => x.id === quoteId);
    if (!q) return;

    q.status = 'تم التحويل لفاتورة';
    const newId = 'INV-2026-' + String(state.invoices.length + 1).padStart(3, '0');
    state.invoices.unshift({
      id: newId,
      entity: q.entity,
      client: q.client,
      date: new Date().toISOString().substring(0, 10),
      dueDate: new Date().toISOString().substring(0, 10),
      subtotal: q.total / 1.15,
      vat: q.total - (q.total / 1.15),
      total: q.total,
      method: 'تحويل بنكي',
      status: 'unpaid',
      item: 'خدمات محولة من عرض سعر رقم ' + quoteId
    });

    saveState();
    renderQuotesTable();
    showToast('تم تحويل عرض السعر إلى فاتورة بيع رقم (' + newId + ') بنجاح!', 'success');
    switchView('invoices');
  }

  function openNewInvoiceModalForClient(clientName, entity) {
    openNewInvoiceModal();
    const cInput = document.getElementById('studio-client');
    const eInput = document.getElementById('studio-entity');
    if (cInput) cInput.value = clientName;
    if (eInput) { eInput.value = entity; onStudioEntityChange(); }
    renderStudioLivePreview();
  }

  function openPaymentModalForSupplier(supplierName) {
    openPaymentModal();
    const payee = document.getElementById('payment-payee');
    if (payee) payee.value = supplierName;
  }
`;

console.log('Script prepared. Now integrating into public and web files...');
fs.writeFileSync('scripts/views_bundle.js', JSON.stringify({
  views: [viewClientsHtml, viewQuotesHtml, viewSuppliersHtml, viewPayrollHtml, viewFixedAssetsHtml, viewHelpHtml].join('\n'),
  modals: helperModalsHtml,
  logic: modulesLogicJs
}), 'utf8');
console.log('views_bundle.js written successfully.');
