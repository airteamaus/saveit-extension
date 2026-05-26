import { isSavedPagesCacheInvalidation } from './saved-pages-cache.js';
import { PINNED_PAGES_SCOPE_ID } from './project-manager-state.js';

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

export function createDrawerCacheInvalidationObserver({
  state,
  savedPagesStore,
  projectsStore,
  getCurrentUser,
  getSearchQuery,
  isDrawerOpen,
  refreshFavorites,
  loadDrawerBasePages,
  loadDrawerProjectPages,
  windowObj = window
}) {
  let savedPagesCacheRefreshTimer = null;

  function syncSavedPagesAfterCacheInvalidation() {
    windowObj.clearTimeout(savedPagesCacheRefreshTimer);
    savedPagesCacheRefreshTimer = windowObj.setTimeout(() => {
      state.hasInitialized = false;

      if (!getCurrentUser()) {
        return;
      }

      refreshFavorites?.();
      void projectsStore.hydrate();
      if (isDrawerOpen()) {
        if (state.selectedProjectId && state.selectedProjectId !== PINNED_PAGES_SCOPE_ID) {
          void loadDrawerProjectPages(state.selectedProjectId, {
            query: getSearchQuery(),
            syncUrl: false
          });
          return;
        }

        void loadDrawerBasePages({
          query: getSearchQuery(),
          syncUrl: false
        });
        return;
      }

      if (state.selectedProjectId && state.selectedProjectId !== PINNED_PAGES_SCOPE_ID) {
        void loadDrawerProjectPages(state.selectedProjectId, {
          query: getSearchQuery(),
          syncUrl: false
        });
        return;
      }

      void savedPagesStore.hydrate();
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

  return {
    initSavedPagesCacheSync,
    syncSavedPagesAfterCacheInvalidation
  };
}

export function createDrawerStoreSubscriptions({
  api,
  state,
  savedPagesStore,
  projectsStore,
  getCurrentUser,
  isDrawerOpen,
  getSuppressSavedPagesStoreSync,
  notifySavedPagesTotalChange,
  syncDrawerStateFromStore,
  syncProjectsStateFromStore
}) {
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

  return {
    initStoreSubscriptions
  };
}
