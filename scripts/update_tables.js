'use strict';
const fs = require('fs');

const files = ['public/index.html', 'web/index.html'];

for (const filePath of files) {
  let content = fs.readFileSync(filePath, 'utf8');

  // Replace renderInvoicesTable loop
  const oldLoop = `      list.forEach(inv => {
        const statusBadge = inv.status === 'paid' 
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
        \`;
        tbody.appendChild(tr);
      });`;

  const newLoop = `      list.forEach(inv => {
        const isPaid = inv.status === 'paid';
        const statusBadge = isPaid 
          ? '<button onclick="toggleInvoicePaidStatus(\\'' + inv.id + '\\')" title="اضغط لتغيير الحالة لغير مسددة" class="px-3 py-1.5 rounded-full bg-emerald-100 text-emerald-800 hover:bg-emerald-200 font-black text-[11px] transition flex items-center gap-1 cursor-pointer"><span>✓ مسددة</span></button>'
          : (inv.status === 'overdue' 
              ? '<button onclick="toggleInvoicePaidStatus(\\'' + inv.id + '\\')" title="اضغط للتسديد" class="px-3 py-1.5 rounded-full bg-rose-100 text-rose-800 hover:bg-rose-200 font-black text-[11px] transition flex items-center gap-1 cursor-pointer"><span>! متأخرة</span></button>' 
              : '<button onclick="toggleInvoicePaidStatus(\\'' + inv.id + '\\')" title="اضغط للتسديد الآن" class="px-3 py-1.5 rounded-full bg-amber-100 text-amber-800 hover:bg-amber-200 font-black text-[11px] transition flex items-center gap-1 cursor-pointer"><span>⏳ غير مسددة</span></button>');

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
            <div class="flex items-center justify-center gap-2">
              <button onclick="viewTaxInvoice('\${inv.id}')" title="عرض الفاتورة الضريبية ZATCA" class="px-2.5 py-1.5 rounded-xl bg-gathern-50 text-gathern-800 hover:bg-gathern-100 font-black text-[11px] transition">
                عرض ZATCA
              </button>
              <button onclick="deleteInvoice('\${inv.id}')" title="حذف الفاتورة" class="px-2.5 py-1.5 rounded-xl bg-red-50 text-red-600 hover:bg-red-100 font-black text-[11px] transition flex items-center gap-1 cursor-pointer">
                <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"></path></svg>
                <span>حذف</span>
              </button>
            </div>
          </td>
        \`;
        tbody.appendChild(tr);
      });`;

  // Also enhance dashboard recent table to support toggle and delete
  const oldDashLoop = `      recent.forEach(inv => {
        const statusBadge = inv.status === 'paid' 
          ? '<span class="px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 font-bold text-[10px]">مدفوعة</span>'
          : (inv.status === 'overdue' 
              ? '<span class="px-2 py-0.5 rounded-full bg-rose-100 text-rose-800 font-bold text-[10px]">متأخرة</span>' 
              : '<span class="px-2 py-0.5 rounded-full bg-amber-100 text-amber-800 font-bold text-[10px]">معلقة</span>');

        const tr = document.createElement('tr');
        tr.className = 'hover:bg-slate-50 transition';
        tr.innerHTML = \`
          <td class="py-3 font-bold text-gathern-800 cursor-pointer" onclick="viewTaxInvoice('\${inv.id}')">\${inv.id}</td>
          <td class="py-3">\${ENTITY_BADGES[inv.entity] || inv.entity}</td>
          <td class="py-3 font-semibold text-slate-800">\${inv.client}</td>
          <td class="py-3 text-slate-500">\${inv.date}</td>
          <td class="py-3 font-black text-slate-900">\${formatSAR(inv.total)} ر.س</td>
          <td class="py-3">\${statusBadge}</td>
          <td class="py-3 text-center">
            <button onclick="viewTaxInvoice('\${inv.id}')" class="text-gathern-700 hover:text-gathern-900 font-bold px-2 py-1 rounded-lg bg-gathern-50">عرض ZATCA</button>
          </td>
        \`;
        tbody.appendChild(tr);
      });`;

  const newDashLoop = `      recent.forEach(inv => {
        const isPaid = inv.status === 'paid';
        const statusBadge = isPaid 
          ? '<button onclick="toggleInvoicePaidStatus(\\'' + inv.id + '\\')" title="اضغط لتغيير الحالة لغير مسددة" class="px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 hover:bg-emerald-200 font-black text-[10px] transition cursor-pointer">✓ مسددة</button>'
          : '<button onclick="toggleInvoicePaidStatus(\\'' + inv.id + '\\')" title="اضغط للتسديد" class="px-2 py-0.5 rounded-full bg-amber-100 text-amber-800 hover:bg-amber-200 font-black text-[10px] transition cursor-pointer">⏳ غير مسددة</button>';

        const tr = document.createElement('tr');
        tr.className = 'hover:bg-slate-50 transition';
        tr.innerHTML = \`
          <td class="py-3 font-bold text-gathern-800 cursor-pointer" onclick="viewTaxInvoice('\${inv.id}')">\${inv.id}</td>
          <td class="py-3">\${ENTITY_BADGES[inv.entity] || inv.entity}</td>
          <td class="py-3 font-semibold text-slate-800">\${inv.client}</td>
          <td class="py-3 text-slate-500">\${inv.date}</td>
          <td class="py-3 font-black text-slate-900">\${formatSAR(inv.total)} ر.س</td>
          <td class="py-3">\${statusBadge}</td>
          <td class="py-3 text-center">
            <div class="flex items-center justify-center gap-1.5">
              <button onclick="viewTaxInvoice('\${inv.id}')" title="عرض ZATCA" class="text-gathern-700 hover:text-gathern-900 font-bold px-2 py-1 rounded-lg bg-gathern-50">عرض</button>
              <button onclick="deleteInvoice('\${inv.id}')" title="حذف الفاتورة" class="text-red-600 hover:text-red-800 font-bold px-2 py-1 rounded-lg bg-red-50">حذف</button>
            </div>
          </td>
        \`;
        tbody.appendChild(tr);
      });`;

  content = content.replace(oldLoop, newLoop);
  content = content.replace(oldDashLoop, newDashLoop);

  fs.writeFileSync(filePath, content, 'utf8');
  console.log('Finished table replacement in:', filePath);
}
