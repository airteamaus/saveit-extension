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
  syncProjectsStateFromStore,
  renderWarmingState,
  // Bind timers to the page window, not the module scope. In a browser
  // extension the module-scope setTimeout (captured at definition time) does
  // not always fire its callback — the window-bound one does. The existing
  // cache-invalidation observer already relies on windowObj.setTimeout for the
  // same reason.
  windowObj = window,
  timers = { setTimeout: windowObj.setTimeout.bind(windowObj), clearTimeout: windowObj.clearTimeout.bind(windowObj) }
}) {
  // Warming-UI state. Lives here because the subscriber that drives it lives
  // here. Reset whenever a non-warming render path runs (e.g. sign-out, a
  // fresh load that hits the warm-cache fast path).
  let warming = { active: false, lastPercent: 0, determinate: false, completionTimer: null };

  function clearWarmingCompletionTimer() {
    if (warming.completionTimer) {
      timers.clearTimeout(warming.completionTimer);
      warming.completionTimer = null;
    }
  }

  function resetWarming() {
    clearWarmingCompletionTimer();
    warming = { active: false, lastPercent: 0, determinate: false, completionTimer: null };
  }

  // Computes the warming percentage for a snapshot. Returns { percent, indeterminate }.
  // Once we've shown a determinate reading we never go back below it (clamp),
  // and an unknown total caps the displayed value at 99 until completion.
  function computeWarmingProgress(snapshot) {
    // The warming UI runs only on the All-pages store (maxItems = Infinity),
    // so total need not be capped against a finite maxItems here.
    const total =
      typeof snapshot?.total === 'number' && snapshot.total > 0
        ? snapshot.total
        : null;
    const loaded = Array.isArray(snapshot?.allPages) ? snapshot.allPages.length : 0;

    if (total == null) {
      return {
        percent: warming.determinate ? Math.min(warming.lastPercent, 99) : 0,
        indeterminate: !warming.determinate
      };
    }

    const computed = total > 0 ? Math.min(100, Math.round((loaded / total) * 100)) : 0;
    // Clamp: never decrease once determinate.
    const percent = warming.determinate ? Math.max(warming.lastPercent, computed) : computed;
    warming.determinate = true;
    warming.lastPercent = percent;
    return { percent, indeterminate: false };
  }

  function isWarmUpActive(snapshot) {
    // The warm-up window is bounded by the store's lazy flag: handleSignedIn
    // sets lazy=false, and prefetchAllPages self-resets it to true on
    // completion. Inside that window, loadMore() emits change events with
    // phase 'load-more' (not 'prefetch'), so we can't gate on the phase.
    // The phase is consulted ONLY to detect the terminal completion emit,
    // which carries { phase: 'prefetch', status: 'idle', reason: 'complete' }.
    const isCompletion =
      snapshot?.refreshState?.phase === 'prefetch' &&
      snapshot?.refreshState?.status === 'idle' &&
      snapshot?.refreshState?.reason === 'complete';
    return savedPagesStore.options.lazy === false || isCompletion;
  }

  function initStoreSubscriptions() {
    savedPagesStore.subscribe(() => {
      notifySavedPagesTotalChange();

      const snapshot = savedPagesStore.getSnapshot();

      // Drive the warming UI while it's active. This takes priority over the
      // normal sync path so the progress bar updates on every batch.
      if (isWarmUpActive(snapshot) && typeof renderWarmingState === 'function' && isDrawerOpen()) {
        // Starting (or continuing) a warm-up. Tear down any pending completion
        // timer from a prior warm-up so it can't fire mid-warm and wipe this
        // one's progress state or render a stale snapshot.
        if (warming.completionTimer) {
          clearWarmingCompletionTimer();
        }
        if (!warming.active) {
          warming.active = true;
        }

        const complete =
          snapshot.refreshState.status === 'idle' && snapshot.refreshState.reason === 'complete';
        const progress = complete
          ? { percent: 100, indeterminate: false }
          : computeWarmingProgress(snapshot);

        // Always paint 100% on completion, even if we were indeterminate.
        if (complete) {
          warming.determinate = true;
          warming.lastPercent = 100;
        }

        renderWarmingState(progress);

        if (complete && !warming.completionTimer) {
          // Brief completion pause so the user sees the bar fill, then hand
          // off to the normal results-render path.
          warming.completionTimer = timers.setTimeout(() => {
            warming.completionTimer = null;
            resetWarming();
            // Read a fresh snapshot: the store may have advanced (e.g. a
            // cache-invalidation refresh) during the completion pause, and we
            // must not render the stale one captured at completion time.
            const currentSnapshot = savedPagesStore.getSnapshot();
            // The completion handoff is not an incidental mid-load store update
            // (which shouldSyncDrawerStoreUpdate exists to suppress) — it is the
            // explicit "warm-up finished, paint the cards" signal. It must not
            // be gated on state.hasInitialized: the fire-and-forget prefetch
            // can complete BEFORE the caller (loadDrawerBasePages) sets
            // hasInitialized=true, and gating on it leaves the warming pane
            // stuck at 100% forever. Only the genuinely-disqualifying
            // conditions matter here: the drawer must still be open, and (in
            // extension mode) a user must still be signed in.
            const hasUser = Boolean(getCurrentUser());
            const userOk = !api.isExtension || hasUser;
            if (userOk && !getSuppressSavedPagesStoreSync() && isDrawerOpen()) {
              syncDrawerStateFromStore(currentSnapshot, { query: state.query, render: true });
            }
          }, 300);
        }

        return;
      }

      // If we were warming and are no longer (e.g. store reset, sign-out),
      // drop warming state so a future warm-up starts fresh.
      if (warming.active && !isWarmUpActive(snapshot)) {
        resetWarming();
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
