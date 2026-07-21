import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  createDrawerCacheInvalidationObserver,
  createDrawerStoreSubscriptions,
  shouldSyncDrawerStoreUpdate
} from '../../src/newtab-drawer-sync-observers.js';
import { PENDING_SAVES_KEY } from '../../src/pending-saves.js';
import { createDrawerSyncCoordinator } from '../../src/newtab-drawer-sync.js';
import { WarmCacheListStore } from '../../src/warm-cache-list-store.js';

describe('drawer sync observers', () => {
  describe('shouldSyncDrawerStoreUpdate', () => {
    it('blocks store sync while suppressed', () => {
      expect(
        shouldSyncDrawerStoreUpdate({
          suppressSavedPagesStoreSync: true,
          hasInitialized: true,
          isExtension: false
        })
      ).toBe(false);
    });

    it('blocks store sync before the drawer is initialized', () => {
      expect(
        shouldSyncDrawerStoreUpdate({
          suppressSavedPagesStoreSync: false,
          hasInitialized: false,
          isExtension: false
        })
      ).toBe(false);
    });

    it('allows sync when the drawer is initialized and auth preconditions are met', () => {
      expect(
        shouldSyncDrawerStoreUpdate({
          suppressSavedPagesStoreSync: false,
          hasInitialized: true,
          isExtension: true,
          hasCurrentUser: true
        })
      ).toBe(true);
    });
  });

  it('subscribes saved-pages and projects stores with the expected sync gating', () => {
    const savedPagesSubscribers = [];
    const projectsSubscribers = [];
    const syncDrawerStateFromStore = vi.fn();
    const syncProjectsStateFromStore = vi.fn();
    const notifySavedPagesTotalChange = vi.fn();
    const subscriptions = createDrawerStoreSubscriptions({
      api: { isExtension: true },
      state: {
        hasInitialized: true,
        query: 'alpha'
      },
      savedPagesStore: {
        subscribe: vi.fn((callback) => {
          savedPagesSubscribers.push(callback);
        }),
        options: { lazy: true },
        getSnapshot: vi.fn(() => ({ allPages: [{ id: 'page-1' }], total: 3 }))
      },
      projectsStore: {
        subscribe: vi.fn((callback) => {
          projectsSubscribers.push(callback);
        }),
        getSnapshot: vi.fn(() => ({ allPages: [{ id: 'project-1' }] }))
      },
      getCurrentUser: vi.fn(() => ({ uid: 'user-1' })),
      isDrawerOpen: vi.fn(() => true),
      getSuppressSavedPagesStoreSync: vi.fn(() => false),
      notifySavedPagesTotalChange,
      syncDrawerStateFromStore,
      syncProjectsStateFromStore
    });

    subscriptions.initStoreSubscriptions();
    savedPagesSubscribers[0]();
    projectsSubscribers[0]();

    expect(notifySavedPagesTotalChange).toHaveBeenCalled();
    expect(syncDrawerStateFromStore).toHaveBeenCalledWith(
      { allPages: [{ id: 'page-1' }], total: 3 },
      {
        query: 'alpha',
        render: true
      }
    );
    expect(syncProjectsStateFromStore).toHaveBeenCalledWith(
      { allPages: [{ id: 'project-1' }] },
      {
        render: true
      }
    );
  });

  beforeEach(() => {
    delete globalThis.browser;
    delete globalThis.chrome;
  });

  it('refreshes local stores and drawer data after cache invalidation', () => {
    let listener;
    globalThis.browser = {
      storage: {
        onChanged: {
          addListener: vi.fn((callback) => {
            listener = callback;
          })
        }
      }
    };
    const windowObj = {
      clearTimeout: vi.fn(),
      setTimeout: vi.fn((callback) => {
        callback();
        return 1;
      })
    };
    const refreshFavorites = vi.fn();
    const projectsStore = {
      hydrate: vi.fn()
    };
    const savedPagesStore = {
      hydrate: vi.fn()
    };
    const loadDrawerBasePages = vi.fn();
    const loadDrawerProjectPages = vi.fn();
    const observer = createDrawerCacheInvalidationObserver({
      state: {
        hasInitialized: true,
        selectedProjectId: null
      },
      savedPagesStore,
      projectsStore,
      getCurrentUser: vi.fn(() => ({ uid: 'user-1' })),
      getSearchQuery: vi.fn(() => 'alpha'),
      isDrawerOpen: vi.fn(() => true),
      refreshFavorites,
      loadDrawerBasePages,
      loadDrawerProjectPages,
      windowObj
    });

    observer.initSavedPagesCacheSync();
    listener(
      {
        savedPages_cache_all: {
          oldValue: { pages: [] },
          newValue: undefined
        }
      },
      'local'
    );

    expect(refreshFavorites).toHaveBeenCalled();
    expect(projectsStore.hydrate).toHaveBeenCalled();
    expect(savedPagesStore.hydrate).not.toHaveBeenCalled();
    expect(loadDrawerBasePages).toHaveBeenCalledWith({
      query: 'alpha',
      syncUrl: false
    });
    expect(loadDrawerProjectPages).not.toHaveBeenCalled();
  });

  // Regression for "toolbar save doesn't update an open newtab's list until
  // manual refresh." The toolbar-save path (background.js) marks the cache
  // stale via markToolbarSaveCachesStale, which writes timestamp: 0 without
  // removing the cached pages. The observer's storage.onChanged filter must
  // recognize that stale-mark as an invalidation and reconcile — previously
  // the filter only matched removals (newValue === undefined), so the save
  // never reached the open newtab.
  it('reconciles when the toolbar-save path marks the cache stale (not just on removal)', () => {
    let listener;
    globalThis.browser = {
      storage: {
        onChanged: {
          addListener: vi.fn((callback) => { listener = callback; })
        }
      }
    };
    const windowObj = {
      clearTimeout: vi.fn(),
      setTimeout: vi.fn((callback) => { callback(); return 1; })
    };
    const refreshFavorites = vi.fn();
    const projectsStore = { hydrate: vi.fn() };
    const savedPagesStore = { hydrate: vi.fn() };
    const loadDrawerBasePages = vi.fn();
    const loadDrawerProjectPages = vi.fn();
    const observer = createDrawerCacheInvalidationObserver({
      state: { hasInitialized: true, selectedProjectId: null },
      savedPagesStore,
      projectsStore,
      getCurrentUser: () => ({ uid: 'user-1' }),
      getSearchQuery: vi.fn(() => 'alpha'),
      isDrawerOpen: vi.fn(() => true),
      refreshFavorites,
      loadDrawerBasePages,
      loadDrawerProjectPages,
      windowObj
    });

    observer.initSavedPagesCacheSync();
    // Simulate the storage.onChanged event that markToolbarSaveCachesStale
    // produces: the cache key is updated (not removed) with timestamp: 0.
    listener(
      {
        'savedPages_cache_user-1_surface%3Ddashboard': {
          oldValue: { response: { pages: [] }, timestamp: 1700000000000 },
          newValue: { response: { pages: [] }, timestamp: 0 }
        }
      },
      'local'
    );

    expect(loadDrawerBasePages).toHaveBeenCalledWith({ query: 'alpha', syncUrl: false });
  });

  it('skips its own reload when forceReload armed the self-invalidation token', () => {
    let listener;
    globalThis.browser = {
      storage: {
        onChanged: {
          addListener: vi.fn((callback) => {
            listener = callback;
          })
        }
      }
    };
    const windowObj = {
      clearTimeout: vi.fn(),
      setTimeout: vi.fn((callback) => {
        callback();
        return 1;
      })
    };
    const loadDrawerBasePages = vi.fn();
    const savedPagesStore = { hydrate: vi.fn() };
    const projectsStore = { hydrate: vi.fn() };
    // forceReload arms the token before invalidating; the observer consumes it.
    let armed = false;
    const consumeSelfInvalidation = () => {
      if (armed) {
        armed = false;
        return true;
      }
      return false;
    };

    const observer = createDrawerCacheInvalidationObserver({
      state: { hasInitialized: true, selectedProjectId: null },
      savedPagesStore,
      projectsStore,
      getCurrentUser: vi.fn(() => ({ uid: 'user-1' })),
      getSearchQuery: vi.fn(() => ''),
      isDrawerOpen: vi.fn(() => true),
      refreshFavorites: vi.fn(),
      loadDrawerBasePages,
      loadDrawerProjectPages: vi.fn(),
      consumeSelfInvalidation,
      windowObj
    });

    observer.initSavedPagesCacheSync();

    // forceReload's own invalidateCache fires this; the token is armed, so the
    // observer must NOT schedule its competing hydrate.
    armed = true;
    listener(
      { savedPages_cache_all: { oldValue: { pages: [] }, newValue: undefined } },
      'local'
    );

    expect(loadDrawerBasePages).not.toHaveBeenCalled();
    expect(savedPagesStore.hydrate).not.toHaveBeenCalled();
  });

  it('still reloads on a genuine (non-self) invalidation after consuming the token', () => {
    let listener;
    globalThis.browser = {
      storage: {
        onChanged: {
          addListener: vi.fn((callback) => {
            listener = callback;
          })
        }
      }
    };
    const windowObj = {
      clearTimeout: vi.fn(),
      setTimeout: vi.fn((callback) => {
        callback();
        return 1;
      })
    };
    const loadDrawerBasePages = vi.fn();
    const savedPagesStore = { hydrate: vi.fn() };
    let armed = false;
    const consumeSelfInvalidation = () => {
      if (armed) {
        armed = false;
        return true;
      }
      return false;
    };

    const observer = createDrawerCacheInvalidationObserver({
      state: { hasInitialized: true, selectedProjectId: null },
      savedPagesStore,
      projectsStore: { hydrate: vi.fn() },
      getCurrentUser: vi.fn(() => ({ uid: 'user-1' })),
      getSearchQuery: vi.fn(() => ''),
      isDrawerOpen: vi.fn(() => true),
      refreshFavorites: vi.fn(),
      loadDrawerBasePages,
      loadDrawerProjectPages: vi.fn(),
      consumeSelfInvalidation,
      windowObj
    });

    observer.initSavedPagesCacheSync();

    // First event: self-invalidation, suppressed.
    armed = true;
    listener(
      { savedPages_cache_all: { oldValue: { pages: [] }, newValue: undefined } },
      'local'
    );
    // Second event: a genuine invalidation (e.g. a delete in another surface).
    // Token already consumed, so this must reload.
    listener(
      { savedPages_cache_all: { oldValue: { pages: [] }, newValue: undefined } },
      'local'
    );

    expect(loadDrawerBasePages).toHaveBeenCalledTimes(1);
  });

  describe('createDrawerStoreSubscriptions warming UI', () => {
    // In production, loadDrawerBasePages arms state.warmUpInProgress before
    // the store emits (newtab-drawer-data.js:213). The subscriber only drives
    // the bar once warming is armed — gating on the flag (not on store idle
    // status) is what keeps the warming pane off routine new-tab opens. Tests
    // that exercise the warming branch therefore arm it explicitly.
    function createWarmingHarness({ snapshot, drawerOpen = true, armWarming = true } = {}) {
      const savedPagesStore = {
        _listeners: [],
        options: { lazy: false },
        subscribe(listener) {
          this._listeners.push(listener);
          return () => {
            this._listeners = this._listeners.filter((l) => l !== listener);
          };
        },
        emit() {
          this._listeners.forEach((l) => l());
        },
        getSnapshot: () => snapshot
      };
      const renderDrawerResults = vi.fn();
      const timers = {
        setTimeout: vi.fn((fn) => {
          fn();
          return 0;
        }),
        clearTimeout: vi.fn()
      };
      const api = { isExtension: true };
      const getCurrentUser = () => ({ uid: 'u1' });
      const state = {
        hasInitialized: true,
        query: '',
        warmUpInProgress: armWarming,
        warmUpProgress: { percent: 0, indeterminate: true },
        warmUpLastPercent: 0,
        warmUpDeterminate: false
      };
      const syncDrawerStateFromStore = vi.fn();
      const notifySavedPagesTotalChange = vi.fn();

      const { initStoreSubscriptions } = createDrawerStoreSubscriptions({
        api,
        state,
        savedPagesStore,
        projectsStore: { subscribe: () => () => {} },
        getCurrentUser,
        isDrawerOpen: () => drawerOpen,
        getSuppressSavedPagesStoreSync: () => false,
        notifySavedPagesTotalChange,
        syncDrawerStateFromStore,
        syncProjectsStateFromStore: vi.fn(),
        renderDrawerResults,
        timers
      });
      initStoreSubscriptions();

      return { savedPagesStore, renderDrawerResults, state, syncDrawerStateFromStore };
    }

    it('sets warmUpInProgress + progress derived from allPages/total', () => {
      const harness = createWarmingHarness({
        snapshot: {
          allPages: Array.from({ length: 24 }, (_, i) => ({ id: `p${i}` })),
          total: 80,
          refreshState: { status: 'loading', phase: 'prefetch', reason: null }
        }
      });

      harness.savedPagesStore.emit();

      expect(harness.state.warmUpInProgress).toBe(true);
      // The subscriber routes through the dispatcher, which is the render
      // authority; it does not call renderWarmingState directly.
      expect(harness.renderDrawerResults).toHaveBeenCalled();
      // 24 / 80 = 30%
      expect(harness.state.warmUpProgress).toEqual(expect.objectContaining({ percent: 30 }));
    });

    it('renders indeterminate when total is unknown (0 or null) on the first batch', () => {
      const harness = createWarmingHarness({
        snapshot: {
          allPages: [{ id: 'p1' }],
          total: 0,
          refreshState: { status: 'loading', phase: 'prefetch', reason: null }
        }
      });

      harness.savedPagesStore.emit();

      expect(harness.state.warmUpProgress).toEqual(
        expect.objectContaining({ indeterminate: true })
      );
    });

    it('clamps the percentage and never decreases once determinate', () => {
      const harness = createWarmingHarness({
        snapshot: {
          allPages: Array.from({ length: 40 }, (_, i) => ({ id: `p${i}` })),
          total: 80,
          refreshState: { status: 'loading', phase: 'prefetch', reason: null }
        }
      });

      harness.savedPagesStore.emit(); // 50%
      // Next batch reports a smaller numerator temporarily (e.g. dedupe) — must
      // not regress the displayed percentage.
      harness.savedPagesStore.getSnapshot = () => ({
        allPages: Array.from({ length: 30 }, (_, i) => ({ id: `p${i}` })),
        total: 80,
        refreshState: { status: 'loading', phase: 'prefetch', reason: null }
      });
      harness.savedPagesStore.emit();

      expect(harness.state.warmUpProgress.percent).toBe(50);
    });

    it('on completion, holds at 100% then hands off to results rendering', () => {
      const harness = createWarmingHarness({
        snapshot: {
          allPages: Array.from({ length: 80 }, (_, i) => ({ id: `p${i}` })),
          total: 80,
          refreshState: { status: 'idle', phase: 'prefetch', reason: 'complete' }
        }
      });

      harness.savedPagesStore.emit();

      // Final warming progress is at 100%, flag still set (completion timer
      // holds it briefly).
      expect(harness.state.warmUpProgress).toEqual(expect.objectContaining({ percent: 100 }));
      // After the (faked, synchronous) ~300ms timer fires, the flag clears and
      // results sync takes over.
      expect(harness.state.warmUpInProgress).toBe(false);
      expect(harness.syncDrawerStateFromStore).toHaveBeenCalled();
    });

    // Regression: hydrate() has fast paths (warm-cache hit, fromCache API
    // response) that bypass prefetchAllPages and delegate to refreshInitial,
    // whose terminal states are {idle, 'up-to-date', 'no-updates'} or
    // {idle, 'incremental-refresh', 'applied'}. The warming bar used to only
    // recognize {idle, 'prefetch', 'complete'} as completion, so the common
    // "log out, log back in, nothing changed" path left the bar pinned at
    // 100% forever. Any idle refreshState must count as completion.
    it('completes on the warm-cache "no-updates" terminal state (refreshInitial path)', () => {
      const harness = createWarmingHarness({
        snapshot: {
          allPages: Array.from({ length: 80 }, (_, i) => ({ id: `p${i}` })),
          total: 80,
          refreshState: { status: 'idle', phase: 'up-to-date', reason: 'no-updates' }
        }
      });

      harness.savedPagesStore.emit();

      expect(harness.state.warmUpProgress).toEqual(expect.objectContaining({ percent: 100 }));
      expect(harness.state.warmUpInProgress).toBe(false);
      expect(harness.syncDrawerStateFromStore).toHaveBeenCalled();
    });

    it('completes on the warm-cache "incremental applied" terminal state', () => {
      const harness = createWarmingHarness({
        snapshot: {
          allPages: Array.from({ length: 80 }, (_, i) => ({ id: `p${i}` })),
          total: 80,
          refreshState: { status: 'idle', phase: 'incremental-refresh', reason: 'applied' }
        }
      });

      harness.savedPagesStore.emit();

      expect(harness.state.warmUpInProgress).toBe(false);
      expect(harness.syncDrawerStateFromStore).toHaveBeenCalled();
    });

    it('does NOT complete on a loading/checking intermediate state', () => {
      const harness = createWarmingHarness({
        snapshot: {
          allPages: Array.from({ length: 40 }, (_, i) => ({ id: `p${i}` })),
          total: 80,
          refreshState: { status: 'checking', phase: 'update-check', reason: null }
        }
      });

      harness.savedPagesStore.emit();

      // Still warming — checking is an intermediate state, not terminal. The
      // bar updates (50%) but no completion handoff fires.
      expect(harness.state.warmUpInProgress).toBe(true);
      expect(harness.state.warmUpProgress.percent).toBe(50);
      expect(harness.syncDrawerStateFromStore).not.toHaveBeenCalled();
    });

    // Critical regression guard: the warming pane must NOT appear on routine
    // new-tab opens. On session restore the store is lazy:true and warming is
    // never armed by loadDrawerBasePages, so a subsequent idle emit (warm-cache
    // hydrate finishing) must route through the normal sync path, not the
    // warming branch. The old gate (isWarmUpActive, which OR'd in
    // isWarmUpComplete) showed the warming bar on every open.
    it('does not activate warming on a routine open (warmUpInProgress not armed)', () => {
      const harness = createWarmingHarness({
        snapshot: {
          allPages: Array.from({ length: 40 }, (_, i) => ({ id: `p${i}` })),
          total: 80,
          // A terminal idle state — but warming was never armed.
          refreshState: { status: 'idle', phase: 'up-to-date', reason: 'no-updates' }
        },
        armWarming: false
      });

      harness.savedPagesStore.emit();

      // Warming never activates; the normal sync path runs instead.
      expect(harness.state.warmUpInProgress).toBe(false);
      expect(harness.renderDrawerResults).not.toHaveBeenCalled();
      expect(harness.syncDrawerStateFromStore).toHaveBeenCalled();
    });

    it('wiring: the coordinator forwards renderDrawerResults to the subscriber', () => {
      // Regression guard: a name mismatch at the coordinator->factory seam
      // leaves the warming branch dead in production. This goes through the
      // REAL coordinator->factory seam so a mismatch fails here.
      const savedPagesStore = {
        _listeners: [],
        options: { lazy: false },
        subscribe(listener) {
          this._listeners.push(listener);
          return () => {
            this._listeners = this._listeners.filter((l) => l !== listener);
          };
        },
        emit() {
          this._listeners.forEach((l) => l());
        },
        getSnapshot: () => ({
          allPages: Array.from({ length: 24 }, (_, i) => ({ id: `p${i}` })),
          total: 80,
          refreshState: { status: 'loading', phase: 'prefetch', reason: null }
        })
      };
      const renderDrawerResults = vi.fn();
      const state = {
        hasInitialized: true,
        query: '',
        // Armed by loadDrawerBasePages before the store emits, as in production.
        warmUpInProgress: true,
        warmUpProgress: { percent: 0, indeterminate: true },
        warmUpLastPercent: 0,
        warmUpDeterminate: false
      };

      const coordinator = createDrawerSyncCoordinator({
        api: { isExtension: true },
        state,
        savedPagesStore,
        projectsStore: { subscribe: () => () => {} },
        getCurrentUser: () => ({ uid: 'u1' }),
        isDrawerOpen: () => true,
        getSearchQuery: () => '',
        notifySavedPagesTotalChange: vi.fn(),
        refreshFavorites: vi.fn(),
        syncDrawerStateFromStore: vi.fn(),
        syncProjectsStateFromStore: vi.fn(),
        loadDrawerBasePages: vi.fn(),
        loadDrawerProjectPages: vi.fn(),
        loadDrawerResults: vi.fn(),
        renderDrawerSignInState: vi.fn(),
        renderDrawerResults,
        resetDrawerState: vi.fn(),
        setSuppressSavedPagesStoreSync: vi.fn(),
        getSuppressSavedPagesStoreSync: () => false
      });

      coordinator.init();
      savedPagesStore.emit();

      // If the renderer were forwarded under the wrong key, the warming branch
      // guard would be false and the flag/progress would never be set.
      expect(renderDrawerResults).toHaveBeenCalled();
      expect(state.warmUpProgress).toEqual(expect.objectContaining({ percent: 30 }));
    });

    it('integration: renders the warming bar per-batch during a real store warm-up (not just at completion)', async () => {
      // Regression guard for the phase-vocabulary mismatch: loadMore() emits
      // change events with phase 'load-more' during a real warm-up, NOT
      // 'prefetch'. The old isWarmUpActive gated on phase === 'prefetch', so
      // the warming branch was dead for every per-batch event and the bar only
      // flashed once at 100% on completion. This wires a REAL WarmCacheListStore
      // to the REAL subscriber so the disconnect can't hide behind a hand-faked
      // snapshot.
      function makePages(count, start = 1) {
        return Array.from({ length: count }, (_, index) => ({
          id: `page-${start + index}`,
          title: `Page ${start + index}`,
          url: `https://example.com/${start + index}`
        }));
      }

      const firstBatch = makePages(50);
      const secondBatch = makePages(40, 51);
      const getList = vi
        .fn()
        .mockResolvedValueOnce({
          pages: firstBatch,
          pagination: { total: 90, hasNextPage: true, nextCursor: 'page-50' },
          meta: { fromCache: false }
        })
        .mockResolvedValueOnce({
          pages: secondBatch,
          pagination: { total: 90, hasNextPage: false, nextCursor: null },
          meta: { fromCache: false }
        });

      const api = {
        isExtension: true,
        getCachedPages: vi.fn(async () => null),
        setCachedPages: vi.fn(async () => {})
      };
      const store = new WarmCacheListStore(api, {
        initialFetchLimit: 50,
        prefetchBatchLimit: 100,
        warmCacheScope: { surface: 'test' },
        getList,
        buildInitialFetchOptions: (overrides = {}) => ({
          limit: 50,
          sort: 'newest',
          ...overrides
        }),
        buildLoadMoreFetchOptions: (cursor) => ({
          limit: 100,
          sort: 'newest',
          cursor,
          skipCache: true
        })
      });

      const renderDrawerResults = vi.fn();
      const state = {
        hasInitialized: true,
        query: '',
        warmUpInProgress: false,
        warmUpProgress: { percent: 0, indeterminate: true },
        warmUpLastPercent: 0,
        warmUpDeterminate: false
      };
      const { initStoreSubscriptions } = createDrawerStoreSubscriptions({
        api: { isExtension: true },
        state,
        savedPagesStore: store,
        projectsStore: { subscribe: () => () => {} },
        getCurrentUser: () => ({ uid: 'u1' }),
        isDrawerOpen: () => true,
        getSuppressSavedPagesStoreSync: () => false,
        notifySavedPagesTotalChange: vi.fn(),
        syncDrawerStateFromStore: vi.fn(),
        syncProjectsStateFromStore: vi.fn(),
        renderDrawerResults
      });
      initStoreSubscriptions();

      store.setLazy(false);
      // Mirror loadDrawerBasePages: it arms the warming flag before hydrate()
      // runs, so the subscriber drives the bar on each batch emit.
      state.warmUpInProgress = true;
      await store.hydrate();

      // The warm-up is fire-and-forget; poll until the completion timer fires
      // (real 300ms setTimeout) and clears the warm-up flag. Polling on the
      // flag (not store.options.lazy) accounts for the timer gap between the
      // store's lazy reset (in prefetchAllPages' finally) and the flag clear
      // (in the completion timer callback).
      await vi.waitFor(() => {
        expect(state.warmUpInProgress).toBe(false);
      }, { timeout: 3000, interval: 50 });

      // The dispatcher (single render authority) must have been called during
      // the warm-up to paint the warming pane.
      expect(renderDrawerResults).toHaveBeenCalled();
    });

    it('does not treat a load-more inter-batch idle as completion (regression: bar jumping to 100% mid-warm)', () => {
      // loadMore() emits change events with { status: 'idle', phase: 'load-more' }
      // after EACH batch resolves, while the prefetch loop is still running. The
      // bar must reflect real progress (50/90 ≈ 56%), NOT jump to 100% — jumping
      // mid-warm was the symptom of isWarmUpComplete treating any idle as
      // terminal. The real-bug repro is the e2e test; this unit test pins the
      // exact snapshot shape that loadMore emits between batches.
      const harness = createWarmingHarness({
        snapshot: {
          allPages: Array.from({ length: 50 }, (_, i) => ({ id: `p${i}` })),
          total: 90,
          refreshState: { status: 'idle', phase: 'load-more', reason: 'appended-pages' }
        }
      });

      harness.savedPagesStore.emit();

      // 50/90 rounds to 56%. If this reads 100, isWarmUpComplete wrongly
      // treated the inter-batch idle as terminal and forced percent to 100.
      expect(harness.state.warmUpProgress.percent).toBe(56);
      expect(harness.state.warmUpProgress.indeterminate).toBe(false);
    });

    it('integration: hands off to results rendering even when hasInitialized is still false at completion', async () => {
      // Reproduces the "warming UI stays permanently at 100%, never shows cards"
      // symptom. The race: prefetchAllPages is launched fire-and-forget DURING
      // hydrate(), and can complete BEFORE loadDrawerBasePages (the caller) sets
      // state.hasInitialized = true. The 300ms completion timer then fires with
      // hasInitialized === false, the shouldSyncDrawerStoreUpdate gate returns
      // false, and the handoff is skipped — leaving the warming pane stuck.
      //
      // The fix: the warming completion handoff must paint regardless of
      // hasInitialized, because the warm-up completing IS the render trigger.
      function makePages(count, start = 1) {
        return Array.from({ length: count }, (_, index) => ({
          id: `page-${start + index}`,
          title: `Page ${start + index}`,
          url: `https://example.com/${start + index}`
        }));
      }

      const firstBatch = makePages(50);
      const secondBatch = makePages(40, 51);
      const getList = vi
        .fn()
        .mockResolvedValueOnce({
          pages: firstBatch,
          pagination: { total: 90, hasNextPage: true, nextCursor: 'page-50' },
          meta: { fromCache: false }
        })
        .mockResolvedValueOnce({
          pages: secondBatch,
          pagination: { total: 90, hasNextPage: false, nextCursor: null },
          meta: { fromCache: false }
        });

      const api = {
        isExtension: true,
        getCachedPages: vi.fn(async () => null),
        setCachedPages: vi.fn(async () => {})
      };
      const store = new WarmCacheListStore(api, {
        initialFetchLimit: 50,
        prefetchBatchLimit: 100,
        warmCacheScope: { surface: 'test' },
        getList,
        buildInitialFetchOptions: (overrides = {}) => ({ limit: 50, sort: 'newest', ...overrides }),
        buildLoadMoreFetchOptions: (cursor) => ({ limit: 100, sort: 'newest', cursor, skipCache: true })
      });

      const renderDrawerResults = vi.fn();
      const syncDrawerStateFromStore = vi.fn();
      // Real production timing: hasInitialized starts FALSE and is only set
      // true by the caller (loadDrawerBasePages) after hydrate() resolves. The
      // prefetch can easily complete during that window.
      const state = {
        hasInitialized: false,
        query: '',
        warmUpInProgress: false,
        warmUpProgress: { percent: 0, indeterminate: true },
        warmUpLastPercent: 0,
        warmUpDeterminate: false
      };
      const { initStoreSubscriptions } = createDrawerStoreSubscriptions({
        api: { isExtension: true },
        state,
        savedPagesStore: store,
        projectsStore: { subscribe: () => () => {} },
        getCurrentUser: () => ({ uid: 'u1' }),
        isDrawerOpen: () => true,
        getSuppressSavedPagesStoreSync: () => false,
        notifySavedPagesTotalChange: vi.fn(),
        syncDrawerStateFromStore,
        syncProjectsStateFromStore: vi.fn(),
        renderDrawerResults
      });
      initStoreSubscriptions();

      store.setLazy(false);
      // Mirror loadDrawerBasePages: it arms the warming flag before hydrate()
      // runs. Prefetch can complete (and the completion timer fire) before the
      // caller sets hasInitialized — that's the race under test.
      state.warmUpInProgress = true;
      await store.hydrate();
      // NOTE: deliberately NOT setting state.hasInitialized = true here, to
      // model the race where the prefetch completes first.

      // Wait for the warm-up + 300ms completion pause. The handoff MUST fire
      // even though hasInitialized is still false — the flag clears and cards
      // sync runs.
      await vi.waitFor(() => {
        expect(syncDrawerStateFromStore).toHaveBeenCalled();
      });

      const handoffCall = syncDrawerStateFromStore.mock.calls.at(-1);
      expect(handoffCall[1]).toEqual(expect.objectContaining({ render: true }));

      // The completion timer cleared the warm-up phase, so the dispatcher
      // would now render cards (the handoff sync paints them).
      expect(state.warmUpInProgress).toBe(false);
    });
  });

  describe('syncPendingSaves stale-record cleanup', () => {
    // Regression: when the enrichment poll gives up, the pending-save record
    // stays in storage.local (by design — "a later refresh reconciles"). But if
    // the real doc arrives through another path (force-reenrich, background
    // unload + later enrichment), nothing clears the record, and
    // syncPendingSaves re-prepends the optimistic tile on every newtab load.
    // The fix: syncPendingSaves checks if the real page already exists in the
    // store before adding the tile, and clears stale records instead.

    function createMemoryStorage() {
      let store = {};
      return {
        store,
        get: vi.fn(async (keys) => {
          if (typeof keys === 'string') {
            return keys in store ? { [keys]: store[keys] } : {};
          }
          return { ...store };
        }),
        set: vi.fn(async (entries) => {
          store = { ...store, ...entries };
        }),
        remove: vi.fn(async (keys) => {
          const arr = Array.isArray(keys) ? keys : [keys];
          const next = { ...store };
          for (const k of arr) delete next[k];
          store = next;
        })
      };
    }

    function createHarness({ existingPages = [], pendingRecords = {}, savedPagesStore: storeOverrides = {} } = {}) {
      const storage = createMemoryStorage();
      storage.store[PENDING_SAVES_KEY] = pendingRecords;

      globalThis.browser = { storage: { local: storage } };

      const prependOptimisticPage = vi.fn(async () => ({}));
      const savedPagesStore = {
        prependOptimisticPage,
        getSnapshot: () => ({ allPages: existingPages }),
        refreshInitial: vi.fn(async () => ({})),
        ...storeOverrides
      };

      const observer = createDrawerCacheInvalidationObserver({
        state: {},
        savedPagesStore,
        projectsStore: {},
        getCurrentUser: () => ({ uid: 'u1' }),
        getSearchQuery: () => '',
        isDrawerOpen: () => false,
        refreshFavorites: vi.fn(),
        loadDrawerBasePages: vi.fn(),
        loadDrawerProjectPages: vi.fn()
      });

      return { observer, storage, prependOptimisticPage, savedPagesStore };
    }

    it('clears a pending record when the real page already exists in the store', async () => {
      const realPageUrl = 'https://docs.google.com/document/d/abc/edit?tab=t.0';
      const { observer, storage, prependOptimisticPage } = createHarness({
        existingPages: [
          { id: 'real-1', url: realPageUrl, title: 'Real Doc' }
        ],
        pendingRecords: {
          'https://docs.google.com/document/d/abc/edit?tab=t.0': {
            url: realPageUrl,
            title: 'Real Doc',
            saved_at: new Date().toISOString()
          }
        }
      });

      await observer.syncPendingSaves();

      // The tile was NOT prepended (the real doc is already in the list)
      expect(prependOptimisticPage).not.toHaveBeenCalled();
      // The stale pending record was removed from storage
      expect(storage.remove).toHaveBeenCalledWith(PENDING_SAVES_KEY);
    });

    it('prepends the tile when the real page is not yet in the store', async () => {
      const pendingUrl = 'https://example.com/pending';
      const { observer, storage, prependOptimisticPage } = createHarness({
        existingPages: [],
        pendingRecords: {
          'https://example.com/pending': {
            url: pendingUrl,
            title: 'Pending Page',
            saved_at: new Date().toISOString()
          }
        }
      });

      await observer.syncPendingSaves();

      expect(prependOptimisticPage).toHaveBeenCalledTimes(1);
      expect(storage.remove).not.toHaveBeenCalled();
    });

    it('does not match optimistic tiles as "real pages" (avoids clearing too early)', async () => {
      // An optimistic tile in the store doesn't count as "the real doc arrived"
      const pendingUrl = 'https://example.com/still-pending';
      const { observer, prependOptimisticPage } = createHarness({
        existingPages: [
          { id: 'optimistic:xyz', url: pendingUrl, optimistic: true }
        ],
        pendingRecords: {
          'https://example.com/still-pending': {
            url: pendingUrl,
            title: 'Still Pending',
            saved_at: new Date().toISOString()
          }
        }
      });

      await observer.syncPendingSaves();

      // Tile IS prepended — the existing entry was optimistic, not a real doc
      expect(prependOptimisticPage).toHaveBeenCalledTimes(1);
    });

    // Regression for the "placeholder stuck forever" bug: realtime SSE has no
    // replay buffer, so a stream drop during the ~28s enrichment window means
    // the page_updated event is lost and the optimistic tile never reconciles
    // until a manual refresh. syncPendingSaves now arms a bounded periodic
    // refresh while pending records exist, so the store re-pulls and
    // onOptimisticReconciled fires to clear the tile. The 10-min pending TTL
    // guarantees termination even if enrichment never completes.
    describe('fallback poll for missed realtime events', () => {
      function createPollHarness({ pendingRecords, existingPages = [] }) {
        // A fake window whose setTimeout fires synchronously on a tick we
        // control. The poll arms itself via windowObj.setTimeout; capturing
        // the callback lets us advance the timer deterministically.
        let pendingCallback = null;
        const windowObj = {
          setTimeout: vi.fn((cb) => {
            pendingCallback = cb;
            return 1;
          }),
          clearTimeout: vi.fn(() => {
            pendingCallback = null;
          }),
          drain: () => {
            const cb = pendingCallback;
            pendingCallback = null;
            if (cb) cb();
            return Boolean(cb);
          }
        };

        const storage = createMemoryStorage();
        storage.store[PENDING_SAVES_KEY] = pendingRecords;
        globalThis.browser = { storage: { local: storage } };

        const savedPagesStore = {
          prependOptimisticPage: vi.fn(async () => ({})),
          getSnapshot: () => ({ allPages: existingPages }),
          refreshInitial: vi.fn(async () => ({}))
        };

        const observer = createDrawerCacheInvalidationObserver({
          state: {},
          savedPagesStore,
          projectsStore: {},
          getCurrentUser: () => ({ uid: 'u1' }),
          getSearchQuery: () => '',
          isDrawerOpen: () => false,
          refreshFavorites: vi.fn(),
          loadDrawerBasePages: vi.fn(),
          loadDrawerProjectPages: vi.fn(),
          windowObj
        });

        return { observer, storage, savedPagesStore, windowObj };
      }

      it('arms a periodic refresh when pending records exist', async () => {
        const { observer, savedPagesStore, windowObj } = createPollHarness({
          pendingRecords: {
            'https://example.com/pending': {
              url: 'https://example.com/pending',
              title: 'Pending',
              saved_at: new Date().toISOString()
            }
          }
        });

        await observer.syncPendingSaves();

        // The poll armed a timer.
        expect(windowObj.setTimeout).toHaveBeenCalledTimes(1);
        // Firing the timer pulls the store — this is the recovery path for a
        // missed realtime event.
        expect(savedPagesStore.refreshInitial).not.toHaveBeenCalled();
        windowObj.drain();
        expect(savedPagesStore.refreshInitial).toHaveBeenCalledTimes(1);
      });

      it('does NOT arm the poll when there are no pending records', async () => {
        const { observer, windowObj } = createPollHarness({ pendingRecords: {} });

        await observer.syncPendingSaves();

        expect(windowObj.setTimeout).not.toHaveBeenCalled();
      });

      it('disarms the poll once pending records clear', async () => {
        const { observer, savedPagesStore, windowObj } = createPollHarness({
          pendingRecords: {
            'https://example.com/pending': {
              url: 'https://example.com/pending',
              title: 'Pending',
              saved_at: new Date().toISOString()
            }
          }
        });

        await observer.syncPendingSaves();
        expect(windowObj.setTimeout).toHaveBeenCalledTimes(1);

        // Simulate the doc arriving via the refresh: clear the pending record,
        // then run syncPendingSaves again (as the storage.onChanged listener
        // would on the clearPendingSave write).
        observer.storage = observer.storage; // noop for clarity
        delete globalThis.browser.storage.local.store[PENDING_SAVES_KEY];
        await observer.syncPendingSaves();

        // A second poll was NOT armed — no pending records to recover.
        expect(windowObj.setTimeout).toHaveBeenCalledTimes(1);
        expect(savedPagesStore.refreshInitial).not.toHaveBeenCalled();
      });

      it('keeps polling while pending records remain', async () => {
        const { observer, savedPagesStore, windowObj } = createPollHarness({
          pendingRecords: {
            'https://example.com/pending': {
              url: 'https://example.com/pending',
              title: 'Pending',
              saved_at: new Date().toISOString()
            }
          }
        });

        await observer.syncPendingSaves();
        expect(windowObj.setTimeout).toHaveBeenCalledTimes(1);

        // First tick: refresh runs but the doc hasn't arrived yet (pending
        // record still present). The poll should re-arm. The poll callback is
        // async (refreshInitial then syncPendingSaves), so await a microtask
        // flush after draining before asserting on the re-arm.
        windowObj.drain();
        await new Promise((resolve) => setTimeout(resolve, 0));
        expect(savedPagesStore.refreshInitial).toHaveBeenCalledTimes(1);
        expect(windowObj.setTimeout).toHaveBeenCalledTimes(2);

        // Second tick: still pending, still re-arming.
        windowObj.drain();
        await new Promise((resolve) => setTimeout(resolve, 0));
        expect(savedPagesStore.refreshInitial).toHaveBeenCalledTimes(2);
        expect(windowObj.setTimeout).toHaveBeenCalledTimes(3);
      });
    });
  });

  describe('forceReload self-invalidation suppression', () => {
    // Regression guard for refresh-cache vs subsequent-window drift: the refresh
    // button invalidates the cache (firing storage.onChanged in its OWN window)
    // and then reloads via forceReload → hydrate. Without suppression the
    // observer schedules a second hydrate ~50ms later that bumps requestId and
    // aborts forceReload's prefetch, leaving the warm cache at the partial
    // initial batch. markForceReloadInitiated arms a one-shot token the observer
    // consumes so this window skips its own competing reload.
    function makeCoordinatorHarness() {
      // The coordinator registers TWO storage.onChanged listeners (cache
      // invalidation first, then pending-saves). Capture the FIRST — that's the
      // cache-invalidation listener under test.
      const listeners = [];
      globalThis.browser = {
        storage: {
          onChanged: {
            addListener: vi.fn((callback) => {
              listeners.push(callback);
            })
          }
        }
      };
      const windowObj = {
        clearTimeout: vi.fn(),
        setTimeout: vi.fn((callback) => {
          callback();
          return 1;
        })
      };
      const loadDrawerBasePages = vi.fn();
      const savedPagesStore = { hydrate: vi.fn(), subscribe: () => () => {} };
      const projectsStore = { hydrate: vi.fn(), subscribe: () => () => {} };

      const coordinator = createDrawerSyncCoordinator({
        api: { isExtension: true },
        state: { hasInitialized: true, query: '' },
        savedPagesStore,
        projectsStore,
        getCurrentUser: () => ({ uid: 'user-1' }),
        isDrawerOpen: () => true,
        getSearchQuery: () => '',
        notifySavedPagesTotalChange: vi.fn(),
        refreshFavorites: vi.fn(),
        syncDrawerStateFromStore: vi.fn(),
        syncProjectsStateFromStore: vi.fn(),
        loadDrawerBasePages,
        loadDrawerProjectPages: vi.fn(),
        loadDrawerResults: vi.fn(),
        renderDrawerSignInState: vi.fn(),
        renderDrawerResults: vi.fn(),
        resetDrawerState: vi.fn(),
        setSuppressSavedPagesStoreSync: vi.fn(),
        getSuppressSavedPagesStoreSync: () => false,
        windowObj
      });
      coordinator.init();
      return { coordinator, getListener: () => listeners[0], loadDrawerBasePages, savedPagesStore };
    }

    it('marks and consumes the self-invalidation token so forceReload does not double-load', () => {
      const { coordinator, getListener, loadDrawerBasePages } = makeCoordinatorHarness();
      const listener = getListener();

      // Simulate the refresh click: arm the token, then fire the self-invalidation.
      coordinator.markForceReloadInitiated();
      listener(
        { savedPages_cache_all: { oldValue: { pages: [] }, newValue: undefined } },
        'local'
      );

      expect(loadDrawerBasePages).not.toHaveBeenCalled();
    });

    it('only suppresses one invalidation (a later genuine one still reloads)', () => {
      const { coordinator, getListener, loadDrawerBasePages } = makeCoordinatorHarness();
      const listener = getListener();

      coordinator.markForceReloadInitiated();
      listener(
        { savedPages_cache_all: { oldValue: { pages: [] }, newValue: undefined } },
        'local'
      );
      // Token consumed; a second, genuine invalidation must reload.
      listener(
        { savedPages_cache_all: { oldValue: { pages: [] }, newValue: undefined } },
        'local'
      );

      expect(loadDrawerBasePages).toHaveBeenCalledTimes(1);
    });
  });

  describe('getCurrentUser contract', () => {
    // Regression: production wires `getCurrentUserAsync` (an async function)
    // into the coordinator, which forwards it to the cache observer and store
    // subscriptions. Those call sites do `if (!getCurrentUser())` and
    // `Boolean(getCurrentUser())` WITHOUT awaiting — so an async getter made
    // every guard evaluate against a Promise (always truthy). The no-user
    // short-circuit never fired and telemetry logged `[object Promise]`.
    //
    // The runtime fix injects the SYNC cached-user reader. This test pins the
    // contract: the observer and subscriber must treat `getCurrentUser` as a
    // synchronous user-or-null reader. If anyone reintroduces an async getter
    // here, the null-user assertion below will fail.

    it('cache observer short-circuits when the sync getter returns null', () => {
      const refreshFavorites = vi.fn();
      // Harness above doesn't expose refreshFavorites; rebuild inline to assert.
      let listener;
      globalThis.browser = {
        storage: { onChanged: { addListener: vi.fn((cb) => { listener = cb; }) } }
      };
      const windowObj = {
        clearTimeout: vi.fn(),
        setTimeout: vi.fn((cb) => { cb(); return 1; })
      };
      const loadDrawerBasePages = vi.fn();
      const observer = createDrawerCacheInvalidationObserver({
        state: { hasInitialized: true, selectedProjectId: null },
        savedPagesStore: { hydrate: vi.fn() },
        projectsStore: { hydrate: vi.fn() },
        // Sync null return — the contract the runtime now relies on.
        getCurrentUser: () => null,
        getSearchQuery: () => '',
        isDrawerOpen: () => true,
        refreshFavorites,
        loadDrawerBasePages,
        loadDrawerProjectPages: vi.fn(),
        windowObj
      });
      observer.initSavedPagesCacheSync();
      listener(
        { savedPages_cache_all: { oldValue: { pages: [] }, newValue: undefined } },
        'local'
      );

      // No user → no reload, no favorites refresh.
      expect(loadDrawerBasePages).not.toHaveBeenCalled();
      expect(refreshFavorites).not.toHaveBeenCalled();
    });

    it('store subscriber skips sync when the sync getter returns null (extension mode)', () => {
      const syncDrawerStateFromStore = vi.fn();
      const savedPagesSubscribers = [];
      const subscriptions = createDrawerStoreSubscriptions({
        api: { isExtension: true },
        state: { hasInitialized: true, query: '' },
        savedPagesStore: {
          subscribe: vi.fn((cb) => { savedPagesSubscribers.push(cb); }),
          getSnapshot: () => ({ allPages: [{ id: 'p1' }], total: 1 })
        },
        projectsStore: { subscribe: () => () => {} },
        // Sync null return — the contract the runtime now relies on.
        getCurrentUser: () => null,
        isDrawerOpen: () => true,
        getSuppressSavedPagesStoreSync: () => false,
        notifySavedPagesTotalChange: vi.fn(),
        syncDrawerStateFromStore,
        syncProjectsStateFromStore: vi.fn()
      });
      subscriptions.initStoreSubscriptions();
      savedPagesSubscribers[0]();

      // shouldSyncDrawerStoreUpdate gates on hasCurrentUser in extension mode;
      // a null user must prevent the sync.
      expect(syncDrawerStateFromStore).not.toHaveBeenCalled();
    });
  });
});
