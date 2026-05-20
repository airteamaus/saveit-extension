import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  createDrawerCacheInvalidationObserver,
  createDrawerStoreSubscriptions,
  shouldSyncDrawerStoreUpdate
} from '../../src/newtab-drawer-sync-observers.js';

describe('drawer sync observers', () => {
  describe('shouldSyncDrawerStoreUpdate', () => {
    it('blocks store sync while suppressed', () => {
      expect(shouldSyncDrawerStoreUpdate({
        suppressSavedPagesStoreSync: true,
        hasInitialized: true,
        isExtension: false
      })).toBe(false);
    });

    it('blocks store sync before the drawer is initialized', () => {
      expect(shouldSyncDrawerStoreUpdate({
        suppressSavedPagesStoreSync: false,
        hasInitialized: false,
        isExtension: false
      })).toBe(false);
    });

    it('allows sync when the drawer is initialized and auth preconditions are met', () => {
      expect(shouldSyncDrawerStoreUpdate({
        suppressSavedPagesStoreSync: false,
        hasInitialized: true,
        isExtension: true,
        hasCurrentUser: true
      })).toBe(true);
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
        subscribe: vi.fn(callback => {
          savedPagesSubscribers.push(callback);
        }),
        getSnapshot: vi.fn(() => ({ allPages: [{ id: 'page-1' }], total: 3 }))
      },
      projectsStore: {
        subscribe: vi.fn(callback => {
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
    expect(syncDrawerStateFromStore).toHaveBeenCalledWith({ allPages: [{ id: 'page-1' }], total: 3 }, {
      query: 'alpha',
      render: true
    });
    expect(syncProjectsStateFromStore).toHaveBeenCalledWith({ allPages: [{ id: 'project-1' }] }, {
      render: true
    });
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
          addListener: vi.fn(callback => {
            listener = callback;
          })
        }
      }
    };
    const windowObj = {
      clearTimeout: vi.fn(),
      setTimeout: vi.fn(callback => {
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
    listener({
      savedPages_cache_all: {
        oldValue: { pages: [] },
        newValue: undefined
      }
    }, 'local');

    expect(refreshFavorites).toHaveBeenCalled();
    expect(projectsStore.hydrate).toHaveBeenCalled();
    expect(savedPagesStore.hydrate).toHaveBeenCalled();
    expect(loadDrawerBasePages).toHaveBeenCalledWith({
      query: 'alpha',
      syncUrl: false
    });
    expect(loadDrawerProjectPages).not.toHaveBeenCalled();
  });
});
