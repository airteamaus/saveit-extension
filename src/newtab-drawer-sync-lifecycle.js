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

        if (api.isExtension && !getCurrentUser()) {
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
    state.hasInitialized = false;
    savedPagesStore.reset({ emit: false });
    await loadSummary();

    if (isDrawerOpen()) {
      await loadDrawerResults(getSearchQuery(), { syncUrl: false });
    }
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
