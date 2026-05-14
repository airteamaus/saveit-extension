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
});
