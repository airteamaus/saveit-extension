export function getSubmittedSearchQuery(searchInput) {
  return searchInput?.value?.trim() || '';
}

export function getNewtabElements(documentObj = document) {
  return {
    dataSyncBtn: documentObj.getElementById('hero-data-sync-btn'),
    refreshBtn: documentObj.getElementById('hero-refresh-btn'),
    sharingBtn: documentObj.getElementById('hero-sharing-btn'),
    projectEditorBackdrop: documentObj.getElementById('project-editor-backdrop'),
    projectEditorDialog: documentObj.getElementById('project-editor-dialog'),
    importPanelBackdrop: documentObj.getElementById('import-panel-backdrop'),
    importPanelDialog: documentObj.getElementById('import-panel-dialog'),
    sharingCentreBackdrop: documentObj.getElementById('sharing-centre-backdrop'),
    sharingCentreDialog: documentObj.getElementById('sharing-centre-dialog'),
    dataSyncCentreBackdrop: documentObj.getElementById('data-sync-centre-backdrop'),
    dataSyncCentreDialog: documentObj.getElementById('data-sync-centre-dialog'),
    toastRegion: documentObj.getElementById('toast-region'),
    savedPagesPageHeader: documentObj.getElementById('saved-pages-page-header'),
    savedPagesPageShell: documentObj.getElementById('saved-pages-page-shell'),
    projectSidebar: documentObj.getElementById('project-sidebar'),
    sidebarToggleBtn: documentObj.getElementById('saved-pages-sidebar-toggle-btn'),
    sidebarBackdrop: documentObj.getElementById('saved-pages-sidebar-backdrop'),
    savedPagesDrawer: documentObj.getElementById('saved-pages-page'),
    savedPagesDrawerBackdrop: documentObj.getElementById('saved-pages-drawer-backdrop'),
    savedPagesDrawerClearBtn: documentObj.getElementById('saved-pages-search-clear-btn'),
    savedPagesDrawerCloseBtn: documentObj.getElementById('saved-pages-drawer-close-btn'),
    savedPagesDrawerResults: documentObj.getElementById('saved-pages-results'),
    savedPagesDrawerSearchForm: documentObj.getElementById('saved-pages-search-form'),
    savedPagesDrawerSearchInput: documentObj.getElementById('saved-pages-search-input'),
    savedPagesToggleBtn: documentObj.getElementById('saved-pages-toggle-btn'),
    searchForm: documentObj.getElementById('search-form'),
    searchInput: documentObj.getElementById('search-input'),
    signInBtn: documentObj.getElementById('hero-sign-in-btn'),
    signOutBtn: documentObj.getElementById('hero-sign-out-btn'),
    userAvatar: documentObj.getElementById('hero-user-avatar'),
    userAvatarBtn: documentObj.getElementById('hero-user-avatar-btn'),
    userDropdown: documentObj.getElementById('hero-user-dropdown'),
    userEmailEl: documentObj.getElementById('hero-user-email'),
    userMenu: documentObj.getElementById('hero-user-menu'),
    versionIndicator: documentObj.getElementById('hero-version-indicator'),
    versionNumberEl: documentObj.getElementById('hero-version-number')
  };
}

export function bindNewtabEventHandlers({
  elements,
  authController,
  documentObj = document
}) {
  elements.signInBtn?.addEventListener('click', () => void authController.handleSignIn());
  elements.userAvatarBtn?.addEventListener('click', () => authController.toggleUserDropdown());
  elements.signOutBtn?.addEventListener('click', () => void authController.handleSignOut());

  documentObj.addEventListener('click', event => {
    authController.hideDropdownForOutsideClick(event.target);
  });
}

export async function startNewtabPage({
  ThemeManager,
  versionNumberEl,
  updateVersionIndicator,
  drawerController,
  authController,
  realtimeClient
}) {
  ThemeManager.init('hero-theme-toggle-container');
  updateVersionIndicator(versionNumberEl);
  // init() seeds the synchronous current-user cache the sidebar needs to
  // resolve ownership (isOwnedProject) on the first warm-cache paint.
  await drawerController.init();

  // Do NOT paint an eager loading state here. The results pane starts empty
  // and the warm-cache path renders real content directly on first paint;
  // an interim spinner here causes a flash of unstyled state (blank →
  // spinner → content). Cold starts show the loading dog from within
  // loadDrawerBasePages once it confirms there's no warm cache to render.

  // Resolve auth BEFORE loading the drawer. The drawer's initial hydrate()
  // runs a freshness check (headSavedPages) that needs a signed-in user to
  // mint an auth token; loading before auth resolves throws "No user signed
  // in" and the pages never appear.
  //
  // `load()` is the single trigger for the first fetch. It routes through
  // loadDrawerBasePages, which gates on canHydrateDrawerWithWarmCache (so a
  // null user renders the sign-in state instead of erroring) and starts the
  // projects load in the same pass. Calling preloadProjects() separately here
  // used to bypass that gate and race auth on cold starts.
  await authController.init();
  void drawerController.load?.();

  // Open the realtime SSE stream now that auth has resolved (the stream needs
  // a session token). Fire-and-forget — the client toasts on disconnect and
  // does not auto-reconnect; a page refresh re-establishes it.
  void realtimeClient?.connect();

  // Disconnect when the page is torn down so a bfcache restore doesn't leave
  // a zombie stream and the server can free the connection promptly.
  globalThis.addEventListener('pagehide', () => {
    realtimeClient?.disconnect();
  }, { once: true });
}
