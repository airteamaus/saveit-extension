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
    loadSummary: lifecycle.loadSummary
  };
}
