import { PINNED_PAGES_SCOPE_ID } from './project-manager-state.js';

function getDefaultProjectEditorState() {
  return { pageId: null, query: '' };
}

function hasSelectedProjectScope(state) {
  return Boolean(state.selectedProjectId && state.selectedProjectId !== PINNED_PAGES_SCOPE_ID);
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
    get domains() {
      return state.domains;
    },
    set domains(value) {
      state.domains = Array.isArray(value) ? value : [];
    },
    get selectedDomainId() {
      return state.selectedDomainId;
    },
    set selectedDomainId(value) {
      state.selectedDomainId = value || null;
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
    get view() {
      return state.view;
    },
    set view(value) {
      state.view = value === 'browse' ? 'browse' : 'home';
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
        const safeTotal = Math.max(
          typeof state.allItemsTotal === 'number' ? state.allItemsTotal : 0,
          typeof state.total === 'number' ? state.total : 0,
          state.allPages.length
        );
        await savedPagesStore.setPages(state.allPages, {
          total: safeTotal,
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
      if (hasSelectedProjectScope(state)) {
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
      const shouldRefilter = state.selectedProjectId === projectId || state.selectedProjectId === PINNED_PAGES_SCOPE_ID;

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
