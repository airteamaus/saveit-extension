import {
  applyDrawerFilters as applySavedPagesDrawerFilters,
  syncDrawerStateFromStore as syncSavedPagesDrawerStateFromStore,
  syncProjectsStateFromStore as syncSavedPagesDrawerProjectsStateFromStore
} from './newtab-drawer-state.js';

export function getDrawerCurrentUser(windowObj = window) {
  return windowObj.firebaseAuth?.currentUser || null;
}

export async function canHydrateDrawerWithWarmCache(api, getCurrentUser) {
  if (!api?.isExtension) {
    return true;
  }

  if (getCurrentUser?.()) {
    return true;
  }

  try {
    return Boolean(await api.getLastKnownUserId?.());
  } catch (error) {
    console.debug('[newtab] Failed to read warm-cache bootstrap user:', error);
    return false;
  }
}

export function createSavedPagesTotalNotifier({
  savedPagesStore,
  onSavedPagesTotalChange
}) {
  return function notifySavedPagesTotalChange() {
    const snapshot = savedPagesStore.getSnapshot();
    onSavedPagesTotalChange?.(typeof snapshot.total === 'number' ? snapshot.total : null);
  };
}

export function createDrawerFiltersApplier({
  state,
  projectManager,
  getSavedPagesView
}) {
  return function applyDrawerFilters(query = state.query) {
    applySavedPagesDrawerFilters({
      state,
      projectManager,
      savedPagesView: getSavedPagesView(),
      query
    });
  };
}

export function createDrawerStateSyncHelpers({
  state,
  projectManager,
  getSavedPagesView,
  applyDrawerFilters,
  renderDrawerResults,
  renderDrawerChrome
}) {
  return {
    syncDrawerStateFromStore(snapshot, { query = state.query, render = state.hasInitialized } = {}) {
      syncSavedPagesDrawerStateFromStore({
        snapshot,
        state,
        savedPagesView: getSavedPagesView(),
        projectManager,
        applyDrawerFilters,
        renderDrawerResults,
        query,
        render
      });
    },
    syncProjectsStateFromStore(snapshot, { render = state.hasInitialized } = {}) {
      syncSavedPagesDrawerProjectsStateFromStore({
        snapshot,
        state,
        savedPagesView: getSavedPagesView(),
        projectManager,
        renderDrawerChrome,
        render
      });
    }
  };
}
