'use strict';
const fs = require('fs');

const files = ['public/index.html', 'web/index.html'];

// Complete Modern Real-Time Invoice/Quote Studio Modal matching the user screenshot
const invoiceStudioModalHtml = `
  <!-- ================= MODERN PRO INVOICE & QUOTE STUDIO (استوديو الفواتير وعروض الأسعار التفاعلي المتكامل) ================= -->
  <div id="newInvoiceModal" class="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-2 sm:p-4 hidden overflow-y-auto">
    <div class="bg-[#f8f9fc] rounded-3xl w-full max-w-7xl shadow-2xl border border-slate-200/90 flex flex-col max-h-[96vh] overflow-hidden">
      
      <!-- Studio Header Bar matching screenshot -->
      <header class="bg-white px-6 py-3.5 border-b border-slate-200 flex items-center justify-between shrink-0 shadow-xs">
        <div class="flex items-center gap-3">
          <button onclick="closeModal('newInvoiceModal')" class="w-8 h-8 rounded-full hover:bg-slate-100 flex items-center justify-center text-slate-400 hover:text-slate-700 font-bold transition">
            ✕
          </button>
          <div class="h-5 w-px bg-slate-200"></div>
          <h2 id="studioModalTitle" class="text-base font-extrabold text-slate-800 flex items-center gap-2">
            <span>إنشاء فاتورة مبيعات / عرض سعر</span>
          </h2>
        </div>

        <div class="flex items-center gap-2 sm:gap-3">
          <span class="text-xs font-bold text-slate-500 hover:text-purple-700 cursor-pointer hidden md:inline">English</span>
          <button type="button" onclick="triggerLogoUpload()" class="px-3 py-1.5 rounded-xl border border-slate-200 hover:bg-slate-50 text-slate-700 font-bold text-xs flex items-center gap-1.5 transition">
            <svg class="w-3.5 h-3.5 text-purple-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"></path></svg>
            <span>شعار الفاتورة (Logo)</span>
          </button>
          <input type="file" id="customLogoFileInput" accept="image/*" class="hidden" onchange="handleCustomLogoUpload(event)">
          
          <button type="button" onclick="printStudioInvoice()" class="px-3 py-1.5 rounded-xl border border-slate-200 hover:bg-slate-50 text-slate-700 font-bold text-xs flex items-center gap-1.5 transition">
            <svg class="w-3.5 h-3.5 text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z"></path></svg>
            <span class="hidden sm:inline">طباعة / تنزيل</span>
          </button>
          
          <button type="button" onclick="toggleStudioLivePreview()" class="px-3 py-1.5 rounded-xl border border-slate-200 hover:bg-slate-50 text-slate-700 font-bold text-xs flex items-center gap-1.5 transition">
            <svg class="w-3.5 h-3.5 text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"></path><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"></path></svg>
            <span id="previewToggleText">معاينة حية</span>
          </button>

          <button type="button" onclick="document.getElementById('studioInvoiceForm').requestSubmit()" class="px-4 py-2 rounded-xl bg-purple-700 hover:bg-purple-800 text-white font-black text-xs shadow-md shadow-purple-500/20 transition flex items-center gap-1.5">
            <span>حفظ ثم إرسال</span>
          </button>
        </div>
      </header>

      <!-- Main Studio 2-Column Split: Right Editor & Left Real-time Live Document -->
      <div class="flex-1 flex flex-col lg:flex-row overflow-y-auto">
        
        <!-- RIGHT PANEL: Full Interactive Invoice / Quote Editor -->
        <div class="flex-1 p-6 md:p-8 space-y-6 overflow-y-auto">
          <form id="studioInvoiceForm" onsubmit="handleStudioSaveInvoice(event)" class="space-y-6">
            
            <!-- Document Type & Number Row -->
            <div class="flex flex-wrap items-center justify-between gap-4 bg-white p-5 rounded-2xl border border-slate-200 shadow-xs">
              <div class="flex items-center gap-3">
                <span class="text-xs font-bold text-slate-500">نوع المستند:</span>
                <select id="studio-doc-type" onchange="updateStudioDocType()" class="px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-xl font-black text-xs text-purple-900 focus:outline-none focus:ring-2 focus:ring-purple-600">
                  <option value="tax_invoice">🧾 فاتورة ضريبية رسمية (Tax Invoice)</option>
                  <option value="simplified_invoice">🧾 فاتورة ضريبية مبسطة (B2C)</option>
                  <option value="proforma">📄 فاتورة مبدئية (Proforma Invoice)</option>
                  <option value="quotation">📊 عرض سعر رسمي (Quotation)</option>
                </select>
              </div>

              <div class="flex items-center gap-2">
                <span class="text-xs font-bold text-slate-400">رقم المرجع:</span>
                <input type="text" id="studio-doc-number" value="INV-2026-001" oninput="renderStudioLivePreview()" class="px-3 py-1 bg-slate-50 border border-slate-200 rounded-lg text-xs font-black text-purple-700 text-left uppercase">
              </div>
            </div>

            <!-- Header Entity, Client, and Dates Selection -->
            <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
              
              <!-- جهة الإصدار / المنشأة -->
              <div class="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs space-y-2">
                <div class="flex items-center justify-between">
                  <label class="text-xs font-black text-slate-700">جهة الإصدار (المنشأة)*</label>
                  <span class="text-[10px] text-purple-700 font-bold bg-purple-50 px-2 py-0.5 rounded-md">معتمدة بالرقم الضريبي</span>
                </div>
                <select id="studio-entity" onchange="onStudioEntityChange()" class="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl font-bold text-xs text-slate-800 focus:outline-none focus:ring-2 focus:ring-purple-600">
                  <option value="law">شركة حجاج للمحاماة والاستشارات القانونية (1010987654)</option>
                  <option value="restaurant">مطعم مذاق البخاري والشاورما (1010765432)</option>
                  <option value="farm">مزرعة الواحة الخضراء للمنتجات الزراعية (1010543210)</option>
                  <option value="barber">صالون الأناقة الرجالي (1010432109)</option>
                  <option value="home">الذمة المالية الشخصية والمنزلية</option>
                </select>
                <div id="studio-entity-details" class="text-[11px] text-slate-400 font-medium pt-1">
                  طريق الملك عبدالله، الرياض • الرقم الضريبي: 310123456700003
                </div>
              </div>

              <!-- العميل والتواريخ -->
              <div class="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs space-y-3">
                <div>
                  <div class="flex items-center justify-between mb-1">
                    <label class="text-xs font-black text-slate-700">العميل / المستفيد*</label>
                    <span class="text-[10px] text-slate-400">اسم المنشأة أو الفرد</span>
                  </div>
                  <input type="text" id="studio-client" required placeholder="مثال: شركة الفيصلية للاستثمار والتطوير" oninput="renderStudioLivePreview()" class="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-purple-600">
                </div>

                <div class="grid grid-cols-2 gap-3 pt-1">
                  <div>
                    <label class="block text-[11px] font-bold text-slate-500 mb-1">تاريخ الإصدار*</label>
                    <input type="date" id="studio-date" required onchange="renderStudioLivePreview()" class="w-full p-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-700">
                  </div>
                  <div>
                    <label class="block text-[11px] font-bold text-slate-500 mb-1">تاريخ الاستحقاق*</label>
                    <input type="date" id="studio-due-date" required onchange="renderStudioLivePreview()" class="w-full p-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-700">
                  </div>
                </div>
              </div>
            </div>

            <!-- Payment & Template Controls Bar -->
            <div class="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs flex flex-wrap items-center justify-between gap-4 text-xs font-bold">
              <div class="flex items-center gap-3">
                <span class="text-slate-500">قالب وشكل الفاتورة:</span>
                <select id="studio-template" onchange="renderStudioLivePreview()" class="px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-xl text-purple-700 font-extrabold focus:outline-none">
                  <option value="modern_purple">🎨 قالب قـيـد البنفسجي الحديث (Modern Purple)</option>
                  <option value="clean_corporate">🏢 قالب الشركات الرسمي النظيف (Corporate Clean)</option>
                  <option value="zatca_standard">🇸🇦 قالب ZATCA المعتمد ثنائي اللغة</option>
                  <option value="minimalist_classic">📜 قالب كلاسيكي بسيط (Minimalist)</option>
                </select>
              </div>

              <div class="flex items-center gap-3">
                <span class="text-slate-500">حالة السداد:</span>
                <select id="studio-status" onchange="renderStudioLivePreview()" class="px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-xl font-black text-xs">
                  <option value="paid">✅ مسددة (مدفوعة بالكامل)</option>
                  <option value="unpaid">⏳ غير مسددة (آجلة / مستحقة)</option>
                  <option value="pending">⚠️ معلقة بانتظار التحصيل</option>
                </select>
              </div>

              <div class="flex items-center gap-2">
                <span class="text-slate-500">العملة:</span>
                <span class="px-2 py-1 bg-purple-50 text-purple-700 rounded-lg text-xs font-black">SAR (ر.س)</span>
              </div>
            </div>

            <!-- Multi-line Items Grid (جدول بنود الفاتورة المتعددة المتكامل) -->
            <div class="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
              <div class="p-4 bg-slate-50/80 border-b border-slate-200 flex items-center justify-between">
                <div>
                  <h3 class="text-xs font-extrabold text-slate-800">بنود وسلع وخدمات الفاتورة</h3>
                  <p class="text-[11px] text-slate-400 font-medium">أضف البنود والكميات والأسعار وسيتم احتساب ضريبة القيمة المضافة 15% آلياً</p>
                </div>
                <button type="button" onclick="addStudioInvoiceRow()" class="px-3 py-1.5 bg-purple-50 hover:bg-purple-100 text-purple-700 border border-purple-200 rounded-xl text-xs font-black flex items-center gap-1.5 transition">
                  <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4"></path></svg>
                  <span>+ إضافة بند جديد</span>
                </button>
              </div>

              <div class="overflow-x-auto">
                <table class="w-full text-right text-xs">
                  <thead class="bg-slate-50 text-slate-400 font-extrabold border-b border-slate-200">
                    <tr>
                      <th class="p-3 w-8 text-center">#</th>
                      <th class="p-3 min-w-[220px]">الوصف والبيان (Description)</th>
                      <th class="p-3 w-28 text-center">الكمية</th>
                      <th class="p-3 w-32">السعر (ر.س)</th>
                      <th class="p-3 w-28">الضريبة</th>
                      <th class="p-3 w-32">الإجمالي</th>
                      <th class="p-3 w-12 text-center"></th>
                    </tr>
                  </thead>
                  <tbody id="studioItemsTableBody" class="divide-y divide-slate-100 font-medium">
                    <!-- Dynamic Rows populated by JS -->
                  </tbody>
                </table>
              </div>

              <!-- Quick Subtotal & VAT Summary inside editor -->
              <div class="p-5 bg-slate-50 border-t border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-4 text-xs font-bold">
                <div class="text-slate-500">
                  عدد البنود: <span id="studioItemsCount" class="text-purple-700 font-black">1</span> بند
                </div>
                <div class="flex items-center gap-6">
                  <div>قبل الضريبة: <span id="studioEditorSubtotal" class="text-slate-800 font-black">0.00</span> ر.س</div>
                  <div>ضريبة 15%: <span id="studioEditorVat" class="text-slate-800 font-black">0.00</span> ر.س</div>
                  <div class="text-sm font-black text-purple-800 bg-purple-100/60 px-3 py-1.5 rounded-xl">
                    الإجمالي النهائي: <span id="studioEditorGrand">0.00</span> ر.س
                  </div>
                </div>
              </div>
            </div>

            <!-- Notes & Terms -->
            <div class="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs space-y-2">
              <label class="text-xs font-black text-slate-700">شروط وأحكام الفاتورة / معلومات التحويل البنكي:</label>
              <textarea id="studio-terms" rows="2" oninput="renderStudioLivePreview()" class="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-700 focus:outline-none" placeholder="التحويل لحساب الآيبان: SA0380000201608010100000 - مصرف الراجحي"></textarea>
            </div>

            <div class="flex items-center justify-end gap-3 pt-4 border-t border-slate-200">
              <button type="button" onclick="closeModal('newInvoiceModal')" class="px-5 py-2.5 rounded-xl border border-slate-200 text-slate-600 hover:bg-slate-100 font-bold text-xs transition">
                إلغاء
              </button>
              <button type="submit" class="px-6 py-2.5 rounded-xl bg-purple-700 hover:bg-purple-800 text-white font-black text-xs shadow-lg shadow-purple-500/25 transition">
                اعتماد وحفظ الفاتورة
              </button>
            </div>
          </form>
        </div>

        <!-- LEFT PANEL: High Fidelity Live Paper Document Preview matching Screenshot -->
        <div id="studioLivePreviewContainer" class="w-full lg:w-[500px] xl:w-[540px] bg-slate-100/70 p-6 border-t lg:border-t-0 lg:border-r border-slate-200 shrink-0 flex flex-col items-center justify-start overflow-y-auto">
          
          <div class="w-full flex items-center justify-between mb-3 text-xs font-bold text-slate-500">
            <span>المعاينة المباشرة (A4 Paper Preview)</span>
            <span class="text-[10px] bg-white border border-slate-200 px-2 py-0.5 rounded-md shadow-xs">محدث تلقائياً</span>
          </div>

          <!-- The Real Paper Sheet (A4 Styled Document) -->
          <div id="studioPaperDocument" class="w-full bg-white rounded-xl shadow-lg border border-slate-200/80 p-8 min-h-[640px] flex flex-col justify-between text-slate-800 font-cairo transition duration-200">
            
            <!-- Top Document Header -->
            <div class="space-y-6">
              <div class="flex items-start justify-between border-b border-slate-100 pb-5">
                
                <!-- Logo & Entity Details -->
                <div class="space-y-2">
                  <div class="h-14 w-auto flex items-center">
                    <img id="studioPreviewLogo" src="/logo.png" alt="شعار المنشأة" class="max-h-14 max-w-[150px] object-contain">
                  </div>
                  <div>
                    <h4 id="previewEntityName" class="font-extrabold text-xs text-slate-900 leading-snug">شركة حجاج للمحاماة والاستشارات</h4>
                    <p id="previewEntityEnName" class="text-[10px] text-slate-400 font-sans">Hajjaj Legal Firm & Consultations</p>
                    <p id="previewEntityCR" class="text-[10px] text-slate-500 font-semibold mt-0.5">س.ت: 1010987654 | ر.ض: 310123456700003</p>
                  </div>
                </div>

                <!-- Document Title & Details -->
                <div class="text-left space-y-1">
                  <h3 id="previewDocTitleAr" class="text-lg font-black text-slate-900">فاتورة ضريبية</h3>
                  <div id="previewDocTitleEn" class="text-xs text-slate-400 font-sans font-bold uppercase tracking-wider">Tax Invoice</div>
                  
                  <div class="pt-2 text-[10px] space-y-0.5 text-slate-500">
                    <div>رقم الفاتورة: <span id="previewDocNum" class="font-black text-slate-800 font-mono">INV-2026-001</span></div>
                    <div>التاريخ: <span id="previewDocDate" class="font-bold text-slate-700">2026-10-21</span></div>
                  </div>
                </div>
              </div>

              <!-- Bill To & Payment Status Banner -->
              <div class="flex items-center justify-between bg-slate-50/80 p-3.5 rounded-xl border border-slate-100 text-xs">
                <div>
                  <span class="text-[10px] font-bold text-slate-400 block">العميل / Bill To:</span>
                  <span id="previewClientName" class="font-black text-slate-800 text-xs">شركة الفيصلية للاستثمار</span>
                </div>
                <div id="previewStatusBadge">
                  <span class="px-2.5 py-1 rounded-full bg-emerald-100 text-emerald-800 font-black text-[10px]">مسددة ✓</span>
                </div>
              </div>

              <!-- Items Table in Preview -->
              <div class="overflow-hidden border border-slate-200 rounded-lg">
                <table class="w-full text-right text-[11px]">
                  <thead class="bg-slate-50 text-slate-500 font-black border-b border-slate-200">
                    <tr>
                      <th class="p-2 w-6 text-center">#</th>
                      <th class="p-2">الوصف (Description)</th>
                      <th class="p-2 text-center w-12">الكمية</th>
                      <th class="p-2 w-16">السعر</th>
                      <th class="p-2 w-16 text-left">الإجمالي</th>
                    </tr>
                  </thead>
                  <tbody id="previewItemsTbody" class="divide-y divide-slate-100">
                    <!-- Populated via live preview -->
                  </tbody>
                </table>
              </div>

              <!-- Live Totals Block & ZATCA QR -->
              <div class="flex items-end justify-between pt-2">
                <!-- ZATCA QR Code Preview -->
                <div class="flex flex-col items-center gap-1">
                  <div id="studioLiveQrContainer" class="p-1.5 bg-white border border-slate-200 rounded-lg shadow-2xs"></div>
                  <span class="text-[9px] font-bold text-slate-400">هيئة الزكاة والضريبة ZATCA</span>
                </div>

                <!-- Totals Breakdown -->
                <div class="w-48 space-y-1.5 text-xs text-left">
                  <div class="flex justify-between text-slate-500 font-semibold">
                    <span>المجموع الفرعي:</span>
                    <span id="previewSubtotal">0.00 ر.س</span>
                  </div>
                  <div class="flex justify-between text-slate-500 font-semibold">
                    <span>ضريبة القيمة المضافة (15%):</span>
                    <span id="previewVat">0.00 ر.س</span>
                  </div>
                  <div class="h-px bg-slate-200 my-1"></div>
                  <div class="flex justify-between text-sm font-black text-slate-900">
                    <span>الإجمالي الكلي:</span>
                    <span id="previewGrandTotal" class="text-purple-900 font-black">0.00 ر.س</span>
                  </div>
                </div>
              </div>
            </div>

            <!-- Footer Notes -->
            <div class="border-t border-slate-100 pt-4 mt-6 text-[10px] text-slate-400 flex items-center justify-between">
              <span id="previewFooterTerms">شكراً لتعاملكم معنا • نظام قـيـد المحاسبي المتكامل</span>
              <span>صفحة 1 من 1</span>
            </div>

          </div>
        </div>

      </div>
    </div>
  </div>
`;

// Helper JavaScript functions to inject into public and web index.html
const studioScripts = `
  // ================= MODERN INVOICE STUDIO SCRIPTS =================
  let studioRows = [
    { desc: 'أتعاب استشارات وتراخيص نظامية', qty: 1, price: 5000 }
  ];

  let currentCustomLogo = localStorage.getItem('qoyod_custom_invoice_logo') || '/logo.png';

  function triggerLogoUpload() {
    const fileInput = document.getElementById('customLogoFileInput');
    if (fileInput) fileInput.click();
  }

  function handleCustomLogoUpload(event) {
    const file = event.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = function(e) {
      currentCustomLogo = e.target.result;
      localStorage.setItem('qoyod_custom_invoice_logo', currentCustomLogo);
      const img = document.getElementById('studioPreviewLogo');
      if (img) img.src = currentCustomLogo;
      showToast('تم تحديث شعار الفاتورة بنجاح!', 'success');
      renderStudioLivePreview();
    };
    reader.readAsDataURL(file);
  }

  function toggleStudioLivePreview() {
    const p = document.getElementById('studioLivePreviewContainer');
    const txt = document.getElementById('previewToggleText');
    if (!p) return;
    if (p.classList.contains('hidden')) {
      p.classList.remove('hidden');
      if (txt) txt.textContent = 'إخفاء المعاينة';
    } else {
      p.classList.add('hidden');
      if (txt) txt.textContent = 'إظهار المعاينة';
    }
  }

  function updateStudioDocType() {
    const type = document.getElementById('studio-doc-type').value;
    const titleAr = document.getElementById('previewDocTitleAr');
    const titleEn = document.getElementById('previewDocTitleEn');
    const numInput = document.getElementById('studio-doc-number');

    if (type === 'quotation') {
      if (titleAr) titleAr.textContent = 'عرض سعر';
      if (titleEn) titleEn.textContent = 'QUOTATION';
      if (numInput && !numInput.value.startsWith('QUO-')) numInput.value = 'QUO-000100';
    } else if (type === 'proforma') {
      if (titleAr) titleAr.textContent = 'فاتورة مبدئية';
      if (titleEn) titleEn.textContent = 'PROFORMA INVOICE';
      if (numInput && !numInput.value.startsWith('PRO-')) numInput.value = 'PRO-000100';
    } else {
      if (titleAr) titleAr.textContent = 'فاتورة ضريبية';
      if (titleEn) titleEn.textContent = 'TAX INVOICE';
      if (numInput && (numInput.value.startsWith('QUO-') || numInput.value.startsWith('PRO-'))) numInput.value = 'INV-2026-' + String(state.invoices.length + 1).padStart(3, '0');
    }
    renderStudioLivePreview();
  }

  function onStudioEntityChange() {
    const entity = document.getElementById('studio-entity').value;
    const details = document.getElementById('studio-entity-details');
    const entityInfo = {
      law: { ar: 'شركة حجاج للمحاماة والاستشارات القانونية', en: 'Hajjaj Law & Legal Consultations', cr: '1010987654', vat: '310123456700003', addr: 'طريق الملك عبدالله، الرياض' },
      restaurant: { ar: 'مطعم مذاق البخاري والشاورما', en: 'Mazaq Al Bukhari Restaurant', cr: '1010765432', vat: '310987654300003', addr: 'شارع التحلية، الرياض' },
      farm: { ar: 'مزرعة الواحة الخضراء للمنتجات الزراعية', en: 'Green Oasis Farm', cr: '1010543210', vat: '310654321000003', addr: 'الخرج، منطقة الرياض' },
      barber: { ar: 'صالون الأناقة الرجالي', en: 'Elegance Men Salon', cr: '1010432109', vat: '310432109800003', addr: 'حي الياسمين، الرياض' },
      home: { ar: 'الذمة المالية الشخصية والمنزلية', en: 'Personal Household', cr: 'خاص', vat: 'غير خاضع', addr: 'الرياض' }
    };

    const cur = entityInfo[entity] || entityInfo.law;
    if (details) details.textContent = \`\${cur.addr} • الرقم الضريبي: \${cur.vat}\`;
    renderStudioLivePreview();
  }

  function addStudioInvoiceRow() {
    studioRows.push({ desc: '', qty: 1, price: 0 });
    renderStudioEditorRows();
    renderStudioLivePreview();
  }

  function removeStudioInvoiceRow(index) {
    if (studioRows.length <= 1) {
      showToast('يجب أن تحتوي الفاتورة على بند واحد على الأقل', 'error');
      return;
    }
    studioRows.splice(index, 1);
    renderStudioEditorRows();
    renderStudioLivePreview();
  }

  function updateStudioRow(index, field, value) {
    if (field === 'qty' || field === 'price') {
      studioRows[index][field] = parseFloat(value) || 0;
    } else {
      studioRows[index][field] = value;
    }
    calculateStudioTotals();
    renderStudioLivePreview();
  }

  function renderStudioEditorRows() {
    const tbody = document.getElementById('studioItemsTableBody');
    if (!tbody) return;
    tbody.innerHTML = '';

    studioRows.forEach((row, i) => {
      const tr = document.createElement('tr');
      tr.className = 'hover:bg-slate-50/50 transition';
      const rowTotal = (row.qty || 0) * (row.price || 0) * 1.15;

      tr.innerHTML = \`
        <td class="p-3 text-center font-bold text-slate-400">\${i + 1}</td>
        <td class="p-3">
          <input type="text" value="\${row.desc || ''}" placeholder="وصف الخدمة أو الصنف..." oninput="updateStudioRow(\${i}, 'desc', this.value)" class="w-full p-2 bg-slate-50 border border-slate-200 rounded-lg text-xs font-semibold focus:outline-none focus:border-purple-600">
        </td>
        <td class="p-3">
          <input type="number" min="1" step="1" value="\${row.qty || 1}" oninput="updateStudioRow(\${i}, 'qty', this.value)" class="w-full p-2 bg-slate-50 border border-slate-200 rounded-lg text-xs font-bold text-center focus:outline-none focus:border-purple-600">
        </td>
        <td class="p-3">
          <input type="number" min="0" step="0.01" value="\${row.price || 0}" oninput="updateStudioRow(\${i}, 'price', this.value)" class="w-full p-2 bg-slate-50 border border-slate-200 rounded-lg text-xs font-bold focus:outline-none focus:border-purple-600">
        </td>
        <td class="p-3 text-slate-500 font-bold">15%</td>
        <td class="p-3 font-black text-purple-900">\${formatSAR(rowTotal)} ر.س</td>
        <td class="p-3 text-center">
          <button type="button" onclick="removeStudioInvoiceRow(\${i})" class="text-slate-300 hover:text-red-500 transition p-1" title="حذف البند">
            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"></path></svg>
          </button>
        </td>
      \`;
      tbody.appendChild(tr);
    });

    const countSpan = document.getElementById('studioItemsCount');
    if (countSpan) countSpan.textContent = studioRows.length;
    calculateStudioTotals();
  }

  function calculateStudioTotals() {
    let subtotal = 0;
    studioRows.forEach(r => {
      subtotal += (r.qty || 0) * (r.price || 0);
    });
    const vat = subtotal * 0.15;
    const grand = subtotal + vat;

    const s = document.getElementById('studioEditorSubtotal');
    const v = document.getElementById('studioEditorVat');
    const g = document.getElementById('studioEditorGrand');
    if (s) s.textContent = formatSAR(subtotal);
    if (v) v.textContent = formatSAR(vat);
    if (g) g.textContent = formatSAR(grand);

    return { subtotal, vat, grand };
  }

  function renderStudioLivePreview() {
    const { subtotal, vat, grand } = calculateStudioTotals();
    const entity = document.getElementById('studio-entity')?.value || 'law';
    const client = document.getElementById('studio-client')?.value || 'العميل الكريم';
    const date = document.getElementById('studio-date')?.value || new Date().toISOString().substring(0, 10);
    const docNum = document.getElementById('studio-doc-number')?.value || 'INV-2026-001';
    const status = document.getElementById('studio-status')?.value || 'paid';
    const terms = document.getElementById('studio-terms')?.value || 'شكراً لتعاملكم معنا • نظام قـيـد المحاسبي المتكامل';
    const template = document.getElementById('studio-template')?.value || 'modern_purple';

    const entityInfo = {
      law: { ar: 'شركة حجاج للمحاماة والاستشارات القانونية', en: 'Hajjaj Law & Legal Consultations', cr: '1010987654', vat: '310123456700003' },
      restaurant: { ar: 'مطعم مذاق البخاري والشاورما', en: 'Mazaq Al Bukhari Restaurant', cr: '1010765432', vat: '310987654300003' },
      farm: { ar: 'مزرعة الواحة الخضراء للمنتجات الزراعية', en: 'Green Oasis Farm', cr: '1010543210', vat: '310654321000003' },
      barber: { ar: 'صالون الأناقة الرجالي', en: 'Elegance Men Salon', cr: '1010432109', vat: '310432109800003' },
      home: { ar: 'الذمة المالية الشخصية والمنزلية', en: 'Personal Household', cr: 'خاص', vat: 'غير خاضع' }
    };
    const curEnt = entityInfo[entity] || entityInfo.law;

    // Apply template themes to paper
    const paper = document.getElementById('studioPaperDocument');
    if (paper) {
      if (template === 'clean_corporate') {
        paper.style.borderColor = '#cbd5e1';
        paper.style.boxShadow = '0 10px 25px -5px rgba(0, 0, 0, 0.05)';
      } else if (template === 'minimalist_classic') {
        paper.style.borderColor = '#000000';
        paper.style.boxShadow = 'none';
      } else {
        paper.style.borderColor = '#e2e8f0';
        paper.style.boxShadow = '0 20px 35px -10px rgba(109, 40, 217, 0.12)';
      }
    }

    const nameAr = document.getElementById('previewEntityName');
    const nameEn = document.getElementById('previewEntityEnName');
    const crVat = document.getElementById('previewEntityCR');
    if (nameAr) nameAr.textContent = curEnt.ar;
    if (nameEn) nameEn.textContent = curEnt.en;
    if (crVat) crVat.textContent = \`س.ت: \${curEnt.cr} | ر.ض: \${curEnt.vat}\`;

    const docNumSpan = document.getElementById('previewDocNum');
    const docDateSpan = document.getElementById('previewDocDate');
    const clientSpan = document.getElementById('previewClientName');
    if (docNumSpan) docNumSpan.textContent = docNum;
    if (docDateSpan) docDateSpan.textContent = date;
    if (clientSpan) clientSpan.textContent = client;

    // Status Badge
    const badgeContainer = document.getElementById('previewStatusBadge');
    if (badgeContainer) {
      if (status === 'paid') {
        badgeContainer.innerHTML = '<span class="px-2.5 py-1 rounded-full bg-emerald-100 text-emerald-800 font-black text-[10px]">مسددة ✓</span>';
      } else if (status === 'unpaid') {
        badgeContainer.innerHTML = '<span class="px-2.5 py-1 rounded-full bg-amber-100 text-amber-800 font-black text-[10px]">غير مسددة ⏳</span>';
      } else {
        badgeContainer.innerHTML = '<span class="px-2.5 py-1 rounded-full bg-purple-100 text-purple-800 font-black text-[10px]">معلقة</span>';
      }
    }

    // Items Tbody
    const tbody = document.getElementById('previewItemsTbody');
    if (tbody) {
      tbody.innerHTML = '';
      studioRows.forEach((r, idx) => {
        const itemSub = (r.qty || 0) * (r.price || 0);
        const tr = document.createElement('tr');
        tr.innerHTML = \`
          <td class="p-2 text-center text-slate-400 font-bold">\${idx + 1}</td>
          <td class="p-2 font-bold text-slate-800">\${r.desc || 'بند مالي'}</td>
          <td class="p-2 text-center text-slate-600">\${r.qty || 1}</td>
          <td class="p-2 text-slate-600">\${formatSAR(r.price || 0)}</td>
          <td class="p-2 text-left font-black text-slate-900">\${formatSAR(itemSub)} ر.س</td>
        \`;
        tbody.appendChild(tr);
      });
    }

    // Totals
    const pSub = document.getElementById('previewSubtotal');
    const pVat = document.getElementById('previewVat');
    const pGrand = document.getElementById('previewGrandTotal');
    if (pSub) pSub.textContent = \`\${formatSAR(subtotal)} ر.س\`;
    if (pVat) pVat.textContent = \`\${formatSAR(vat)} ر.س\`;
    if (pGrand) pGrand.textContent = \`\${formatSAR(grand)} ر.س\`;

    // Footer Terms
    const footTerms = document.getElementById('previewFooterTerms');
    if (footTerms) footTerms.textContent = terms;

    // Render ZATCA QR
    const qrDiv = document.getElementById('studioLiveQrContainer');
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
    }
  }

  // Override openNewInvoiceModal to launch Studio
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
  }

  function handleStudioSaveInvoice(e) {
    e.preventDefault();
    const docType = document.getElementById('studio-doc-type').value;
    const docNum = document.getElementById('studio-doc-number').value.trim() || \`INV-2026-\${String(state.invoices.length + 1).padStart(3, '0')}\`;
    const entity = document.getElementById('studio-entity').value;
    const client = document.getElementById('studio-client').value.trim();
    const date = document.getElementById('studio-date').value;
    const dueDate = document.getElementById('studio-due-date').value;
    const status = document.getElementById('studio-status').value;
    const { subtotal, vat, grand } = calculateStudioTotals();

    const itemsSummary = studioRows.map(r => \`\${r.desc || 'خدمة'} (\${r.qty} × \${r.price})\`).join(' + ');

    const newInvoice = {
      id: docNum,
      entity,
      client,
      date,
      dueDate,
      subtotal,
      vat,
      total: grand,
      method: 'تحويل بنكي',
      status,
      item: itemsSummary,
      docType,
      items: [...studioRows]
    };

    state.invoices.unshift(newInvoice);

    // If paid, create matching journal entry
    if (status === 'paid') {
      state.journals.unshift({
        id: \`JRN-\${String(state.journals.length + 1).padStart(3, '0')}\`,
        date,
        entity,
        desc: \`فاتورة مبيعات رقم \${docNum} - \${client}\`,
        debit: '1002 - مصرف الراجحي',
        credit: '4001 - إيرادات مبيعات وخدمات',
        amount: grand,
        status: 'متزن'
      });
      state.treasury.rajhi += grand;
    }

    saveState();
    closeModal('newInvoiceModal');
    renderAll();
    updateCharts();
    showToast(\`تم حفظ وإصدار \${docNum} بنجاح!\`, 'success');
    viewTaxInvoice(docNum);
  }

  function printStudioInvoice() {
    window.print();
  }
`;

for (const filePath of files) {
  let content = fs.readFileSync(filePath, 'utf8');

  // Replace old modal with the new studio modal
  const oldModalStart = '<!-- MODAL: NEW INVOICE -->';
  const oldModalEnd = '<!-- MODAL: VIEW INVOICE (طباعة الفاتورة الضريبية ZATCA) -->';

  const startIndex = content.indexOf(oldModalStart);
  const endIndex = content.indexOf(oldModalEnd);

  if (startIndex !== -1 && endIndex !== -1) {
    content = content.substring(0, startIndex) + invoiceStudioModalHtml + '\n  ' + content.substring(endIndex);
    console.log('Replaced invoice modal in:', filePath);
  }

  // Inject studio scripts
  if (!content.includes('function addStudioInvoiceRow')) {
    content = content.replace('function openNewInvoiceModal() {', studioScripts + '\n    function _oldOpenNewInvoiceModal() {');
    console.log('Injected studio scripts in:', filePath);
  }

  fs.writeFileSync(filePath, content, 'utf8');
}
