(function () {
  'use strict';

  function icon(name, size = 15, cls = '') {
    if (typeof window.erpIcon === 'function') {
      return window.erpIcon(name, size, cls);
    }
    return '';
  }

  function fmt(num) {
    if (typeof window.formatSAR === 'function') return window.formatSAR(num);
    return (Number(num) || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }

  function getLeafAccounts(typeFilter) {
    const accounts = (window.state && Array.isArray(window.state.accounts)) ? window.state.accounts : [];
    return accounts.filter(a => !a.isGroup && a.status !== 'inactive' && (!typeFilter || a.type === typeFilter));
  }

  function buildAccountOptions(selectedCode, filterFn) {
    const accounts = getLeafAccounts().filter(a => !filterFn || filterFn(a));
    return accounts.map(a => {
      const sel = String(a.code) === String(selectedCode) || `${a.code} - ${a.name}` === String(selectedCode) ? 'selected' : '';
      return `<option value="${a.code}" ${sel}>${a.code} — ${a.name}</option>`;
    }).join('');
  }

  function ensureAccountingStateDefaults() {
    if (!window.state) return;
    if (typeof window.ensureExtendedState === 'function') window.ensureExtendedState();
    if (!window.state.taxSettings) {
      window.state.taxSettings = Object.assign({}, window.InvoiceUtils ? window.InvoiceUtils.DEFAULT_TAX_SETTINGS : {
        standard: { code: 'standard', nameAr: 'خاضع للضريبة الأساسية (15%)', rate: 15, recoverable: true },
        zero: { code: 'zero', nameAr: 'خاضع لنسبة الصفر (0%)', rate: 0, recoverable: true },
        exempt: { code: 'exempt', nameAr: 'معفى من الضريبة', rate: 0, recoverable: false },
        out_of_scope: { code: 'out_of_scope', nameAr: 'خارج نطاق الضريبة', rate: 0, recoverable: false }
      });
    }
    if (!Array.isArray(window.state.costCenters) || window.state.costCenters.length === 0) {
      window.state.costCenters = [
        { code: 'CC-MAIN', name: 'المركز الرئيسي - الإدارة العامة' },
        { code: 'CC-SALES', name: 'مركز تكلفة المبيعات والتسويق' },
        { code: 'CC-PROJECTS', name: 'مركز تكلفة المشاريع والتنفيذ' },
        { code: 'CC-BRANCH-JED', name: 'فرع جدة - المنطقة الغربية' }
      ];
    }
    if (!Array.isArray(window.state.returns)) {
      window.state.returns = [];
    }

    // Enrich clients & suppliers with default control accounts
    if (Array.isArray(window.state.clients)) {
      window.state.clients.forEach(c => {
        if (!c.arAccount) c.arAccount = '110301';
        if (!c.defaultRevenueAccount) c.defaultRevenueAccount = '410101';
        if (!c.paymentTerms) c.paymentTerms = 'net30';
        if (c.creditLimit === undefined) c.creditLimit = 100000;
      });
    }
    if (Array.isArray(window.state.suppliers)) {
      window.state.suppliers.forEach(s => {
        if (!s.apAccount) s.apAccount = '210101';
        if (!s.defaultExpenseAccount) s.defaultExpenseAccount = '110401';
        if (!s.paymentTerms) s.paymentTerms = 'net30';
      });
    }
    if (Array.isArray(window.state.inventory)) {
      window.state.inventory.forEach(item => {
        if (!item.id) item.id = item.sku || ('ITM-' + Math.random().toString(36).slice(2, 7));
        if (!item.salesRevenueAccount) item.salesRevenueAccount = '410101';
        if (!item.purchaseExpenseAccount) item.purchaseExpenseAccount = '110401';
        if (!item.inventoryAssetAccount) item.inventoryAssetAccount = '110401';
        if (!item.cogsAccount) item.cogsAccount = '510101';
        if (!item.vatTreatment) item.vatTreatment = 'standard';
      });
    }
  }

  function recalculateDynamicPartyBalances() {
    if (!window.state || !window.InvoiceUtils) return;
    ensureAccountingStateDefaults();

    if (Array.isArray(window.state.clients)) {
      window.state.clients.forEach(client => {
        const stmt = window.InvoiceUtils.computePartyStatement('customer', client.id || client.name, window.state);
        if (stmt && Array.isArray(stmt.entries) && stmt.entries.length > 0) {
          client.balance = window.InvoiceUtils.roundCurrency(stmt.closingBalance);
        } else {
          const invBal = (window.state.invoices || [])
            .filter(i => (i.customerId === client.id || i.client === client.name) && i.status !== 'cancelled' && i.status !== 'void')
            .reduce((s, i) => s + Number(i.outstanding ?? i.remainingAmount ?? (i.status === 'paid' ? 0 : i.total) ?? 0), 0);
          client.balance = window.InvoiceUtils.roundCurrency(invBal);
        }
      });
    }

    if (Array.isArray(window.state.suppliers)) {
      window.state.suppliers.forEach(sup => {
        const stmt = window.InvoiceUtils.computePartyStatement('supplier', sup.id || sup.name, window.state);
        if (stmt && Array.isArray(stmt.entries) && stmt.entries.length > 0) {
          sup.balance = window.InvoiceUtils.roundCurrency(stmt.closingBalance);
        } else {
          const poBal = (window.state.purchases || [])
            .filter(p => (p.supplierId === sup.id || p.supplier === sup.name || p.vendor === sup.name) && p.status !== 'cancelled')
            .reduce((s, p) => s + Number(p.remainingAmount ?? (p.status === 'paid' || p.status === 'مسدد' ? 0 : p.total) ?? 0), 0);
          sup.balance = window.InvoiceUtils.roundCurrency(poBal);
        }
      });
    }
  }

  // ============================================================================
  // 1. UPGRADE ACCOUNT BALANCES & GENERAL LEDGER TO SUPPORT MULTI-LINE JOURNALS
  // ============================================================================
  window.calculateAccountBalances = function () {
    ensureAccountingStateDefaults();
    const balances = {};
    const debitTotals = {};
    const creditTotals = {};

    (window.state.accounts || []).forEach(acc => {
      balances[acc.id] = 0;
      debitTotals[acc.id] = 0;
      creditTotals[acc.id] = 0;
    });

    const entityJournals = typeof window.getFilteredList === 'function'
      ? window.getFilteredList(window.state.journals)
      : (window.state.journals || []);

    entityJournals.forEach(j => {
      if (!j || j.status === 'cancelled' || j.status === 'void' || j.status === 'معكوس') return;

      if (Array.isArray(j.lines) && j.lines.length > 0) {
        j.lines.forEach(line => {
          const rawCode = String(line.accountCode || line.account || '').trim();
          const code = rawCode.includes(' - ') ? rawCode.split(' - ')[0].trim() : rawCode;
          const acc = window.state.accounts.find(a => !a.isGroup && (String(a.code) === code || a.id === line.account_id || rawCode.includes(a.code)));
          if (!acc) return;
          const deb = Number(line.debit) || 0;
          const cred = Number(line.credit) || 0;
          debitTotals[acc.id] = (debitTotals[acc.id] || 0) + deb;
          creditTotals[acc.id] = (creditTotals[acc.id] || 0) + cred;
        });
        return;
      }

      const amt = Number(j.amount) || 0;
      if (!amt) return;

      const debitAcc = window.state.accounts.find(a => !a.isGroup && (
        (j.debitAccount && (j.debitAccount === a.id || j.debitAccount === a.code)) ||
        (j.debit && (String(j.debit).includes(a.code) || j.debit === a.name))
      ));
      if (debitAcc) debitTotals[debitAcc.id] = (debitTotals[debitAcc.id] || 0) + amt;

      const creditAcc = window.state.accounts.find(a => !a.isGroup && (
        (j.creditAccount && (j.creditAccount === a.id || j.creditAccount === a.code)) ||
        (j.credit && (String(j.credit).includes(a.code) || j.credit === a.name))
      ));
      if (creditAcc) creditTotals[creditAcc.id] = (creditTotals[creditAcc.id] || 0) + amt;
    });

    window.state.accounts.forEach(acc => {
      if (!acc.isGroup) {
        const deb = debitTotals[acc.id] || 0;
        const cred = creditTotals[acc.id] || 0;
        balances[acc.id] = acc.nature === 'debit' ? (deb - cred) : (cred - deb);
      }
    });

    const sortedByLevelDesc = [...window.state.accounts].sort((a, b) => (b.level || 1) - (a.level || 1));
    sortedByLevelDesc.forEach(acc => {
      if (acc.isGroup) {
        const getLeafSum = (parentId) => {
          let sum = 0;
          const children = window.state.accounts.filter(a => a.parentId === parentId);
          children.forEach(c => {
            sum += c.isGroup ? getLeafSum(c.id) : (balances[c.id] || 0);
          });
          return sum;
        };
        balances[acc.id] = getLeafSum(acc.id);
      }
    });

    return { balances, debitTotals, creditTotals };
  };

  // ============================================================================
  // 2. MULTI-LINE PARTY-LINKED JOURNAL ENTRY STUDIO (#newJournalModal)
  // ============================================================================
  window.modalJournalLines = [
    { accountCode: '110301', partyType: 'customer', partyId: '', partyName: '', costCenter: 'CC-MAIN', debit: 1150, credit: 0, desc: 'إثبات استحقاق على العميل' },
    { accountCode: '410101', partyType: '', partyId: '', partyName: '', costCenter: 'CC-MAIN', debit: 0, credit: 1000, desc: 'إيراد المبيعات والخدمات' },
    { accountCode: '210201', partyType: '', partyId: '', partyName: '', costCenter: 'CC-MAIN', debit: 0, credit: 150, desc: 'ضريبة القيمة المضافة 15%' }
  ];

  function upgradeJournalModalDOM() {
    const modal = document.getElementById('newJournalModal');
    if (!modal || modal.dataset.upgraded === '1') return;
    modal.dataset.upgraded = '1';

    const container = modal.querySelector('.max-w-lg');
    if (container) {
      container.classList.remove('max-w-lg');
      container.classList.add('max-w-5xl');
    }

    const form = document.getElementById('newJournalForm');
    if (!form) return;

    form.innerHTML = `
      <div class="grid grid-cols-1 sm:grid-cols-4 gap-3 bg-slate-50 p-3.5 rounded-2xl border border-slate-200/80">
        <div>
          <label class="block font-bold text-slate-700 mb-1">رقم القيد</label>
          <input type="text" id="jrn-number" readonly class="w-full p-2 bg-white border border-slate-200 rounded-xl font-mono font-black text-purple-800 text-xs" value="JV-000101">
        </div>
        <div>
          <label class="block font-bold text-slate-700 mb-1">تاريخ القيد <span class="text-rose-500">*</span></label>
          <input type="date" id="jrn-date" required class="w-full p-2 bg-white border border-slate-200 rounded-xl font-bold text-xs">
        </div>
        <div>
          <label class="block font-bold text-slate-700 mb-1">النشاط / الفرع</label>
          <select id="jrn-entity" class="w-full p-2 bg-white border border-slate-200 rounded-xl font-bold text-xs">
            <option value="law">شركة المحاماة</option>
            <option value="restaurant">المطعم</option>
            <option value="farm">المزرعة</option>
            <option value="barber">الحلاق</option>
            <option value="home">البيت</option>
          </select>
        </div>
        <div>
          <label class="block font-bold text-slate-700 mb-1">المستند المرجعي (اختياري)</label>
          <input type="text" id="jrn-ref" placeholder="مثال: INV-2026-001 أو عقد" class="w-full p-2 bg-white border border-slate-200 rounded-xl font-mono text-xs">
        </div>
        <div class="sm:col-span-4">
          <label class="block font-bold text-slate-700 mb-1">البيان العام للقيد المحاسبي <span class="text-rose-500">*</span></label>
          <input type="text" id="jrn-desc" required placeholder="مثال: قيد إثبات مبيعات آجل مع ربط العميل والضريبة..." class="w-full p-2.5 bg-white border border-slate-200 rounded-xl font-bold text-xs">
        </div>
      </div>

      <div class="rounded-2xl border border-slate-200 overflow-hidden bg-white">
        <div class="flex flex-wrap items-center justify-between gap-2 px-4 py-2.5 bg-slate-100 border-b border-slate-200">
          <div class="font-black text-slate-800 text-xs flex items-center gap-2">
            ${icon('book-open', 15, 'text-purple-700')}
            <span>تفاصيل سطور القيد وربط الأطراف (Party Linking)</span>
          </div>
          <button type="button" onclick="addJournalLineRow()" class="px-3 py-1.5 bg-purple-700 hover:bg-purple-800 text-white rounded-xl font-black text-[11px] flex items-center gap-1 transition">
            ${icon('plus', 13)} <span>إضافة سطر قيد</span>
          </button>
        </div>
        <div class="overflow-x-auto">
          <table class="w-full text-right text-xs min-w-[820px]">
            <thead class="bg-slate-50 text-slate-600 font-bold border-b border-slate-200">
              <tr>
                <th class="p-2.5 w-8 text-center">#</th>
                <th class="p-2.5 w-56">الحساب المحاسبي <span class="text-rose-500">*</span></th>
                <th class="p-2.5 w-32">نوع الطرف (Party Type)</th>
                <th class="p-2.5 w-48">اسم العميل / المورد (Party ID)</th>
                <th class="p-2.5 w-32">مركز التكلفة</th>
                <th class="p-2.5 w-28">مدين (Debit)</th>
                <th class="p-2.5 w-28">دائن (Credit)</th>
                <th class="p-2.5">بيان السطر</th>
                <th class="p-2.5 w-10"></th>
              </tr>
            </thead>
            <tbody id="jrnLinesTbody" class="divide-y divide-slate-100"></tbody>
          </table>
        </div>
      </div>

      <!-- Balance Bar -->
      <div class="p-3.5 rounded-2xl bg-slate-900 text-white flex flex-wrap items-center justify-between gap-4 text-xs">
        <div class="flex items-center gap-6">
          <div>
            <span class="text-slate-400 block text-[10px]">إجمالي المدين</span>
            <span id="jrn-total-debit" class="font-black text-sm text-emerald-400">0.00 ر.س</span>
          </div>
          <div>
            <span class="text-slate-400 block text-[10px]">إجمالي الدائن</span>
            <span id="jrn-total-credit" class="font-black text-sm text-blue-400">0.00 ر.س</span>
          </div>
          <div>
            <span class="text-slate-400 block text-[10px]">الفرق</span>
            <span id="jrn-diff" class="font-black text-sm text-white">0.00 ر.س</span>
          </div>
        </div>
        <div id="jrn-balance-badge" class="px-3 py-1.5 rounded-xl bg-emerald-500/20 text-emerald-300 font-black text-xs">
          القيد متوازن (Total Debit = Total Credit)
        </div>
      </div>

      <div id="jrn-validation-alert" class="hidden p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 font-bold text-xs"></div>

      <div class="flex items-center justify-end gap-3 pt-2 border-t border-slate-100">
        <button type="button" onclick="closeModal('newJournalModal')" class="px-4 py-2 text-slate-500 rounded-xl font-bold">إلغاء</button>
        <button type="submit" class="gathern-gradient-btn text-white px-6 py-2.5 rounded-xl font-black transition">اعتماد وترحيل القيد لدفتر اليومية</button>
      </div>
    `;
  }

  function buildPartySelectOptions(partyType, selectedId) {
    ensureAccountingStateDefaults();
    const t = String(partyType || '').toLowerCase();
    if (t === 'customer') {
      const list = window.state.clients || [];
      return `<option value="">-- اختر العميل من قاعدة البيانات * --</option>` +
        list.map(c => `<option value="${c.id}" ${String(c.id) === String(selectedId) || c.name === selectedId ? 'selected' : ''}>${c.name} (${c.id})</option>`).join('');
    }
    if (t === 'supplier') {
      const list = window.state.suppliers || [];
      return `<option value="">-- اختر المورد من قاعدة البيانات * --</option>` +
        list.map(s => `<option value="${s.id}" ${String(s.id) === String(selectedId) || s.name === selectedId ? 'selected' : ''}>${s.name} (${s.id})</option>`).join('');
    }
    if (t === 'employee') {
      const list = window.state.employees || [];
      return `<option value="">-- اختر الموظف --</option>` +
        list.map(e => `<option value="${e.id}" ${String(e.id) === String(selectedId) || e.name === selectedId ? 'selected' : ''}>${e.name} (${e.id})</option>`).join('');
    }
    if (t === 'other') {
      return `<option value="OTHER-PARTY" selected>طرف آخر عام</option>`;
    }
    return `<option value="">— حساب عام (بدون طرف) —</option>`;
  }

  window.renderJournalLinesTable = function () {
    upgradeJournalModalDOM();
    const tbody = document.getElementById('jrnLinesTbody');
    if (!tbody) return;
    tbody.innerHTML = '';

    const costCenters = (window.state && window.state.costCenters) || [{ code: 'CC-MAIN', name: 'المركز الرئيسي' }];

    window.modalJournalLines.forEach((line, idx) => {
      const code = String(line.accountCode || '');
      const isAR = code.startsWith('1103');
      const isAP = code.startsWith('2101');
      if (isAR && line.partyType !== 'customer') line.partyType = 'customer';
      if (isAP && line.partyType !== 'supplier') line.partyType = 'supplier';

      const reqBadge = (isAR || isAP)
        ? `<span class="block text-[10px] text-rose-600 font-black mt-0.5">* إلزامي لحساب ${isAR ? 'العملاء' : 'الموردين'}</span>`
        : '';

      const ccOpts = costCenters.map(cc =>
        `<option value="${cc.code}" ${cc.code === line.costCenter ? 'selected' : ''}>${cc.code} - ${cc.name}</option>`
      ).join('');

      const tr = document.createElement('tr');
      tr.className = 'hover:bg-slate-50/80 transition align-top';
      tr.innerHTML = `
        <td class="p-2 text-center font-bold text-slate-400 pt-3">${idx + 1}</td>
        <td class="p-2">
          <select onchange="updateJournalLine(${idx}, 'accountCode', this.value)" class="w-full p-2 bg-slate-50 border border-slate-200 rounded-lg font-bold text-[11px]">
            ${buildAccountOptions(line.accountCode)}
          </select>
        </td>
        <td class="p-2">
          <select onchange="updateJournalLine(${idx}, 'partyType', this.value)" class="w-full p-2 bg-slate-50 border border-slate-200 rounded-lg font-bold text-[11px]">
            <option value="" ${!line.partyType ? 'selected' : ''}>بدون طرف (عام)</option>
            <option value="customer" ${line.partyType === 'customer' ? 'selected' : ''}>عميل (Customer)</option>
            <option value="supplier" ${line.partyType === 'supplier' ? 'selected' : ''}>مورد (Supplier)</option>
            <option value="employee" ${line.partyType === 'employee' ? 'selected' : ''}>موظف (Employee)</option>
            <option value="other" ${line.partyType === 'other' ? 'selected' : ''}>طرف آخر</option>
          </select>
          ${reqBadge}
        </td>
        <td class="p-2">
          <select onchange="updateJournalLine(${idx}, 'partyId', this.value)" class="w-full p-2 ${isAR || isAP ? 'bg-amber-50/70 border-amber-300' : 'bg-slate-50 border-slate-200'} border rounded-lg font-bold text-[11px]" ${!line.partyType ? 'disabled' : ''}>
            ${buildPartySelectOptions(line.partyType, line.partyId)}
          </select>
        </td>
        <td class="p-2">
          <select onchange="updateJournalLine(${idx}, 'costCenter', this.value)" class="w-full p-2 bg-slate-50 border border-slate-200 rounded-lg font-semibold text-[11px]">
            ${ccOpts}
          </select>
        </td>
        <td class="p-2">
          <input type="number" min="0" step="0.01" value="${line.debit || 0}" oninput="updateJournalLine(${idx}, 'debit', this.value, false)" class="w-full p-2 bg-emerald-50/40 border border-emerald-200 rounded-lg font-black text-emerald-800 text-xs text-center">
        </td>
        <td class="p-2">
          <input type="number" min="0" step="0.01" value="${line.credit || 0}" oninput="updateJournalLine(${idx}, 'credit', this.value, false)" class="w-full p-2 bg-blue-50/40 border border-blue-200 rounded-lg font-black text-blue-800 text-xs text-center">
        </td>
        <td class="p-2">
          <input type="text" value="${line.desc || ''}" placeholder="شرح السطر..." oninput="updateJournalLine(${idx}, 'desc', this.value, false)" class="w-full p-2 bg-slate-50 border border-slate-200 rounded-lg text-[11px]">
        </td>
        <td class="p-2 text-center pt-3">
          <button type="button" onclick="removeJournalLineRow(${idx})" class="text-slate-300 hover:text-rose-600 transition" title="حذف السطر">
            ${icon('trash-2', 14)}
          </button>
        </td>
      `;
      tbody.appendChild(tr);
    });

    updateJournalModalTotals();
  };

  window.addJournalLineRow = function () {
    window.modalJournalLines.push({
      accountCode: '110101',
      partyType: '',
      partyId: '',
      partyName: '',
      costCenter: 'CC-MAIN',
      debit: 0,
      credit: 0,
      desc: ''
    });
    window.renderJournalLinesTable();
  };

  window.removeJournalLineRow = function (idx) {
    if (window.modalJournalLines.length <= 2) {
      if (typeof window.showToast === 'function') window.showToast('يجب أن يحتوي القيد على سطرين على الأقل (مدين ودائن)', 'error');
      return;
    }
    window.modalJournalLines.splice(idx, 1);
    window.renderJournalLinesTable();
  };

  window.updateJournalLine = function (idx, field, value, rerender = true) {
    const line = window.modalJournalLines[idx];
    if (!line) return;

    if (field === 'debit') {
      line.debit = parseFloat(value) || 0;
      if (line.debit > 0) line.credit = 0;
    } else if (field === 'credit') {
      line.credit = parseFloat(value) || 0;
      if (line.credit > 0) line.debit = 0;
    } else if (field === 'accountCode') {
      line.accountCode = value;
      if (String(value).startsWith('1103')) {
        line.partyType = 'customer';
      } else if (String(value).startsWith('2101')) {
        line.partyType = 'supplier';
      }
      rerender = true;
    } else if (field === 'partyType') {
      line.partyType = value;
      line.partyId = '';
      line.partyName = '';
      rerender = true;
    } else if (field === 'partyId') {
      line.partyId = value;
      if (line.partyType === 'customer') {
        const c = (window.state.clients || []).find(x => String(x.id) === String(value));
        line.partyName = c ? c.name : '';
      } else if (line.partyType === 'supplier') {
        const s = (window.state.suppliers || []).find(x => String(x.id) === String(value));
        line.partyName = s ? s.name : '';
      } else if (line.partyType === 'employee') {
        const e = (window.state.employees || []).find(x => String(x.id) === String(value));
        line.partyName = e ? e.name : '';
      }
    } else {
      line[field] = value;
    }

    if (rerender) {
      window.renderJournalLinesTable();
    } else {
      updateJournalModalTotals();
    }
  };

  function updateJournalModalTotals() {
    let deb = 0;
    let cred = 0;
    window.modalJournalLines.forEach(l => {
      deb += Number(l.debit) || 0;
      cred += Number(l.credit) || 0;
    });
    const diff = Math.abs(deb - cred);
    const balanced = diff < 0.005 && deb > 0;

    const elDeb = document.getElementById('jrn-total-debit');
    const elCred = document.getElementById('jrn-total-credit');
    const elDiff = document.getElementById('jrn-diff');
    const elBadge = document.getElementById('jrn-balance-badge');

    if (elDeb) elDeb.textContent = fmt(deb) + ' ر.س';
    if (elCred) elCred.textContent = fmt(cred) + ' ر.س';
    if (elDiff) elDiff.textContent = fmt(diff) + ' ر.س';
    if (elBadge) {
      if (balanced) {
        elBadge.className = 'px-3 py-1.5 rounded-xl bg-emerald-500/20 text-emerald-300 font-black text-xs';
        elBadge.textContent = 'القيد متوازن (Total Debit = Total Credit)';
      } else {
        elBadge.className = 'px-3 py-1.5 rounded-xl bg-rose-500/20 text-rose-300 font-black text-xs';
        elBadge.textContent = `القيد غير متوازن (الفرق: ${fmt(diff)} ر.س)`;
      }
    }
  }

  window.openNewJournalModal = function () {
    ensureAccountingStateDefaults();
    upgradeJournalModalDOM();
    const today = new Date().toISOString().slice(0, 10);
    const dInput = document.getElementById('jrn-date');
    if (dInput) dInput.value = today;
    const numInput = document.getElementById('jrn-number');
    if (numInput) {
      numInput.value = `JV-${String((window.state.journals || []).length + 101).padStart(6, '0')}`;
    }
    const alertBox = document.getElementById('jrn-validation-alert');
    if (alertBox) alertBox.classList.add('hidden');

    window.renderJournalLinesTable();
    window.openModal('newJournalModal');
  };

  window.handleCreateJournal = function (e) {
    if (e && e.preventDefault) e.preventDefault();
    ensureAccountingStateDefaults();

    const entity = document.getElementById('jrn-entity')?.value || 'law';
    const date = document.getElementById('jrn-date')?.value || new Date().toISOString().slice(0, 10);
    const desc = document.getElementById('jrn-desc')?.value?.trim() || '';
    const ref = document.getElementById('jrn-ref')?.value?.trim() || '';
    const alertBox = document.getElementById('jrn-validation-alert');

    const validation = window.InvoiceUtils.validateJournalEntry({
      date,
      entity,
      desc,
      ref,
      lines: window.modalJournalLines
    }, {
      accounts: window.state.accounts,
      clients: window.state.clients,
      suppliers: window.state.suppliers,
      employees: window.state.employees
    });

    if (!validation.valid) {
      if (alertBox) {
        alertBox.innerHTML = validation.errors.map(err => `<div>• ${err}</div>`).join('');
        alertBox.classList.remove('hidden');
      }
      if (typeof window.showToast === 'function') window.showToast(validation.errors[0], 'error');
      return;
    }

    const id = document.getElementById('jrn-number')?.value || `JRN-${String(window.state.journals.length + 1).padStart(3, '0')}`;
    const primaryParty = validation.lines.find(l => l.partyType && l.partyId) || {};

    const newJrn = {
      id,
      date,
      entity,
      ref: ref || id,
      sourceId: ref || id,
      sourceDocRef: ref || id,
      desc,
      partyType: primaryParty.partyType || null,
      partyId: primaryParty.partyId || null,
      partyName: primaryParty.partyName || '',
      amount: validation.totalDebit,
      totalDebit: validation.totalDebit,
      totalCredit: validation.totalCredit,
      debit: validation.lines.filter(l => l.debit > 0).map(l => `${l.accountCode} - ${l.accountName}`).join(' + '),
      credit: validation.lines.filter(l => l.credit > 0).map(l => `${l.accountCode} - ${l.accountName}`).join(' + '),
      lines: validation.lines,
      status: 'متزن',
      posted: true,
      isLocked: true
    };

    window.state.journals.unshift(newJrn);
    recalculateDynamicPartyBalances();
    window.saveState();
    window.closeModal('newJournalModal');
    window.renderAll();
    if (typeof window.showToast === 'function') window.showToast(`تم اعتماد وترحيل القيد المحاسبي ${id} بنجاح`, 'success');
  };

  // ============================================================================
  // 3. UPGRADE SALES INVOICE MODAL (#newInvoiceModal) WITH TAX MODE & LINE REVENUE ACCOUNTS
  // ============================================================================
  function upgradeSalesInvoiceModalDOM() {
    const modal = document.getElementById('newInvoiceModal');
    if (!modal || modal.dataset.accountingUpgraded === '1') return;
    modal.dataset.accountingUpgraded = '1';

    // Inject Customer Database Selector, AR Account, Tax Calculation Mode, Warehouse, Cost Center into Section 2
    const clientInput = document.getElementById('inv-client');
    if (clientInput && clientInput.parentElement) {
      const wrapper = clientInput.parentElement;
      const accountingControlsHtml = document.createElement('div');
      accountingControlsHtml.className = 'sm:col-span-2 grid grid-cols-1 sm:grid-cols-3 gap-3 bg-purple-50/60 p-3 rounded-2xl border border-purple-200/80 mb-1';
      accountingControlsHtml.innerHTML = `
        <div>
          <label class="inv-label text-purple-900">اختيار عميل من قاعدة البيانات</label>
          <select id="inv-customer-select" onchange="onInvoiceCustomerSelected(this.value)" class="inv-input font-bold text-xs">
            <option value="">-- اختر عميلاً مسجلاً أو اكتب اسماً جديداً --</option>
          </select>
        </div>
        <div>
          <label class="inv-label text-purple-900">حساب ذمم العميل (AR Control Account) <span class="text-rose-500">*</span></label>
          <select id="inv-ar-account" class="inv-input font-bold text-xs">
            <option value="110301">110301 — العملاء والمدينون التجاريون</option>
            <option value="110302">110302 — أوراق القبض وشيكات برسم التحصيل</option>
          </select>
        </div>
        <div>
          <label class="inv-label text-purple-900">طريقة احتساب الضريبة (Tax Mode) <span class="text-rose-500">*</span></label>
          <select id="inv-tax-mode" onchange="renderInvoiceRows(true)" class="inv-input font-black text-purple-900 bg-white border-purple-300 text-xs">
            <option value="exclusive">السعر غير شامل الضريبة (تضاف 15%)</option>
            <option value="inclusive">السعر شامل الضريبة (استخراج الضريبة 15%)</option>
          </select>
        </div>
        <div>
          <label class="inv-label">المستودع المصدر</label>
          <select id="inv-warehouse" class="inv-input font-bold text-xs">
            <option value="المستودع الرئيسي">المستودع الرئيسي</option>
            <option value="مستودع الفرع">مستودع الفرع</option>
          </select>
        </div>
        <div>
          <label class="inv-label">مركز التكلفة (Cost Center)</label>
          <select id="inv-cost-center" class="inv-input font-bold text-xs">
            <option value="CC-MAIN">CC-MAIN — المركز الرئيسي</option>
            <option value="CC-SALES">CC-SALES — المبيعات والتسويق</option>
            <option value="CC-PROJECTS">CC-PROJECTS — المشاريع والتنفيذ</option>
          </select>
        </div>
        <div>
          <label class="inv-label">المرجع الداخلي / أمر البيع</label>
          <input type="text" id="inv-internal-ref" placeholder="SO-2026-001" class="inv-input font-mono text-xs">
        </div>
      `;
      wrapper.parentElement.insertBefore(accountingControlsHtml, wrapper);
    }

    // Upgrade Invoice Items Table Header to include Product Selector, Tax Category, Revenue Account, Net, VAT, Total
    const tableHeadRow = modal.querySelector('.inv-items-table thead tr');
    if (tableHeadRow) {
      tableHeadRow.innerHTML = `
        <th class="w-8 text-center">#</th>
        <th class="w-36">الصنف / الخدمة</th>
        <th class="min-w-[150px]">البيان والوصف</th>
        <th class="w-44">حساب الإيراد (Revenue Account)</th>
        <th class="w-16 text-center">الكمية</th>
        <th class="w-24">السعر</th>
        <th class="w-20">الخصم</th>
        <th class="w-28 text-center">فئة الضريبة</th>
        <th class="w-24 text-left">الصافي</th>
        <th class="w-24 text-left">الضريبة</th>
        <th class="w-28 text-left">الإجمالي</th>
        <th class="w-8"></th>
      `;
    }

    // Add Live Accounting Entry Preview inside Side Column
    const sideAside = modal.querySelector('aside');
    if (sideAside && !document.getElementById('inv-journal-preview-box')) {
      const previewCard = document.createElement('section');
      previewCard.className = 'inv-card bg-slate-900 text-white border-slate-800 space-y-2';
      previewCard.innerHTML = `
        <div class="flex items-center justify-between border-b border-slate-800 pb-2">
          <span class="font-black text-xs text-purple-300">معاينة القيد المحاسبي الآلي</span>
          <span id="inv-tax-mode-pill" class="text-[10px] px-2 py-0.5 rounded-full bg-purple-500/20 text-purple-200 font-bold">غير شامل الضريبة</span>
        </div>
        <div id="inv-journal-preview-box" class="space-y-1.5 text-[11px] font-mono"></div>
      `;
      sideAside.appendChild(previewCard);
    }
  }

  function populateInvoiceCustomerDropdown() {
    ensureAccountingStateDefaults();
    const sel = document.getElementById('inv-customer-select');
    if (!sel) return;
    const clients = window.state.clients || [];
    sel.innerHTML = `<option value="">-- اختر عميلاً من قاعدة البيانات (${clients.length} عميل) --</option>` +
      clients.map(c => `<option value="${c.id}">${c.name} — الرصيد: ${fmt(c.balance)} ر.س</option>`).join('');
  }

  window.onInvoiceCustomerSelected = function (clientId) {
    const client = (window.state.clients || []).find(c => String(c.id) === String(clientId));
    if (!client) return;
    const cName = document.getElementById('inv-client');
    const cVat = document.getElementById('inv-client-vat');
    const cAddr = document.getElementById('inv-client-address');
    const arSelect = document.getElementById('inv-ar-account');
    if (cName) cName.value = client.name || '';
    if (cVat) cVat.value = (client.vat && client.vat !== '—') ? client.vat : '';
    if (cAddr) cAddr.value = client.addr || 'الرياض، المملكة العربية السعودية';
    if (arSelect && client.arAccount) arSelect.value = client.arAccount;
    window.calculateModalInvoiceTotals();
  };

  window.onInvoiceProductSelected = function (idx, skuOrId) {
    const prod = (window.state.inventory || []).find(p => p.id === skuOrId || p.sku === skuOrId);
    if (!prod || !window.modalInvoiceRows[idx]) return;
    window.modalInvoiceRows[idx].productId = prod.id || prod.sku;
    window.modalInvoiceRows[idx].sku = prod.sku || '';
    window.modalInvoiceRows[idx].desc = prod.name;
    window.modalInvoiceRows[idx].price = Number(prod.price) || 0;
    window.modalInvoiceRows[idx].unit = prod.unit || 'وحدة';
    window.modalInvoiceRows[idx].revenueAccount = prod.salesRevenueAccount || '410101';
    window.modalInvoiceRows[idx].taxCategory = prod.vatTreatment || 'standard';
    window.renderInvoiceRows(true);
  };

  window.calculateModalInvoiceTotals = function () {
    ensureAccountingStateDefaults();
    const taxMode = document.getElementById('inv-tax-mode')?.value || 'exclusive';
    const entity = document.getElementById('inv-entity')?.value || 'law';
    const defaultRevMap = { law: '410101', restaurant: '410102', farm: '410103', barber: '410104', home: '410105' };
    const defaultRev = defaultRevMap[entity] || '410101';

    let calc = {
      subtotal: 0,
      discountTotal: 0,
      vat: 0,
      total: 0,
      items: [],
      revenueAllocations: {}
    };

    try {
      const safeRows = (window.modalInvoiceRows || []).map(r => ({
        ...r,
        desc: r.desc || 'بند مبيعات',
        qty: Number(r.qty) > 0 ? Number(r.qty) : 1,
        price: Number(r.price) >= 0 ? Number(r.price) : 0,
        discount: Number(r.discount) >= 0 ? Number(r.discount) : 0,
        revenueAccount: r.revenueAccount || defaultRev,
        taxCategory: r.taxCategory || 'standard'
      }));
      calc = window.InvoiceUtils.calculateInvoice(safeRows, {
        taxMode,
        taxSettings: window.state.taxSettings,
        defaultRevenueAccount: defaultRev
      });
    } catch (_) {}

    const sDisp = document.getElementById('modal-subtotal-disp');
    const dDisp = document.getElementById('modal-discount-disp');
    const vDisp = document.getElementById('modal-vat-disp');
    const gDisp = document.getElementById('modal-grand-disp');
    const tDisp = document.getElementById('modal-tafqeet-disp');
    const modePill = document.getElementById('inv-tax-mode-pill');
    const previewBox = document.getElementById('inv-journal-preview-box');

    if (sDisp) sDisp.textContent = fmt(calc.subtotal) + ' ر.س';
    if (dDisp) dDisp.textContent = fmt(calc.discountTotal) + ' ر.س';
    if (vDisp) vDisp.textContent = fmt(calc.vat) + ' ر.س';
    if (gDisp) gDisp.textContent = fmt(calc.total) + ' ر.س';
    if (tDisp && typeof window.numberToArabicWords === 'function') {
      tDisp.textContent = window.numberToArabicWords(calc.total);
    }
    if (modePill) {
      modePill.textContent = taxMode === 'inclusive' ? 'شامل الضريبة (Inclusive)' : 'غير شامل الضريبة (Exclusive)';
    }

    if (previewBox) {
      const arCode = document.getElementById('inv-ar-account')?.value || '110301';
      const clientName = document.getElementById('inv-client')?.value || 'العميل';
      const revLinesHtml = Object.entries(calc.revenueAllocations || {}).map(([code, amt]) =>
        `<div class="flex justify-between text-blue-300"><span>إلى حـ/ الإيراد (${code})</span><span>${fmt(amt)}</span></div>`
      ).join('');
      previewBox.innerHTML = `
        <div class="flex justify-between text-emerald-300"><span>من حـ/ العملاء (${arCode}) - ${clientName}</span><span>${fmt(calc.total)}</span></div>
        ${revLinesHtml}
        <div class="flex justify-between text-amber-300"><span>إلى حـ/ ضريبة المخرجات (210201)</span><span>${fmt(calc.vat)}</span></div>
      `;
    }

    return {
      subtotal: calc.subtotal,
      totalDiscount: calc.discountTotal,
      vat: calc.vat,
      grand: calc.total,
      taxMode,
      items: calc.items,
      revenueAllocations: calc.revenueAllocations
    };
  };

  window.renderInvoiceRows = function (rebuildTable = true) {
    ensureAccountingStateDefaults();
    upgradeSalesInvoiceModalDOM();
    populateInvoiceCustomerDropdown();

    const tbody = document.getElementById('invoiceItemsTbody');
    const badge = document.getElementById('invItemsCountBadge');
    const taxMode = document.getElementById('inv-tax-mode')?.value || 'exclusive';
    const entity = document.getElementById('inv-entity')?.value || 'law';
    const defaultRevMap = { law: '410101', restaurant: '410102', farm: '410103', barber: '410104', home: '410105' };
    const defaultRev = defaultRevMap[entity] || '410101';

    if (badge) badge.textContent = (window.modalInvoiceRows || []).length + ' بند';

    if (rebuildTable && tbody) {
      tbody.innerHTML = '';
      const products = window.state.inventory || [];
      const revAccounts = getLeafAccounts('revenue');

      window.modalInvoiceRows.forEach((r, idx) => {
        if (!r.revenueAccount) r.revenueAccount = defaultRev;
        if (!r.taxCategory) r.taxCategory = 'standard';

        let rowNet = 0;
        let rowVat = 0;
        let rowGrand = 0;
        try {
          const singleCalc = window.InvoiceUtils.calculateInvoice([{
            ...r,
            desc: r.desc || 'بند',
            qty: Number(r.qty) > 0 ? Number(r.qty) : 1
          }], { taxMode, taxSettings: window.state.taxSettings, defaultRevenueAccount: defaultRev });
          if (singleCalc.items[0]) {
            rowNet = singleCalc.items[0].net;
            rowVat = singleCalc.items[0].vat;
            rowGrand = singleCalc.items[0].total;
          }
        } catch (_) {}

        const prodOpts = `<option value="">-- اختر صنفاً --</option>` +
          products.map(p => `<option value="${p.sku || p.id}" ${(r.productId === p.id || r.sku === p.sku) ? 'selected' : ''}>${p.name} (${fmt(p.price)} ر.س)</option>`).join('');

        const revOpts = revAccounts.map(a =>
          `<option value="${a.code}" ${String(a.code) === String(r.revenueAccount) ? 'selected' : ''}>${a.code} — ${a.name}</option>`
        ).join('');

        const tr = document.createElement('tr');
        tr.className = 'hover:bg-slate-50/70 transition';
        tr.innerHTML = `
          <td class="p-2 text-center font-bold text-slate-400">${idx + 1}</td>
          <td class="p-2">
            <select onchange="onInvoiceProductSelected(${idx}, this.value)" class="w-full p-1.5 bg-slate-50 border border-slate-200 rounded-lg font-semibold text-[11px]">
              ${prodOpts}
            </select>
          </td>
          <td class="p-2">
            <input type="text" value="${r.desc || ''}" placeholder="وصف الخدمة أو الصنف..." oninput="updateInvoiceItemRow(${idx}, 'desc', this.value)" class="w-full p-1.5 bg-slate-50 border border-slate-200 rounded-lg font-bold text-slate-800 text-xs">
          </td>
          <td class="p-2">
            <select onchange="updateInvoiceItemRow(${idx}, 'revenueAccount', this.value)" class="w-full p-1.5 bg-purple-50/60 border border-purple-200 rounded-lg font-bold text-purple-900 text-[11px]">
              ${revOpts}
            </select>
          </td>
          <td class="p-2">
            <input type="number" min="1" step="1" value="${r.qty || 1}" oninput="updateInvoiceItemRow(${idx}, 'qty', this.value)" class="w-full p-1.5 bg-slate-50 border border-slate-200 rounded-lg font-bold text-center text-xs">
          </td>
          <td class="p-2">
            <input type="number" min="0" step="0.01" value="${r.price || 0}" oninput="updateInvoiceItemRow(${idx}, 'price', this.value)" class="w-full p-1.5 bg-slate-50 border border-slate-200 rounded-lg font-bold text-xs">
          </td>
          <td class="p-2">
            <input type="number" min="0" step="0.01" value="${r.discount || 0}" oninput="updateInvoiceItemRow(${idx}, 'discount', this.value)" class="w-full p-1.5 bg-slate-50 border border-slate-200 rounded-lg font-bold text-xs">
          </td>
          <td class="p-2">
            <select onchange="updateInvoiceItemRow(${idx}, 'taxCategory', this.value); renderInvoiceRows(true);" class="w-full p-1.5 bg-slate-50 border border-slate-200 rounded-lg font-bold text-[11px]">
              <option value="standard" ${r.taxCategory === 'standard' ? 'selected' : ''}>أساسية 15%</option>
              <option value="zero" ${r.taxCategory === 'zero' ? 'selected' : ''}>صفرية 0%</option>
              <option value="exempt" ${r.taxCategory === 'exempt' ? 'selected' : ''}>معفى 0%</option>
              <option value="out_of_scope" ${r.taxCategory === 'out_of_scope' ? 'selected' : ''}>خارج النطاق</option>
            </select>
          </td>
          <td class="p-2 text-left font-bold text-slate-700 row-net-cell">${fmt(rowNet)}</td>
          <td class="p-2 text-left font-bold text-purple-700 row-vat-cell">${fmt(rowVat)}</td>
          <td class="p-2 text-left font-black text-slate-900 row-total-cell">${fmt(rowGrand)} ر.س</td>
          <td class="p-2 text-center">
            <button type="button" onclick="removeInvoiceItemRow(${idx})" class="text-slate-300 hover:text-red-500 transition p-1" title="حذف البند">
              ${icon('trash-2', 14)}
            </button>
          </td>
        `;
        tbody.appendChild(tr);
      });
    } else if (tbody) {
      // Update row net/vat/total cells in-place without losing input focus
      const calc = window.calculateModalInvoiceTotals();
      const rows = tbody.querySelectorAll('tr');
      (calc.items || []).forEach((item, idx) => {
        const tr = rows[idx];
        if (!tr) return;
        const nCell = tr.querySelector('.row-net-cell');
        const vCell = tr.querySelector('.row-vat-cell');
        const tCell = tr.querySelector('.row-total-cell');
        if (nCell) nCell.textContent = fmt(item.net);
        if (vCell) vCell.textContent = fmt(item.vat);
        if (tCell) tCell.textContent = fmt(item.total) + ' ر.س';
      });
      return;
    }

    window.calculateModalInvoiceTotals();
  };

  window.handleCreateInvoice = function (e) {
    if (e && e.preventDefault) e.preventDefault();
    ensureAccountingStateDefaults();

    const docType = document.getElementById('inv-doc-type')?.value || 'tax_invoice';
    const docNum = document.getElementById('inv-number')?.value?.trim() || ('INV-2026-' + String(window.state.invoices.length + 1).padStart(3, '0'));
    const entity = document.getElementById('inv-entity')?.value || 'law';
    const customerSelectId = document.getElementById('inv-customer-select')?.value || '';
    const client = document.getElementById('inv-client')?.value?.trim() || '';
    const clientVat = document.getElementById('inv-client-vat')?.value?.trim() || '';
    const clientAddress = document.getElementById('inv-client-address')?.value?.trim() || 'الرياض، المملكة العربية السعودية';
    const date = document.getElementById('inv-date')?.value || new Date().toISOString().slice(0, 10);
    const dueDate = document.getElementById('inv-due-date')?.value || date;
    const status = document.getElementById('inv-status')?.value || 'unpaid';
    const method = document.getElementById('inv-payment-method')?.value || 'تحويل بنكي';
    const notes = document.getElementById('inv-notes')?.value?.trim() || '';
    const taxMode = document.getElementById('inv-tax-mode')?.value || 'exclusive';
    const receivableAccount = document.getElementById('inv-ar-account')?.value || '110301';
    const warehouse = document.getElementById('inv-warehouse')?.value || 'المستودع الرئيسي';
    const costCenter = document.getElementById('inv-cost-center')?.value || 'CC-MAIN';
    const internalRef = document.getElementById('inv-internal-ref')?.value?.trim() || '';

    const paymentMethodCode = status === 'paid' ? 'cash' : (status === 'partial' ? 'partial' : 'credit');
    const cashAccount = method.includes('نقد') ? '110101' : '110201';

    const validation = window.InvoiceUtils.validateInvoicePayload({
      id: docNum,
      customerId: customerSelectId || undefined,
      client,
      clientVat,
      clientAddr: clientAddress,
      date,
      due: dueDate,
      taxMode,
      receivableAccount,
      warehouse,
      costCenter,
      paymentMethod: paymentMethodCode,
      cashAccount,
      notes,
      internalRef,
      items: window.modalInvoiceRows
    }, {
      clients: window.state.clients,
      taxSettings: window.state.taxSettings
    });

    if (!validation.valid) {
      if (typeof window.showToast === 'function') window.showToast(validation.errors[0], 'error');
      return null;
    }

    const norm = validation.normalized;

    // Prevent editing an already posted invoice directly
    const existingInv = window.state.invoices.find(i => i.id === docNum);
    if (existingInv && existingInv.posted) {
      if (typeof window.showToast === 'function') {
        window.showToast(`الفاتورة ${docNum} مرحلة مسبقاً ولا يمكن تعديلها مباشرة. استخدم إشعار دائن أو رقم فاتورة جديد.`, 'error');
      }
      return null;
    }

    // Ensure Customer exists in state.clients
    let clientObj = window.state.clients.find(c => String(c.id) === String(norm.customerId) || c.name === norm.client);
    if (!clientObj) {
      clientObj = {
        id: 'CLI-' + String(window.state.clients.length + 101),
        name: norm.client,
        entity,
        phone: '',
        vat: norm.clientVat,
        addr: norm.clientAddr,
        arAccount: norm.receivableAccount,
        defaultRevenueAccount: norm.revenueAccount,
        balance: 0,
        status: 'نشط'
      };
      window.state.clients.unshift(clientObj);
    }
    norm.customerId = clientObj.id;

    const newInvoice = {
      id: docNum,
      entity,
      customerId: clientObj.id,
      client: clientObj.name,
      clientVat: norm.clientVat,
      clientAddress: norm.clientAddr,
      date: norm.date,
      dueDate: norm.due,
      taxMode: norm.taxMode,
      receivableAccount: norm.receivableAccount,
      revenueAccount: norm.revenueAccount,
      revenueAllocations: norm.revenueAllocations,
      warehouse: norm.warehouse,
      costCenter: norm.costCenter,
      subtotal: norm.subtotal,
      discount: norm.discountTotal,
      vat: norm.vat,
      total: norm.total,
      method,
      status: docType === 'quote' || docType === 'proforma' ? 'quote' : status,
      paidAmount: norm.paidAmount,
      outstanding: norm.remainingAmount,
      remainingAmount: norm.remainingAmount,
      item: norm.items.map(r => `${r.desc} (${r.qty} × ${r.price})`).join(' + '),
      docType,
      notes: norm.notes,
      internalRef: norm.internalRef,
      posted: docType !== 'quote' && docType !== 'proforma',
      isLocked: docType !== 'quote' && docType !== 'proforma',
      items: norm.items
    };

    if (docType === 'quote') {
      window.state.quotes.unshift({
        id: docNum.startsWith('QUO') ? docNum : ('QUO-' + docNum.replace(/^INV-/, '')),
        entity,
        customerId: clientObj.id,
        client: clientObj.name,
        date: norm.date,
        validUntil: norm.due,
        total: norm.total,
        status: 'بانتظار موافقة العميل'
      });
    } else {
      window.state.invoices.unshift(newInvoice);

      // Deduct stock if physical item
      norm.items.forEach(item => {
        if (!item.productId && !item.sku) return;
        const invItem = (window.state.inventory || []).find(p => p.id === item.productId || p.sku === item.sku);
        if (invItem) invItem.qty = Math.max(0, Number(invItem.qty || 0) - Number(item.qty || 0));
      });

      // Build and post Automatic Double-Entry Sales Journal (Debit Customer AR, Credit Line Revenue Accounts, Credit Output VAT)
      const builtJrn = window.InvoiceUtils.buildSalesInvoiceJournal(newInvoice);
      const jrnId = 'JRN-' + String(window.state.journals.length + 1).padStart(3, '0');
      window.state.journals.unshift({
        id: jrnId,
        date: norm.date,
        entity,
        ref: docNum,
        sourceId: docNum,
        sourceDocRef: docNum,
        partyType: 'customer',
        partyId: clientObj.id,
        partyName: clientObj.name,
        costCenter: norm.costCenter,
        desc: builtJrn.desc,
        debit: `${norm.receivableAccount} - العملاء (${clientObj.name})`,
        credit: `إيرادات المبيعات + ضريبة القيمة المضافة`,
        amount: norm.total,
        totalDebit: norm.total,
        totalCredit: norm.total,
        lines: builtJrn.lines,
        status: 'متزن',
        posted: true,
        isLocked: true
      });

      // If paid immediately, also post Receipt Voucher + Receipt Journal (Debit Cash/Bank, Credit Customer AR)
      if (status === 'paid') {
        const cashKey = cashAccount === '110101' ? 'cash' : 'rajhi';
        const cashName = cashAccount === '110101' ? 'الصندوق النقدي الرئيسي' : 'حساب مصرف الراجحي';
        window.state.treasury[cashKey] = (Number(window.state.treasury[cashKey]) || 0) + norm.total;

        const rcId = 'RC-' + String((window.state.vouchers || []).length + 101);
        window.state.vouchers.unshift({
          id: rcId,
          type: 'قبض',
          entity,
          date: norm.date,
          customerId: clientObj.id,
          client: clientObj.name,
          account: `${cashAccount} - ${cashName}`,
          notes: `تحصيل فاتورة مبيعات ${docNum} من ${clientObj.name}`,
          amount: norm.total,
          invoiceId: docNum,
          user: (window.currentUser && window.currentUser.name) || 'المدير المالي'
        });

        const rcJrnId = 'JRN-' + String(window.state.journals.length + 1).padStart(3, '0');
        window.state.journals.unshift({
          id: rcJrnId,
          date: norm.date,
          entity,
          ref: rcId,
          sourceId: docNum,
          sourceDocRef: docNum,
          partyType: 'customer',
          partyId: clientObj.id,
          partyName: clientObj.name,
          costCenter: norm.costCenter,
          desc: `سند قبض ${rcId} — تحصيل فاتورة ${docNum} (${clientObj.name})`,
          debit: `${cashAccount} - ${cashName}`,
          credit: `${norm.receivableAccount} - العملاء (${clientObj.name})`,
          amount: norm.total,
          totalDebit: norm.total,
          totalCredit: norm.total,
          status: 'متزن',
          posted: true,
          isLocked: true,
          lines: [
            {
              account: `${cashAccount} - ${cashName}`,
              accountCode: cashAccount,
              accountName: cashName,
              debit: norm.total,
              credit: 0,
              partyType: null,
              partyId: null,
              partyName: '',
              costCenter: norm.costCenter,
              sourceDocRef: rcId,
              desc: `تحصيل سند قبض ${rcId}`
            },
            {
              account: `${norm.receivableAccount} - العملاء والمدينون التجاريون`,
              accountCode: norm.receivableAccount,
              accountName: 'العملاء والمدينون التجاريون',
              debit: 0,
              credit: norm.total,
              partyType: 'customer',
              partyId: clientObj.id,
              partyName: clientObj.name,
              costCenter: norm.costCenter,
              sourceDocRef: docNum,
              desc: `سداد ذمة العميل ${clientObj.name} عن فاتورة ${docNum}`
            }
          ]
        });
      }
    }

    recalculateDynamicPartyBalances();
    window.saveState();
    window.closeModal('newInvoiceModal');
    window.renderAll();
    if (typeof window.updateCharts === 'function') window.updateCharts();
    if (typeof window.showToast === 'function') {
      window.showToast(`تم حفظ وترحيل الفاتورة ${docNum} وتوليد القيود المحاسبية بنجاح!`, 'success');
    }
    return newInvoice;
  };

  // ============================================================================
  // 4. UPGRADE PURCHASE INVOICE MODAL (#newPurchaseModal) TO MULTI-LINE WITH ACCOUNT ALLOCATION & TAX MODE
  // ============================================================================
  window.modalPurchaseRows = [
    { productId: '', desc: 'مشتريات بضائع وخامات تشغيلية', expenseAccount: '110401', qty: 1, price: 1000, discount: 0, taxCategory: 'standard' }
  ];

  function upgradePurchaseModalDOM() {
    const modal = document.getElementById('newPurchaseModal');
    if (!modal || modal.dataset.upgraded === '1') return;
    modal.dataset.upgraded = '1';

    const box = modal.querySelector('.max-w-lg');
    if (box) {
      box.classList.remove('max-w-lg');
      box.classList.add('max-w-5xl');
    }

    const form = document.getElementById('newPurchaseForm');
    if (!form) return;

    form.innerHTML = `
      <div class="grid grid-cols-1 sm:grid-cols-4 gap-3 bg-slate-50 p-3.5 rounded-2xl border border-slate-200">
        <div>
          <label class="block font-bold text-slate-700 mb-1">اختيار المورد من السجل</label>
          <select id="po-supplier-select" onchange="onPurchaseSupplierSelected(this.value)" class="w-full p-2 bg-white border border-slate-200 rounded-xl font-bold text-xs">
            <option value="">-- اختر مورداً أو اكتب اسماً جديداً --</option>
          </select>
        </div>
        <div>
          <label class="block font-bold text-slate-700 mb-1">اسم المورد / الشركة <span class="text-rose-500">*</span></label>
          <input type="text" id="po-vendor" required placeholder="مثال: شركة التوريدات الغذائية" class="w-full p-2 bg-white border border-slate-200 rounded-xl font-bold text-xs">
        </div>
        <div>
          <label class="block font-bold text-slate-700 mb-1">رقم فاتورة المورد</label>
          <input type="text" id="po-supplier-inv-no" placeholder="SUP-INV-992" class="w-full p-2 bg-white border border-slate-200 rounded-xl font-mono text-xs">
        </div>
        <div>
          <label class="block font-bold text-slate-700 mb-1">تاريخ الفاتورة <span class="text-rose-500">*</span></label>
          <input type="date" id="po-date" required class="w-full p-2 bg-white border border-slate-200 rounded-xl font-bold text-xs">
        </div>
        <div>
          <label class="block font-bold text-slate-700 mb-1">حساب ذمم الموردين (AP Control)</label>
          <select id="po-ap-account" class="w-full p-2 bg-white border border-slate-200 rounded-xl font-bold text-xs">
            <option value="210101">210101 — موردو الخامات والبضائع (آجل)</option>
            <option value="210102">210102 — أوراق الدفع وشيكات مؤجلة</option>
          </select>
        </div>
        <div>
          <label class="block font-bold text-slate-700 mb-1">طريقة احتساب الضريبة (Tax Mode)</label>
          <select id="po-tax-mode" onchange="renderPurchaseRows()" class="w-full p-2 bg-purple-50 border border-purple-300 text-purple-900 rounded-xl font-black text-xs">
            <option value="exclusive">غير شامل الضريبة (تضاف 15%)</option>
            <option value="inclusive">شامل الضريبة (استخراج الضريبة 15%)</option>
          </select>
        </div>
        <div>
          <label class="block font-bold text-slate-700 mb-1">طريقة الدفع</label>
          <select id="po-payment-method" class="w-full p-2 bg-white border border-slate-200 rounded-xl font-bold text-xs">
            <option value="credit">آجل (ذمم دائنة للمورد)</option>
            <option value="cash">نقدي — الصندوق الرئيسي</option>
            <option value="rajhi">تحويل بنكي — مصرف الراجحي</option>
            <option value="ahli">تحويل بنكي — البنك الأهلي</option>
          </select>
        </div>
        <div>
          <label class="block font-bold text-slate-700 mb-1">النشاط والمركز</label>
          <select id="po-entity" class="w-full p-2 bg-white border border-slate-200 rounded-xl font-bold text-xs">
            <option value="law">شركة المحاماة</option>
            <option value="restaurant">المطعم</option>
            <option value="farm">المزرعة</option>
            <option value="barber">الحلاق</option>
            <option value="home">البيت</option>
          </select>
        </div>
      </div>

      <div class="rounded-2xl border border-slate-200 overflow-hidden bg-white">
        <div class="flex items-center justify-between px-4 py-2.5 bg-slate-100 border-b border-slate-200">
          <span class="font-black text-xs text-slate-800">بنود فاتورة المشتريات وتوجيه حسابات المخزون / المصروفات</span>
          <button type="button" onclick="addPurchaseItemRow()" class="px-3 py-1.5 bg-purple-700 hover:bg-purple-800 text-white rounded-xl font-black text-[11px] flex items-center gap-1">
            ${icon('plus', 13)} <span>إضافة بند شراء</span>
          </button>
        </div>
        <div class="overflow-x-auto">
          <table class="w-full text-right text-xs min-w-[780px]">
            <thead class="bg-slate-50 text-slate-600 font-bold border-b border-slate-200">
              <tr>
                <th class="p-2 w-8 text-center">#</th>
                <th class="p-2">بيان الصنف / الخدمة المشتراة</th>
                <th class="p-2 w-52">حساب المخزون / المصروف (Debit)</th>
                <th class="p-2 w-20 text-center">الكمية</th>
                <th class="p-2 w-28">سعر الوحدة</th>
                <th class="p-2 w-28">فئة الضريبة</th>
                <th class="p-2 w-24 text-left">الصافي</th>
                <th class="p-2 w-24 text-left">الضريبة</th>
                <th class="p-2 w-28 text-left">الإجمالي</th>
                <th class="p-2 w-8"></th>
              </tr>
            </thead>
            <tbody id="poItemsTbody" class="divide-y divide-slate-100"></tbody>
          </table>
        </div>
      </div>

      <!-- Summary Box -->
      <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div class="bg-slate-900 text-white p-3.5 rounded-2xl text-[11px] font-mono space-y-1" id="po-journal-preview"></div>
        <div class="bg-slate-50 p-3.5 rounded-2xl border border-slate-200/80 space-y-1.5 text-slate-700 font-bold">
          <div class="flex justify-between">
            <span>الصافي قبل الضريبة:</span>
            <span id="po-modal-subtotal">0.00 ر.س</span>
          </div>
          <div class="flex justify-between">
            <span>ضريبة المدخلات المستردة (110501):</span>
            <span id="po-modal-vat" class="text-purple-700">0.00 ر.س</span>
          </div>
          <div class="flex justify-between text-slate-900 text-sm font-black pt-1 border-t border-slate-200">
            <span>الإجمالي النهائي للفاتورة:</span>
            <span id="po-modal-total" class="text-rose-600">0.00 ر.س</span>
          </div>
        </div>
      </div>

      <div class="flex items-center justify-end gap-3 pt-2 border-t border-slate-100">
        <button type="button" onclick="closeModal('newPurchaseModal')" class="px-4 py-2 text-slate-500 rounded-xl font-bold">إلغاء</button>
        <button type="submit" class="gathern-gradient-btn text-white px-6 py-2.5 rounded-xl font-black transition">حفظ فاتورة الشراء وترحيل القيد</button>
      </div>
    `;
  }

  window.onPurchaseSupplierSelected = function (supId) {
    const sup = (window.state.suppliers || []).find(s => String(s.id) === String(supId));
    if (!sup) return;
    const vInput = document.getElementById('po-vendor');
    const apSelect = document.getElementById('po-ap-account');
    if (vInput) vInput.value = sup.name;
    if (apSelect && sup.apAccount) apSelect.value = sup.apAccount;
    window.calculatePurchaseModalTotals();
  };

  window.addPurchaseItemRow = function () {
    window.modalPurchaseRows.push({
      desc: '',
      expenseAccount: '110401',
      qty: 1,
      price: 0,
      discount: 0,
      taxCategory: 'standard'
    });
    window.renderPurchaseRows();
  };

  window.removePurchaseItemRow = function (idx) {
    if (window.modalPurchaseRows.length <= 1) return;
    window.modalPurchaseRows.splice(idx, 1);
    window.renderPurchaseRows();
  };

  window.updatePurchaseItemRow = function (idx, field, val, rerender = false) {
    const row = window.modalPurchaseRows[idx];
    if (!row) return;
    if (field === 'qty' || field === 'price' || field === 'discount') {
      row[field] = parseFloat(val) || 0;
    } else {
      row[field] = val;
    }
    if (rerender) window.renderPurchaseRows();
    else window.calculatePurchaseModalTotals();
  };

  window.renderPurchaseRows = function () {
    ensureAccountingStateDefaults();
    upgradePurchaseModalDOM();

    const supSelect = document.getElementById('po-supplier-select');
    if (supSelect) {
      const curVal = supSelect.value;
      supSelect.innerHTML = `<option value="">-- اختر مورداً من السجل (${(window.state.suppliers || []).length}) --</option>` +
        (window.state.suppliers || []).map(s => `<option value="${s.id}" ${s.id === curVal ? 'selected' : ''}>${s.name} — الرصيد: ${fmt(s.balance)} ر.س</option>`).join('');
    }

    const tbody = document.getElementById('poItemsTbody');
    if (!tbody) return;
    tbody.innerHTML = '';

    const expAndInvAccounts = getLeafAccounts().filter(a => a.type === 'expense' || String(a.code).startsWith('1104') || String(a.code).startsWith('1201'));

    window.modalPurchaseRows.forEach((r, idx) => {
      const accOpts = expAndInvAccounts.map(a =>
        `<option value="${a.code}" ${String(a.code) === String(r.expenseAccount) ? 'selected' : ''}>${a.code} — ${a.name}</option>`
      ).join('');

      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td class="p-2 text-center font-bold text-slate-400">${idx + 1}</td>
        <td class="p-2">
          <input type="text" value="${r.desc || ''}" placeholder="اسم المادة أو الخدمة..." oninput="updatePurchaseItemRow(${idx}, 'desc', this.value)" class="w-full p-1.5 bg-slate-50 border border-slate-200 rounded-lg font-bold text-xs">
        </td>
        <td class="p-2">
          <select onchange="updatePurchaseItemRow(${idx}, 'expenseAccount', this.value, true)" class="w-full p-1.5 bg-amber-50/60 border border-amber-200 rounded-lg font-bold text-[11px]">
            ${accOpts}
          </select>
        </td>
        <td class="p-2">
          <input type="number" min="1" step="1" value="${r.qty || 1}" oninput="updatePurchaseItemRow(${idx}, 'qty', this.value)" class="w-full p-1.5 bg-slate-50 border border-slate-200 rounded-lg font-bold text-center text-xs">
        </td>
        <td class="p-2">
          <input type="number" min="0" step="0.01" value="${r.price || 0}" oninput="updatePurchaseItemRow(${idx}, 'price', this.value)" class="w-full p-1.5 bg-slate-50 border border-slate-200 rounded-lg font-bold text-xs">
        </td>
        <td class="p-2">
          <select onchange="updatePurchaseItemRow(${idx}, 'taxCategory', this.value, true)" class="w-full p-1.5 bg-slate-50 border border-slate-200 rounded-lg font-bold text-[11px]">
            <option value="standard" ${r.taxCategory === 'standard' ? 'selected' : ''}>15% أساسية</option>
            <option value="zero" ${r.taxCategory === 'zero' ? 'selected' : ''}>0% صفرية</option>
            <option value="exempt" ${r.taxCategory === 'exempt' ? 'selected' : ''}>معفى</option>
          </select>
        </td>
        <td class="p-2 text-left font-bold text-slate-700 po-net-cell">0.00</td>
        <td class="p-2 text-left font-bold text-purple-700 po-vat-cell">0.00</td>
        <td class="p-2 text-left font-black text-slate-900 po-total-cell">0.00 ر.س</td>
        <td class="p-2 text-center">
          <button type="button" onclick="removePurchaseItemRow(${idx})" class="text-slate-300 hover:text-rose-600">${icon('trash-2', 14)}</button>
        </td>
      `;
      tbody.appendChild(tr);
    });

    window.calculatePurchaseModalTotals();
  };

  window.calculatePurchaseModalTotals = function () {
    const taxMode = document.getElementById('po-tax-mode')?.value || 'exclusive';
    let calc = { subtotal: 0, vat: 0, total: 0, items: [], expenseAllocations: {} };
    try {
      const safe = (window.modalPurchaseRows || []).map(r => ({
        ...r,
        desc: r.desc || 'بند شراء',
        qty: Number(r.qty) > 0 ? Number(r.qty) : 1,
        price: Number(r.price) >= 0 ? Number(r.price) : 0
      }));
      calc = window.InvoiceUtils.calculateInvoice(safe, {
        taxMode,
        taxSettings: window.state.taxSettings,
        defaultExpenseAccount: '110401'
      });
    } catch (_) {}

    const tbody = document.getElementById('poItemsTbody');
    if (tbody) {
      const rows = tbody.querySelectorAll('tr');
      (calc.items || []).forEach((it, idx) => {
        const tr = rows[idx];
        if (!tr) return;
        const n = tr.querySelector('.po-net-cell');
        const v = tr.querySelector('.po-vat-cell');
        const t = tr.querySelector('.po-total-cell');
        if (n) n.textContent = fmt(it.net);
        if (v) v.textContent = fmt(it.vat);
        if (t) t.textContent = fmt(it.total) + ' ر.س';
      });
    }

    const sEl = document.getElementById('po-modal-subtotal');
    const vEl = document.getElementById('po-modal-vat');
    const tEl = document.getElementById('po-modal-total');
    const prevEl = document.getElementById('po-journal-preview');

    if (sEl) sEl.textContent = fmt(calc.subtotal) + ' ر.س';
    if (vEl) vEl.textContent = fmt(calc.vat) + ' ر.س';
    if (tEl) tEl.textContent = fmt(calc.total) + ' ر.س';

    if (prevEl) {
      const apCode = document.getElementById('po-ap-account')?.value || '210101';
      const vendor = document.getElementById('po-vendor')?.value || 'المورد';
      const expLines = Object.entries(calc.expenseAllocations || {}).map(([code, amt]) =>
        `<div class="flex justify-between text-emerald-300"><span>من حـ/ المخزون/المصروف (${code})</span><span>${fmt(amt)}</span></div>`
      ).join('');
      prevEl.innerHTML = `
        <div class="text-purple-300 font-bold mb-1">القيد المحاسبي التلقائي للمشتريات:</div>
        ${expLines}
        <div class="flex justify-between text-amber-300"><span>من حـ/ ضريبة المدخلات (110501)</span><span>${fmt(calc.vat)}</span></div>
        <div class="flex justify-between text-blue-300"><span>إلى حـ/ الموردين (${apCode}) - ${vendor}</span><span>${fmt(calc.total)}</span></div>
      `;
    }

    return calc;
  };

  window.openNewPurchaseModal = function () {
    ensureAccountingStateDefaults();
    upgradePurchaseModalDOM();
    const d = document.getElementById('po-date');
    if (d) d.value = new Date().toISOString().slice(0, 10);
    if (!window.modalPurchaseRows || window.modalPurchaseRows.length === 0) {
      window.modalPurchaseRows = [{ desc: 'مشتريات بضائع وخامات', expenseAccount: '110401', qty: 1, price: 1000, discount: 0, taxCategory: 'standard' }];
    }
    window.renderPurchaseRows();
    window.openModal('newPurchaseModal');
  };

  window.handleCreatePurchase = function (e) {
    if (e && e.preventDefault) e.preventDefault();
    ensureAccountingStateDefaults();

    const entity = document.getElementById('po-entity')?.value || 'law';
    const supSelectId = document.getElementById('po-supplier-select')?.value || '';
    const vendor = document.getElementById('po-vendor')?.value?.trim() || '';
    const supplierInvoiceNumber = document.getElementById('po-supplier-inv-no')?.value?.trim() || '';
    const date = document.getElementById('po-date')?.value || new Date().toISOString().slice(0, 10);
    const payableAccount = document.getElementById('po-ap-account')?.value || '210101';
    const taxMode = document.getElementById('po-tax-mode')?.value || 'exclusive';
    const payMethod = document.getElementById('po-payment-method')?.value || 'credit';

    const validation = window.InvoiceUtils.validatePurchaseInvoicePayload({
      supplierId: supSelectId || undefined,
      supplier: vendor,
      supplierInvoiceNumber,
      date,
      taxMode,
      payableAccount,
      paymentMethod: payMethod === 'credit' ? 'credit' : 'cash',
      cashAccount: payMethod === 'cash' ? '110101' : '110201',
      items: window.modalPurchaseRows
    }, {
      suppliers: window.state.suppliers,
      taxSettings: window.state.taxSettings
    });

    if (!validation.valid) {
      if (typeof window.showToast === 'function') window.showToast(validation.errors[0], 'error');
      return;
    }

    const norm = validation.normalized;
    const id = `PO-2026-${String(window.state.purchases.length + 1).padStart(3, '0')}`;

    let supObj = window.state.suppliers.find(s => String(s.id) === String(norm.supplierId) || s.name === norm.supplier);
    if (!supObj) {
      supObj = {
        id: 'SUP-' + String(window.state.suppliers.length + 101),
        name: norm.supplier,
        entity,
        phone: '',
        vat: '',
        apAccount: norm.payableAccount,
        defaultExpenseAccount: norm.expenseAccount,
        balance: 0,
        status: 'معتمد'
      };
      window.state.suppliers.unshift(supObj);
    }
    norm.supplierId = supObj.id;

    const purchaseRecord = {
      id,
      entity,
      supplierId: supObj.id,
      supplier: supObj.name,
      vendor: supObj.name,
      supplierInvoiceNumber: norm.supplierInvoiceNumber,
      date: norm.date,
      taxMode: norm.taxMode,
      payableAccount: norm.payableAccount,
      expenseAccount: norm.expenseAccount,
      recoverableVatAccount: norm.recoverableVatAccount,
      expenseAllocations: norm.expenseAllocations,
      items: norm.items,
      itemsDesc: norm.itemsDesc,
      subtotal: norm.subtotal,
      vat: norm.vat,
      total: norm.total,
      paidAmount: norm.paidAmount,
      remainingAmount: norm.remainingAmount,
      status: payMethod === 'credit' ? 'آجل مستحق' : 'مسدد',
      posted: true,
      isLocked: true
    };

    window.state.purchases.unshift({
      ...purchaseRecord,
      items: norm.itemsDesc,
      lineItems: norm.items
    });

    // Post Purchase Journal (Debit Expense/Inventory + Debit Input VAT 110501 / Credit Supplier AP 210101)
    const builtJrn = window.InvoiceUtils.buildPurchaseInvoiceJournal(purchaseRecord);
    const jrnId = `JRN-${String(window.state.journals.length + 1).padStart(3, '0')}`;
    window.state.journals.unshift({
      id: jrnId,
      date: norm.date,
      entity,
      ref: id,
      sourceId: id,
      sourceDocRef: id,
      partyType: 'supplier',
      partyId: supObj.id,
      partyName: supObj.name,
      desc: builtJrn.desc,
      debit: `مشتريات ومخزون + ضريبة مدخلات`,
      credit: `${norm.payableAccount} - الموردون (${supObj.name})`,
      amount: norm.total,
      totalDebit: norm.total,
      totalCredit: norm.total,
      lines: builtJrn.lines,
      status: 'متزن',
      posted: true,
      isLocked: true
    });

    // If paid immediately, record Payment Voucher + Payment Journal (Debit Supplier AP / Credit Cash or Bank)
    if (payMethod !== 'credit') {
      const cashCode = payMethod === 'cash' ? '110101' : (payMethod === 'ahli' ? '110202' : '110201');
      const cashName = payMethod === 'cash' ? 'الصندوق النقدي' : (payMethod === 'ahli' ? 'البنك الأهلي' : 'مصرف الراجحي');
      if (payMethod === 'cash') window.state.treasury.cash -= norm.total;
      else if (payMethod === 'ahli') window.state.treasury.ahli -= norm.total;
      else window.state.treasury.rajhi -= norm.total;

      const pvId = `PV-${String(window.state.vouchers.length + 101).padStart(3, '0')}`;
      window.state.vouchers.unshift({
        id: pvId,
        type: 'صرف',
        entity,
        date: norm.date,
        supplierId: supObj.id,
        supplier: supObj.name,
        account: `${cashCode} - ${cashName}`,
        notes: `سداد فاتورة مشتريات ${id} للمورد ${supObj.name}`,
        amount: norm.total,
        user: (window.currentUser && window.currentUser.name) || 'المدير المالي'
      });

      const pvJrnId = `JRN-${String(window.state.journals.length + 1).padStart(3, '0')}`;
      window.state.journals.unshift({
        id: pvJrnId,
        date: norm.date,
        entity,
        ref: pvId,
        sourceId: id,
        sourceDocRef: id,
        partyType: 'supplier',
        partyId: supObj.id,
        partyName: supObj.name,
        desc: `سند صرف ${pvId} — سداد فاتورة شراء ${id} للمورد ${supObj.name}`,
        debit: `${norm.payableAccount} - الموردون (${supObj.name})`,
        credit: `${cashCode} - ${cashName}`,
        amount: norm.total,
        totalDebit: norm.total,
        totalCredit: norm.total,
        status: 'متزن',
        posted: true,
        isLocked: true,
        lines: [
          {
            account: `${norm.payableAccount} - الموردون والذمم الدائنة`,
            accountCode: norm.payableAccount,
            accountName: 'الموردون والذمم الدائنة',
            debit: norm.total,
            credit: 0,
            partyType: 'supplier',
            partyId: supObj.id,
            partyName: supObj.name,
            costCenter: 'CC-MAIN',
            sourceDocRef: id,
            desc: `تخفيض ذمة المورد ${supObj.name} عن فاتورة ${id}`
          },
          {
            account: `${cashCode} - ${cashName}`,
            accountCode: cashCode,
            accountName: cashName,
            debit: 0,
            credit: norm.total,
            partyType: null,
            partyId: null,
            partyName: '',
            costCenter: 'CC-MAIN',
            sourceDocRef: pvId,
            desc: `صرف سند ${pvId}`
          }
        ]
      });
    }

    recalculateDynamicPartyBalances();
    window.saveState();
    window.closeModal('newPurchaseModal');
    window.renderAll();
    if (typeof window.updateCharts === 'function') window.updateCharts();
    if (typeof window.showToast === 'function') {
      window.showToast(`تم تسجيل فاتورة الشراء ${id} وترحيل القيود المحاسبية بنجاح!`, 'success');
    }
  };

  // ============================================================================
  // 5. GENERAL LEDGER & PARTY STATEMENTS EXPLORER (الأستاذ العام وكشوف حسابات العملاء والموردين)
  // ============================================================================
  function injectGeneralLedgerExplorerInJournalView() {
    const viewJournal = document.getElementById('view-journal');
    if (!viewJournal || document.getElementById('gl-explorer-card')) return;

    const explorer = document.createElement('div');
    explorer.id = 'gl-explorer-card';
    explorer.className = 'bg-white rounded-2xl border border-slate-200/80 shadow-xs p-5 space-y-4';
    explorer.innerHTML = `
      <div class="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 pb-3">
        <div>
          <h3 class="text-base font-black text-slate-900 flex items-center gap-2">
            ${icon('book-open', 18, 'text-purple-700')}
            <span>مستكشف الأستاذ العام وكشوف حسابات العملاء والموردين (General Ledger & Party Statements)</span>
          </h3>
          <p class="text-xs text-slate-400 font-medium mt-0.5">كشف حساب تفصيلي بالرصيد الافتتاحي والحركات المدينة والدائنة والرصيد التراكمي مع تتبع المستند المصدر</p>
        </div>
        <div class="flex items-center gap-2">
          <button type="button" onclick="runGeneralLedgerFilter()" class="px-4 py-2 bg-purple-700 hover:bg-purple-800 text-white rounded-xl text-xs font-black transition flex items-center gap-1.5">
            ${icon('search', 14)} <span>عرض الكشف</span>
          </button>
        </div>
      </div>

      <div class="grid grid-cols-1 sm:grid-cols-5 gap-3 text-xs bg-slate-50 p-3.5 rounded-xl border border-slate-200/70">
        <div>
          <label class="block font-bold text-slate-600 mb-1">نوع الكشف</label>
          <select id="gl-filter-mode" onchange="onGlFilterModeChange()" class="w-full p-2 bg-white border border-slate-200 rounded-lg font-bold">
            <option value="all">جميع حركات الأستاذ العام</option>
            <option value="account">كشف حساب محاسبي (Account Ledger)</option>
            <option value="customer">كشف حساب عميل (Customer Statement)</option>
            <option value="supplier">كشف حساب مورد (Supplier Statement)</option>
          </select>
        </div>
        <div id="gl-filter-account-wrap">
          <label class="block font-bold text-slate-600 mb-1">الحساب المحاسبي</label>
          <select id="gl-filter-account" onchange="runGeneralLedgerFilter()" class="w-full p-2 bg-white border border-slate-200 rounded-lg font-bold">
            <option value="">-- كافة الحسابات --</option>
          </select>
        </div>
        <div id="gl-filter-party-wrap">
          <label class="block font-bold text-slate-600 mb-1">العميل / المورد</label>
          <select id="gl-filter-party" onchange="runGeneralLedgerFilter()" class="w-full p-2 bg-white border border-slate-200 rounded-lg font-bold">
            <option value="">-- كافة الأطراف --</option>
          </select>
        </div>
        <div>
          <label class="block font-bold text-slate-600 mb-1">من تاريخ</label>
          <input type="date" id="gl-filter-from" onchange="runGeneralLedgerFilter()" class="w-full p-2 bg-white border border-slate-200 rounded-lg font-semibold">
        </div>
        <div>
          <label class="block font-bold text-slate-600 mb-1">إلى تاريخ</label>
          <input type="date" id="gl-filter-to" onchange="runGeneralLedgerFilter()" class="w-full p-2 bg-white border border-slate-200 rounded-lg font-semibold">
        </div>
      </div>

      <!-- Summary KPI Strip -->
      <div class="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
        <div class="p-3 rounded-xl bg-slate-50 border border-slate-200">
          <span class="text-slate-400 font-bold block">الرصيد الافتتاحي</span>
          <span id="gl-sum-opening" class="text-sm font-black text-slate-800">0.00 ر.س</span>
        </div>
        <div class="p-3 rounded-xl bg-emerald-50/60 border border-emerald-200">
          <span class="text-emerald-700 font-bold block">إجمالي المدين للفترة</span>
          <span id="gl-sum-debit" class="text-sm font-black text-emerald-800">0.00 ر.س</span>
        </div>
        <div class="p-3 rounded-xl bg-blue-50/60 border border-blue-200">
          <span class="text-blue-700 font-bold block">إجمالي الدائن للفترة</span>
          <span id="gl-sum-credit" class="text-sm font-black text-blue-800">0.00 ر.س</span>
        </div>
        <div class="p-3 rounded-xl bg-purple-50 border border-purple-200">
          <span class="text-purple-700 font-bold block">الرصيد الختامي (Running Balance)</span>
          <span id="gl-sum-closing" class="text-base font-black text-purple-900">0.00 ر.س</span>
        </div>
      </div>

      <div class="overflow-x-auto border border-slate-200 rounded-xl max-h-96">
        <table class="w-full text-right text-xs">
          <thead class="bg-slate-100 text-slate-600 font-bold border-b border-slate-200 sticky top-0">
            <tr>
              <th class="p-3">التاريخ</th>
              <th class="p-3">رقم القيد</th>
              <th class="p-3">المستند المصدر</th>
              <th class="p-3">الحساب</th>
              <th class="p-3">الطرف المرتبط (العميل/المورد)</th>
              <th class="p-3">البيان</th>
              <th class="p-3 text-left">مدين</th>
              <th class="p-3 text-left">دائن</th>
              <th class="p-3 text-left font-black">الرصيد التراكمي</th>
            </tr>
          </thead>
          <tbody id="glExplorerTbody" class="divide-y divide-slate-100 font-medium"></tbody>
        </table>
      </div>
    `;

    const trialBalBar = viewJournal.children[1];
    if (trialBalBar) {
      viewJournal.insertBefore(explorer, trialBalBar.nextSibling);
    } else {
      viewJournal.appendChild(explorer);
    }
  }

  window.onGlFilterModeChange = function () {
    ensureAccountingStateDefaults();
    const mode = document.getElementById('gl-filter-mode')?.value || 'all';
    const accSel = document.getElementById('gl-filter-account');
    const partySel = document.getElementById('gl-filter-party');

    if (accSel) {
      accSel.innerHTML = `<option value="">-- كافة الحسابات --</option>` + buildAccountOptions('');
      if (mode === 'customer') accSel.value = '110301';
      else if (mode === 'supplier') accSel.value = '210101';
    }

    if (partySel) {
      if (mode === 'customer') {
        partySel.innerHTML = `<option value="">-- جميع العملاء --</option>` +
          (window.state.clients || []).map(c => `<option value="${c.id}">${c.name} (${c.id})</option>`).join('');
      } else if (mode === 'supplier') {
        partySel.innerHTML = `<option value="">-- جميع الموردين --</option>` +
          (window.state.suppliers || []).map(s => `<option value="${s.id}">${s.name} (${s.id})</option>`).join('');
      } else {
        partySel.innerHTML = `<option value="">-- كافة الأطراف --</option>` +
          (window.state.clients || []).map(c => `<option value="${c.id}">عميل: ${c.name}</option>`).join('') +
          (window.state.suppliers || []).map(s => `<option value="${s.id}">مورد: ${s.name}</option>`).join('');
      }
    }

    window.runGeneralLedgerFilter();
  };

  window.runGeneralLedgerFilter = function () {
    ensureAccountingStateDefaults();
    injectGeneralLedgerExplorerInJournalView();
    const mode = document.getElementById('gl-filter-mode')?.value || 'all';
    const accountCode = document.getElementById('gl-filter-account')?.value || '';
    const partyId = document.getElementById('gl-filter-party')?.value || '';
    const fromDate = document.getElementById('gl-filter-from')?.value || '';
    const toDate = document.getElementById('gl-filter-to')?.value || '';

    let ledger;
    if (mode === 'customer' && partyId) {
      ledger = window.InvoiceUtils.computePartyStatement('customer', partyId, window.state, { fromDate, toDate });
    } else if (mode === 'supplier' && partyId) {
      ledger = window.InvoiceUtils.computePartyStatement('supplier', partyId, window.state, { fromDate, toDate });
    } else {
      ledger = window.InvoiceUtils.computeGeneralLedger({
        accountCode: accountCode || undefined,
        partyType: mode === 'customer' ? 'customer' : (mode === 'supplier' ? 'supplier' : undefined),
        partyId: partyId || undefined,
        fromDate: fromDate || undefined,
        toDate: toDate || undefined
      }, window.state);
    }

    const elOpen = document.getElementById('gl-sum-opening');
    const elDeb = document.getElementById('gl-sum-debit');
    const elCred = document.getElementById('gl-sum-credit');
    const elClose = document.getElementById('gl-sum-closing');
    if (elOpen) elOpen.textContent = fmt(ledger.openingBalance) + ' ر.س';
    if (elDeb) elDeb.textContent = fmt(ledger.totalDebit) + ' ر.س';
    if (elCred) elCred.textContent = fmt(ledger.totalCredit) + ' ر.س';
    if (elClose) elClose.textContent = fmt(ledger.closingBalance) + ' ر.س';

    const tbody = document.getElementById('glExplorerTbody');
    if (!tbody) return;
    tbody.innerHTML = '';

    if (!ledger.entries || ledger.entries.length === 0) {
      tbody.innerHTML = `<tr><td colspan="9" class="py-8 text-center text-slate-400 font-bold">لا توجد حركات مطابقة للفلاتر المحددة</td></tr>`;
      return;
    }

    ledger.entries.forEach(row => {
      const partyBadge = row.partyName
        ? `<span class="px-2 py-0.5 rounded-md ${row.partyType === 'supplier' ? 'bg-amber-50 text-amber-800' : 'bg-purple-50 text-purple-800'} font-bold text-[10px]">${row.partyType === 'supplier' ? 'مورد: ' : 'عميل: '}${row.partyName}</span>`
        : '<span class="text-slate-300">—</span>';

      const tr = document.createElement('tr');
      tr.className = 'hover:bg-slate-50 transition';
      tr.innerHTML = `
        <td class="p-3 text-slate-500 font-mono">${row.date}</td>
        <td class="p-3 font-mono font-bold text-slate-700">${row.journalId}</td>
        <td class="p-3"><span class="px-2 py-0.5 rounded bg-slate-100 text-slate-700 font-mono font-bold text-[10px]">${row.ref || row.journalId}</span></td>
        <td class="p-3 font-bold text-slate-800">${row.accountCode} — ${row.accountName}</td>
        <td class="p-3">${partyBadge}</td>
        <td class="p-3 text-slate-600">${row.description}</td>
        <td class="p-3 text-left font-black ${row.debit > 0 ? 'text-emerald-700' : 'text-slate-300'}">${row.debit > 0 ? fmt(row.debit) : '0.00'}</td>
        <td class="p-3 text-left font-black ${row.credit > 0 ? 'text-rose-600' : 'text-slate-300'}">${row.credit > 0 ? fmt(row.credit) : '0.00'}</td>
        <td class="p-3 text-left font-black text-slate-900">${fmt(row.runningBalance)} ر.س</td>
      `;
      tbody.appendChild(tr);
    });
  };

  window.openPartyStatement = function (partyType, partyIdOrName) {
    ensureAccountingStateDefaults();
    window.switchView('journal');
    injectGeneralLedgerExplorerInJournalView();
    const modeSel = document.getElementById('gl-filter-mode');
    if (modeSel) {
      modeSel.value = partyType === 'supplier' ? 'supplier' : 'customer';
      window.onGlFilterModeChange();
    }
    const partySel = document.getElementById('gl-filter-party');
    if (partySel) {
      partySel.value = partyIdOrName;
    }
    window.runGeneralLedgerFilter();
  };

  // Also upgrade openAccountLedger(accId) so clicking "كشف حساب" on any account in Chart of Accounts includes multi-line journals!
  window.openAccountLedger = function (accId) {
    ensureAccountingStateDefaults();
    const acc = (window.state.accounts || []).find(a => a.id === accId || String(a.code) === String(accId));
    if (!acc) return;

    document.getElementById('ledger-acc-code').textContent = acc.code;
    document.getElementById('ledger-acc-name').textContent = acc.name;
    document.getElementById('ledger-acc-sub').textContent = `التصنيف: ${acc.type} | الطبيعة: ${acc.nature === 'debit' ? 'مدين' : 'دائن'} | كشف حركات دفتر الأستاذ العام`;

    const ledger = window.InvoiceUtils.computeGeneralLedger({ accountCode: acc.code }, window.state);
    const tbody = document.getElementById('ledgerTableBody');
    if (!tbody) return;
    tbody.innerHTML = '';

    if (!ledger.entries || ledger.entries.length === 0) {
      tbody.innerHTML = `<tr><td colspan="7" class="py-8 text-center text-slate-400">لا توجد قيود أو حركات مسجلة لهذا الحساب حتى تاريخه</td></tr>`;
    } else {
      ledger.entries.forEach(row => {
        const partyInfo = row.partyName ? ` <span class="text-[10px] px-1.5 py-0.5 rounded bg-purple-50 text-purple-700 font-bold">(${row.partyName})</span>` : '';
        const tr = document.createElement('tr');
        tr.className = 'hover:bg-slate-50 transition';
        tr.innerHTML = `
          <td class="p-3 font-mono font-bold text-slate-700">${row.journalId}</td>
          <td class="p-3 text-slate-500">${row.date}</td>
          <td class="p-3"><span class="px-2 py-0.5 rounded bg-slate-100 font-mono text-[10px] font-bold">${row.ref || row.journalId}</span></td>
          <td class="p-3 font-bold text-slate-800">${row.description}${partyInfo}</td>
          <td class="p-3 text-left font-black ${row.debit > 0 ? 'text-emerald-700' : 'text-slate-300'}">${row.debit > 0 ? fmt(row.debit) : '0.00'}</td>
          <td class="p-3 text-left font-black ${row.credit > 0 ? 'text-rose-600' : 'text-slate-300'}">${row.credit > 0 ? fmt(row.credit) : '0.00'}</td>
          <td class="p-3 text-left font-black text-slate-900">${fmt(row.runningBalance)} ر.س</td>
        `;
        tbody.appendChild(tr);
      });
    }

    document.getElementById('ledger-total-debit').textContent = fmt(ledger.totalDebit) + ' ر.س';
    document.getElementById('ledger-total-credit').textContent = fmt(ledger.totalCredit) + ' ر.س';
    document.getElementById('ledger-net-change').textContent = fmt(ledger.closingBalance) + ' ر.س';
    document.getElementById('ledger-final-balance').textContent = fmt(ledger.closingBalance) + ' ر.س';

    window.openModal('accountLedgerModal');
  };

  // ============================================================================
  // 6. ENHANCE CLIENTS, SUPPLIERS, AND JOURNALS TABLES WITH PARTY LINKS & STATEMENTS
  // ============================================================================
  const origRenderClientsTable = window.renderClientsTable;
  window.renderClientsTable = function () {
    recalculateDynamicPartyBalances();
    if (typeof origRenderClientsTable === 'function') origRenderClientsTable();
    const tbody = document.getElementById('clientsTableBody');
    if (!tbody) return;
    const rows = tbody.querySelectorAll('tr');
    const list = typeof window.getFilteredList === 'function' ? window.getFilteredList(window.state.clients) : (window.state.clients || []);
    rows.forEach((tr, idx) => {
      const c = list[idx];
      if (!c) return;
      const actionCell = tr.querySelector('td:last-child');
      if (actionCell) {
        actionCell.innerHTML = `
          <div class="flex items-center justify-center gap-1.5">
            <button onclick="openPartyStatement('customer', '${c.id}')" class="px-2.5 py-1 rounded-lg bg-blue-50 text-blue-700 hover:bg-blue-100 font-bold text-[11px] transition">كشف حساب</button>
            <button onclick="openNewInvoiceModalForClient('${c.name}', '${c.entity}')" class="px-2.5 py-1 rounded-lg bg-purple-50 text-purple-700 hover:bg-purple-100 font-bold text-[11px] transition">+ فاتورة</button>
          </div>
        `;
      }
    });
  };

  const origRenderSuppliersTable = window.renderSuppliersTable;
  window.renderSuppliersTable = function () {
    recalculateDynamicPartyBalances();
    if (typeof origRenderSuppliersTable === 'function') origRenderSuppliersTable();
    const tbody = document.getElementById('suppliersTableBody');
    if (!tbody) return;
    const rows = tbody.querySelectorAll('tr');
    const list = typeof window.getFilteredList === 'function' ? window.getFilteredList(window.state.suppliers) : (window.state.suppliers || []);
    rows.forEach((tr, idx) => {
      const s = list[idx];
      if (!s) return;
      const actionCell = tr.querySelector('td:last-child');
      if (actionCell) {
        actionCell.innerHTML = `
          <div class="flex items-center justify-center gap-1.5">
            <button onclick="openPartyStatement('supplier', '${s.id}')" class="px-2.5 py-1 rounded-lg bg-blue-50 text-blue-700 hover:bg-blue-100 font-bold text-[11px] transition">كشف حساب</button>
            <button onclick="openPaymentModalForSupplier('${s.name}')" class="px-2.5 py-1 rounded-lg bg-emerald-50 text-emerald-700 hover:bg-emerald-100 font-bold text-[11px] transition">سداد سند</button>
          </div>
        `;
      }
    });
  };

  const origRenderJournalsTable = window.renderJournalsTable;
  window.renderJournalsTable = function () {
    if (typeof origRenderJournalsTable === 'function') origRenderJournalsTable();
    injectGeneralLedgerExplorerInJournalView();
    window.onGlFilterModeChange();

    const tbody = document.getElementById('journalTableBody');
    if (!tbody) return;
    const list = typeof window.getFilteredList === 'function' ? window.getFilteredList(window.state.journals) : (window.state.journals || []);
    const rows = tbody.querySelectorAll('tr');
    rows.forEach((tr, idx) => {
      const j = list[idx];
      if (!j || !Array.isArray(j.lines) || j.lines.length === 0) return;
      const descCell = tr.children[3];
      const debCell = tr.children[4];
      const credCell = tr.children[5];

      const partyLine = j.lines.find(l => l.partyName) || j;
      const partyBadge = partyLine.partyName
        ? `<span class="inline-block mt-1 px-2 py-0.5 rounded bg-purple-50 text-purple-800 text-[10px] font-bold">الطرف: ${partyLine.partyName} (${partyLine.partyType === 'supplier' ? 'مورد' : 'عميل'})</span>`
        : '';

      if (descCell) {
        descCell.innerHTML = `<div>${j.desc}</div>${partyBadge}`;
      }
      if (debCell) {
        debCell.innerHTML = j.lines.filter(l => l.debit > 0).map(l => `<div>${l.accountCode} - ${l.accountName || ''} (${fmt(l.debit)})</div>`).join('');
      }
      if (credCell) {
        credCell.innerHTML = j.lines.filter(l => l.credit > 0).map(l => `<div>${l.accountCode} - ${l.accountName || ''} (${fmt(l.credit)})</div>`).join('');
      }
    });
  };

  window.addEventListener('DOMContentLoaded', () => {
    setTimeout(() => {
      ensureAccountingStateDefaults();
      recalculateDynamicPartyBalances();
      upgradeSalesInvoiceModalDOM();
      upgradePurchaseModalDOM();
      upgradeJournalModalDOM();
      injectGeneralLedgerExplorerInJournalView();
      if (typeof window.onGlFilterModeChange === 'function') window.onGlFilterModeChange();
    }, 150);
  });
})();
