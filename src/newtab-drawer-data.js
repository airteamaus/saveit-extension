import { PINNED_PAGES_SCOPE_ID } from './project-manager-state.js';
import { canHydrateDrawerWithWarmCache } from './newtab-drawer-coordination.js';
import { createProjectSavedPagesStore } from './newtab-drawer-stores.js';
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
  renderDrawerResults,
  syncDrawerStateFromStore,
  syncProjectsStateFromStore,
  applyDrawerFilters,
  windowObj = window,
  projectFetchLimit = 100,
  createProjectSavedPagesStoreFn = createProjectSavedPagesStore
}) {
  let drawerProjectsPromise = null;
  const projectSavedPagesStores = new Map();

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
      renderDrawerLoadingState(trimmedQuery ? 'Searching project pages...' : 'Loading project pages...');
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
      const applyResponseToPage = entry => ({
        ...entry,
        ...(response && typeof response === 'object' ? response : {}),
        title: nextTitle,
        description: nextDescription
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
