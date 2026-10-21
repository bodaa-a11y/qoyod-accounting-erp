// web/js/router.js
(function () {
  const VALID_VIEWS = ['dashboard','invoices','inventory','purchases','treasury','journal',
                       'accounts','reports','zatca','branches','settings','payroll'];

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
    return r;
  };

  window.addEventListener('popstate', () => {
    const v = currentView();
    if (_switchView) _switchView(v);
  });

  document.addEventListener('DOMContentLoaded', () => {
    const v = currentView();
    if (v !== 'dashboard' && window.switchView) window.switchView(v);
  });
})();
