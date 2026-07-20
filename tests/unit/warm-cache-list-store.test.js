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

  it('does not prefetch beyond the initial batch when lazy, but honors explicit loadMore', async () => {
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
    const { store } = createStore({ getList }, { lazy: true });

    await store.hydrate();
    // Give any stray background work a chance, then assert no prefetch happened.
    await new Promise(resolve => setTimeout(resolve, 0));

    expect(store.getSnapshot().allPages).toHaveLength(50);
    expect(getList).toHaveBeenCalledTimes(1);

    // An explicit loadMore (as driven by scroll) still fetches the next batch.
    await store.loadMore();

    expect(store.getSnapshot().allPages).toHaveLength(90);
    expect(getList).toHaveBeenCalledTimes(2);
  });

  it('setLazy(false) makes a lazy store run the full prefetch on hydrate', async () => {
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
    const { store } = createStore({ getList }, { lazy: true });

    store.setLazy(false);
    await store.hydrate();
    await vi.waitFor(() => {
      expect(store.getSnapshot().allPages).toHaveLength(90);
    });

    expect(getList).toHaveBeenCalledTimes(2);
  });

  it('prefetchAllPages resets lazy back to true after completing', async () => {
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
    const { store } = createStore({ getList }, { lazy: true });

    store.setLazy(false);
    await store.hydrate();
    // prefetchAllPages is fire-and-forget from hydrate(); its try/finally is
    // what restores the lazy flag, and that lands strictly after the last page
    // is appended. Poll on the flag itself as the completion signal, then
    // assert coverage.
    await vi.waitFor(() => {
      expect(store.options.lazy).toBe(true);
    });

    // After the warm completes, the lazy flag must be restored so subsequent
    // visits / scroll-driven fetches keep the lazy optimization.
    expect(store.options.lazy).toBe(true);
    expect(store.getSnapshot().allPages).toHaveLength(90);
  });

  it('prefetchAllPages resets lazy to true even on the lazy early-return path', async () => {
    const firstBatch = makePages(50);
    const getList = vi.fn().mockResolvedValueOnce({
      pages: firstBatch,
      pagination: { total: 90, hasNextPage: true, nextCursor: 'page-50' },
      meta: { fromCache: false }
    });
    const { store } = createStore({ getList }, { lazy: true });

    // Leave lazy true; calling prefetchAllPages directly hits the early return.
    await store.prefetchAllPages();

    expect(store.options.lazy).toBe(true);
  });

  it('resets lazy to true even when a loadMore batch rejects mid-warm', async () => {
    const firstBatch = makePages(50);
    const getList = vi
      .fn()
      .mockResolvedValueOnce({
        pages: firstBatch,
        pagination: { total: 90, hasNextPage: true, nextCursor: 'page-50' },
        meta: { fromCache: false }
      })
      .mockRejectedValueOnce(new Error('network down'));

    const { store } = createStore({ getList }, { lazy: true });

    store.setLazy(false);
    await store.hydrate();
    // Wait for the fire-and-forget prefetch to settle (it should reject, not throw
    // synchronously). The lazy flag must be restored regardless.
    await vi.waitFor(() => {
      expect(store.options.lazy).toBe(true);
    });
  });

  it('does not change the lazy flag when setLazy is not called (regression guard)', async () => {
    const firstBatch = makePages(50);
    const getList = vi.fn().mockResolvedValueOnce({
      pages: firstBatch,
      pagination: { total: 90, hasNextPage: true, nextCursor: 'page-50' },
      meta: { fromCache: false }
    });
    const { store } = createStore({ getList }, { lazy: true });

    await store.hydrate();
    await new Promise(resolve => setTimeout(resolve, 0));

    // A lazy store that was never opted out must stay lazy.
    expect(store.options.lazy).toBe(true);
    expect(store.getSnapshot().allPages).toHaveLength(50);
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

// Regression coverage for the Tier 2 refactor (refreshBuffer → refreshSession).
// These pin the contract: a refresh never truncates state.allPages below what's
// already loaded; it only adds/replaces by id, and drops stale entries when the
// refresh chain reaches authoritative coverage.
describe('WarmCacheListStore refresh truncation guarantee', () => {
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
      buildInitialFetchOptions: (overrides = {}) => ({ limit: 50, sort: 'newest', ...overrides }),
      buildLoadMoreFetchOptions: cursor => ({ limit: 100, sort: 'newest', cursor, skipCache: true }),
      ...optionOverrides
    });
    return { api, store };
  }

  // The v1.25.1 bug shape: state momentarily had a small allPages, and the
  // early-return `state.allPages.length <= response.pages.length` branch
  // overwrote a 754-page cache with 50. The refactor makes this structurally
  // impossible: applyResponse always merges by id, which can only grow or
  // replace-by-id.
  it('never truncates a broad state when a refresh arrives with a smaller batch (v1.25.1 regression)', async () => {
    const cachedPages = makePages(754);
    const refreshBatch = makePages(50);
    const { store } = createStore({
      getCachedPages: vi.fn(async () => buildListCachePayload(cachedPages, {
        total: 754,
        hasNextPage: false,
        nextCursor: null
      }, true)),
      getList: vi.fn().mockResolvedValue({
        pages: refreshBatch,
        pagination: { total: 754, hasNextPage: true, nextCursor: 'page-50' },
        meta: { fromCache: false }
      })
    });

    await store.hydrate();
    // The refresh fires fire-and-forget; wait for it to land.
    await vi.waitFor(() => {
      expect(store.getSnapshot().allPages).toHaveLength(754);
    });

    // A refresh must NEVER bring state below the 754 pages already loaded,
    // regardless of how small the response batch is.
    expect(store.getSnapshot().allPages).toHaveLength(754);
  });

  it('never drops below current coverage between batches of a multi-batch refresh', async () => {
    // Seed 100 pages in the warm cache (partial — total is 200); the refresh
    // delivers the full set in 4 batches of 50. Between every batch, state
    // must stay >= the prior floor (the warm cache's 100, then grow only).
    const cachedPages = makePages(100);
    const batches = [
      makePages(50, 1),    // batch 1: overlap with cache
      makePages(50, 51),   // batch 2
      makePages(50, 101),  // batch 3: new territory
      makePages(50, 151)   // batch 4: new territory
    ].map((pages, i) => ({
      pages,
      pagination: {
        total: 200,
        hasNextPage: i < 3,
        nextCursor: i < 3 ? `page-${(i + 1) * 50}` : null
      },
      meta: { fromCache: false }
    }));
    const getList = vi.fn();
    batches.forEach(b => getList.mockResolvedValueOnce(b));
    const { store } = createStore({
      getCachedPages: vi.fn(async () => buildListCachePayload(cachedPages, {
        total: 100,
        hasNextPage: true,
        nextCursor: 'page-100'
      }, true)),
      getList
    });

    const seenLengths = [];
    store.subscribe(() => {
      seenLengths.push(store.getSnapshot().allPages.length);
    });

    await store.hydrate();
    await vi.waitFor(() => {
      expect(getList).toHaveBeenCalledTimes(4);
    });

    // Every emit during the refresh must preserve the 100-page floor from the
    // warm cache; the multi-batch refresh only grows from there.
    expect(seenLengths.every(len => len >= 100)).toBe(true);
    expect(store.getSnapshot().allPages).toHaveLength(200);
  });

  it('keeps a stale entry mid-chain and drops it only when coverage completes', async () => {
    // Cache has 5 pages including page-4; server total drops to 4 (page-4
    // deleted). Batches of 2: [p1,p2], [p3,p5]. page-4 must survive after
    // batch 1 and be dropped only after batch 2 completes coverage.
    const cachedPages = makePages(5);
    // Gate the second batch behind a promise we control, so the mid-chain
    // assertion is deterministic rather than a race against the prefetch loop.
    let releaseBatch2;
    const batch2Promise = new Promise(resolve => { releaseBatch2 = resolve; });
    const getList = vi.fn()
      .mockResolvedValueOnce({
        pages: [cachedPages[0], cachedPages[1]],
        pagination: { total: 4, hasNextPage: true, nextCursor: 'page-2' },
        meta: { fromCache: false }
      })
      .mockImplementationOnce(() => batch2Promise.then(() => ({
        pages: [cachedPages[2], cachedPages[4]],
        pagination: { total: 4, hasNextPage: false, nextCursor: null },
        meta: { fromCache: false }
      })));

    const { store } = createStore({
      getCachedPages: vi.fn(async () => buildListCachePayload(cachedPages, {
        total: 5,
        hasNextPage: false,
        nextCursor: null
      }, true)),
      getList
    }, {
      initialFetchLimit: 2,
      prefetchBatchLimit: 2
    });

    await store.hydrate();
    // Wait for batch 1 to land; batch 2 is held at the gate.
    await vi.waitFor(() => {
      expect(getList).toHaveBeenCalledTimes(2); // initial + first loadMore
    });
    // page-4 is still present mid-chain: coverage hasn't been reached.
    expect(store.getSnapshot().allPages.map(p => p.id)).toContain('page-4');
    expect(store.getSnapshot().allPages).toHaveLength(5);

    // Release batch 2; coverage completes and page-4 is dropped.
    releaseBatch2();
    await vi.waitFor(() => {
      expect(store.getSnapshot().allPages).toHaveLength(4);
    });
    expect(store.getSnapshot().allPages.map(p => p.id)).toEqual([
      'page-1',
      'page-2',
      'page-3',
      'page-5'
    ]);
  });

  it('does not spuriously drop pages when the first batch already covers the total', async () => {
    // 50 cached pages; refresh returns the same 50 with hasNextPage:false.
    // Coverage is reached on batch 1; the seen set is the full 50, so nothing
    // is dropped and hasNextPage ends up false.
    const cachedPages = makePages(50);
    const { store } = createStore({
      getCachedPages: vi.fn(async () => buildListCachePayload(cachedPages, {
        total: 50,
        hasNextPage: false,
        nextCursor: null
      }, true)),
      getList: vi.fn().mockResolvedValue({
        pages: cachedPages,
        pagination: { total: 50, hasNextPage: false, nextCursor: null },
        meta: { fromCache: false }
      })
    });

    await store.hydrate();
    await vi.waitFor(() => {
      expect(store.getSnapshot().allPages).toHaveLength(50);
    });

    expect(store.getSnapshot().hasNextPage).toBe(false);
    expect(store.getSnapshot().allPages.map(p => p.id)).toEqual(
      cachedPages.map(p => p.id)
    );
  });

  it('ignores an applyFreshResponse whose requestId is stale (no session, no mutation)', async () => {
    const cachedPages = makePages(3);
    const { store } = createStore({
      getCachedPages: vi.fn(async () => buildListCachePayload(cachedPages, {
        total: 3,
        hasNextPage: false,
        nextCursor: null
      }, true)),
      getList: vi.fn().mockResolvedValue({
        pages: makePages(50),
        pagination: { total: 50, hasNextPage: true, nextCursor: 'page-50' },
        meta: { fromCache: false }
      })
    });

    await store.hydrate();
    const beforeIds = store.getSnapshot().allPages.map(p => p.id);
    const staleRequestId = store.state.requestId - 999;

    const result = store.applyFreshResponse(
      {
        pages: makePages(5),
        pagination: { total: 5, hasNextPage: false, nextCursor: null }
      },
      { requestId: staleRequestId, preserveExistingCoverage: true }
    );

    expect(result).toBe(false);
    expect(store.refreshSession).toBeNull();
    // state untouched
    expect(store.getSnapshot().allPages.map(p => p.id)).toEqual(beforeIds);
  });

  it('clears refreshSession on reset, applyIncrementalResponse, and setPages', async () => {
    const cachedPages = makePages(20);
    const getList = vi.fn().mockResolvedValue({
      pages: makePages(5),
      pagination: { total: 20, hasNextPage: true, nextCursor: 'page-5' },
      meta: { fromCache: false }
    });
    const { store } = createStore({
      getCachedPages: vi.fn(async () => buildListCachePayload(cachedPages, {
        total: 20,
        hasNextPage: false,
        nextCursor: null
      }, true)),
      getList
    });

    await store.hydrate();
    await vi.waitFor(() => {
      expect(getList).toHaveBeenCalled();
    });

    // Each mutation that begins a new data context must clear any in-flight
    // session so the next refresh starts from a clean accumulator.
    store.refreshSession = { requestId: store.state.requestId, accumulatedPages: [], total: null, hasNextPage: false, nextCursor: null };
    store.reset({ emit: false });
    expect(store.refreshSession).toBeNull();

    store.refreshSession = { requestId: store.state.requestId, accumulatedPages: [], total: null, hasNextPage: false, nextCursor: null };
    await store.setPages(makePages(2), { total: 2, hasNextPage: false, nextCursor: null });
    expect(store.refreshSession).toBeNull();

    store.refreshSession = { requestId: store.state.requestId, accumulatedPages: [], total: null, hasNextPage: false, nextCursor: null };
    store.applyIncrementalResponse(
      { pages: makePages(1, 100), pagination: { total: 1, hasNextPage: false, nextCursor: null } },
      { requestId: store.state.requestId }
    );
    expect(store.refreshSession).toBeNull();
  });
});
