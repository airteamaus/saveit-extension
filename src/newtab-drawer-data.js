import { PINNED_PAGES_SCOPE_ID } from './project-manager-state.js';
import { canHydrateDrawerWithWarmCache } from './newtab-drawer-coordination.js';
import { createDomainSavedPagesStore, createProjectSavedPagesStore } from './newtab-drawer-stores.js';
import {
  beginDrawerWarming,
  growDrawerRenderLimit,
  nextDrawerRequestId,
  nextDrawerSemanticRequestId,
  resetDrawerRenderLimit,
  setDrawerAllPages,
  setDrawerDomains,
  setDrawerEditingPage,
  setDrawerInitialized,
  setDrawerLoadedScopePages,
  setDrawerLoading,
  setDrawerProjects,
  setDrawerProjectsAvailability,
  setDrawerProjectsLoading,
  setDrawerRenderedPages,
  setDrawerSavingEdit,
  setDrawerSemantic,
  setDrawerView,
  updateDrawerPageCollections
} from './newtab-drawer-state.js';
import { hasRenderableWarmCache, upsertListPages } from './warm-cache-list-store.js';
import { togglePagePrivacy } from './newtab-privacy.js';

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
  renderDrawerResults,
  syncDrawerStateFromStore,
  syncProjectsStateFromStore,
  applyDrawerFilters,
  windowObj = window,
  // Optional toast callback (message, { type }) for transient failure feedback.
  // Falls back to a blocking windowObj.alert when not provided.
  notify,
  projectFetchLimit = 100,
  createProjectSavedPagesStoreFn = createProjectSavedPagesStore,
  createDomainSavedPagesStoreFn = createDomainSavedPagesStore
}) {
  let drawerProjectsPromise = null;
  const projectSavedPagesStores = new Map();
  const domainSavedPagesStores = new Map();

  // Surface a transient failure message via toast when available, else fall
  // back to a blocking alert so older callers / tests still see the message.
  const reportFailure = (message) => {
    if (typeof notify === 'function') {
      try { notify(message, { type: 'error' }); } catch { /* toast must never break the action */ }
    } else {
      windowObj.alert(message);
    }
  };

  function findDrawerPage(id) {
    return state.allPages.find(page => page.id === id) || null;
  }

  function syncProjectDrawerStateFromStore(projectId, snapshot, { query = state.query, render = state.hasInitialized } = {}) {
    if (!projectId || state.selectedProjectId !== projectId) {
      return;
    }

    const projectPages = snapshot?.allPages || [];
    setDrawerAllPages(state, upsertListPages(state.allPages, projectPages, Number.POSITIVE_INFINITY));
    setDrawerLoadedScopePages(state, projectPages);
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
    setDrawerAllPages(state, upsertListPages(state.allPages, domainPages, Number.POSITIVE_INFINITY));
    setDrawerLoadedScopePages(state, domainPages);
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
      setDrawerProjectsLoading(state, true);
      drawerProjectsPromise = projectsStore
        .hydrate()
        .then(snapshot => {
          syncProjectsStateFromStore(snapshot, {
            render: state.hasInitialized
          });
        })
        .catch(error => {
          console.error('Failed to load projects:', error);
          setDrawerProjects(state, []);
          if (error?.code === 'PROJECTS_UNSUPPORTED') {
            setDrawerProjectsAvailability(state, { available: false, message: error.message });
          } else {
            setDrawerProjectsAvailability(state, { available: true, message: '' });
          }
        })
        .finally(() => {
          setDrawerProjectsLoading(state, false);
          drawerProjectsPromise = null;
        });
    }

    return drawerProjectsPromise;
  }

  // --- Scope loading --------------------------------------------------------
  // loadDrawerBasePages / loadDrawerProjectPages / loadDrawerDomainPages were
  // three ~75-line copies of the same algorithm (requestId guard, sign-in gate,
  // pre-hydrate UI arming, hydrate, sync, side-loads). They had drifted in
  // message strings, the warming branch (all-only), and which side-loads ran.
  // loadDrawerScope below is the single implementation; the three public names
  // are thin wrappers that build a scope config and delegate.

  function allPagesScope() {
    return {
      type: 'all',
      // The all-pages store is the shared savedPagesStore; getStore returns it
      // directly (not a memoized lookup), and reset() of the same store twice
      // in the sign-in gate is harmless.
      getStore: () => savedPagesStore,
      syncFromStore: (snapshot, opts) => syncDrawerStateFromStore(snapshot, opts),
      messages: {
        searching: 'Searching your saved pages…',
        gathering: 'Gathering your saved pages…',
        failed: 'Could not reach your saved pages.',
        logTag: '[newtab] Drawer load failed:'
      },
      // Only the all-pages store has the lazy flag and the warming subscriber
      // path, so only this scope arms the warming pane.
      armWarming: true,
      loadProjectsAlongside: true,
      loadDomainsAlongside: true,
      // The all-pages caller (loadDrawerResults) owns the render window reset;
      // scoped loaders reset their own.
      resetRenderLimitFirst: false
    };
  }

  function projectScope(projectId) {
    return {
      type: 'project',
      id: projectId,
      getStore: () => getProjectSavedPagesStore(projectId),
      syncFromStore: (snapshot, opts) => syncProjectDrawerStateFromStore(projectId, snapshot, opts),
      messages: {
        searching: 'Searching project pages…',
        gathering: 'Gathering project pages…',
        failed: 'Could not reach your project pages.',
        logTag: '[newtab] Project drawer load failed:'
      },
      armWarming: false,
      loadProjectsAlongside: true,
      loadDomainsAlongside: false,
      resetRenderLimitFirst: true
    };
  }

  function domainScope(domain) {
    return {
      type: 'domain',
      id: domain,
      getStore: () => getDomainSavedPagesStore(domain),
      syncFromStore: (snapshot, opts) => syncDomainDrawerStateFromStore(domain, snapshot, opts),
      messages: {
        searching: 'Searching pages from this domain…',
        gathering: 'Gathering pages from this domain…',
        failed: 'Could not reach pages from this domain.',
        logTag: '[newtab] Domain drawer load failed:'
      },
      armWarming: false,
      // Domain view is a flat list; projects and further domain discovery are
      // not relevant while browsing one domain's pages.
      loadProjectsAlongside: false,
      loadDomainsAlongside: false,
      resetRenderLimitFirst: true
    };
  }

  async function loadDrawerScope(scope, { query = state.query, syncUrl = true } = {}) {
    if (scope.resetRenderLimitFirst) {
      resetRenderLimit();
    }
    // Selecting a domain scope leaves the sparse home view for the browse list.
    // (all-pages sets this via loadDrawerResults; project scope is entered from
    // elsewhere that has already settled the view.)
    if (scope.type === 'domain') {
      setDrawerView(state, 'browse');
    }

    const requestId = nextDrawerRequestId(state);
    const trimmedQuery = query.trim();

    setDrawerLoading(state, true);
    setDrawerSearchValue(trimmedQuery);

    if (syncUrl && isDrawerOpen()) {
      updateDrawerUrl(true, trimmedQuery);
    }

    if (!(await canHydrateDrawerWithWarmCache(api, getCurrentUser))) {
      setDrawerLoading(state, false);
      setDrawerInitialized(state, true);
      savedPagesStore.reset({ emit: false });
      // Reset the scope's own store too (project/domain). For the all-pages
      // scope this is the same store as above — a redundant reset, harmless.
      scope.getStore()?.reset?.({ emit: false });
      setDrawerAllPages(state, []);
      // all-pages uses null (no scope overlay); scoped views use [] (empty
      // scope set). Both clear to "no scope pages loaded".
      setDrawerLoadedScopePages(state, scope.type === 'all' ? null : []);
      setDrawerRenderedPages(state, []);
      renderDrawerSignInState();
      return;
    }

    const store = scope.getStore();
    const snapshot = store?.getSnapshot?.() || null;
    if (store && !snapshot?.allPages?.length && !hasRenderableWarmCache(snapshot)) {
      // Post-login the all-pages store is in non-lazy prefetch mode (set by the
      // interactive Sign-in button). Arm the warming phase on state so the
      // dispatcher renders the warming pane (not the bare dog, and not cards
      // mid-warm-up). The subscriber takes over progress updates once the first
      // batch lands. Scoped views (project/domain) don't have this path.
      if (scope.armWarming && store.options?.lazy === false) {
        beginDrawerWarming(state, { percent: 0, indeterminate: true });
        renderDrawerResults();
      } else {
        renderDrawerLoadingState(trimmedQuery ? scope.messages.searching : scope.messages.gathering);
      }
    }

    try {
      const projectsPromise = scope.loadProjectsAlongside ? ensureDrawerProjectsLoaded() : null;
      const fresh = await store.hydrate();

      if (requestId !== state.requestId) {
        return;
      }

      scope.syncFromStore(fresh, { query: trimmedQuery, render: false });
      setDrawerInitialized(state, true);
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

      // Load domains for the sidebar section alongside the all-pages view
      // (non-blocking). Scoped views don't surface the domain list.
      if (scope.loadDomainsAlongside) {
        void ensureDrawerDomainsLoaded().then(() => {
          if (requestId !== state.requestId) {
            return;
          }
          renderDrawerResults();
        });
      }
    } catch (error) {
      if (requestId !== state.requestId) {
        return;
      }

      console.error(scope.messages.logTag, error);
      renderDrawerErrorState(error.message || scope.messages.failed);
    } finally {
      if (requestId === state.requestId) {
        setDrawerLoading(state, false);
      }
    }
  }

  async function loadDrawerBasePages(options) {
    return loadDrawerScope(allPagesScope(), options);
  }

  async function loadDrawerProjectPages(projectId, options) {
    // Pinned-pages sentinel and a null/empty id both route to the all-pages
    // view — that's the "All pages" pseudo-scope.
    if (!projectId || projectId === PINNED_PAGES_SCOPE_ID) {
      return loadDrawerBasePages(options);
    }
    return loadDrawerScope(projectScope(projectId), options);
  }

  // Pick the scope that matches the currently-selected project/domain so callers
  // (forceReload) don't have to replicate the project-vs-domain-vs-all branch.
  // Returns null when no scope is selected and the drawer hasn't initialized —
  // callers should fall back to loadDrawerBasePages in that case.
  function scopeForCurrentSelection() {
    if (state.selectedProjectId && state.selectedProjectId !== PINNED_PAGES_SCOPE_ID) {
      return projectScope(state.selectedProjectId);
    }
    if (state.selectedDomainId) {
      // selectedDomainId is stored WITH the "domain:" prefix (the nav-row
      // convention), but the domain loaders receive the bare domain — strip
      // it here so the scope id matches what the sync helper guards on.
      const domain = state.selectedDomainId.startsWith('domain:')
        ? state.selectedDomainId.slice('domain:'.length)
        : state.selectedDomainId;
      return domainScope(domain);
    }
    return allPagesScope();
  }

  async function loadDrawerScopeForCurrentSelection(options) {
    return loadDrawerScope(scopeForCurrentSelection(), options);
  }

  async function handleDrawerDelete(id) {
    if (!id || !windowObj.confirm('Delete this saved page? This cannot be undone.')) {
      return;
    }

    const deletedPage = findDrawerPage(id);

    // Optimistic placeholders (pending saves not yet enriched) have synthetic
    // IDs like "optimistic:<url>". There's no backend doc to delete — just clear
    // the pending-save record and drop the tile locally. Calling the API with a
    // synthetic ID would fail silently and leave the tile behind.
    if (id.startsWith('optimistic:')) {
      const browserApi = globalThis.browser ?? globalThis.chrome;
      // Clear the pending-save record BEFORE removing the tile. removePage
      // emits a store change that can trigger syncPendingSaves via the storage
      // listener, which would re-prepend the tile if the record still exists.
      if (deletedPage?.url && browserApi?.storage?.local) {
        const { clearPendingSave } = await import('./pending-saves.js');
        await clearPendingSave(browserApi.storage.local, deletedPage.url).catch(() => {});
      }
      await savedPagesStore.removePage(id);
      renderDrawerResults();
      return;
    }

    try {
      await api.deletePage(id);
      await savedPagesStore.removePage(id);
      await removeFromCachedProjectStores(id, deletedPage?.project_ids || []);
      if (Array.isArray(state.loadedProjectPages)) {
        setDrawerLoadedScopePages(state, state.loadedProjectPages.filter(page => page.id !== id));
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
      reportFailure('Failed to delete page. Please try again.');
    }
  }

  async function handleDrawerPin(id) {
    const page = findDrawerPage(id);
    if (!page) {
      return;
    }

    const nextPinnedState = !page.pinned;
    updateDrawerPageCollections(state, id, entry => ({ ...entry, pinned: nextPinnedState }));
    void savedPagesView.persistAllPages();
    void updateCachedProjectStores(page, entry => ({ ...entry, pinned: nextPinnedState }));
    renderDrawerResults();

    try {
      await api.pinPage(id, nextPinnedState);
    } catch (error) {
      updateDrawerPageCollections(state, id, entry => ({ ...entry, pinned: !nextPinnedState }));
      void savedPagesView.persistAllPages();
      renderDrawerResults();
      console.error('[newtab] Failed to update pin:', error);
      reportFailure('Failed to update pin status. Please try again.');
    }
  }

  // Toggle org-search visibility (the "Hide from organisation" card button).
  // `private` only affects Slack /links bucket 2 (org-mates' results); the
  // owner always sees their own pages. Mirrors handleDrawerPin: optimistic
  // state update + cached-store sync + re-render, then the API call via the
  // extracted togglePagePrivacy handler, rolling back on failure.
  async function handleDrawerTogglePrivacy(id) {
    const page = findDrawerPage(id);
    if (!page) {
      return;
    }

    const nextPrivateState = !page.private;
    updateDrawerPageCollections(state, id, entry => ({ ...entry, private: nextPrivateState }));
    void savedPagesView.persistAllPages();
    void updateCachedProjectStores(page, entry => ({ ...entry, private: nextPrivateState }));
    renderDrawerResults();

    try {
      await togglePagePrivacy(api, page);
    } catch (error) {
      updateDrawerPageCollections(state, id, entry => ({ ...entry, private: !nextPrivateState }));
      void savedPagesView.persistAllPages();
      void updateCachedProjectStores(page, entry => ({ ...entry, private: page.private }));
      renderDrawerResults();
      console.error('[newtab] Failed to update page visibility:', error);
      reportFailure('Failed to update visibility. Please try again.');
    }
  }

  function handleDrawerEditStart(id) {
    if (!findDrawerPage(id)) {
      return;
    }

    setDrawerEditingPage(state, id);
    setDrawerSavingEdit(state, null);
    renderDrawerResults();
  }

  function handleDrawerEditCancel() {
    if (state.savingEditPageId) {
      return;
    }

    setDrawerEditingPage(state, null);
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
      reportFailure('Title is required.');
      return;
    }

    setDrawerSavingEdit(state, id);
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
      updateDrawerPageCollections(state, id, applyResponseToPage);
      setDrawerEditingPage(state, null);
      setDrawerSavingEdit(state, null);
      await savedPagesView.persistAllPages();
      await updateCachedProjectStores(page, applyResponseToPage);
      applyDrawerFilters(state.query);
      renderDrawerResults();
    } catch (error) {
      setDrawerSavingEdit(state, null);
      renderDrawerResults();
      console.error('[newtab] Failed to update page:', error);
      reportFailure('Failed to update page. Please try again.');
    }
  }

  async function loadSemanticResults(query) {
    const trimmedQuery = (query || '').trim();

    // Empty query: nothing to search semantically. Clear any prior results.
    if (!trimmedQuery) {
      setDrawerSemantic(state, { results: [], query: '', loading: false });
      renderDrawerResults();
      return;
    }

    // Only attempt semantic search when the API supports it; otherwise no-op
    // rather than erroring, so the saved-page filter still works.
    if (typeof api?.searchContent !== 'function') {
      setDrawerSemantic(state, { results: [], query: trimmedQuery, loading: false });
      renderDrawerResults();
      return;
    }

    const requestId = nextDrawerSemanticRequestId(state);
    setDrawerSemantic(state, { query: trimmedQuery, results: [], loading: true });
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
      setDrawerSemantic(state, { results: results.map(result => result?.thing_data).filter(Boolean) });
    } catch (error) {
      console.error('[newtab] Semantic search failed:', error);
      if (state.semanticRequestId === requestId) {
        setDrawerSemantic(state, { results: [] });
      }
    } finally {
      if (state.semanticRequestId === requestId) {
        setDrawerSemantic(state, { loading: false });
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
    setDrawerView(state, 'browse');

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
      setDrawerDomains(state, Array.isArray(domains) ? domains : []);
      return state.domains;
    } catch (error) {
      console.error('Failed to load domains:', error);
      setDrawerDomains(state, []);
      return state.domains;
    }
  }

  // Load pages scoped to a domain (broad category), using the same per-scope
  // warm-cache approach as project pages. Thin wrapper over loadDrawerScope —
  // see the scope-loading section above for the shared algorithm.
  async function loadDrawerDomainPages(domain, options) {
    if (!domain) {
      return loadDrawerBasePages(options);
    }
    return loadDrawerScope(domainScope(domain), options);
  }

  function resetRenderLimit() {
    resetDrawerRenderLimit(state);
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
      growDrawerRenderLimit(state);
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
    getProjectSavedPagesStore,
    handleDrawerDelete,
    handleDrawerEditCancel,
    handleDrawerEditStart,
    handleDrawerPin,
    handleDrawerScrollNearEnd,
    handleDrawerTogglePrivacy,
    handleDrawerUpdate,
    loadDrawerBasePages,
    loadDrawerDomainPages,
    loadDrawerProjectPages,
    loadDrawerResults,
    loadDrawerScopeForCurrentSelection,
    loadSemanticResults,
    resetRenderLimit
  };
}
