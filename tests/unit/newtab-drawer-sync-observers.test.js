import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  createDrawerCacheInvalidationObserver,
  createDrawerStoreSubscriptions,
  shouldSyncDrawerStoreUpdate
} from '../../src/newtab-drawer-sync-observers.js';
import { createDrawerSyncCoordinator } from '../../src/newtab-drawer-sync.js';

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

  describe('createDrawerStoreSubscriptions warming UI', () => {
    function createWarmingHarness({ snapshot, drawerOpen = true } = {}) {
      const savedPagesStore = {
        _listeners: [],
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
      const renderedStates = [];
      const renderWarmingState = vi.fn((opts) => renderedStates.push(opts));
      const timers = {
        setTimeout: vi.fn((fn) => {
          fn();
          return 0;
        }),
        clearTimeout: vi.fn()
      };
      const api = { isExtension: true };
      const getCurrentUser = () => ({ uid: 'u1' });
      const state = { hasInitialized: true, query: '' };
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
        renderWarmingState,
        timers
      });
      initStoreSubscriptions();

      return { savedPagesStore, renderWarmingState, renderedStates, syncDrawerStateFromStore };
    }

    it('renders the warming bar with a percentage derived from allPages/total', () => {
      const harness = createWarmingHarness({
        snapshot: {
          allPages: Array.from({ length: 24 }, (_, i) => ({ id: `p${i}` })),
          total: 80,
          refreshState: { status: 'loading', phase: 'prefetch', reason: null }
        }
      });

      harness.savedPagesStore.emit();

      expect(harness.renderWarmingState).toHaveBeenCalled();
      // 24 / 80 = 30%
      expect(harness.renderedStates.at(-1)).toEqual(expect.objectContaining({ percent: 30 }));
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

      expect(harness.renderedStates.at(-1)).toEqual(
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

      expect(harness.renderedStates.at(-1).percent).toBe(50);
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

      // Final warming render is at 100%.
      expect(harness.renderedStates.at(-1)).toEqual(expect.objectContaining({ percent: 100 }));
      // After the (faked, synchronous) ~300ms timer fires, results rendering takes over.
      expect(harness.syncDrawerStateFromStore).toHaveBeenCalled();
    });

    it('wiring: the coordinator forwards renderDrawerWarmingState to the subscriber under the name the factory expects', () => {
      // Regression guard: the coordinator used to forward the runtime renderer
      // under the shorthand key `renderDrawerWarmingState`, but the factory
      // destructures it as `renderWarmingState` — leaving the warming branch
      // dead in production. This goes through the REAL coordinator->factory
      // seam so a key mismatch fails here instead of in production.
      const savedPagesStore = {
        _listeners: [],
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
      const renderDrawerWarmingState = vi.fn();

      const coordinator = createDrawerSyncCoordinator({
        api: { isExtension: true },
        state: { hasInitialized: true, query: '' },
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
        renderDrawerWarmingState,
        resetDrawerState: vi.fn(),
        setSuppressSavedPagesStoreSync: vi.fn(),
        getSuppressSavedPagesStoreSync: () => false
      });

      coordinator.init();
      savedPagesStore.emit();

      // 24 / 80 = 30%. If the renderer were forwarded under the wrong key, the
      // warming branch guard would be false and this spy would never be called.
      expect(renderDrawerWarmingState).toHaveBeenCalledWith(
        expect.objectContaining({ percent: 30 })
      );
    });
  });
});
