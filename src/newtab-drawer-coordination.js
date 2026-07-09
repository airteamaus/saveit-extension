import {
  applyDrawerFilters as applySavedPagesDrawerFilters,
  syncDrawerStateFromStore as syncSavedPagesDrawerStateFromStore,
  syncProjectsStateFromStore as syncSavedPagesDrawerProjectsStateFromStore
} from './newtab-drawer-state.js';
import { getCurrentUser as getSessionUser } from './session-store.js';

// Returns the current user from the shared session store, or null. Kept as a
// thin wrapper so call sites pass windowObj for consistency with the prior
// Firebase-based implementation.
export async function getDrawerCurrentUser(windowObj = window) {
  const runtime = windowObj.browser?.runtime || windowObj.chrome?.runtime;
  if (!runtime) {
    return null;
  }
  return await getSessionUser();
}

export async function canHydrateDrawerWithWarmCache(api, getCurrentUser) {
  if (!api?.isExtension) {
    return true;
  }

  const user = await getCurrentUser?.();
  if (user) {
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
