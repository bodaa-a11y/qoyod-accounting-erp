'use strict';
const fs = require('fs');

const files = ['public/index.html', 'web/index.html'];

for (const filePath of files) {
  let content = fs.readFileSync(filePath, 'utf8');

  // 1. Add status in New Invoice Modal
  const oldGrid = '<div class="grid grid-cols-1 sm:grid-cols-3 gap-4">';
  const newGrid = `<div class="grid grid-cols-1 sm:grid-cols-4 gap-4">
          <div>
            <label class="block font-bold text-slate-700 mb-1">حالة السداد:</label>
            <select id="inv-status" class="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:border-gathern-500 font-bold text-slate-800">
              <option value="paid">✅ مسددة (مدفوعة)</option>
              <option value="unpaid">⏳ غير مسددة (آجلة)</option>
            </select>
          </div>`;
  content = content.replace(oldGrid, newGrid);

  // 2. Add filter for unpaid
  const oldFilter = `<button onclick="filterInvoicesByStatus('paid')" class="inv-filter-btn px-3 py-1.5 rounded-lg bg-slate-100 text-slate-600 hover:bg-slate-200 font-semibold">مدفوعة</button>`;
  const newFilter = `<button onclick="filterInvoicesByStatus('paid')" class="inv-filter-btn px-3 py-1.5 rounded-lg bg-slate-100 text-slate-600 hover:bg-slate-200 font-semibold">مسددة (مدفوعة)</button>
            <button onclick="filterInvoicesByStatus('unpaid')" class="inv-filter-btn px-3 py-1.5 rounded-lg bg-slate-100 text-slate-600 hover:bg-slate-200 font-semibold">غير مسددة</button>`;
  content = content.replace(oldFilter, newFilter);

  // 3. Update handleCreateInvoice to read status
  const oldCreateStatus = "status: 'paid',";
  const newCreateStatus = "status: document.getElementById('inv-status')?.value || 'paid',";
  content = content.replace(oldCreateStatus, newCreateStatus);

  // 4. Update renderInvoicesTable to support toggle status & delete invoice
  const oldRenderRow = `        const statusBadge = inv.status === 'paid' 
          ? '<span class="px-2.5 py-1 rounded-full bg-emerald-100 text-emerald-800 font-bold text-[10px]">مدفوعة</span>'
          : (inv.status === 'overdue' 
              ? '<span class="px-2.5 py-1 rounded-full bg-rose-100 text-rose-800 font-bold text-[10px]">متأخرة</span>' 
              : '<span class="px-2.5 py-1 rounded-full bg-amber-100 text-amber-800 font-bold text-[10px]">معلقة</span>');

        const tr = document.createElement('tr');
        tr.className = 'hover:bg-slate-50/80 transition';
        tr.innerHTML = \`
          <td class="p-4 font-black text-gathern-800 cursor-pointer" onclick="viewTaxInvoice('\${inv.id}')">\${inv.id}</td>
          <td class="p-4 font-bold text-slate-800">\${inv.client}</td>
          <td class="p-4">\${ENTITY_BADGES[inv.entity] || inv.entity}</td>
          <td class="p-4 text-slate-500">\${inv.date}</td>
          <td class="p-4 font-semibold text-slate-700">\${formatSAR(inv.subtotal)} ر.س</td>
          <td class="p-4 font-semibold text-slate-500">\${formatSAR(inv.vat)} ر.س</td>
          <td class="p-4 font-black text-slate-900">\${formatSAR(inv.total)} ر.س</td>
          <td class="p-4 text-slate-600">\${inv.method}</td>
          <td class="p-4">\${statusBadge}</td>
          <td class="p-4 text-center">
            <button onclick="viewTaxInvoice('\${inv.id}')" class="px-3 py-1.5 rounded-xl bg-gathern-50 text-gathern-800 hover:bg-gathern-100 font-black text-[11px] transition">
              عرض وضريبة QR
            </button>
          </td>
        \`;`;

  const newRenderRow = `        const isPaid = inv.status === 'paid';
        const statusBadge = isPaid 
          ? '<button onclick="toggleInvoicePaidStatus(\\'' + inv.id + '\\')" title=\"اضغط للتحويل لغير مسددة\" class=\"px-2.5 py-1 rounded-full bg-emerald-100 text-emerald-800 hover:bg-emerald-200 font-black text-[11px] transition flex items-center gap-1 cursor-pointer\"><span>✓ مسددة</span></button>'
          : (inv.status === 'overdue' 
              ? '<button onclick=\"toggleInvoicePaidStatus(\\'' + inv.id + '\\')\" title=\"اضغط للتحويل لمسددة\" class=\"px-2.5 py-1 rounded-full bg-rose-100 text-rose-800 hover:bg-rose-200 font-black text-[11px] transition flex items-center gap-1 cursor-pointer\"><span>! متأخرة</span></button>' 
              : '<button onclick=\"toggleInvoicePaidStatus(\\'' + inv.id + '\\')\" title=\"اضغط لتأكيد السداد\" class=\"px-2.5 py-1 rounded-full bg-amber-100 text-amber-800 hover:bg-amber-200 font-black text-[11px] transition flex items-center gap-1 cursor-pointer\"><span>⏳ غير مسددة</span></button>');

        const tr = document.createElement('tr');
        tr.className = 'hover:bg-slate-50/80 transition';
        tr.innerHTML = \`
          <td class="p-4 font-black text-gathern-800 cursor-pointer" onclick="viewTaxInvoice('\${inv.id}')">\${inv.id}</td>
          <td class="p-4 font-bold text-slate-800">\${inv.client}</td>
          <td class="p-4">\${ENTITY_BADGES[inv.entity] || inv.entity}</td>
          <td class="p-4 text-slate-500">\${inv.date}</td>
          <td class="p-4 font-semibold text-slate-700">\${formatSAR(inv.subtotal)} ر.س</td>
          <td class="p-4 font-semibold text-slate-500">\${formatSAR(inv.vat)} ر.س</td>
          <td class="p-4 font-black text-slate-900">\${formatSAR(inv.total)} ر.س</td>
          <td class="p-4 text-slate-600">\${inv.method}</td>
          <td class="p-4">\${statusBadge}</td>
          <td class="p-4 text-center">
            <div class="flex items-center justify-center gap-1.5">
              <button onclick="viewTaxInvoice('\${inv.id}')" title="عرض الفاتورة ورمز QR" class="px-2.5 py-1.5 rounded-xl bg-gathern-50 text-gathern-800 hover:bg-gathern-100 font-black text-[11px] transition">
                عرض ZATCA
              </button>
              <button onclick="deleteInvoice('\${inv.id}')" title="حذف الفاتورة" class="px-2.5 py-1.5 rounded-xl bg-red-50 text-red-600 hover:bg-red-100 font-black text-[11px] transition flex items-center gap-1">
                <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"></path></svg>
                <span>حذف</span>
              </button>
            </div>
          </td>
        \`;`;

  content = content.replace(oldRenderRow, newRenderRow);

  // 5. Add toggleInvoicePaidStatus and deleteInvoice functions
  const helperFunctions = `
    // تغيير حالة سداد الفاتورة (مسددة / غير مسددة)
    function toggleInvoicePaidStatus(invId) {
      const inv = state.invoices.find(i => i.id === invId);
      if (!inv) return;
      
      const newStatus = (inv.status === 'paid') ? 'unpaid' : 'paid';
      inv.status = newStatus;
      
      saveState();
      renderAll();
      updateCharts();
      
      if (newStatus === 'paid') {
        showToast('تم تحديث الفاتورة ' + invId + ' إلى: مسددة بنجاح ✓', 'success');
      } else {
        showToast('تم تحديث الفاتورة ' + invId + ' إلى: غير مسددة (آجلة)', 'info');
      }
    }

    // حذف فاتورة مبيعات
    function deleteInvoice(invId) {
      const inv = state.invoices.find(i => i.id === invId);
      if (!inv) return;

      if (!confirm('هل أنت متأكد من رغبتك في حذف الفاتورة رقم (' + invId + ') للعميل (' + inv.client + ')؟')) {
        return;
      }

      // Remove invoice
      state.invoices = state.invoices.filter(i => i.id !== invId);

      // Remove related journal entry if found
      state.journals = state.journals.filter(j => !j.desc || !j.desc.includes(invId));

      saveState();
      renderAll();
      updateCharts();
      showToast('تم حذف الفاتورة (' + invId + ') بنجاح', 'success');
    }
  `;

  // Inject helper functions right before "function renderInventoryTable"
  content = content.replace('function renderInventoryTable() {', helperFunctions + '\n    function renderInventoryTable() {');

  fs.writeFileSync(filePath, content, 'utf8');
  console.log('Successfully updated:', filePath);
}
