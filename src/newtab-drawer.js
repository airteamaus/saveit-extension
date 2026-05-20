import { ProjectsStore } from './projects-store.js';
import { SavedPagesStore } from './saved-pages-store.js';
import { createDrawerDataController } from './newtab-drawer-data.js';
import { initSavedPagesDrawerEvents } from './newtab-drawer-events.js';
import { createDrawerRenderer } from './newtab-drawer-renderer.js';
import { createDrawerSyncCoordinator } from './newtab-drawer-sync.js';

const SAVED_PAGES_DRAWER_PARAM = 'drawer';
const SAVED_PAGES_DRAWER_VALUE = 'saved-pages';
const DRAWER_INITIAL_FETCH_LIMIT = 50;
const DRAWER_WARM_CACHE_SCOPE = {
  surface: 'saved-pages-drawer',
  sort: 'newest',
  pinnedFirst: false,
  limit: 'all'
};

function createInitialDrawerState() {
  return {
    hasInitialized: false,
    isLoading: false,
    query: '',
    currentFilter: {
      search: '',
      projectId: null,
      cursor: null
    },
    pages: [],
    allPages: [],
    projects: [],
    projectsLoading: false,
    projectsAvailable: true,
    projectsUnavailableMessage: '',
    selectedProjectId: null,
    projectEditorState: {
      pageId: null,
      query: ''
    },
    total: null,
    allItemsTotal: null,
    requestId: 0
  };
}

export function createSavedPagesStore(api) {
  return new SavedPagesStore(api, {
    initialFetchLimit: DRAWER_INITIAL_FETCH_LIMIT,
    prefetchBatchLimit: 100,
    warmCacheScope: DRAWER_WARM_CACHE_SCOPE
  });
}

export function createProjectsStore(api) {
  return new ProjectsStore(api);
}

export function getDrawerSearchableText(page = {}) {
  const fields = [
    page.title,
    page.url,
    page.domain,
    page.description,
    page.ai_summary_brief,
    page.primary_classification_label,
    ...(page.manual_tags || []),
    ...(page.classifications || []).map(classification => classification.label)
  ];

  return fields
    .filter(Boolean)
    .join(' ')
    .toLowerCase();
}

export function createSavedPagesDrawerController({
  api,
  savedPagesStore,
  projectsStore,
  projectManager,
  elements,
  onSavedPagesTotalChange,
  refreshFavorites,
  windowObj = window,
  documentObj = document
}) {
  const {
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
    projectEditorDialog
  } = elements;

  const state = createInitialDrawerState();
  let suppressSavedPagesStoreSync = false;

  function notifySavedPagesTotalChange() {
    const snapshot = savedPagesStore.getSnapshot();
    onSavedPagesTotalChange?.(typeof snapshot.total === 'number' ? snapshot.total : null);
  }

  function getCurrentUser() {
    return windowObj.firebaseAuth?.currentUser || null;
  }

  function isDrawerOpen() {
    return Boolean(savedPagesDrawer && !savedPagesDrawer.classList.contains('hidden'));
  }

  function getSearchQuery() {
    return savedPagesDrawerSearchInput?.value || state.query;
  }

  function updateDrawerUrl(isOpen, searchQuery = '') {
    const url = new URL(windowObj.location.href);
    if (isOpen) {
      url.searchParams.set(SAVED_PAGES_DRAWER_PARAM, SAVED_PAGES_DRAWER_VALUE);
      if (searchQuery.trim()) {
        url.searchParams.set('search', searchQuery.trim());
      } else {
        url.searchParams.delete('search');
      }
    } else {
      url.searchParams.delete(SAVED_PAGES_DRAWER_PARAM);
      url.searchParams.delete('search');
    }

    windowObj.history.replaceState({}, '', url);
  }

  function setDrawerToggleState(isOpen) {
    if (!savedPagesToggleBtn) return;

    savedPagesToggleBtn.setAttribute('aria-expanded', String(isOpen));
    savedPagesToggleBtn.setAttribute('aria-label', isOpen ? 'Close saved pages' : 'Open saved pages');
    savedPagesToggleBtn.title = isOpen ? 'Close saved pages' : 'Open saved pages';
    savedPagesToggleBtn.classList.toggle('is-active', isOpen);
  }

  function setDrawerSearchValue(query = '') {
    if (!savedPagesDrawerSearchInput || !savedPagesDrawerClearBtn) return;

    savedPagesDrawerSearchInput.value = query;
    savedPagesDrawerClearBtn.classList.toggle('hidden', !query.trim());
  }

  let dataController;

  const savedPagesView = {
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
      state.projectEditorState = value || { pageId: null, query: '' };
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
      suppressSavedPagesStoreSync = true;

      try {
        await savedPagesStore.setPages(state.allPages, {
          total: state.allItemsTotal ?? state.total ?? state.allPages.length,
          hasNextPage: false,
          nextCursor: null
        });
      } finally {
        suppressSavedPagesStoreSync = false;
      }
    },
    async persistProjects() {
      await projectsStore.setProjects(state.projects || []);
    },
    showLoading: renderDrawerLoadingState,
    async loadPages() {
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

  function getDrawerProjectPills(page) {
    return projectManager.getProjectPills(page, savedPagesView);
  }

  function getProjectScopeLabel() {
    const selectedProject = projectManager.getSelectedProject(savedPagesView);
    return selectedProject ? selectedProject.name : 'All saved items';
  }

  function applyDrawerFilters(query = state.query) {
    const trimmedQuery = query.trim();
    state.query = trimmedQuery;
    state.currentFilter.search = trimmedQuery;

    const scopedPages = projectManager.getScopedPages(savedPagesView, state.allPages);
    state.total = state.selectedProjectId
      ? scopedPages.length
      : (typeof state.allItemsTotal === 'number' ? state.allItemsTotal : null);

    if (!trimmedQuery) {
      state.pages = [...scopedPages];
      return;
    }

    const loweredQuery = trimmedQuery.toLowerCase();
    state.pages = scopedPages.filter(page => getDrawerSearchableText(page).includes(loweredQuery));
  }

  function renderProjectSidebar() {
    projectManager.renderSidebar(savedPagesView);
  }

  function renderProjectEditor() {
    projectManager.renderEditor(savedPagesView);
  }

  function renderDrawerChrome() {
    renderProjectSidebar();
    renderProjectEditor();
  }

  const drawerRenderer = createDrawerRenderer({
    documentObj,
    resultsContainer: savedPagesDrawerResults,
    renderChrome: renderDrawerChrome,
    getProjectPills: page => getDrawerProjectPills(page),
    isProjectsUnavailable: () => savedPagesView.projectsAvailable === false,
    getProjectScopeLabel
  });

  function navigateDrawerCard(card, event = {}) {
    const url = card?.dataset?.url;
    if (!url) {
      return;
    }

    if (event.metaKey || event.ctrlKey || event.button === 1) {
      windowObj.open(url, '_blank', 'noopener');
      return;
    }

    windowObj.location.assign(url);
  }

  function refreshDrawerCard(pageId) {
    drawerRenderer.refreshCard(pageId, state.pages, state.query, {
      onMissingPage: () => {
        if (!state.pages.length) {
          renderDrawerEmptyState(state.query);
        }
      }
    });
  }

  function renderDrawerLoadingState(message = 'Loading saved pages...') {
    drawerRenderer.renderLoadingState(message);
  }

  function renderDrawerErrorState(message) {
    drawerRenderer.renderErrorState(message);
  }

  function renderDrawerEmptyState(query = '') {
    drawerRenderer.renderEmptyState(query, {
      hasSelectedProject: Boolean(state.selectedProjectId)
    });
  }

  function renderDrawerSignInState() {
    drawerRenderer.renderSignInState();
  }

  function renderDrawerResults() {
    if (!state.pages.length) {
      renderDrawerEmptyState(state.query);
      return;
    }

    if (!savedPagesDrawerResults) {
      return;
    }

    drawerRenderer.renderResults(state.pages);
  }

  function syncDrawerStateFromStore(snapshot, { query = state.query, render = state.hasInitialized } = {}) {
    state.allPages = snapshot.allPages || [];
    state.total = typeof snapshot.total === 'number' ? snapshot.total : state.allPages.length;
    if (!state.selectedProjectId) {
      state.allItemsTotal = state.total;
    }
    projectManager.refreshProjectCounts(savedPagesView);
    applyDrawerFilters(query);

    if (render) {
      renderDrawerResults();
    }
  }

  function syncProjectsStateFromStore(snapshot, { render = state.hasInitialized } = {}) {
    state.projects = snapshot.projects || snapshot.allPages || [];
    state.projectsAvailable = true;
    state.projectsUnavailableMessage = '';
    projectManager.refreshProjectCounts(savedPagesView);

    if (render) {
      renderDrawerChrome();
    }
  }

  dataController = createDrawerDataController({
    api,
    state,
    savedPagesStore,
    projectsStore,
    projectManager,
    savedPagesView,
    getCurrentUser,
    isDrawerOpen,
    setDrawerSearchValue,
    updateDrawerUrl,
    renderDrawerLoadingState,
    renderDrawerErrorState,
    renderDrawerSignInState,
    renderDrawerResults,
    syncDrawerStateFromStore,
    syncProjectsStateFromStore,
    applyDrawerFilters,
    windowObj,
    projectFetchLimit: 100
  });

  function openSavedPagesDrawer({ syncUrl = true, searchQuery = '' } = {}) {
    if (!savedPagesDrawer) return;

    setDrawerSearchValue(searchQuery);
    savedPagesDrawer.classList.remove('hidden');
    savedPagesDrawer.setAttribute('aria-hidden', 'false');
    documentObj.body.classList.add('saved-pages-drawer-open');
    setDrawerToggleState(true);

    if (syncUrl) {
      updateDrawerUrl(true, searchQuery);
    }

    if (!state.hasInitialized) {
      void dataController.loadDrawerBasePages({ query: searchQuery, syncUrl: false });
    } else if (state.query !== searchQuery.trim()) {
      void dataController.loadDrawerResults(searchQuery, { syncUrl: false });
    } else {
      renderDrawerResults();
    }
  }

  function closeSavedPagesDrawer({ syncUrl = true } = {}) {
    if (!savedPagesDrawer) return;

    savedPagesDrawer.classList.add('hidden');
    savedPagesDrawer.setAttribute('aria-hidden', 'true');
    documentObj.body.classList.remove('saved-pages-drawer-open');
    setDrawerToggleState(false);

    if (syncUrl) {
      updateDrawerUrl(false);
    }
  }

  function initDrawerEventHandlers() {
    initSavedPagesDrawerEvents({
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
      loadDrawerResults: dataController.loadDrawerResults,
      navigateDrawerCard,
      handleDrawerPin: dataController.handleDrawerPin,
      handleDrawerDelete: dataController.handleDrawerDelete,
      setDrawerSearchValue,
      setDrawerToggleState,
      isDrawerOpen,
      drawerParam: SAVED_PAGES_DRAWER_PARAM,
      drawerValue: SAVED_PAGES_DRAWER_VALUE,
      windowObj,
      documentObj
    });
  }

  const syncCoordinator = createDrawerSyncCoordinator({
    api,
    state,
    savedPagesStore,
    projectsStore,
    getCurrentUser,
    isDrawerOpen,
    getSearchQuery,
    notifySavedPagesTotalChange,
    refreshFavorites,
    syncDrawerStateFromStore,
    syncProjectsStateFromStore,
    loadDrawerBasePages: dataController.loadDrawerBasePages,
    loadDrawerProjectPages: dataController.loadDrawerProjectPages,
    loadDrawerResults: dataController.loadDrawerResults,
    renderDrawerSignInState,
    resetDrawerState: () => {
      Object.assign(state, createInitialDrawerState());
    },
    setSuppressSavedPagesStoreSync: value => {
      suppressSavedPagesStoreSync = value === true;
    },
    getSuppressSavedPagesStoreSync: () => suppressSavedPagesStoreSync,
    windowObj
  });

  function init() {
    syncCoordinator.init();
    initDrawerEventHandlers();
  }

  return {
    close: closeSavedPagesDrawer,
    handleSignedIn: syncCoordinator.handleSignedIn,
    handleSignedOut: syncCoordinator.handleSignedOut,
    init,
    loadSummary: syncCoordinator.loadSummary,
    open: openSavedPagesDrawer
  };
}
