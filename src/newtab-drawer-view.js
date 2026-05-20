function getDefaultProjectEditorState() {
  return { pageId: null, query: '' };
}

export function createSavedPagesView({
  state,
  savedPagesStore,
  projectsStore,
  getCurrentUser,
  getDataController,
  setSuppressSavedPagesStoreSync,
  renderDrawerLoadingState,
  syncDrawerStateFromStore,
  applyDrawerFilters,
  renderDrawerResults,
  renderProjectSidebar,
  refreshDrawerCard
}) {
  return {
    get allPages() {
      return state.allPages;
    },
    set allPages(value) {
      state.allPages = Array.isArray(value) ? value : [];
    },
    get pages() {
      return state.pages;
    },
    set pages(value) {
      state.pages = Array.isArray(value) ? value : [];
    },
    get projects() {
      return state.projects;
    },
    set projects(value) {
      state.projects = Array.isArray(value) ? value : [];
    },
    get projectsLoading() {
      return state.projectsLoading;
    },
    set projectsLoading(value) {
      state.projectsLoading = value === true;
    },
    get selectedProjectId() {
      return state.selectedProjectId;
    },
    set selectedProjectId(value) {
      state.selectedProjectId = value || null;
    },
    get projectsAvailable() {
      return state.projectsAvailable;
    },
    set projectsAvailable(value) {
      state.projectsAvailable = value !== false;
    },
    get projectsUnavailableMessage() {
      return state.projectsUnavailableMessage;
    },
    set projectsUnavailableMessage(value) {
      state.projectsUnavailableMessage = value || '';
    },
    projectsStore,
    get projectEditorState() {
      return state.projectEditorState;
    },
    set projectEditorState(value) {
      state.projectEditorState = value || getDefaultProjectEditorState();
    },
    get currentFilter() {
      return state.currentFilter;
    },
    get totalPages() {
      return state.total;
    },
    set totalPages(value) {
      state.total = value;
    },
    get allItemsTotal() {
      return state.allItemsTotal;
    },
    set allItemsTotal(value) {
      state.allItemsTotal = value;
    },
    getCurrentUser,
    async persistAllPages() {
      setSuppressSavedPagesStoreSync(true);

      try {
        await savedPagesStore.setPages(state.allPages, {
          total: state.allItemsTotal ?? state.total ?? state.allPages.length,
          hasNextPage: false,
          nextCursor: null
        });
      } finally {
        setSuppressSavedPagesStoreSync(false);
      }
    },
    async persistProjects() {
      await projectsStore.setProjects(state.projects || []);
    },
    showLoading: renderDrawerLoadingState,
    async loadPages() {
      const dataController = getDataController();
      if (state.selectedProjectId) {
        await dataController.loadDrawerProjectPages(state.selectedProjectId, {
          query: state.query,
          syncUrl: false
        });
        return;
      }

      if (!state.hasInitialized) {
        await dataController.loadDrawerBasePages({ query: state.query, syncUrl: false });
        return;
      }

      syncDrawerStateFromStore(savedPagesStore.getSnapshot(), {
        query: state.query,
        render: false
      });
    },
    async handleFilterChange() {
      applyDrawerFilters(state.currentFilter.search || '');
      renderDrawerResults();
    },
    render() {
      renderDrawerResults();
    },
    handleProjectMembershipChange(pageId, projectId) {
      const shouldRefilter = state.selectedProjectId === projectId;

      if (shouldRefilter) {
        applyDrawerFilters(state.currentFilter.search || '');
        renderDrawerResults();
        return;
      }

      renderProjectSidebar();
      refreshDrawerCard(pageId);
    },
    onProjectsUpdated() {
      renderDrawerResults();
    },
    tagInteractionManager: {
      clearSelection() {}
    },
    discoveryManager: {
      exit() {}
    }
  };
}
