export function getInitialDrawerUrlState(locationSearch = '', {
  drawerParam = 'drawer',
  drawerValue = 'saved-pages'
} = {}) {
  const urlParams = new URLSearchParams(locationSearch);
  const isOpen = urlParams.get(drawerParam) === drawerValue;
  void isOpen;

  return {
    isOpen: true,
    searchQuery: urlParams.get('search') || ''
  };
}

export function initSavedPagesDrawerEvents({
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
  handleDrawerEditCancel,
  handleDrawerEditStart,
  handleDrawerPin,
  handleDrawerUpdate,
  handleDrawerDelete,
  setDrawerSearchValue,
  setDrawerToggleState,
  isDrawerOpen,
  windowObj = window,
  documentObj = document
}) {
  let drawerSearchDebounceTimer = null;
  void closeSavedPagesDrawer;
  void isDrawerOpen;

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
    if (event.target.closest('[data-semantic-search-tag]')) {
      return;
    }

    const actionButton = event.target.closest('[data-action]');
    if (!actionButton) {
      if (event.target.closest('.saved-pages-drawer-edit-form')) {
        return;
      }
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
      void projectManager.togglePageProject(savedPagesView, id, actionButton.dataset.projectId, false);
      return;
    }

    if (action === 'delete') {
      void handleDrawerDelete(id);
    }
  });

  savedPagesDrawerResults?.addEventListener('auxclick', (event) => {
    if (
      event.button !== 1 ||
      event.target.closest('[data-semantic-search-tag]') ||
      event.target.closest('[data-action]') ||
      event.target.closest('.saved-pages-drawer-edit-form')
    ) {
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
    if (
      event.target.closest('.saved-pages-drawer-edit-form')
    ) {
      if (event.key === 'Escape') {
        event.preventDefault();
        handleDrawerEditCancel();
      }
      return;
    }

    if (
      (event.key !== 'Enter' && event.key !== ' ') ||
      event.target.closest('[data-action]') ||
      event.target.closest('[data-semantic-search-tag]')
    ) {
      return;
    }

    const card = event.target.closest('.saved-pages-drawer-card[data-url]');
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
    void handleDrawerUpdate(form.dataset.pageId, {
      title: formData.get('title') || '',
      description: formData.get('description') || ''
    });
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
    }
  });
  void openSavedPagesDrawer;
  setDrawerToggleState(true);
  setDrawerSearchValue(getInitialDrawerUrlState(windowObj.location.search).searchQuery);
}
