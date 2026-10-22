// public/js/router.js — Hash routing & Side Popover Navigation Support
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
    window.closeAllNavPopovers();
    window.scrollTo({ top: 0, behavior: 'smooth' });
    return r;
  };

  window.addEventListener('popstate', () => {
    const v = currentView();
    if (window.switchView && !document.querySelector('#view-' + v)) return;
    if (_switchView) _switchView(v);
    updateBreadcrumb(v);
    highlightNav(v);
    window.closeAllNavPopovers();
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

  window.toggleNavPopover = function (id, e) {
    if (e) {
      e.preventDefault();
      e.stopPropagation();
    }
    const target = document.getElementById(id);
    if (!target) return;
    const wasOpen = target.classList.contains('open');
    window.closeAllNavPopovers();
    if (!wasOpen) {
      target.classList.add('open');
    }
  };

  window.closeAllNavPopovers = function () {
    document.querySelectorAll('.has-popover').forEach(el => el.classList.remove('open'));
  };

  // Close on outside click
  document.addEventListener('click', (e) => {
    if (!e.target.closest('.has-popover')) {
      window.closeAllNavPopovers();
    }
  });

  function highlightNav(view) {
    document.querySelectorAll('.sidebar-nav-item').forEach(b => {
      b.classList.remove('sidebar-active', 'text-purple-700', 'bg-purple-50');
    });

    let targetId = 'nav-' + view;
    if (['clients', 'quotes', 'invoices'].includes(view)) {
      targetId = 'nav-invoices';
    } else if (['suppliers', 'purchases'].includes(view)) {
      targetId = 'nav-purchases';
    } else if (['treasury', 'journal', 'accounts', 'fixed-assets'].includes(view)) {
      targetId = 'nav-accounting';
    }

    const btn = document.getElementById(targetId);
    if (btn) btn.classList.add('sidebar-active');
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
