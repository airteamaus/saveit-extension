import { isSavedPagesCacheInvalidation } from './saved-pages-cache.js';
import { PINNED_PAGES_SCOPE_ID } from './project-manager-state.js';
import { computeWarmingProgress, isWarmUpComplete } from './newtab-drawer-state.js';

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
  syncProjectsStateFromStore,
  // Renders the drawer via the central dispatcher. The warming UI is now a
  // branch of the dispatcher (gated on state.warmUpInProgress), not a direct
  // paint — so the subscriber drives the warming bar by setting the flag +
  // progress on state, then calling renderDrawerResults(). This makes the
  // dispatcher the single render authority and eliminates the race where the
  // warming pane and cards fought over the drawer.
  renderDrawerResults,
  // Bind timers to the page window, not the module scope. In a browser
  // extension the module-scope setTimeout (captured at definition time) does
  // not always fire its callback — the window-bound one does. The existing
  // cache-invalidation observer already relies on windowObj.setTimeout for the
  // same reason.
  windowObj = window,
  timers = { setTimeout: windowObj.setTimeout.bind(windowObj), clearTimeout: windowObj.clearTimeout.bind(windowObj) }
}) {
  // The only warming-specific state that doesn't live on `state` is the
  // completion timer handle (it's an implementation detail of the 300ms hold).
  let completionTimer = null;

  function clearCompletionTimer() {
    if (completionTimer) {
      timers.clearTimeout(completionTimer);
      completionTimer = null;
    }
  }

  // The warm-up window is bounded by the store's lazy flag: onInteractiveSignIn
  // sets lazy=false, and prefetchAllPages self-resets it to true on completion.
  // While that window is open (lazy===false), loadMore() emits change events
  // that should drive the warming bar.
  function isWarmUpActive(snapshot) {
    return savedPagesStore.options.lazy === false || isWarmUpComplete(snapshot);
  }

  function initStoreSubscriptions() {
    savedPagesStore.subscribe(() => {
      notifySavedPagesTotalChange();

      const snapshot = savedPagesStore.getSnapshot();

      // Drive the warming UI while it's active. This takes priority over the
      // normal sync path so the progress bar updates on every batch.
      if (isWarmUpActive(snapshot) && typeof renderDrawerResults === 'function' && isDrawerOpen()) {
        // Tear down any pending completion timer from a prior warm-up so it
        // can't fire mid-warm and clear the flag prematurely.
        clearCompletionTimer();

        const complete = isWarmUpComplete(snapshot);
        const progress = computeWarmingProgress(snapshot, state, { complete });
        state.warmUpInProgress = true;
        state.warmUpProgress = progress;

        // Route through the dispatcher — the single render authority. It sees
        // warmUpInProgress and renders the warming pane, never cards.
        renderDrawerResults();

        if (complete && !completionTimer) {
          // Brief completion pause so the user sees the bar fill to 100%,
          // then clear the flag so the next dispatcher call renders cards.
          completionTimer = timers.setTimeout(() => {
            completionTimer = null;
            state.warmUpInProgress = false;
            state.warmUpLastPercent = 0;
            state.warmUpDeterminate = false;
            // The store snapshot already populated state.allPages via the
            // loadDrawerBasePages -> syncDrawerStateFromStore path; the
            // dispatcher reads it now that the warming flag is clear.
            // Guard: only paint cards if the drawer is still open and (in
            // extension mode) a user is still signed in.
            const userOk = !api.isExtension || Boolean(getCurrentUser());
            if (userOk && isDrawerOpen()) {
              const currentSnapshot = savedPagesStore.getSnapshot();
              if (!getSuppressSavedPagesStoreSync()) {
                syncDrawerStateFromStore(currentSnapshot, { query: state.query, render: true });
              } else {
                renderDrawerResults();
              }
            }
          }, 300);
        }

        return;
      }

      // If we were warming and are no longer (e.g. store reset, sign-out),
      // drop warming state so a future warm-up starts fresh.
      if (state.warmUpInProgress && !isWarmUpActive(snapshot)) {
        clearCompletionTimer();
        state.warmUpInProgress = false;
        state.warmUpLastPercent = 0;
        state.warmUpDeterminate = false;
      }

      if (
        !shouldSyncDrawerStoreUpdate({
          suppressSavedPagesStoreSync: getSuppressSavedPagesStoreSync(),
          hasInitialized: state.hasInitialized,
          isExtension: api.isExtension,
          hasCurrentUser: Boolean(getCurrentUser())
        })
      ) {
        return;
      }

      syncDrawerStateFromStore(snapshot, {
        query: state.query,
        render: isDrawerOpen()
      });
    });

    projectsStore.subscribe(() => {
      if (
        !shouldSyncDrawerStoreUpdate({
          hasInitialized: state.hasInitialized,
          isExtension: api.isExtension,
          hasCurrentUser: Boolean(getCurrentUser())
        })
      ) {
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
