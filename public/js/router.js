// public/js/router.js — Hash routing & deep link support for Qoyod ERP
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
    dashboard: 'لوحة التحكم', invoices: 'المبيعات والفواتير', inventory: 'المخزون',
    purchases: 'المشتريات', treasury: 'الخزينة والبنوك', journal: 'القيود اليومية',
    accounts: 'شجرة الحسابات', reports: 'التقارير المالية', zatca: 'التوافق الضريبي ZATCA',
    branches: 'الفروع', settings: 'الإعدادات', payroll: 'الرواتب والموظفون',
    clients: 'قائمة العملاء والمدينون', quotes: 'عروض الأسعار والفواتير المبدئية',
    suppliers: 'الموردون وجهات التوريد', 'fixed-assets': 'الأصول الثابتة والإهلاك',
    help: 'مركز المساعدة والدعم'
  };

  function updateBreadcrumb(view) {
    const el = document.getElementById('breadcrumb');
    if (!el) return;
    el.innerHTML = '<a href="#/dashboard" class="hover:text-purple-700">الرئيسية</a>' +
                   '<span class="mx-1 text-slate-300">/</span><span>' + (TITLES[view] || view) + '</span>';
  }

  function highlightNav(view) {
    document.querySelectorAll('.sidebar-nav-item').forEach(b => b.classList.remove('sidebar-active'));
    const btn = document.getElementById('nav-' + view);
    if (btn) btn.classList.add('sidebar-active');
  }

  document.addEventListener('DOMContentLoaded', () => {
    const v = currentView();
    if (v !== 'dashboard' && window.switchView) window.switchView(v);
  });
})();
