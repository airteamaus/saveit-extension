import { canHydrateDrawerWithWarmCache } from './newtab-drawer-coordination.js';
import { setDrawerInitialized } from './newtab-drawer-state.js';

export function createDrawerSyncLifecycle({
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
}) {
  let savedPagesSummaryPromise = null;

  async function loadSummary() {
    if (savedPagesSummaryPromise) {
      return savedPagesSummaryPromise;
    }

    savedPagesSummaryPromise = (async () => {
      try {
        if (!api?.getSavedPages) {
          savedPagesStore.reset({ emit: false });
          notifySavedPagesTotalChange();
          return;
        }

        if (!(await canHydrateDrawerWithWarmCache(api, getCurrentUser))) {
          savedPagesStore.reset({ emit: false });
          notifySavedPagesTotalChange();
          return;
        }

        await savedPagesStore.hydrate();
        notifySavedPagesTotalChange();
      } catch (error) {
        console.error('[newtab] Failed to load saved pages summary:', error);
      } finally {
        savedPagesSummaryPromise = null;
      }
    })();

    return savedPagesSummaryPromise;
  }

  async function handleSignedIn() {
    if (isDrawerOpen()) {
      // If the drawer already has renderable pages (e.g. a warm cache painted
      // during session restoration before auth resolved), keep them visible and
      // just refresh results — resetting would cause an unnecessary flash.
      // But if there's nothing renderable (the signed-out sign-in state, whose
      // render sets hasInitialized=true even though nothing was loaded), we
      // MUST reset and reload — otherwise loadDrawerBasePages never runs and
      // the user is left staring at "No pages" after a real sign-out -> sign-in.
      const snapshot = savedPagesStore.getSnapshot?.();
      const hasRenderable = snapshot?.allPages?.length > 0;
      if (state.hasInitialized && hasRenderable) {
        await loadDrawerResults(getSearchQuery(), { syncUrl: false });
        return;
      }

      setDrawerInitialized(state, false);
      savedPagesStore.reset({ emit: false });
      await loadDrawerResults(getSearchQuery(), { syncUrl: false });
      return;
    }

    setDrawerInitialized(state, false);
    savedPagesStore.reset({ emit: false });
    await loadSummary();
  }

  function handleSignedOut() {
    projectsStore.reset({ emit: false });
    savedPagesStore.reset({ emit: false });
    notifySavedPagesTotalChange();
    resetDrawerState();
    setSuppressSavedPagesStoreSync(false);

    if (isDrawerOpen()) {
      renderDrawerSignInState();
    }
  }

  return {
    handleSignedIn,
    handleSignedOut,
    loadSummary
  };
}
