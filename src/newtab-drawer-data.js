import { PINNED_PAGES_SCOPE_ID } from './project-manager-state.js';
import { canHydrateDrawerWithWarmCache } from './newtab-drawer-coordination.js';
import { upsertListPages } from './warm-cache-list-store.js';

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
  projectFetchLimit = 100
}) {
  let drawerProjectsPromise = null;

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
    if (!projectId || projectId === PINNED_PAGES_SCOPE_ID) {
      await loadDrawerBasePages({ query, syncUrl });
      return;
    }

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

      do {
        const response = await api.getSavedPages({
          limit: projectFetchLimit,
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
        pages.push(...(response?.pages || []));
        cursor = response?.pagination?.hasNextPage ? response?.pagination?.nextCursor || null : null;
      } while (cursor);

      if (requestId !== state.requestId) {
        return;
      }

      const normalizedProjectPages = upsertListPages([], pages, Number.POSITIVE_INFINITY);
      state.allPages = upsertListPages(state.allPages, normalizedProjectPages, Number.POSITIVE_INFINITY);
      state.loadedProjectPages = normalizedProjectPages;
      applyDrawerFilters(trimmedQuery);
      projectManager.refreshProjectCounts(savedPagesView);
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
    const nextDescription = (updates.description || '').trim();
    if (!nextTitle) {
      windowObj.alert('Title is required.');
      return;
    }

    state.savingEditPageId = id;
    renderDrawerResults();

    try {
      const response = await api.updatePage(id, {
        title: nextTitle,
        description: nextDescription
      });
      updateDrawerPageCollections(id, entry => ({
        ...entry,
        ...(response && typeof response === 'object' ? response : {}),
        title: nextTitle,
        description: nextDescription
      }));
      state.editingPageId = null;
      state.savingEditPageId = null;
      await savedPagesView.persistAllPages();
      applyDrawerFilters(state.query);
      renderDrawerResults();
    } catch (error) {
      state.savingEditPageId = null;
      renderDrawerResults();
      console.error('[newtab] Failed to update page:', error);
      windowObj.alert('Failed to update page. Please try again.');
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

  return {
    ensureDrawerProjectsLoaded,
    handleDrawerDelete,
    handleDrawerEditCancel,
    handleDrawerEditStart,
    handleDrawerPin,
    handleDrawerUpdate,
    loadDrawerBasePages,
    loadDrawerProjectPages,
    loadDrawerResults
  };
}
