import { PINNED_PAGES_SCOPE_ID } from './project-manager-state.js';
import { canHydrateDrawerWithWarmCache } from './newtab-drawer-coordination.js';
import { createDomainSavedPagesStore, createProjectSavedPagesStore } from './newtab-drawer-stores.js';
import {
  INITIAL_RENDER_LIMIT,
  RENDER_LIMIT_INCREMENT
} from './newtab-drawer-state.js';
import { hasRenderableWarmCache, upsertListPages } from './warm-cache-list-store.js';

export function createDrawerDataController({
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
  renderDrawerWarmingState,
  renderDrawerResults,
  syncDrawerStateFromStore,
  syncProjectsStateFromStore,
  applyDrawerFilters,
  windowObj = window,
  projectFetchLimit = 100,
  createProjectSavedPagesStoreFn = createProjectSavedPagesStore,
  createDomainSavedPagesStoreFn = createDomainSavedPagesStore
}) {
  let drawerProjectsPromise = null;
  const projectSavedPagesStores = new Map();
  const domainSavedPagesStores = new Map();

  function findDrawerPage(id) {
    return state.allPages.find(page => page.id === id) || null;
  }

  function updateDrawerPageCollections(id, updater) {
    state.allPages = state.allPages.map(page => (page.id === id ? updater(page) : page));
    if (Array.isArray(state.loadedProjectPages)) {
      state.loadedProjectPages = state.loadedProjectPages.map(page => (page.id === id ? updater(page) : page));
    }
    state.pages = state.pages.map(page => (page.id === id ? updater(page) : page));
  }

  function syncProjectDrawerStateFromStore(projectId, snapshot, { query = state.query, render = state.hasInitialized } = {}) {
    if (!projectId || state.selectedProjectId !== projectId) {
      return;
    }

    const projectPages = snapshot?.allPages || [];
    state.allPages = upsertListPages(state.allPages, projectPages, Number.POSITIVE_INFINITY);
    state.loadedProjectPages = projectPages;
    projectManager.refreshProjectCounts(savedPagesView);
    applyDrawerFilters(query);

    if (render) {
      renderDrawerResults();
    }
  }

  function getProjectSavedPagesStore(projectId) {
    if (!projectId || projectId === PINNED_PAGES_SCOPE_ID) {
      return null;
    }

    if (!projectSavedPagesStores.has(projectId)) {
      const store = createProjectSavedPagesStoreFn(api, projectId, {
        initialFetchLimit: projectFetchLimit,
        prefetchBatchLimit: projectFetchLimit
      });
      store.subscribe(() => {
        syncProjectDrawerStateFromStore(projectId, store.getSnapshot(), {
          query: state.query,
          render: state.hasInitialized
        });
      });
      projectSavedPagesStores.set(projectId, store);
    }

    return projectSavedPagesStores.get(projectId) || null;
  }

  // --- Domain warm-cache stores (mirror the project store pattern) ---

  function syncDomainDrawerStateFromStore(domain, snapshot, { query = state.query, render = state.hasInitialized } = {}) {
    if (!domain || state.selectedDomainId !== `domain:${domain}`) {
      return;
    }

    const domainPages = snapshot?.allPages || [];
    state.allPages = upsertListPages(state.allPages, domainPages, Number.POSITIVE_INFINITY);
    state.loadedProjectPages = domainPages;
    applyDrawerFilters(query);

    if (render) {
      renderDrawerResults();
    }
  }

  function getDomainSavedPagesStore(domain) {
    if (!domain) {
      return null;
    }

    if (!domainSavedPagesStores.has(domain)) {
      const store = createDomainSavedPagesStoreFn(api, domain, {
        initialFetchLimit: projectFetchLimit,
        prefetchBatchLimit: projectFetchLimit
      });
      store.subscribe(() => {
        syncDomainDrawerStateFromStore(domain, store.getSnapshot(), {
          query: state.query,
          render: state.hasInitialized
        });
      });
      domainSavedPagesStores.set(domain, store);
    }

    return domainSavedPagesStores.get(domain) || null;
  }

  async function updateCachedProjectStores(page, updater) {
    const projectIds = Array.isArray(page?.project_ids) ? page.project_ids : [];

    await Promise.all(projectIds.map(async projectId => {
      const store = projectSavedPagesStores.get(projectId);
      if (!store) {
        return;
      }

      await store.updatePage(page.id, updater);
    }));
  }

  async function removeFromCachedProjectStores(id, projectIds = []) {
    await Promise.all(projectIds.map(async projectId => {
      const store = projectSavedPagesStores.get(projectId);
      if (!store) {
        return;
      }

      await store.removePage(id);
    }));
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

    if (!(await canHydrateDrawerWithWarmCache(api, getCurrentUser))) {
      state.isLoading = false;
      state.hasInitialized = true;
      savedPagesStore.reset({ emit: false });
      state.allPages = [];
      state.pages = [];
      renderDrawerSignInState();
      return;
    }

    const savedPagesSnapshot = savedPagesStore.getSnapshot();
    if (!savedPagesSnapshot.allPages.length && !hasRenderableWarmCache(savedPagesSnapshot)) {
      // Post-login the store is in non-lazy prefetch mode (set by
      // handleSignedIn). Show the warming bar instead of the bare dog so the
      // user sees progress immediately. The subscriber in
      // createDrawerStoreSubscriptions takes over bar updates once the first
      // batch lands.
      if (savedPagesStore.options.lazy === false && renderDrawerWarmingState) {
        renderDrawerWarmingState({ indeterminate: true });
      } else {
        renderDrawerLoadingState(trimmedQuery ? 'Searching your saved pages…' : 'Gathering your saved pages…');
      }
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

      // Load domains for the sidebar section alongside projects (non-blocking).
      void ensureDrawerDomainsLoaded().then(() => {
        if (requestId !== state.requestId) {
          return;
        }
        renderDrawerResults();
      });
    } catch (error) {
      if (requestId !== state.requestId) {
        return;
      }

      console.error('[newtab] Drawer load failed:', error);
      renderDrawerErrorState(error.message || 'Could not reach your saved pages.');
    } finally {
      if (requestId === state.requestId) {
        state.isLoading = false;
      }
    }
  }

  async function loadDrawerProjectPages(projectId, { query = state.query, syncUrl = true } = {}) {
    if (!projectId || projectId === PINNED_PAGES_SCOPE_ID) {
      await loadDrawerBasePages({ query, syncUrl });
      return;
    }

    const requestId = ++state.requestId;
    const trimmedQuery = query.trim();
    resetRenderLimit();

    state.isLoading = true;
    setDrawerSearchValue(trimmedQuery);

    if (syncUrl && isDrawerOpen()) {
      updateDrawerUrl(true, trimmedQuery);
    }

    if (!(await canHydrateDrawerWithWarmCache(api, getCurrentUser))) {
      state.isLoading = false;
      state.hasInitialized = true;
      savedPagesStore.reset({ emit: false });
      getProjectSavedPagesStore(projectId)?.reset({ emit: false });
      state.allPages = [];
      state.loadedProjectPages = [];
      state.pages = [];
      renderDrawerSignInState();
      return;
    }

    const projectSavedPagesStore = getProjectSavedPagesStore(projectId);
    const projectSnapshot = projectSavedPagesStore?.getSnapshot?.() || null;
    if (
      projectSavedPagesStore &&
      !projectSnapshot?.allPages?.length &&
      !hasRenderableWarmCache(projectSnapshot)
    ) {
      renderDrawerLoadingState(trimmedQuery ? 'Searching project pages…' : 'Gathering project pages…');
    }

    try {
      const projectsPromise = ensureDrawerProjectsLoaded();
      const snapshot = await projectSavedPagesStore.hydrate();

      if (requestId !== state.requestId) {
        return;
      }

      syncProjectDrawerStateFromStore(projectId, snapshot, {
        query: trimmedQuery,
        render: false
      });
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
      renderDrawerErrorState(error.message || 'Could not reach your project pages.');
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
      await removeFromCachedProjectStores(id, deletedPage?.project_ids || []);
      if (Array.isArray(state.loadedProjectPages)) {
        state.loadedProjectPages = state.loadedProjectPages.filter(page => page.id !== id);
      }
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
    void updateCachedProjectStores(page, entry => ({ ...entry, pinned: nextPinnedState }));
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

  function handleDrawerEditStart(id) {
    if (!findDrawerPage(id)) {
      return;
    }

    state.editingPageId = id;
    state.savingEditPageId = null;
    renderDrawerResults();
  }

  function handleDrawerEditCancel() {
    if (state.savingEditPageId) {
      return;
    }

    state.editingPageId = null;
    renderDrawerResults();
  }

  async function handleDrawerUpdate(id, updates = {}) {
    const page = findDrawerPage(id);
    if (!page) {
      return;
    }

    const nextTitle = (updates.title || '').trim();
    const nextAiSummaryBrief = (updates.ai_summary_brief || '').trim();
    if (!nextTitle) {
      windowObj.alert('Title is required.');
      return;
    }

    state.savingEditPageId = id;
    renderDrawerResults();

    try {
      const response = await api.updatePage(id, {
        title: nextTitle,
        ai_summary_brief: nextAiSummaryBrief
      });
      const applyResponseToPage = entry => ({
        ...entry,
        ...(response && typeof response === 'object' ? response : {}),
        title: nextTitle,
        ai_summary_brief: nextAiSummaryBrief
      });
      updateDrawerPageCollections(id, applyResponseToPage);
      state.editingPageId = null;
      state.savingEditPageId = null;
      await savedPagesView.persistAllPages();
      await updateCachedProjectStores(page, applyResponseToPage);
      applyDrawerFilters(state.query);
      renderDrawerResults();
    } catch (error) {
      state.savingEditPageId = null;
      renderDrawerResults();
      console.error('[newtab] Failed to update page:', error);
      windowObj.alert('Failed to update page. Please try again.');
    }
  }

  async function loadSemanticResults(query) {
    const trimmedQuery = (query || '').trim();

    // Empty query: nothing to search semantically. Clear any prior results.
    if (!trimmedQuery) {
      state.semanticResults = [];
      state.semanticQuery = '';
      state.semanticLoading = false;
      renderDrawerResults();
      return;
    }

    // Only attempt semantic search when the API supports it; otherwise no-op
    // rather than erroring, so the saved-page filter still works.
    if (typeof api?.searchContent !== 'function') {
      state.semanticResults = [];
      state.semanticQuery = trimmedQuery;
      state.semanticLoading = false;
      renderDrawerResults();
      return;
    }

    const requestId = state.semanticRequestId + 1;
    state.semanticRequestId = requestId;
    state.semanticQuery = trimmedQuery;
    // Clear prior results so the loading state is shown on every new search,
    // including follow-on tag clicks from an existing results page.
    state.semanticResults = [];
    state.semanticLoading = true;
    renderDrawerResults();

    // Run the search inside a Sentry span when available (production) so the
    // client-experienced latency is traced; fall through to a direct call when
    // Sentry/tracing is absent (dev, standalone, unit tests).
    // limit 20: the results pane shows ~15 cards above the fold. Asking for 50
    // hydrated thing-documents tripled Firestore hydration time (multiple
    // sequential batches) for content the user never sees before scrolling.
    // 20 keeps the first page fast; pagination can fetch more on scroll later.
    const runSearch = () => api.searchContent(trimmedQuery, {
      limit: 20,
      offset: 0,
      threshold: 0.58
    });
    const spanOptions = { name: 'search.semantic', op: 'search', attributes: { 'search.query': trimmedQuery } };

    try {
      const response = typeof window !== 'undefined' && window.SentryHelpers?.startSpan
        ? await window.SentryHelpers.startSpan(spanOptions, runSearch)
        : await runSearch();

      // Surface the backend's per-phase timings so they're queryable in Sentry
      // alongside the client-experienced span (older backends omit these).
      const backendTimings = response?.metadata?.timings;
      if (backendTimings) {
        window.SentryHelpers?.captureMessage?.('search.backend_timings', backendTimings, 'info');
      }

      // Drop stale responses so out-of-order completions can't clobber a
      // newer query.
      if (state.semanticRequestId !== requestId) {
        return;
      }

      const results = Array.isArray(response?.results) ? response.results : [];
      state.semanticResults = results.map(result => result?.thing_data).filter(Boolean);
    } catch (error) {
      console.error('[newtab] Semantic search failed:', error);
      if (state.semanticRequestId === requestId) {
        state.semanticResults = [];
      }
    } finally {
      if (state.semanticRequestId === requestId) {
        state.semanticLoading = false;
        renderDrawerResults();
      }
    }
  }

  async function loadDrawerResults(query = '', { syncUrl = true } = {}) {
    const trimmedQuery = query.trim();

    // A new query re-filters in memory; start the render window fresh so the
    // first matches paint immediately and scroll re-grows it.
    resetRenderLimit();

    // Any search intent (typed, submitted, cleared, topic-pill click) leaves
    // the sparse home view for the browse list.
    state.view = 'browse';

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

    // Semantic search is account-wide and independent of the saved-page
    // filter, so fire it after rendering the local matches.
    void loadSemanticResults(trimmedQuery);
  }

  // Domains: fetch the user's distinct domains for the sidebar section. Cached
  // by the API layer; re-fetched on demand.
  async function ensureDrawerDomainsLoaded() {
    if (state.domains && state.domains.length) {
      return null;
    }
    try {
      const domains = await api.getDomains();
      state.domains = Array.isArray(domains) ? domains : [];
      return state.domains;
    } catch (error) {
      console.error('Failed to load domains:', error);
      state.domains = [];
      return state.domains;
    }
  }

  // Load pages scoped to a domain (broad category), using the same per-scope
  // warm-cache approach as project pages.
  async function loadDrawerDomainPages(domain, { query = state.query, syncUrl = true } = {}) {
    if (!domain) {
      await loadDrawerBasePages({ query, syncUrl });
      return;
    }

    // Selecting a domain scope leaves the sparse home view.
    state.view = 'browse';
    resetRenderLimit();
    const requestId = ++state.requestId;
    const trimmedQuery = query.trim();

    state.isLoading = true;
    setDrawerSearchValue(trimmedQuery);

    if (syncUrl && isDrawerOpen()) {
      updateDrawerUrl(true, trimmedQuery);
    }

    if (!(await canHydrateDrawerWithWarmCache(api, getCurrentUser))) {
      state.isLoading = false;
      state.hasInitialized = true;
      savedPagesStore.reset({ emit: false });
      getDomainSavedPagesStore(domain)?.reset({ emit: false });
      state.allPages = [];
      state.loadedProjectPages = [];
      state.pages = [];
      renderDrawerSignInState();
      return;
    }

    const domainSavedPagesStore = getDomainSavedPagesStore(domain);
    const domainSnapshot = domainSavedPagesStore?.getSnapshot?.() || null;
    if (
      domainSavedPagesStore &&
      !domainSnapshot?.allPages?.length &&
      !hasRenderableWarmCache(domainSnapshot)
    ) {
      renderDrawerLoadingState(trimmedQuery ? 'Searching pages from this domain…' : 'Gathering pages from this domain…');
    }

    try {
      const snapshot = await domainSavedPagesStore.hydrate();

      if (requestId !== state.requestId) {
        return;
      }

      syncDomainDrawerStateFromStore(domain, snapshot, {
        query: trimmedQuery,
        render: false
      });
      state.hasInitialized = true;
      renderDrawerResults();
    } catch (error) {
      if (requestId !== state.requestId) {
        return;
      }

      console.error('[newtab] Domain drawer load failed:', error);
      renderDrawerErrorState(error.message || 'Could not reach pages from this domain.');
    } finally {
      if (requestId === state.requestId) {
        state.isLoading = false;
      }
    }
  }

  function resetRenderLimit() {
    state.renderLimit = INITIAL_RENDER_LIMIT;
  }

  // Track in-flight lazy loads so concurrent scroll events don't stack calls.
  let lazyLoadInFlight = false;

  // Called by the scroll handler when the user nears the bottom of the list.
  // Grows the render window, and — for the All-pages scope only — asks the
  // store for the next cursor batch once we're rendering past what's in memory.
  async function handleDrawerScrollNearEnd() {
    const hasScope = Boolean(state.selectedProjectId) || Boolean(state.selectedDomainId);

    // Project/domain views are not windowed; nothing to grow.
    if (hasScope) {
      return;
    }

    const fullCount = state.pages.length;
    if (state.renderLimit < fullCount) {
      state.renderLimit += RENDER_LIMIT_INCREMENT;
      renderDrawerResults();
    }

    // If the render window already covers everything we have in memory, but the
    // server still has more, fetch the next batch. The store's change event
    // re-renders on arrival.
    const snapshot = savedPagesStore.getSnapshot();
    if (
      !lazyLoadInFlight
      && state.renderLimit >= state.allPages.length
      && snapshot?.hasNextPage
      && !snapshot?.isLoadingMore
    ) {
      lazyLoadInFlight = true;
      try {
        await savedPagesStore.loadMore();
      } catch (error) {
        console.error('[newtab] Lazy loadMore failed:', error);
      } finally {
        lazyLoadInFlight = false;
      }
    }
  }

  return {
    ensureDrawerDomainsLoaded,
    ensureDrawerProjectsLoaded,
    handleDrawerDelete,
    handleDrawerEditCancel,
    handleDrawerEditStart,
    handleDrawerPin,
    handleDrawerScrollNearEnd,
    handleDrawerUpdate,
    loadDrawerBasePages,
    loadDrawerDomainPages,
    loadDrawerProjectPages,
    loadDrawerResults,
    loadSemanticResults,
    resetRenderLimit
  };
}
