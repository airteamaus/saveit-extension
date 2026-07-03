import { canHydrateDrawerWithWarmCache } from './newtab-drawer-coordination.js';

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
    // A one-time full eager warm-up drives the post-login progress bar. The
    // store self-resets lazy=true when the warm-up finishes, so this only
    // affects the current sign-in moment.
    savedPagesStore.setLazy(false);

    if (isDrawerOpen()) {
      if (state.hasInitialized) {
        await loadDrawerResults(getSearchQuery(), { syncUrl: false });
        return;
      }

      state.hasInitialized = false;
      savedPagesStore.reset({ emit: false });
      await loadDrawerResults(getSearchQuery(), { syncUrl: false });
      return;
    }

    state.hasInitialized = false;
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
