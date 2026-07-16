import { createDrawerSyncLifecycle } from './newtab-drawer-sync-lifecycle.js';
import {
  createDrawerCacheInvalidationObserver,
  createDrawerStoreSubscriptions
} from './newtab-drawer-sync-observers.js';

export { shouldSyncDrawerStoreUpdate } from './newtab-drawer-sync-observers.js';

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
  renderDrawerResults,
  resetDrawerState,
  setSuppressSavedPagesStoreSync,
  getSuppressSavedPagesStoreSync,
  windowObj = window
}) {
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
  // One-shot token: set by forceReload before it invalidates, consumed by the
  // cache observer so this window doesn't double-load its own invalidation.
  // Other windows never set it, so they reload as intended.
  let suppressNextSelfInvalidation = false;

  const cacheObserver = createDrawerCacheInvalidationObserver({
    state,
    savedPagesStore,
    projectsStore,
    getCurrentUser,
    getSearchQuery,
    isDrawerOpen,
    refreshFavorites,
    loadDrawerBasePages,
    loadDrawerProjectPages,
    consumeSelfInvalidation: () => {
      if (suppressNextSelfInvalidation) {
        suppressNextSelfInvalidation = false;
        return true;
      }
      return false;
    },
    windowObj
  });
  const storeSubscriptions = createDrawerStoreSubscriptions({
    api,
    state,
    savedPagesStore,
    projectsStore,
    getCurrentUser,
    isDrawerOpen,
    getSuppressSavedPagesStoreSync,
    notifySavedPagesTotalChange,
    syncDrawerStateFromStore,
    syncProjectsStateFromStore,
    renderDrawerResults,
    windowObj
  });

  function init() {
    storeSubscriptions.initStoreSubscriptions();
    cacheObserver.initSavedPagesCacheSync();
    cacheObserver.initPendingSavesSync();
  }

  return {
    handleSignedIn: lifecycle.handleSignedIn,
    handleSignedOut: lifecycle.handleSignedOut,
    init,
    loadSummary: lifecycle.loadSummary,
    // Arm the one-shot self-invalidation token. Called by forceReload before it
    // invalidates, so this window's cache observer skips its own reload.
    markForceReloadInitiated: () => {
      suppressNextSelfInvalidation = true;
    }
  };
}
