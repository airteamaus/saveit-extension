import { PINNED_PAGES_SCOPE_ID } from './project-manager-state.js';
import {
  selectDrawerDomain,
  selectDrawerProject,
  setDrawerAllItemsTotal,
  setDrawerAllPages,
  setDrawerCurrentFilter,
  setDrawerDomains,
  setDrawerProjectEditorState,
  setDrawerProjects,
  setDrawerProjectsAvailability,
  setDrawerProjectsLoading,
  setDrawerRenderedPages,
  setDrawerTotal
} from './newtab-drawer-state.js';

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
      setDrawerAllPages(state, value);
    },
    get pages() {
      return state.pages;
    },
    set pages(value) {
      setDrawerRenderedPages(state, value);
    },
    get projects() {
      return state.projects;
    },
    set projects(value) {
      setDrawerProjects(state, value);
    },
    get domains() {
      return state.domains;
    },
    set domains(value) {
      setDrawerDomains(state, value);
    },
    get selectedDomainId() {
      return state.selectedDomainId;
    },
    set selectedDomainId(value) {
      selectDrawerDomain(state, value);
    },
    get projectsLoading() {
      return state.projectsLoading;
    },
    set projectsLoading(value) {
      setDrawerProjectsLoading(state, value);
    },
    get selectedProjectId() {
      return state.selectedProjectId;
    },
    set selectedProjectId(value) {
      selectDrawerProject(state, value);
    },
    get projectsAvailable() {
      return state.projectsAvailable;
    },
    set projectsAvailable(value) {
      setDrawerProjectsAvailability(state, { available: value });
    },
    get projectsUnavailableMessage() {
      return state.projectsUnavailableMessage;
    },
    set projectsUnavailableMessage(value) {
      setDrawerProjectsAvailability(state, { message: value });
    },
    projectsStore,
    get projectEditorState() {
      return state.projectEditorState;
    },
    set projectEditorState(value) {
      setDrawerProjectEditorState(state, value);
    },
    get currentFilter() {
      return state.currentFilter;
    },
    set currentFilter(value) {
      // Whole-object replacement: rebuild with normalization. Nested field
      // writes (dashboard.currentFilter.projectId = x) go through the getter's
      // live object and are NOT routed here — project-manager code calls
      // setDrawerCurrentFilter directly for those, see pm-actions.js.
      setDrawerCurrentFilter(state, {
        search: value?.search,
        projectId: value?.projectId,
        cursor: value?.cursor
      });
    },
    get totalPages() {
      return state.total;
    },
    set totalPages(value) {
      setDrawerTotal(state, value);
    },
    get allItemsTotal() {
      return state.allItemsTotal;
    },
    set allItemsTotal(value) {
      setDrawerAllItemsTotal(state, value);
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
