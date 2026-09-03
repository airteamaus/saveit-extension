// Extract the initial drawer search query from the URL search string. The
// drawer is always open on the newtab page (it owns the saved-pages surface),
// so there is no `?drawer=` open/close param to parse — only `?search=` matters.
export function getInitialDrawerUrlState(locationSearch = '') {
  const urlParams = new URLSearchParams(locationSearch);
  return {
    searchQuery: urlParams.get('search') || ''
  };
}

export function initSavedPagesDrawerEvents({
  savedPagesDrawerSearchForm,
  savedPagesDrawerSearchInput,
  savedPagesDrawerClearBtn,
  savedPagesDrawerResults,
  launchStrip,
  projectSidebar,
  projectPills,
  deskIndexTitle,
  projectEditorBackdrop,
  projectEditorDialog,
  projectManager,
  savedPagesView,
  loadDrawerResults,
  loadDrawerDomainPages,
  navigateDrawerCard,
  handleDrawerEditCancel,
  handleDrawerEditStart,
  handleDrawerPin,
  handleDrawerVote,
  handleFeedTogglePrivacy,
  handleFeedEditStart,
  handleFeedEditCancel,
  handleFeedEditSubmit,
  handleFeedPin,
  handleFeedProjects,
  handleFeedDelete,
  handleDrawerTogglePrivacy,
  handleDrawerUpdate,
  handleDrawerDelete,
  handleDrawerScrollNearEnd,
  handleFeedScrollNearEnd,
  setDrawerSearchValue,
  setDrawerToggleState,
  windowObj = window,
  documentObj = document
}) {
  let drawerSearchDebounceTimer = null;

  savedPagesDrawerSearchForm?.addEventListener('submit', (event) => {
    event.preventDefault();
    void loadDrawerResults(savedPagesDrawerSearchInput?.value || '');
  });

  savedPagesDrawerSearchInput?.addEventListener('input', (event) => {
    const query = event.target?.value || '';
    setDrawerSearchValue(query);
    windowObj.clearTimeout(drawerSearchDebounceTimer);
    drawerSearchDebounceTimer = windowObj.setTimeout(() => {
      void loadDrawerResults(query);
    }, 250);
  });

  savedPagesDrawerClearBtn?.addEventListener('click', () => {
    windowObj.clearTimeout(drawerSearchDebounceTimer);
    void loadDrawerResults('');
    savedPagesDrawerSearchInput?.focus();
  });

  function handleTagSearchFromEvent(event) {
    const tagEl = event.target.closest('[data-semantic-search-tag]');
    if (!tagEl) {
      return false;
    }

    event.preventDefault();
    const label = tagEl.dataset.semanticSearchTag || '';
    if (!label) {
      return true;
    }

    // Tag clicks become an inline search: fill the input and run both the
    // saved-page filter and the semantic search.
    setDrawerSearchValue(label);
    if (savedPagesDrawerSearchInput) {
      savedPagesDrawerSearchInput.value = label;
    }
    void loadDrawerResults(label);
    return true;
  }

  savedPagesDrawerResults?.addEventListener('click', (event) => {
    if (handleTagSearchFromEvent(event)) {
      return;
    }

    const actionButton = event.target.closest('[data-action]');
    if (!actionButton) {
      if (event.target.closest('.saved-pages-drawer-edit-form')) {
        return;
      }
      const card = event.target.closest('.index-row[data-url], .launch-chip[data-url]');
      if (!card) {
        return;
      }

      navigateDrawerCard(card, event);
      return;
    }

    event.preventDefault();
    event.stopPropagation();

    const { action, id } = actionButton.dataset;
    if (action === 'pin') {
      void handleDrawerPin(id);
      return;
    }

    if (action === 'vote') {
      void handleDrawerVote(id);
      return;
    }

    // Feed rows' own-save management — distinct feed-* actions so each
    // handler updates its own surface's state (the drawer twins keep their
    // drawer-state optimistic paths).
    if (action === 'feed-privacy') {
      void handleFeedTogglePrivacy(id);
      return;
    }

    if (action === 'feed-edit') {
      handleFeedEditStart(id);
      return;
    }

    if (action === 'feed-edit-cancel') {
      handleFeedEditCancel();
      return;
    }

    if (action === 'feed-pin') {
      void handleFeedPin(id);
      return;
    }

    if (action === 'feed-projects') {
      handleFeedProjects(id);
      return;
    }

    if (action === 'feed-delete') {
      void handleFeedDelete(id);
      return;
    }

    if (action === 'toggle-privacy') {
      void handleDrawerTogglePrivacy(id);
      return;
    }

    if (action === 'edit') {
      handleDrawerEditStart(id);
      return;
    }

    if (action === 'cancel-edit') {
      handleDrawerEditCancel();
      return;
    }

    if (action === 'projects') {
      projectManager.openEditor(savedPagesView, id);
      return;
    }

    if (action === 'remove-project') {
      void projectManager.togglePageProject(
        savedPagesView,
        id,
        actionButton.dataset.projectId,
        false
      );
      return;
    }

    if (action === 'delete') {
      void handleDrawerDelete(id);
    }
  });

  savedPagesDrawerResults?.addEventListener('auxclick', (event) => {
    if (
      event.button !== 1 ||
      event.target.closest('[data-action]') ||
      event.target.closest('.saved-pages-drawer-edit-form')
    ) {
      return;
    }

    const card = event.target.closest('.index-row[data-url], .launch-chip[data-url]');
    if (!card) {
      return;
    }

    event.preventDefault();
    navigateDrawerCard(card, event);
  });

  savedPagesDrawerResults?.addEventListener('keydown', (event) => {
    if (event.target.closest('.saved-pages-drawer-edit-form')) {
      if (event.key === 'Escape') {
        event.preventDefault();
        handleDrawerEditCancel();
        return;
      }

      // Submit on Enter from the title input (single-line), and on
      // Cmd/Ctrl+Enter from anywhere in the form (the textarea needs Enter
      // for newlines). Browsers' implicit form submission on Enter is
      // unreliable across inputs/buttons, so drive it explicitly.
      const isTitleInput = event.target.matches?.('input[name="title"]');
      const isModifierSubmit = event.key === 'Enter' && (event.metaKey || event.ctrlKey);
      if (event.key === 'Enter' && (isTitleInput || isModifierSubmit)) {
        event.preventDefault();
        const form = event.target.closest('.saved-pages-drawer-edit-form');
        if (form?.requestSubmit) {
          form.requestSubmit();
        } else if (form) {
          form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
        }
      }
      return;
    }

    if ((event.key !== 'Enter' && event.key !== ' ') || event.target.closest('[data-action]')) {
      return;
    }

    // Enter/Space on a tag button triggers the inline tag search.
    if (handleTagSearchFromEvent(event)) {
      return;
    }

    const card = event.target.closest('.index-row[data-url], .launch-chip[data-url]');
    if (!card) {
      return;
    }

    event.preventDefault();
    navigateDrawerCard(card, event);
  });

  savedPagesDrawerResults?.addEventListener('submit', (event) => {
    const form = event.target.closest('.saved-pages-drawer-edit-form');
    if (!form) {
      return;
    }

    event.preventDefault();
    const formData = new FormData(form);

    // The feed's own-row edit form carries a feed-edit-form marker on the
    // shared class; branch before the drawer path so one listener serves both
    // surfaces.
    if (form.classList.contains('feed-edit-form')) {
      void handleFeedEditSubmit(form.dataset.pageId, {
        title: formData.get('title') || '',
        ai_summary_brief: formData.get('ai_summary_brief') || ''
      });
      return;
    }

    void handleDrawerUpdate(form.dataset.pageId, {
      title: formData.get('title') || '',
      ai_summary_brief: formData.get('ai_summary_brief') || ''
    });
  });

  // Launch strip: its own container outside the results pane, so it carries
  // its own delegation. Chips are pure launchers — no inline actions; they
  // navigate like rows (click, or Enter/Space when focused).
  launchStrip?.addEventListener('click', (event) => {
    const chip = event.target.closest('.launch-chip[data-url]');
    if (chip) {
      navigateDrawerCard(chip, event);
    }
  });

  launchStrip?.addEventListener('keydown', (event) => {
    if (event.key !== 'Enter' && event.key !== ' ') {
      return;
    }

    const chip = event.target.closest('.launch-chip[data-url]');
    if (!chip) {
      return;
    }

    event.preventDefault();
    navigateDrawerCard(chip, event);
  });

  // Shared scope selection for the dropdown rows and the pills row: domain
  // ids route to domain scoping, everything else to project selection (empty
  // id = All pages, which also clears any domain scope).
  function handleScopeSelection(scopeId) {
    if (scopeId.startsWith('domain:')) {
      const domain = scopeId.slice('domain:'.length);
      savedPagesView.selectedDomainId = scopeId;
      savedPagesView.selectedProjectId = null;
      void loadDrawerDomainPages?.(domain);
      return;
    }

    savedPagesView.selectedDomainId = null;
    void projectManager.selectProject(savedPagesView, scopeId || null);
  }

  projectSidebar?.addEventListener('click', (event) => {
    const createButton = event.target.closest('.project-sidebar-create');
    if (createButton) {
      void projectManager.promptCreateProject(savedPagesView);
      return;
    }

    const renameButton = event.target.closest('.project-action-rename');
    if (renameButton) {
      void projectManager.renameProject(savedPagesView, renameButton.dataset.projectId);
      return;
    }

    const visibilityButton = event.target.closest('.project-action-visibility');
    if (visibilityButton) {
      void projectManager.toggleProjectVisibility(
        savedPagesView,
        visibilityButton.dataset.projectId
      );
      return;
    }

    const archiveButton = event.target.closest('.project-action-archive');
    if (archiveButton) {
      void projectManager.archiveProject(savedPagesView, archiveButton.dataset.projectId);
      return;
    }

    const projectRow = event.target.closest('.project-nav-row[data-project-id]');
    if (projectRow) {
      event.preventDefault();
      handleScopeSelection(projectRow.dataset.projectId || '');
    }
  });

  // Pills row: project pills select scopes; +N more opens the dropdown;
  // + New starts the create flow.
  projectPills?.addEventListener('click', (event) => {
    const actionButton = event.target.closest('[data-action]');
    if (actionButton) {
      event.preventDefault();
      if (actionButton.dataset.action === 'open-projects-menu') {
        documentObj.getElementById('saved-pages-sidebar-toggle-btn')?.click();
      } else if (actionButton.dataset.action === 'create-project') {
        void projectManager.promptCreateProject(savedPagesView);
      }
      return;
    }

    const pill = event.target.closest('.project-pill-tab[data-project-id]');
    if (pill) {
      event.preventDefault();
      handleScopeSelection(pill.dataset.projectId || '');
    }
  });

  // Breadcrumb back: clears the scope by selecting All pages.
  deskIndexTitle?.addEventListener('click', (event) => {
    const backButton = event.target.closest('[data-action="breadcrumb-back"]');
    if (!backButton) {
      return;
    }

    event.preventDefault();
    handleScopeSelection('');
  });

  projectEditorBackdrop?.addEventListener('click', () => {
    projectManager.closeEditor(savedPagesView);
  });

  projectEditorDialog?.addEventListener('click', (event) => {
    const closeButton = event.target.closest('.project-editor-close');
    if (closeButton) {
      projectManager.closeEditor(savedPagesView);
      return;
    }

    const createButton = event.target.closest('.project-editor-create');
    if (createButton) {
      void projectManager.createProject(
        savedPagesView,
        createButton.dataset.projectName || '',
        createButton.dataset.pageId || null
      );
    }
  });

  projectEditorDialog?.addEventListener('change', (event) => {
    const checkbox = event.target.closest('.project-editor-checkbox');
    if (!checkbox) {
      return;
    }

    void projectManager.togglePageProject(
      savedPagesView,
      checkbox.dataset.pageId,
      checkbox.dataset.projectId,
      checkbox.checked
    );
  });

  projectEditorDialog?.addEventListener('input', (event) => {
    const input = event.target.closest('#project-editor-search-input');
    if (!input) {
      return;
    }

    projectManager.updateEditorQuery(savedPagesView, input.value);
  });

  documentObj.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && !projectEditorDialog?.classList.contains('hidden')) {
      projectManager.closeEditor(savedPagesView);
    }
  });
  // Lazy-load more saved pages as the user scrolls toward the bottom of the
  // results pane. Throttled per frame to avoid firing on every scroll event.
  // Listens on the results container (the bounded scroll viewport) and on the
  // window as a fallback for the narrow-width layout where the window scrolls.
  let scrollRafQueued = false;
  function onScrollNearEnd() {
    // While the feed owns the results pane, its personal archive view grows
    // on scroll (the org view stays a fixed ranked window by design); the
    // drawer's list pagination only applies when the drawer owns the pane.
    if (savedPagesDrawerResults?.querySelector('[data-section="feed"]')) {
      void handleFeedScrollNearEnd?.();
      return;
    }
    if (scrollRafQueued) {
      return;
    }
    scrollRafQueued = true;
    windowObj.requestAnimationFrame(() => {
      scrollRafQueued = false;
      void handleDrawerScrollNearEnd?.();
    });
  }
  function isNearScrollEnd(el) {
    if (!el) {
      return false;
    }
    const threshold = el.clientHeight * 1.5;
    return el.scrollTop + el.clientHeight >= el.scrollHeight - threshold;
  }

  // Scroll-state header choreography, driven by whichever element scrolls
  // (the results container in the wide layout, the page in narrow layouts):
  // - The pinned strip collapses to favicon-only launchers — wrapped label
  //   chips cost too much vertical space mid-browse. Collapsed chips keep
  //   their pointer target and title tooltip; management returns at the top.
  // - Scroll mode additionally retires the masthead and utility row and
  //   slims the search hero (spec:
  //   docs/superpowers/specs/2026-08-31-scroll-mode-header-design.md).
  //   A header this large jittering at a single threshold would be visible,
  //   so it enters deep (96px) and exits near the top (32px).
  const LAUNCH_STRIP_COLLAPSE_SCROLL_PX = 48;
  const SCROLL_MODE_ENTER_PX = 96;
  const SCROLL_MODE_EXIT_PX = 32;
  const pageEl = launchStrip?.closest('.desk-page') || null;
  let scrollModeActive = false;
  function updateHeaderScrollState(scroller) {
    const scrollTop = scroller?.scrollTop ?? 0;
    launchStrip?.classList?.toggle('is-collapsed', scrollTop > LAUNCH_STRIP_COLLAPSE_SCROLL_PX);
    const next = scrollModeActive
      ? scrollTop > SCROLL_MODE_EXIT_PX
      : scrollTop >= SCROLL_MODE_ENTER_PX;
    if (next !== scrollModeActive) {
      scrollModeActive = next;
      pageEl?.classList?.toggle('is-scroll-mode', scrollModeActive);
    }
  }

  savedPagesDrawerResults?.addEventListener(
    'scroll',
    () => {
      updateHeaderScrollState(savedPagesDrawerResults);
      if (isNearScrollEnd(savedPagesDrawerResults)) {
        onScrollNearEnd();
      }
    },
    { passive: true }
  );
  windowObj.addEventListener(
    'scroll',
    () => {
      // Only acts as a fallback when the results container itself isn't the
      // scroller (narrow layout). handleDrawerScrollNearEnd is a no-op for
      // project/domain scopes, so this stays safe.
      updateHeaderScrollState(windowObj.document.scrollingElement);
      if (isNearScrollEnd(windowObj.document.scrollingElement)) {
        onScrollNearEnd();
      }
    },
    { passive: true }
  );
  updateHeaderScrollState(savedPagesDrawerResults);

  setDrawerToggleState(true);
  setDrawerSearchValue(getInitialDrawerUrlState(windowObj.location.search).searchQuery);
}
