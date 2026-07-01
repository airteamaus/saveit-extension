// Apply the stored theme preference to the toolbar popup before the UI settles.
//
// The new-tab page owns the source of truth (theme-manager.js) and writes the
// same 'theme-preference' localStorage key. Popups are recreated on every open,
// so reading the key here on load is enough to stay in sync — no cross-tab
// listener is needed. Runs as an external module because the extension CSP
// blocks inline scripts.
(function () {
  try {
    const pref = localStorage.getItem('theme-preference');
    // 'auto' (or unset) leaves the attribute off so the OS preference drives
    // color-scheme via the :root rule. 'light'/'dark' pin it explicitly.
    if (pref === 'light' || pref === 'dark') {
      document.documentElement.setAttribute('data-theme', pref);
    }
  } catch {
    /* localStorage may be unavailable; fall back to auto (system). */
  }
})();
