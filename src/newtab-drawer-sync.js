import { isSavedPagesCacheInvalidation } from './saved-pages-cache.js';
import { createDrawerSyncLifecycle } from './newtab-drawer-sync-lifecycle.js';

export function shouldSyncDrawerStoreUpdate({
  suppressSavedPagesStoreSync = false,
  hasInitialized = false,
  isExtension = false,
  hasCurrentUser = false
} = {}) {
  if (suppressSavedPagesStoreSync) {
    return false;
  }

  if (!hasInitialized) {
    return false;
  }

  if (isExtension && !hasCurrentUser) {
    return false;
  }

  return true;
}

export function createDrawerSyncCoordinator({
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
  loadDrawerBasePages,
  loadDrawerProjectPages,
  loadDrawerResults,
  renderDrawerSignInState,
  resetDrawerState,
  setSuppressSavedPagesStoreSync,
  getSuppressSavedPagesStoreSync,
  windowObj = window
}) {
  let savedPagesCacheRefreshTimer = null;
  const lifecycle = createDrawerSyncLifecycle({
    api,
    state,
    savedPagesStore,
    projectsStore,
    getCurrentUser,
    isDrawerOpen,
    getSearchQuery,
    notifySavedPagesTotalChange,
    loadDrawerResults,
    renderDrawerSignInState,
    resetDrawerState,
    setSuppressSavedPagesStoreSync
  });

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
          query: getSearchQuery(),
          syncUrl: false
        });
        return;
      }

      void savedPagesStore.hydrate();

      if (isDrawerOpen()) {
        void loadDrawerBasePages({
          query: getSearchQuery(),
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

  function initStoreSubscriptions() {
    savedPagesStore.subscribe(() => {
      notifySavedPagesTotalChange();

      if (!shouldSyncDrawerStoreUpdate({
        suppressSavedPagesStoreSync: getSuppressSavedPagesStoreSync(),
        hasInitialized: state.hasInitialized,
        isExtension: api.isExtension,
        hasCurrentUser: Boolean(getCurrentUser())
      })) {
        return;
      }

      syncDrawerStateFromStore(savedPagesStore.getSnapshot(), {
        query: state.query,
        render: isDrawerOpen()
      });
    });

    projectsStore.subscribe(() => {
      if (!shouldSyncDrawerStoreUpdate({
        hasInitialized: state.hasInitialized,
        isExtension: api.isExtension,
        hasCurrentUser: Boolean(getCurrentUser())
      })) {
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
  }

  return {
    handleSignedIn: lifecycle.handleSignedIn,
    handleSignedOut: lifecycle.handleSignedOut,
    init,
    loadSummary: lifecycle.loadSummary
  };
}
