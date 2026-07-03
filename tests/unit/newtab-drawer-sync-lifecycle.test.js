import { describe, expect, it, vi } from 'vitest';

import { createDrawerSyncLifecycle } from '../../src/newtab-drawer-sync-lifecycle.js';

describe('drawer sync lifecycle', () => {
  it('loads the saved-pages summary through the store when available', async () => {
    const notifySavedPagesTotalChange = vi.fn();
    const savedPagesStore = {
      hydrate: vi.fn().mockResolvedValue(undefined),
      reset: vi.fn()
    };
    const lifecycle = createDrawerSyncLifecycle({
      api: { getSavedPages: vi.fn(), isExtension: false },
      state: {},
      savedPagesStore,
      projectsStore: { reset: vi.fn() },
      getCurrentUser: vi.fn(),
      isDrawerOpen: vi.fn(() => false),
      getSearchQuery: vi.fn(() => ''),
      notifySavedPagesTotalChange,
      loadDrawerResults: vi.fn(),
      renderDrawerSignInState: vi.fn(),
      resetDrawerState: vi.fn(),
      setSuppressSavedPagesStoreSync: vi.fn()
    });

    await lifecycle.loadSummary();

    expect(savedPagesStore.hydrate).toHaveBeenCalled();
    expect(notifySavedPagesTotalChange).toHaveBeenCalled();
  });

  it('resets and notifies when summary loading is unavailable in extension mode without a user', async () => {
    const savedPagesStore = {
      hydrate: vi.fn(),
      reset: vi.fn()
    };
    const notifySavedPagesTotalChange = vi.fn();
    const lifecycle = createDrawerSyncLifecycle({
      api: { getSavedPages: vi.fn(), isExtension: true },
      state: {},
      savedPagesStore,
      projectsStore: { reset: vi.fn() },
      getCurrentUser: vi.fn(() => null),
      isDrawerOpen: vi.fn(() => false),
      getSearchQuery: vi.fn(() => ''),
      notifySavedPagesTotalChange,
      loadDrawerResults: vi.fn(),
      renderDrawerSignInState: vi.fn(),
      resetDrawerState: vi.fn(),
      setSuppressSavedPagesStoreSync: vi.fn()
    });

    await lifecycle.loadSummary();

    expect(savedPagesStore.reset).toHaveBeenCalledWith({ emit: false });
    expect(savedPagesStore.hydrate).not.toHaveBeenCalled();
    expect(notifySavedPagesTotalChange).toHaveBeenCalled();
  });

  it('hydrates summary from warm cache bootstrap when a last-known user is available', async () => {
    const savedPagesStore = {
      hydrate: vi.fn().mockResolvedValue(undefined),
      reset: vi.fn()
    };
    const notifySavedPagesTotalChange = vi.fn();
    const lifecycle = createDrawerSyncLifecycle({
      api: {
        getSavedPages: vi.fn(),
        getLastKnownUserId: vi.fn().mockResolvedValue('user-1'),
        isExtension: true
      },
      state: {},
      savedPagesStore,
      projectsStore: { reset: vi.fn() },
      getCurrentUser: vi.fn(() => null),
      isDrawerOpen: vi.fn(() => false),
      getSearchQuery: vi.fn(() => ''),
      notifySavedPagesTotalChange,
      loadDrawerResults: vi.fn(),
      renderDrawerSignInState: vi.fn(),
      resetDrawerState: vi.fn(),
      setSuppressSavedPagesStoreSync: vi.fn()
    });

    await lifecycle.loadSummary();

    expect(savedPagesStore.hydrate).toHaveBeenCalled();
    expect(savedPagesStore.reset).not.toHaveBeenCalled();
    expect(notifySavedPagesTotalChange).toHaveBeenCalled();
  });

  it('reloads open drawer results after sign-in without resetting a warm-cache-rendered drawer', async () => {
    const loadDrawerResults = vi.fn().mockResolvedValue(undefined);
    const savedPagesStore = {
      hydrate: vi.fn().mockResolvedValue(undefined),
      reset: vi.fn(),
      setLazy: vi.fn()
    };
    const lifecycle = createDrawerSyncLifecycle({
      api: { getSavedPages: vi.fn(), isExtension: false },
      state: { hasInitialized: true },
      savedPagesStore,
      projectsStore: { reset: vi.fn() },
      getCurrentUser: vi.fn(() => ({ uid: 'user-1' })),
      isDrawerOpen: vi.fn(() => true),
      getSearchQuery: vi.fn(() => 'alpha'),
      notifySavedPagesTotalChange: vi.fn(),
      loadDrawerResults,
      renderDrawerSignInState: vi.fn(),
      resetDrawerState: vi.fn(),
      setSuppressSavedPagesStoreSync: vi.fn()
    });

    await lifecycle.handleSignedIn();

    expect(savedPagesStore.reset).not.toHaveBeenCalled();
    expect(savedPagesStore.hydrate).not.toHaveBeenCalled();
    expect(loadDrawerResults).toHaveBeenCalledWith('alpha', { syncUrl: false });
  });

  it('still resets before reloading when sign-in completes before the drawer initializes', async () => {
    const loadDrawerResults = vi.fn().mockResolvedValue(undefined);
    const savedPagesStore = {
      hydrate: vi.fn().mockResolvedValue(undefined),
      reset: vi.fn(),
      setLazy: vi.fn()
    };
    const lifecycle = createDrawerSyncLifecycle({
      api: { getSavedPages: vi.fn(), isExtension: false },
      state: { hasInitialized: false },
      savedPagesStore,
      projectsStore: { reset: vi.fn() },
      getCurrentUser: vi.fn(() => ({ uid: 'user-1' })),
      isDrawerOpen: vi.fn(() => true),
      getSearchQuery: vi.fn(() => 'alpha'),
      notifySavedPagesTotalChange: vi.fn(),
      loadDrawerResults,
      renderDrawerSignInState: vi.fn(),
      resetDrawerState: vi.fn(),
      setSuppressSavedPagesStoreSync: vi.fn()
    });

    await lifecycle.handleSignedIn();

    expect(savedPagesStore.reset).toHaveBeenCalledWith({ emit: false });
    expect(loadDrawerResults).toHaveBeenCalledWith('alpha', { syncUrl: false });
  });

  it('resets stores and renders sign-in state on sign-out when drawer is open', () => {
    const projectsStore = { reset: vi.fn() };
    const savedPagesStore = { reset: vi.fn() };
    const notifySavedPagesTotalChange = vi.fn();
    const resetDrawerState = vi.fn();
    const setSuppressSavedPagesStoreSync = vi.fn();
    const renderDrawerSignInState = vi.fn();
    const lifecycle = createDrawerSyncLifecycle({
      api: { getSavedPages: vi.fn(), isExtension: false },
      state: {},
      savedPagesStore,
      projectsStore,
      getCurrentUser: vi.fn(),
      isDrawerOpen: vi.fn(() => true),
      getSearchQuery: vi.fn(() => ''),
      notifySavedPagesTotalChange,
      loadDrawerResults: vi.fn(),
      renderDrawerSignInState,
      resetDrawerState,
      setSuppressSavedPagesStoreSync
    });

    lifecycle.handleSignedOut();

    expect(projectsStore.reset).toHaveBeenCalledWith({ emit: false });
    expect(savedPagesStore.reset).toHaveBeenCalledWith({ emit: false });
    expect(notifySavedPagesTotalChange).toHaveBeenCalled();
    expect(resetDrawerState).toHaveBeenCalled();
    expect(setSuppressSavedPagesStoreSync).toHaveBeenCalledWith(false);
    expect(renderDrawerSignInState).toHaveBeenCalled();
  });

  it('flips the saved-pages store to non-lazy on sign-in so the warm-up runs fully', async () => {
    const savedPagesStore = {
      hydrate: vi.fn().mockResolvedValue(undefined),
      reset: vi.fn(),
      setLazy: vi.fn()
    };
    const lifecycle = createDrawerSyncLifecycle({
      api: { getSavedPages: vi.fn(), isExtension: true },
      state: { hasInitialized: false },
      savedPagesStore,
      projectsStore: { reset: vi.fn() },
      getCurrentUser: vi.fn(() => ({ uid: 'u1' })),
      isDrawerOpen: vi.fn(() => true),
      getSearchQuery: vi.fn(() => ''),
      notifySavedPagesTotalChange: vi.fn(),
      loadDrawerResults: vi.fn().mockResolvedValue(undefined),
      renderDrawerSignInState: vi.fn(),
      resetDrawerState: vi.fn(),
      setSuppressSavedPagesStoreSync: vi.fn()
    });

    await lifecycle.handleSignedIn();

    expect(savedPagesStore.setLazy).toHaveBeenCalledWith(false);
  });
});
