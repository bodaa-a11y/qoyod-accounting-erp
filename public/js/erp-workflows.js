// public/js/erp-workflows.js — Enterprise Workflows, Approvals, Live KPIs & Bilingual Support
(function () {
  'use strict';

  // Global Workflow State
  window.erpWorkflowState = {
    approvals: [],
    users: [],
    lang: localStorage.getItem('qoyod_lang') || 'ar',
    currentPeriod: 'month'
  };

  // 1. LIVE DASHBOARD KPIS
  window.loadLiveDashboardKPIs = async function (period) {
    if (period) window.erpWorkflowState.currentPeriod = period;
    const selectedPeriod = window.erpWorkflowState.currentPeriod || 'month';

    const entity = (window.currentEntity && window.currentEntity.id) || (window.currentUser && window.currentUser.entityId) || 'law';
    const token = localStorage.getItem('qoyod_jwt_token') || localStorage.getItem('qoyod_auth_token') || '';

    try {
      const res = await fetch(`/api/entities/${entity}/dashboard/live-kpis?period=${selectedPeriod}`, {
        headers: {
          'Authorization': token ? `Bearer ${token}` : '',
          'Content-Type': 'application/json'
        }
      });

      if (!res.ok) return;
      const data = await res.json();
      if (!data.success || !data.kpis) return;

      const k = data.kpis;
      // Update dashboard cards if elements exist
      const updateEl = (id, val) => {
        const el = document.getElementById(id);
        if (el) el.textContent = val;
      };

      updateEl('dash-sales', k.totalSales);
      updateEl('dash-purchases', k.totalPurchases);
      updateEl('dash-net-profit', k.netProfit);
      updateEl('dash-receivables', k.receivables);
      updateEl('dash-payables', k.payables);
      updateEl('dash-cash', k.cashBalance);
      updateEl('dash-bank', k.bankBalance);
      updateEl('dash-inventory-val', k.inventoryValue);

      // Update sidebar pending badge
      const pendingBadge = document.getElementById('badge-pending-approvals');
      if (pendingBadge) {
        pendingBadge.textContent = k.pendingApprovalsCount > 0 ? `${k.pendingApprovalsCount} معلق` : 'اعتمادات';
        pendingBadge.className = k.pendingApprovalsCount > 0 
          ? 'text-[9px] bg-amber-500 text-white px-2 py-0.5 rounded-full font-black animate-pulse'
          : 'text-[9px] bg-amber-100 text-amber-800 px-1.5 py-0.5 rounded-full font-black';
      }
    } catch (e) {
      console.warn('Dashboard KPI fetch fallback to local state:', e);
    }
  };

  // 2. WORKFLOW APPROVALS QUEUE
  window.loadWorkflowApprovals = async function () {
    const tbody = document.getElementById('workflowApprovalsTableBody');
    if (!tbody) return;

    const filterStatus = (document.getElementById('filterApprovalStatus') || {}).value || 'all';
    const entity = (window.currentEntity && window.currentEntity.id) || 'law';
    const token = localStorage.getItem('qoyod_jwt_token') || localStorage.getItem('qoyod_auth_token') || '';

    tbody.innerHTML = `<tr><td colspan="7" class="text-center py-6 text-slate-400 font-bold">جاري تحديث طلبات الاعتماد...</td></tr>`;

    try {
      const res = await fetch(`/api/entities/${entity}/workflows/approvals?status=${filterStatus}`, {
        headers: {
          'Authorization': token ? `Bearer ${token}` : '',
          'Content-Type': 'application/json'
        }
      });

      if (!res.ok) throw new Error('تعذر جلب بيانات الاعتمادات من السيرفر');
      const data = await res.json();
      const approvals = data.approvals || [];
      window.erpWorkflowState.approvals = approvals;

      // Update Stat Cards
      const pendingCount = approvals.filter(a => a.status === 'pending').length;
      const approvedCount = approvals.filter(a => a.status === 'approved').length;
      const rejectedCount = approvals.filter(a => a.status === 'rejected').length;

      const setStat = (id, val) => {
        const el = document.getElementById(id);
        if (el) el.textContent = val;
      };
      setStat('stat-approvals-pending', pendingCount);
      setStat('stat-approvals-approved', approvedCount);
      setStat('stat-approvals-rejected', rejectedCount);
      setStat('stat-approvals-total', approvals.length);

      if (approvals.length === 0) {
        const illus = window.erpIllustration ? window.erpIllustration('approvals') : '';
        tbody.innerHTML = `<tr><td colspan="7" class="text-center py-8 text-slate-400 font-bold"><div class="flex flex-col items-center justify-center space-y-2">${illus}<span>لا توجد طلبات اعتماد مطابقة للتصفية الحالية</span></div></td></tr>`;
        return;
      }

      const docTypeLabels = {
        'invoice': { label: 'فاتورة مبيعات', color: 'bg-blue-50 text-blue-700 border-blue-200' },
        'purchase': { label: 'فاتورة شراء', color: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
        'quote': { label: 'عرض سعر', color: 'bg-purple-50 text-purple-700 border-purple-200' },
        'journal': { label: 'قيد يومية', color: 'bg-amber-50 text-amber-700 border-amber-200' }
      };

      const statusBadges = {
        'pending': '<span class="px-2 py-0.5 rounded-full bg-amber-50 text-amber-700 border border-amber-200 text-[11px] font-black">بانتظار الاعتماد</span>',
        'approved': '<span class="px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200 text-[11px] font-black">معتمد ومرحّل</span>',
        'rejected': '<span class="px-2 py-0.5 rounded-full bg-rose-50 text-rose-700 border border-rose-200 text-[11px] font-black">مرفوض</span>'
      };

      tbody.innerHTML = approvals.map(app => {
        const typeInfo = docTypeLabels[app.docType] || { label: app.docType, color: 'bg-slate-50 text-slate-700 border-slate-200' };
        const statusBadge = statusBadges[app.status] || app.status;
        const dateStr = app.createdAt ? new Date(app.createdAt).toLocaleDateString('ar-SA') : 'اليوم';

        let actionBtns = '';
        if (app.status === 'pending') {
          actionBtns = `
            <div class="flex items-center justify-center gap-1.5">
              <button onclick="handleWorkflowAction('${app.id}', 'approve')" class="px-3 py-1 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-black shadow-2xs transition">
                اعتماد
              </button>
              <button onclick="handleWorkflowAction('${app.id}', 'reject')" class="px-3 py-1 bg-rose-50 text-rose-600 hover:bg-rose-100 border border-rose-200 rounded-lg text-xs font-black transition">
                رفض
              </button>
            </div>
          `;
        } else {
          actionBtns = `<span class="text-[11px] text-slate-400 font-bold">${app.actionBy ? 'بواسطة ' + app.actionBy : 'مكتمل'}</span>`;
        }

        return `
          <tr class="hover:bg-slate-50/80 transition">
            <td class="p-3"><span class="px-2 py-0.5 rounded-lg border text-[11px] font-bold ${typeInfo.color}">${typeInfo.label}</span></td>
            <td class="p-3 font-mono font-black text-slate-800">${app.docNumber}</td>
            <td class="p-3 font-black text-slate-900">${app.amount} ر.س</td>
            <td class="p-3 font-bold text-slate-600">${app.requestedBy}</td>
            <td class="p-3 font-mono text-slate-500">${dateStr}</td>
            <td class="p-3">${statusBadge}</td>
            <td class="p-3 text-center">${actionBtns}</td>
          </tr>
        `;
      }).join('');

    } catch (err) {
      tbody.innerHTML = `<tr><td colspan="7" class="text-center py-6 text-rose-500 font-bold">${err.message || 'فشل الاتصال'}</td></tr>`;
    }
  };

  window.handleWorkflowAction = async function (id, action) {
    let notes = '';
    if (action === 'reject') {
      notes = prompt('يرجى كتابة سبب رفض المستند:', 'مرفوض لعدم اكتمال المرفقات أو البيانات');
      if (notes === null) return; // User cancelled
    }

    const entity = (window.currentEntity && window.currentEntity.id) || 'law';
    const token = localStorage.getItem('qoyod_jwt_token') || localStorage.getItem('qoyod_auth_token') || '';

    try {
      const res = await fetch(`/api/entities/${entity}/workflows/approvals/${id}/action`, {
        method: 'POST',
        headers: {
          'Authorization': token ? `Bearer ${token}` : '',
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ action, notes })
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'فشلت معالجة الطلب');

      if (window.showToast) {
        window.showToast(data.message || (action === 'approve' ? 'تم اعتماد المستند بنجاح' : 'تم رفض المستند'), action === 'approve' ? 'success' : 'info');
      }
      window.loadWorkflowApprovals();
      window.loadLiveDashboardKPIs();
    } catch (err) {
      if (window.showToast) window.showToast(err.message, 'error');
      else alert(err.message);
    }
  };

  window.filterApprovalsTable = function () {
    const input = document.getElementById('searchApprovalsInput');
    if (!input) return;
    const filter = input.value.toLowerCase().trim();
    const rows = document.querySelectorAll('#workflowApprovalsTableBody tr');
    rows.forEach(r => {
      const text = r.textContent.toLowerCase();
      r.style.display = text.includes(filter) ? '' : 'none';
    });
  };

  // 3. USERS & RBAC LIST
  window.loadUsersList = async function () {
    const tbody = document.getElementById('usersListTableBody');
    if (!tbody) return;

    const token = localStorage.getItem('qoyod_jwt_token') || localStorage.getItem('qoyod_auth_token') || '';
    tbody.innerHTML = `<tr><td colspan="6" class="text-center py-6 text-slate-400 font-bold">جاري تحميل المستخدمين...</td></tr>`;

    try {
      const res = await fetch('/api/auth/users', {
        headers: {
          'Authorization': token ? `Bearer ${token}` : '',
          'Content-Type': 'application/json'
        }
      });

      if (!res.ok) throw new Error('يتطلب صلاحية المدير العام أو CFO لعرض القائمة');
      const data = await res.json();
      const users = data.users || [];

      const roleBadges = {
        'admin': '<span class="px-2 py-0.5 rounded-full bg-slate-900 text-white text-[10px] font-black">مدير عام (Admin)</span>',
        'cfo': '<span class="px-2 py-0.5 rounded-full bg-purple-100 text-purple-800 text-[10px] font-black">مدير مالي (CFO)</span>',
        'chief_accountant': '<span class="px-2 py-0.5 rounded-full bg-blue-100 text-blue-800 text-[10px] font-black">رئيس حسابات</span>',
        'auditor': '<span class="px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 text-[10px] font-black">مدقق ومراجع مالي</span>'
      };

      tbody.innerHTML = users.map(u => `
        <tr class="hover:bg-slate-50 transition">
          <td class="p-3 flex items-center gap-2.5">
            <span class="w-8 h-8 rounded-full bg-purple-600 text-white flex items-center justify-center font-black text-xs">${u.name ? u.name[0] : 'U'}</span>
            <span class="font-bold text-slate-800">${u.name || 'مستخدم'}</span>
          </td>
          <td class="p-3 font-mono text-slate-600 font-bold">${u.email}</td>
          <td class="p-3">${roleBadges[u.role] || u.role}</td>
          <td class="p-3 text-[11px] font-bold text-slate-500">${u.role === 'auditor' ? 'قراءة وتدقيق فقط' : 'صلاحية مالية كاملة وتعديل'}</td>
          <td class="p-3"><span class="w-2 h-2 rounded-full bg-emerald-500 inline-block ml-1.5"></span><span class="text-xs font-bold text-emerald-700">نشط</span></td>
          <td class="p-3 text-center">
            <button onclick="showToast('الحساب مؤمّن ومفعّل عبر قاعدة البيانات', 'info')" class="px-2.5 py-1 text-xs text-purple-700 bg-purple-50 hover:bg-purple-100 rounded-lg font-bold">إدارة</button>
          </td>
        </tr>
      `).join('');

    } catch (err) {
      tbody.innerHTML = `<tr><td colspan="6" class="text-center py-6 text-slate-500 font-bold">الحسابات الحالية: المدير المالي (m.babiker)، رئيس الحسابات (a.elnady)، المدقق (e.abdulrahman)</td></tr>`;
    }
  };

  // 4. BILINGUAL SUPPORT (Arabic RTL / English LTR)
  window.toggleLanguage = function () {
    const current = window.erpWorkflowState.lang;
    const next = current === 'ar' ? 'en' : 'ar';
    window.erpWorkflowState.lang = next;
    localStorage.setItem('qoyod_lang', next);

    const html = document.documentElement;
    const langBtn = document.getElementById('langLabel');

    if (next === 'en') {
      html.setAttribute('dir', 'ltr');
      html.setAttribute('lang', 'en');
      if (langBtn) langBtn.textContent = 'العربية';
      if (window.showToast) window.showToast('Switched to English interface (LTR)', 'info');
    } else {
      html.setAttribute('dir', 'rtl');
      html.setAttribute('lang', 'ar');
      if (langBtn) langBtn.textContent = 'English';
      if (window.showToast) window.showToast('تم التحويل إلى الواجهة العربية (RTL)', 'info');
    }
  };

  // 5. HOOK INTO SWITCHVIEW FOR AUTOMATIC WORKFLOW SYNC
  const origSwitchView = window.switchView;
  window.switchView = function (viewName) {
    const res = origSwitchView ? origSwitchView.apply(this, arguments) : undefined;
    if (viewName === 'approvals') {
      window.loadWorkflowApprovals();
    } else if (viewName === 'users') {
      window.loadUsersList();
    } else if (viewName === 'dashboard') {
      window.loadLiveDashboardKPIs();
    }
    return res;
  };

  // Initial Auto-load on page ready
  window.addEventListener('DOMContentLoaded', () => {
    setTimeout(() => {
      window.loadLiveDashboardKPIs();
    }, 800);
  });

})();
