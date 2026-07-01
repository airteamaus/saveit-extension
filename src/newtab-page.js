export function getSubmittedSearchQuery(searchInput) {
  return searchInput?.value?.trim() || '';
}

export function getNewtabElements(documentObj = document) {
  return {
    importBtn: documentObj.getElementById('hero-import-btn'),
    refreshBtn: documentObj.getElementById('hero-refresh-btn'),
    projectEditorBackdrop: documentObj.getElementById('project-editor-backdrop'),
    projectEditorDialog: documentObj.getElementById('project-editor-dialog'),
    importPanelBackdrop: documentObj.getElementById('import-panel-backdrop'),
    importPanelDialog: documentObj.getElementById('import-panel-dialog'),
    savedPagesPageHeader: documentObj.getElementById('saved-pages-page-header'),
    savedPagesPageShell: documentObj.getElementById('saved-pages-page-shell'),
    projectSidebar: documentObj.getElementById('project-sidebar'),
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
  authController
}) {
  ThemeManager.init('hero-theme-toggle-container');
  updateVersionIndicator(versionNumberEl);
  drawerController.init();
  drawerController.showLoadingState?.('Gathering your saved pages…');

  // Resolve auth BEFORE loading the drawer. The drawer's initial hydrate()
  // runs a freshness check (headSavedPages) that needs a signed-in user to
  // mint an auth token; loading before auth resolves throws "No user signed
  // in" and the pages never appear.
  await authController.init();
  void drawerController.preloadProjects?.();
  void drawerController.load?.();
}
