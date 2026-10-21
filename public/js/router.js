// public/js/router.js — Full Page Routing & Sidebar Accordion Navigation
(function () {
  const VALID_VIEWS = [
    'dashboard', 'invoices', 'inventory', 'purchases', 'treasury',
    'journal', 'accounts', 'reports', 'zatca', 'branches',
    'settings', 'payroll', 'clients', 'quotes', 'suppliers',
    'fixed-assets', 'help'
  ];

  function currentView() {
    const h = (location.hash || '').replace('#/', '').replace('#', '');
    return VALID_VIEWS.includes(h) ? h : 'dashboard';
  }

  const _switchView = window.switchView;
  window.switchView = function (viewName) {
    if (!VALID_VIEWS.includes(viewName)) viewName = 'dashboard';
    if (('#/' + viewName) !== location.hash) {
      history.pushState(null, '', '#/' + viewName);
    }
    const r = _switchView ? _switchView.apply(this, arguments) : undefined;
    updateBreadcrumb(viewName);
    highlightNav(viewName);
    window.scrollTo({ top: 0, behavior: 'smooth' });
    return r;
  };

  window.addEventListener('popstate', () => {
    const v = currentView();
    if (window.switchView && !document.querySelector('#view-' + v)) return;
    if (_switchView) _switchView(v);
    updateBreadcrumb(v);
    highlightNav(v);
  });

  const TITLES = {
    dashboard: 'لوحة البيانات',
    invoices: 'فواتير المبيعات',
    clients: 'قائمة العملاء والمدينون',
    quotes: 'عروض الأسعار والفواتير المبدئية',
    purchases: 'فواتير المشتريات والمصروفات',
    suppliers: 'الموردون وجهات التوريد',
    inventory: 'المخزون والمنتجات',
    treasury: 'الخزينة والحسابات البنكية',
    journal: 'القيود المحاسبية اليومية',
    accounts: 'دليل شجرة الحسابات',
    'fixed-assets': 'الأصول الثابتة والإهلاك',
    payroll: 'الرواتب والموظفون',
    reports: 'التقارير المالية والختامية',
    zatca: 'التوافق الضريبي والفوترة الإلكترونية ZATCA',
    branches: 'الفروع والكيانات التجارية',
    settings: 'الإعدادات العامة واللوجو',
    help: 'مركز المساعدة والدعم الفني'
  };

  function updateBreadcrumb(view) {
    const el = document.getElementById('breadcrumb');
    if (!el) return;
    el.innerHTML = '<a href="#/dashboard" class="hover:text-purple-700 font-bold">الرئيسية</a>' +
                   '<span class="mx-1.5 text-slate-300">/</span><span class="font-bold text-slate-800">' + (TITLES[view] || view) + '</span>';
  }

  window.toggleSidebarGroup = function (group) {
    const sub = document.getElementById('sub-' + group);
    const chevron = document.getElementById('chevron-' + group);
    if (!sub) return;
    const isHidden = sub.classList.contains('hidden');
    if (isHidden) {
      sub.classList.remove('hidden');
      if (chevron) chevron.style.transform = 'rotate(180deg)';
    } else {
      sub.classList.add('hidden');
      if (chevron) chevron.style.transform = 'rotate(0deg)';
    }
  };

  function expandGroup(group) {
    const sub = document.getElementById('sub-' + group);
    const chevron = document.getElementById('chevron-' + group);
    if (sub && sub.classList.contains('hidden')) {
      sub.classList.remove('hidden');
      if (chevron) chevron.style.transform = 'rotate(180deg)';
    }
  }

  function highlightNav(view) {
    document.querySelectorAll('.sidebar-nav-item, .sidebar-sub-item').forEach(b => {
      b.classList.remove('sidebar-active', 'bg-purple-100', 'text-purple-800', 'font-black');
    });

    const btn = document.getElementById('nav-' + view);
    if (btn) {
      if (btn.classList.contains('sidebar-sub-item')) {
        btn.classList.add('bg-purple-100', 'text-purple-800', 'font-black');
      } else {
        btn.classList.add('sidebar-active');
      }
    }

    // Auto-expand parent group
    if (['invoices', 'clients', 'quotes'].includes(view)) {
      expandGroup('sales');
      const parent = document.getElementById('nav-sales-parent');
      if (parent) parent.classList.add('text-purple-700', 'bg-purple-50/50');
    } else if (['purchases', 'suppliers'].includes(view)) {
      expandGroup('purchases');
      const parent = document.getElementById('nav-purchases-parent');
      if (parent) parent.classList.add('text-purple-700', 'bg-purple-50/50');
    } else if (['treasury', 'journal', 'accounts', 'fixed-assets'].includes(view)) {
      expandGroup('accounting');
      const parent = document.getElementById('nav-accounting-parent');
      if (parent) parent.classList.add('text-purple-700', 'bg-purple-50/50');
    }
  }

  document.addEventListener('DOMContentLoaded', () => {
    const v = currentView();
    if (window.switchView) {
      window.switchView(v);
    } else {
      highlightNav(v);
      updateBreadcrumb(v);
    }
  });
})();
