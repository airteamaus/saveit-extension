export function getInitialDrawerUrlState(locationSearch = '', {
  drawerParam = 'drawer',
  drawerValue = 'saved-pages'
} = {}) {
  const urlParams = new URLSearchParams(locationSearch);
  const isOpen = urlParams.get(drawerParam) === drawerValue;

  return {
    isOpen,
    searchQuery: isOpen ? (urlParams.get('search') || '') : ''
  };
}

export function initSavedPagesDrawerEvents({
  savedPagesToggleBtn,
  savedPagesDrawer,
  savedPagesDrawerBackdrop,
  savedPagesDrawerCloseBtn,
  savedPagesDrawerSearchForm,
  savedPagesDrawerSearchInput,
  savedPagesDrawerClearBtn,
  savedPagesDrawerResults,
  projectSidebar,
  projectEditorBackdrop,
  projectEditorDialog,
  projectManager,
  savedPagesView,
  openSavedPagesDrawer,
  closeSavedPagesDrawer,
  loadDrawerResults,
  navigateDrawerCard,
  handleDrawerPin,
  handleDrawerDelete,
  setDrawerSearchValue,
  setDrawerToggleState,
  isDrawerOpen,
  drawerParam = 'drawer',
  drawerValue = 'saved-pages',
  windowObj = window,
  documentObj = document
}) {
  let drawerSearchDebounceTimer = null;

  savedPagesToggleBtn?.addEventListener('click', () => {
    if (savedPagesDrawer?.classList.contains('hidden')) {
      openSavedPagesDrawer();
    } else {
      closeSavedPagesDrawer();
    }
  });

  savedPagesDrawerBackdrop?.addEventListener('click', () => closeSavedPagesDrawer());
  savedPagesDrawerCloseBtn?.addEventListener('click', () => closeSavedPagesDrawer());

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

  savedPagesDrawerResults?.addEventListener('click', (event) => {
    const actionButton = event.target.closest('[data-action]');
    if (!actionButton) {
      const card = event.target.closest('.saved-pages-drawer-card[data-url]');
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

    if (action === 'projects') {
      projectManager.openEditor(savedPagesView, id);
      return;
    }

    if (action === 'remove-project') {
      void projectManager.togglePageProject(savedPagesView, id, actionButton.dataset.projectId, false);
      return;
    }

    if (action === 'delete') {
      void handleDrawerDelete(id);
    }
  });

  savedPagesDrawerResults?.addEventListener('auxclick', (event) => {
    if (event.button !== 1 || event.target.closest('[data-action]')) {
      return;
    }

    const card = event.target.closest('.saved-pages-drawer-card[data-url]');
    if (!card) {
      return;
    }

    event.preventDefault();
    navigateDrawerCard(card, event);
  });

  savedPagesDrawerResults?.addEventListener('keydown', (event) => {
    if ((event.key !== 'Enter' && event.key !== ' ') || event.target.closest('[data-action]')) {
      return;
    }

    const card = event.target.closest('.saved-pages-drawer-card[data-url]');
    if (!card) {
      return;
    }

    event.preventDefault();
    navigateDrawerCard(card, event);
  });

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
      void projectManager.toggleProjectVisibility(savedPagesView, visibilityButton.dataset.projectId);
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
      void projectManager.selectProject(savedPagesView, projectRow.dataset.projectId || null);
    }
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
      return;
    }

    if (event.key === 'Escape' && isDrawerOpen()) {
      closeSavedPagesDrawer();
    }
  });

  const initialUrlState = getInitialDrawerUrlState(windowObj.location.search, {
    drawerParam,
    drawerValue
  });
  if (initialUrlState.isOpen) {
    openSavedPagesDrawer({
      syncUrl: false,
      searchQuery: initialUrlState.searchQuery
    });
  } else {
    setDrawerToggleState(false);
  }
}
