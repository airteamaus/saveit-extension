export function getSubmittedSearchQuery(searchInput) {
  return searchInput?.value?.trim() || '';
}

export function getNewtabElements(documentObj = document) {
  return {
    importBtn: documentObj.getElementById('hero-import-btn'),
    refreshBtn: documentObj.getElementById('hero-refresh-btn'),
    mirrorToggle: documentObj.getElementById('hero-mirror-toggle'),
    sharingBtn: documentObj.getElementById('hero-sharing-btn'),
    projectEditorBackdrop: documentObj.getElementById('project-editor-backdrop'),
    projectEditorDialog: documentObj.getElementById('project-editor-dialog'),
    importPanelBackdrop: documentObj.getElementById('import-panel-backdrop'),
    importPanelDialog: documentObj.getElementById('import-panel-dialog'),
    sharingCentreBackdrop: documentObj.getElementById('sharing-centre-backdrop'),
    sharingCentreDialog: documentObj.getElementById('sharing-centre-dialog'),
    toastRegion: documentObj.getElementById('toast-region'),
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

// Wire the bookmark-mirror toggle: read its current state on init, flip the
// persisted flag via a runtime message on click. The background owns the
// state and triggers the seed reconcile; the UI just reflects and requests.
// `notify` is an optional toast callback for confirmation/error feedback.
export function initMirrorToggle({ elements, runtime, notify } = {}) {
  const toggle = elements?.mirrorToggle;
  if (!toggle) {
    return;
  }

  // State is carried by aria-pressed; the leading icon turns green via CSS
  // (.dropdown-item[aria-pressed="true"] .dropdown-item-icon). No trailing
  // checkmark — the icon is the state.
  const renderState = (enabled) => {
    toggle.setAttribute('aria-pressed', enabled ? 'true' : 'false');
  };

  const safeNotify = (message, options) => {
    if (typeof notify === 'function') {
      try { notify(message, options); } catch { /* toast must never break the toggle */ }
    }
  };

  // Best-effort initial read. Non-extension contexts (file:// standalone
  // preview) have no runtime — leave the toggle in its default off state.
  if (runtime?.sendMessage) {
    runtime.sendMessage({ action: 'getBookmarkMirrorState' }, (response) => {
      if (runtime.lastError || !response?.success) {
        return;
      }
      renderState(Boolean(response.enabled));
    });

    toggle.addEventListener('click', () => {
      const next = toggle.getAttribute('aria-pressed') !== 'true';
      renderState(next); // optimistic, so the click feels instant
      runtime.sendMessage(
        { action: 'setBookmarkMirrorEnabled', enabled: next },
        (response) => {
          if (runtime.lastError || !response?.success) {
            // Revert on failure and tell the user something went wrong.
            renderState(!next);
            safeNotify('Could not change browser bookmark sync — try again', { type: 'error' });
            return;
          }
          // Close the dropdown so the user sees the bookmark tree, not the menu.
          elements.userDropdown?.classList.add('hidden');
          safeNotify(next ? 'Browser bookmark sync enabled' : 'Browser bookmark sync disabled');
        }
      );
    });
  }
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
}
