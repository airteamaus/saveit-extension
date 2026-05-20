import { ProjectsStore } from './projects-store.js';
import { SavedPagesStore } from './saved-pages-store.js';
import { isSavedPagesCacheInvalidation } from './saved-pages-cache.js';
import { initSavedPagesDrawerEvents } from './newtab-drawer-events.js';
import { createDrawerRenderer } from './newtab-drawer-renderer.js';

const SAVED_PAGES_DRAWER_PARAM = 'drawer';
const SAVED_PAGES_DRAWER_VALUE = 'saved-pages';
const DRAWER_INITIAL_FETCH_LIMIT = 50;
const DRAWER_PROJECT_FETCH_LIMIT = 100;
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
  let savedPagesCacheRefreshTimer = null;
  let drawerProjectsPromise = null;
  let savedPagesSummaryPromise = null;
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
        await loadDrawerProjectPages(state.selectedProjectId, {
          query: state.query,
          syncUrl: false
        });
        return;
      }

      if (!state.hasInitialized) {
        await loadDrawerBasePages({ query: state.query, syncUrl: false });
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

  function findDrawerPage(id) {
    return state.allPages.find(page => page.id === id) || null;
  }

  function updateDrawerPageCollections(id, updater) {
    state.allPages = state.allPages.map(page => (page.id === id ? updater(page) : page));
    state.pages = state.pages.map(page => (page.id === id ? updater(page) : page));
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

  async function ensureDrawerProjectsLoaded() {
    if (state.projects.length || state.projectsAvailable === false) {
      return null;
    }

    if (!drawerProjectsPromise) {
      state.projectsLoading = true;
      drawerProjectsPromise = projectsStore
        .hydrate()
        .then(snapshot => {
          syncProjectsStateFromStore(snapshot, {
            render: state.hasInitialized
          });
        })
        .catch(error => {
          console.error('Failed to load projects:', error);
          state.projects = [];
          if (error?.code === 'PROJECTS_UNSUPPORTED') {
            state.projectsAvailable = false;
            state.projectsUnavailableMessage = error.message;
          } else {
            state.projectsAvailable = true;
            state.projectsUnavailableMessage = '';
          }
        })
        .finally(() => {
          state.projectsLoading = false;
          drawerProjectsPromise = null;
        });
    }

    return drawerProjectsPromise;
  }

  async function loadDrawerBasePages({ query = state.query, syncUrl = true } = {}) {
    const requestId = ++state.requestId;
    const trimmedQuery = query.trim();

    state.isLoading = true;
    setDrawerSearchValue(trimmedQuery);

    if (syncUrl && isDrawerOpen()) {
      updateDrawerUrl(true, trimmedQuery);
    }

    if (api.isExtension && !getCurrentUser()) {
      state.isLoading = false;
      state.hasInitialized = true;
      savedPagesStore.reset({ emit: false });
      state.allPages = [];
      state.pages = [];
      renderDrawerSignInState();
      return;
    }

    if (!savedPagesStore.getSnapshot().allPages.length) {
      renderDrawerLoadingState(trimmedQuery ? 'Searching your saved pages...' : 'Loading saved pages...');
    }

    try {
      const projectsPromise = ensureDrawerProjectsLoaded();
      const snapshot = await savedPagesStore.hydrate();

      if (requestId !== state.requestId) {
        return;
      }

      syncDrawerStateFromStore(snapshot, { query: trimmedQuery, render: false });
      state.hasInitialized = true;
      renderDrawerResults();

      if (projectsPromise) {
        void projectsPromise.then(() => {
          if (requestId !== state.requestId) {
            return;
          }

          projectManager.refreshProjectCounts(savedPagesView);
          renderDrawerResults();
        });
      }
    } catch (error) {
      if (requestId !== state.requestId) {
        return;
      }

      console.error('[newtab] Drawer load failed:', error);
      renderDrawerErrorState(error.message || 'Failed to load saved pages.');
    } finally {
      if (requestId === state.requestId) {
        state.isLoading = false;
      }
    }
  }

  async function loadDrawerProjectPages(projectId, { query = state.query, syncUrl = true } = {}) {
    const requestId = ++state.requestId;
    const trimmedQuery = query.trim();

    state.isLoading = true;
    setDrawerSearchValue(trimmedQuery);

    if (syncUrl && isDrawerOpen()) {
      updateDrawerUrl(true, trimmedQuery);
    }

    renderDrawerLoadingState(trimmedQuery ? 'Searching project pages...' : 'Loading project pages...');

    try {
      const projectsPromise = ensureDrawerProjectsLoaded();
      const pages = [];
      let cursor = null;
      let total = null;

      do {
        const response = await api.getSavedPages({
          limit: DRAWER_PROJECT_FETCH_LIMIT,
          sort: 'newest',
          pinnedFirst: false,
          projectId,
          cursor,
          skipCache: true
        });

        if (requestId !== state.requestId) {
          return;
        }

        pages.push(...(response?.pages || []));
        total = typeof response?.pagination?.total === 'number' ? response.pagination.total : total;
        cursor = response?.pagination?.hasNextPage ? response?.pagination?.nextCursor || null : null;
      } while (cursor);

      if (requestId !== state.requestId) {
        return;
      }

      state.allPages = pages;
      state.allItemsTotal = total ?? pages.length;
      state.total = pages.length;
      applyDrawerFilters(trimmedQuery);
      state.hasInitialized = true;
      renderDrawerResults();

      if (projectsPromise) {
        void projectsPromise.then(() => {
          if (requestId !== state.requestId) {
            return;
          }

          projectManager.refreshProjectCounts(savedPagesView);
          renderDrawerResults();
        });
      }
    } catch (error) {
      if (requestId !== state.requestId) {
        return;
      }

      console.error('[newtab] Project drawer load failed:', error);
      renderDrawerErrorState(error.message || 'Failed to load project pages.');
    } finally {
      if (requestId === state.requestId) {
        state.isLoading = false;
      }
    }
  }

  async function handleDrawerDelete(id) {
    if (!id || !windowObj.confirm('Delete this saved page? This cannot be undone.')) {
      return;
    }

    try {
      await api.deletePage(id);
      const deletedPage = findDrawerPage(id);
      await savedPagesStore.removePage(id);
      syncDrawerStateFromStore(savedPagesStore.getSnapshot(), {
        query: state.query,
        render: false
      });
      (deletedPage?.project_ids || []).forEach(projectId => {
        projectManager.adjustProjectCount(savedPagesView, projectId, -1);
      });
      renderDrawerResults();
    } catch (error) {
      console.error('[newtab] Failed to delete page:', error);
      windowObj.alert('Failed to delete page. Please try again.');
    }
  }

  async function handleDrawerPin(id) {
    const page = findDrawerPage(id);
    if (!page) {
      return;
    }

    const nextPinnedState = !page.pinned;
    updateDrawerPageCollections(id, entry => ({ ...entry, pinned: nextPinnedState }));
    void savedPagesView.persistAllPages();
    renderDrawerResults();

    try {
      await api.pinPage(id, nextPinnedState);
    } catch (error) {
      updateDrawerPageCollections(id, entry => ({ ...entry, pinned: !nextPinnedState }));
      void savedPagesView.persistAllPages();
      renderDrawerResults();
      console.error('[newtab] Failed to update pin:', error);
      windowObj.alert('Failed to update pin status. Please try again.');
    }
  }

  async function loadDrawerResults(query = '', { syncUrl = true } = {}) {
    const trimmedQuery = query.trim();

    if (!state.hasInitialized) {
      await loadDrawerBasePages({ query: trimmedQuery, syncUrl });
      return;
    }

    setDrawerSearchValue(trimmedQuery);
    if (syncUrl && isDrawerOpen()) {
      updateDrawerUrl(true, trimmedQuery);
    }

    applyDrawerFilters(trimmedQuery);
    renderDrawerResults();
  }

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
      void loadDrawerBasePages({ query: searchQuery, syncUrl: false });
    } else if (state.query !== searchQuery.trim()) {
      void loadDrawerResults(searchQuery, { syncUrl: false });
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

  function syncSavedPagesAfterCacheInvalidation() {
    windowObj.clearTimeout(savedPagesCacheRefreshTimer);
    savedPagesCacheRefreshTimer = windowObj.setTimeout(() => {
      state.hasInitialized = false;

      if (!getCurrentUser()) {
        return;
      }

      refreshFavorites?.();
      void projectsStore.hydrate();
      if (state.selectedProjectId) {
        void loadDrawerProjectPages(state.selectedProjectId, {
          query: savedPagesDrawerSearchInput?.value || state.query,
          syncUrl: false
        });
        return;
      }

      void savedPagesStore.hydrate();

      if (isDrawerOpen()) {
        void loadDrawerBasePages({
          query: savedPagesDrawerSearchInput?.value || state.query,
          syncUrl: false
        });
      }
    }, 50);
  }

  function initSavedPagesCacheSync() {
    const browserApi = globalThis.browser ?? globalThis.chrome;
    if (!browserApi?.storage?.onChanged?.addListener) {
      return;
    }

    browserApi.storage.onChanged.addListener((changes, areaName) => {
      if (!isSavedPagesCacheInvalidation(changes, areaName)) {
        return;
      }

      syncSavedPagesAfterCacheInvalidation();
    });
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
      loadDrawerResults,
      navigateDrawerCard,
      handleDrawerPin,
      handleDrawerDelete,
      setDrawerSearchValue,
      setDrawerToggleState,
      isDrawerOpen,
      drawerParam: SAVED_PAGES_DRAWER_PARAM,
      drawerValue: SAVED_PAGES_DRAWER_VALUE,
      windowObj,
      documentObj
    });
  }

  function initStoreSubscriptions() {
    savedPagesStore.subscribe(() => {
      notifySavedPagesTotalChange();

      if (
        suppressSavedPagesStoreSync ||
        !state.hasInitialized ||
        (api.isExtension && !getCurrentUser())
      ) {
        return;
      }

      syncDrawerStateFromStore(savedPagesStore.getSnapshot(), {
        query: state.query,
        render: isDrawerOpen()
      });
    });

    projectsStore.subscribe(() => {
      if (
        !state.hasInitialized ||
        (api.isExtension && !getCurrentUser())
      ) {
        return;
      }

      syncProjectsStateFromStore(projectsStore.getSnapshot(), {
        render: isDrawerOpen()
      });
    });
  }

  function init() {
    initStoreSubscriptions();
    initSavedPagesCacheSync();
    initDrawerEventHandlers();
  }

  async function loadSummary() {
    if (savedPagesSummaryPromise) {
      return savedPagesSummaryPromise;
    }

    savedPagesSummaryPromise = (async () => {
      try {
        if (!api?.getSavedPages) {
          savedPagesStore.reset({ emit: false });
          notifySavedPagesTotalChange();
          return;
        }

        if (api.isExtension && !getCurrentUser()) {
          savedPagesStore.reset({ emit: false });
          notifySavedPagesTotalChange();
          return;
        }

        await savedPagesStore.hydrate();
        notifySavedPagesTotalChange();
      } catch (error) {
        console.error('[newtab] Failed to load saved pages summary:', error);
      } finally {
        savedPagesSummaryPromise = null;
      }
    })();

    return savedPagesSummaryPromise;
  }

  async function handleSignedIn() {
    state.hasInitialized = false;
    savedPagesStore.reset({ emit: false });
    await loadSummary();

    if (isDrawerOpen()) {
      await loadDrawerResults(savedPagesDrawerSearchInput?.value || '', { syncUrl: false });
    }
  }

  function handleSignedOut() {
    projectsStore.reset({ emit: false });
    savedPagesStore.reset({ emit: false });
    notifySavedPagesTotalChange();

    Object.assign(state, createInitialDrawerState());

    if (isDrawerOpen()) {
      renderDrawerSignInState();
    }
  }

  return {
    close: closeSavedPagesDrawer,
    handleSignedIn,
    handleSignedOut,
    init,
    loadSummary,
    open: openSavedPagesDrawer
  };
}
