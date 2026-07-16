import { isSavedPagesCacheInvalidation } from './saved-pages-cache.js';
import { PINNED_PAGES_SCOPE_ID } from './project-manager-state.js';
import {
  clearDrawerWarming,
  computeWarmingProgress,
  isWarmUpComplete,
  setDrawerInitialized,
  updateDrawerWarming
} from './newtab-drawer-state.js';
import {
  PENDING_SAVES_KEY,
  getPendingSaves,
  clearPendingSave,
  buildOptimisticPage
} from './pending-saves.js';

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
      setDrawerInitialized(state, false);

      if (!getCurrentUser()) {
        return;
      }

      // After the reload settles, re-sync pending saves once so optimistic tiles
      // survive the reset() inside hydrate/forceReload. This is a one-shot
      // callback on the reload promise — NOT a store subscription — because
      // subscribing syncPendingSaves to every store emit creates an infinite
      // loop (prependOptimisticPage → emitChange → syncPendingSaves → …).
      const reSyncPendingSaves = () => { void syncPendingSaves(); };
      const afterReload = (result) => {
        if (result && typeof result.then === 'function') {
          result.then(reSyncPendingSaves, reSyncPendingSaves);
        } else {
          reSyncPendingSaves();
        }
      };

      refreshFavorites?.();
      void projectsStore.hydrate();
      if (isDrawerOpen()) {
        if (state.selectedProjectId && state.selectedProjectId !== PINNED_PAGES_SCOPE_ID) {
          afterReload(loadDrawerProjectPages(state.selectedProjectId, {
            query: getSearchQuery(),
            syncUrl: false
          }));
          return;
        }

        afterReload(loadDrawerBasePages({
          query: getSearchQuery(),
          syncUrl: false
        }));
        return;
      }

      if (state.selectedProjectId && state.selectedProjectId !== PINNED_PAGES_SCOPE_ID) {
        afterReload(loadDrawerProjectPages(state.selectedProjectId, {
          query: getSearchQuery(),
          syncUrl: false
        }));
        return;
      }

      afterReload(savedPagesStore.hydrate());
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

  // Read pending-save records and render each as an optimistic tile. Called on
  // newtab load (so tiles appear even when newtab wasn't open at save time) and
  // whenever the pending-saves key changes.
  //
  // Primary cleanup: when the real doc arrives, the store's reconcilePages
  // reports the resolved URL via onOptimisticReconciled, which clears the
  // pending record from storage. This backstop handles records that survive
  // across newtab loads (e.g. the poll gave up, the doc arrived via a
  // different path) — if the real doc is already in the store, clear the
  // stale record instead of re-adding a ghost tile.
  async function syncPendingSaves() {
    if (!getCurrentUser()) {
      return;
    }
    const browserApi = globalThis.browser ?? globalThis.chrome;
    if (!browserApi?.storage?.local) {
      return;
    }
    const records = await getPendingSaves(browserApi.storage.local);
    const snapshot = savedPagesStore.getSnapshot();
    const existingUrls = new Set(
      (snapshot?.allPages || [])
        .filter(p => p.optimistic !== true)
        .map(p => p.url)
        .filter(Boolean)
    );
    for (const record of Object.values(records)) {
      if (existingUrls.has(record.url)) {
        await clearPendingSave(browserApi.storage.local, record.url);
      } else {
        await savedPagesStore.prependOptimisticPage(buildOptimisticPage(record));
      }
    }
  }

  function initPendingSavesSync() {
    const browserApi = globalThis.browser ?? globalThis.chrome;

    // Seed any records that already exist (e.g. newtab opened after a save).
    void syncPendingSaves();

    if (!browserApi?.storage?.onChanged?.addListener) {
      return;
    }

    browserApi.storage.onChanged.addListener((changes, areaName) => {
      if (areaName !== 'local' || !changes || !(PENDING_SAVES_KEY in changes)) {
        return;
      }
      void syncPendingSaves();
    });
  }

  return {
    initSavedPagesCacheSync,
    syncSavedPagesAfterCacheInvalidation,
    initPendingSavesSync,
    syncPendingSaves
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

  // The warming window is opened by loadDrawerBasePages when the store is in
  // non-lazy prefetch mode (set by the interactive Sign-in button via
  // onInteractiveSignIn -> setLazy(false)). It arms state.warmUpInProgress.
  // The subscriber then drives the progress bar on each store emit, and arms
  // the completion timer once the store reaches an idle refreshState.
  //
  // The window is bounded by state.warmUpInProgress (the armed flag), NOT by
  // the store's idle status. Gating on idle alone would show the warming bar
  // on every routine new-tab open, since a warm-cache hydrate also ends in
  // idle — that's the normal session-restore path and must stay invisible.

  function initStoreSubscriptions() {
    savedPagesStore.subscribe(() => {
      notifySavedPagesTotalChange();

      const snapshot = savedPagesStore.getSnapshot();

      // Drive the warming UI while it's active. This takes priority over the
      // normal sync path so the progress bar updates on every batch.
      if (state.warmUpInProgress && typeof renderDrawerResults === 'function' && isDrawerOpen()) {
        // Any idle refreshState is completion, regardless of which hydrate
        // path produced it (prefetch, warm-cache hit, or fromCache ->
        // refreshInitial). Loading/checking keep the bar in progress.
        const complete = isWarmUpComplete(snapshot);

        // Tear down any pending completion timer from a prior emit so it can't
        // fire mid-warm and clear the flag prematurely.
        clearCompletionTimer();

        const progress = computeWarmingProgress(snapshot, state, { complete });
        updateDrawerWarming(state, progress);

        // Route through the dispatcher — the single render authority. It sees
        // warmUpInProgress and renders the warming pane, never cards.
        renderDrawerResults();

        if (complete && !completionTimer) {
          // Brief completion pause so the user sees the bar fill to 100%,
          // then clear the flag so the next dispatcher call renders cards.
          completionTimer = timers.setTimeout(() => {
            completionTimer = null;
            clearDrawerWarming(state);
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

      // If we were warming and the drawer closed or store reset, drop warming
      // state so a future warm-up starts fresh.
      if (state.warmUpInProgress && !isDrawerOpen()) {
        clearCompletionTimer();
        clearDrawerWarming(state);
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
