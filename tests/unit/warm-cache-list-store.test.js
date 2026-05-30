import { describe, it, expect, vi } from 'vitest';

import { WarmCacheListStore, buildListCachePayload } from '../../src/warm-cache-list-store.js';

function makePages(count, start = 1) {
  return Array.from({ length: count }, (_, index) => ({
    id: `page-${start + index}`,
    title: `Page ${start + index}`,
    url: `https://example.com/${start + index}`
  }));
}

describe('WarmCacheListStore', () => {
  function createStore(apiOverrides = {}, optionOverrides = {}) {
    const api = {
      isExtension: true,
      getCachedPages: vi.fn(async () => null),
      setCachedPages: vi.fn(async () => {}),
      ...apiOverrides
    };

    const store = new WarmCacheListStore(api, {
      initialFetchLimit: 50,
      prefetchBatchLimit: 100,
      warmCacheScope: { surface: 'test' },
      getList: apiOverrides.getList,
      buildInitialFetchOptions: (overrides = {}) => ({
        limit: 50,
        sort: 'newest',
        ...overrides
      }),
      buildLoadMoreFetchOptions: cursor => ({
        limit: 100,
        sort: 'newest',
        cursor,
        skipCache: true
      }),
      ...optionOverrides
    });

    return { api, store };
  }

  it('preserves a broader warm cache when the initial refresh returns a smaller slice', async () => {
    const cachedPages = makePages(120);
    const getList = vi.fn().mockResolvedValue({
      pages: cachedPages.slice(0, 50),
      pagination: {
        total: 120,
        hasNextPage: true,
        nextCursor: 'page-50'
      },
      meta: {
        fromCache: false
      }
    });
    const { api, store } = createStore({
      getList,
      getCachedPages: vi.fn(async () => buildListCachePayload(cachedPages, {
        total: 120,
        hasNextPage: false,
        nextCursor: null
      }, true))
    });

    await store.hydrate();
    await vi.waitFor(() => {
      expect(getList).toHaveBeenCalledTimes(1);
    });

    expect(store.getSnapshot().allPages).toHaveLength(120);
    expect(api.setCachedPages.mock.calls.at(-1)[0].pages).toHaveLength(120);
  });

  it('prefetches remaining pages after the initial slice loads', async () => {
    const firstBatch = makePages(50);
    const secondBatch = makePages(40, 51);
    const getList = vi
      .fn()
      .mockResolvedValueOnce({
        pages: firstBatch,
        pagination: {
          total: 90,
          hasNextPage: true,
          nextCursor: 'page-50'
        },
        meta: {
          fromCache: false
        }
      })
      .mockResolvedValueOnce({
        pages: secondBatch,
        pagination: {
          total: 90,
          hasNextPage: false,
          nextCursor: null
        },
        meta: {
          fromCache: false
        }
      });
    const { store } = createStore({ getList });

    await store.hydrate();
    await vi.waitFor(() => {
      expect(store.getSnapshot().allPages).toHaveLength(90);
    });

    expect(getList).toHaveBeenCalledTimes(2);
  });

  it('drops stale cached entries once a full authoritative refresh completes', async () => {
    const cachedPages = makePages(5);
    const getList = vi
      .fn()
      .mockResolvedValueOnce({
        pages: cachedPages.slice(0, 2),
        pagination: {
          total: 4,
          hasNextPage: true,
          nextCursor: 'page-2'
        },
        meta: {
          fromCache: false
        }
      })
      .mockResolvedValueOnce({
        pages: [cachedPages[2], cachedPages[4]],
        pagination: {
          total: 4,
          hasNextPage: false,
          nextCursor: null
        },
        meta: {
          fromCache: false
        }
      });
    const { store } = createStore({
      getList,
      getCachedPages: vi.fn(async () => buildListCachePayload(cachedPages, {
        total: 5,
        hasNextPage: false,
        nextCursor: null
      }, true))
    }, {
      initialFetchLimit: 2,
      prefetchBatchLimit: 2
    });

    await store.hydrate();
    await vi.waitFor(() => {
      expect(store.getSnapshot().allPages).toHaveLength(4);
    });

    expect(store.getSnapshot().allPages.map(page => page.id)).toEqual([
      'page-1',
      'page-2',
      'page-3',
      'page-5'
    ]);
  });

  it('skips the fresh GET when the HEAD update check reports no newer items', async () => {
    const cachedPages = makePages(3);
    const getList = vi.fn();
    const getCachedPages = vi.fn(async () => buildListCachePayload(cachedPages, {
      total: 3,
      hasNextPage: false,
      nextCursor: null
    }, true));
    const checkForUpdates = vi.fn(async () => ({
      hasUpdates: false,
      latestKnownId: 'page-3'
    }));
    const { store } = createStore({
      getList,
      getCachedPages
    }, {
      checkForUpdates
    });

    await store.hydrate();
    await vi.waitFor(() => {
      expect(checkForUpdates).toHaveBeenCalledTimes(1);
    });

    expect(getList).not.toHaveBeenCalled();
    expect(getCachedPages).toHaveBeenCalledWith({ surface: 'test' }, { allowExpired: true });
    expect(store.getSnapshot().allPages).toEqual(cachedPages);
  });

  it('prefetches the remaining pages when the initial API cache slice is partial but not stale', async () => {
    const firstBatch = makePages(36);
    const secondBatch = makePages(54, 37);
    const getList = vi
      .fn()
      .mockResolvedValueOnce({
        pages: firstBatch,
        pagination: {
          total: 90,
          hasNextPage: true,
          nextCursor: 'page-36'
        },
        meta: {
          fromCache: true
        }
      })
      .mockResolvedValueOnce({
        pages: secondBatch,
        pagination: {
          total: 90,
          hasNextPage: false,
          nextCursor: null
        },
        meta: {
          fromCache: false
        }
      });
    const { store } = createStore({
      getList
    }, {
      initialFetchLimit: 36,
      prefetchBatchLimit: 100,
      checkForUpdates: vi.fn(async () => ({
        hasUpdates: false,
        latestKnownId: 'page-36'
      }))
    });

    await store.hydrate();
    await vi.waitFor(() => {
      expect(store.getSnapshot().allPages).toHaveLength(90);
    });

    expect(getList).toHaveBeenCalledTimes(2);
    expect(store.getSnapshot().hasNextPage).toBe(false);
  });

  it('merges newer items from the incremental refresh path without a full GET', async () => {
    const cachedPages = makePages(3);
    const getList = vi.fn();
    const getIncrementalList = vi.fn(async () => ({
      pages: makePages(1, 4),
      pagination: {
        total: 4,
        hasNextPage: false,
        nextCursor: null
      },
      meta: {
        fromCache: false
      }
    }));
    const { store } = createStore({
      getList,
      getCachedPages: vi.fn(async () => buildListCachePayload(cachedPages, {
        total: 3,
        hasNextPage: false,
        nextCursor: null
      }, true))
    }, {
      checkForUpdates: vi.fn(async () => ({
        hasUpdates: true,
        anchorFound: true,
        canIncrementalSync: true,
        latestKnownId: 'page-3'
      })),
      getIncrementalList,
      buildIncrementalFetchOptions: newerThanId => ({
        newerThanId,
        skipCache: true
      })
    });

    await store.hydrate();
    await vi.waitFor(() => {
      expect(store.getSnapshot().allPages).toHaveLength(4);
    });

    expect(getIncrementalList).toHaveBeenCalledWith({
      newerThanId: 'page-3',
      skipCache: true
    });
    expect(getList).not.toHaveBeenCalled();
    expect(store.getSnapshot().allPages.map(page => page.id)).toEqual([
      'page-4',
      'page-1',
      'page-2',
      'page-3'
    ]);
  });

  it('uses the top server-ordered item as the update anchor when pinned items sort first', async () => {
    const cachedPages = [
      {
        id: 'unpinned-newer',
        title: 'Unpinned newer',
        url: 'https://example.com/unpinned-newer',
        pinned: false,
        saved_at: '2026-05-17T00:02:00.000Z'
      },
      {
        id: 'pinned-anchor',
        title: 'Pinned anchor',
        url: 'https://example.com/pinned-anchor',
        pinned: true,
        saved_at: '2026-05-17T00:01:00.000Z'
      }
    ];
    const checkForUpdates = vi.fn(async () => ({
      hasUpdates: false
    }));
    const { store } = createStore({
      getList: vi.fn(),
      getCachedPages: vi.fn(async () => buildListCachePayload(cachedPages, {
        total: 2,
        hasNextPage: false,
        nextCursor: null
      }, true))
    }, {
      checkForUpdates,
      buildUpdateCheckOptions: latestKnownId => ({
        pinnedFirst: true,
        sort: 'newest',
        latestKnownId
      })
    });

    await store.hydrate();
    await vi.waitFor(() => {
      expect(checkForUpdates).toHaveBeenCalledTimes(1);
    });

    expect(checkForUpdates).toHaveBeenCalledWith({
      pinnedFirst: true,
      sort: 'newest',
      latestKnownId: 'pinned-anchor'
    }, {
      requestId: expect.any(Number)
    });
  });

  it('persists optimistic local updates', async () => {
    const pages = makePages(3);
    const getList = vi.fn(async () => ({
      pages,
      pagination: {
        total: 3,
        hasNextPage: false,
        nextCursor: null
      },
      meta: {
        fromCache: false
      }
    }));
    const { api, store } = createStore({ getList });

    await store.hydrate();
    await store.updatePage('page-2', page => ({ ...page, pinned: true }));
    await store.removePage('page-1');

    expect(store.getSnapshot().allPages).toHaveLength(2);
    expect(store.getSnapshot().allPages.find(page => page.id === 'page-2')?.pinned).toBe(true);
    expect(api.setCachedPages).toHaveBeenCalled();
  });

  it('keeps stale cache state visible when the background refresh fails', async () => {
    const cachedPages = makePages(2);
    const refreshError = new Error('Network refresh failed');
    const getList = vi.fn().mockRejectedValue(refreshError);
    const { store } = createStore({
      getList,
      getCachedPagesState: vi.fn(async () => ({
        status: 'stale',
        response: buildListCachePayload(cachedPages, {
          total: 2,
          hasNextPage: false,
          nextCursor: null
        }, true),
        error: null,
        ageMs: 360001,
        timestamp: Date.now() - 360001,
        reason: 'expired',
        usable: true
      }))
    });

    const snapshot = await store.hydrate();

    expect(snapshot.warmCacheState.status).toBe('stale');
    expect(snapshot.dataState.status).toBe('stale');
    expect(snapshot.dataState.source).toBe('warm-cache');
    await vi.waitFor(() => {
      expect(store.getSnapshot().refreshState.status).toBe('error');
    });
    expect(store.getSnapshot().refreshState.error).toBe(refreshError);
    expect(store.getSnapshot().allPages.map(page => page.id)).toEqual(['page-1', 'page-2']);
  });

  it('marks empty list state explicitly after a successful empty hydrate', async () => {
    const getList = vi.fn().mockResolvedValue({
      pages: [],
      pagination: {
        total: 0,
        hasNextPage: false,
        nextCursor: null
      },
      meta: {
        fromCache: false
      }
    });
    const { store } = createStore({
      getList,
      getCachedPagesState: vi.fn(async () => ({
        status: 'empty',
        response: null,
        error: null,
        ageMs: null,
        timestamp: null,
        reason: 'missing-entry',
        usable: false
      }))
    });

    const snapshot = await store.hydrate();

    expect(snapshot.warmCacheState.status).toBe('empty');
    expect(snapshot.dataState).toEqual({
      status: 'empty',
      source: 'network',
      error: null
    });
    expect(snapshot.allPages).toEqual([]);
    expect(snapshot.total).toBe(0);
  });
});
