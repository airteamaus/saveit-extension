import { describe, it, expect, vi } from 'vitest';

import { FavoritesStore, buildFavoritesCachePayload } from '../../src/favorites-store.js';

function makePages(count, start = 1) {
  return Array.from({ length: count }, (_, index) => ({
    id: `page-${start + index}`,
    title: `Page ${start + index}`,
    url: `https://example.com/${start + index}`
  }));
}

describe('FavoritesStore', () => {
  it('hydrates from warm cache and keeps older cached pages until fresh paging catches up', async () => {
    const cachedPages = makePages(60);
    const secondBatch = makePages(24, 37);
    const api = {
      isExtension: true,
      getCachedPages: vi.fn(async () => buildFavoritesCachePayload(cachedPages, {
        total: 60,
        hasNextPage: false,
        nextCursor: null
      }, true)),
      setCachedPages: vi.fn(async () => {}),
      getFavorites: vi
        .fn()
        .mockResolvedValueOnce({
          pages: cachedPages.slice(0, 36),
          pagination: {
            total: 60,
            hasNextPage: true,
            nextCursor: 'page-36'
          },
          meta: {
            fromCache: false
          }
        })
        .mockResolvedValueOnce({
          pages: secondBatch,
          pagination: {
            total: 60,
            hasNextPage: false,
            nextCursor: null
          },
          meta: {
            fromCache: false
          }
        })
    };
    const store = new FavoritesStore(api, {
      initialFetchLimit: 36,
      prefetchBatchLimit: 24,
      maxItems: 300,
      warmCacheScope: { surface: 'favorites-prefetch' },
      initialLayout: { pageSize: 30, columns: 10, rows: 3, tileWidth: 88, gridWidth: 1008 }
    });

    await store.hydrate();
    await vi.waitFor(() => {
      expect(api.getFavorites).toHaveBeenCalledTimes(2);
    });
    const snapshot = store.getSnapshot();

    expect(snapshot.allPages).toHaveLength(60);
    expect(snapshot.pagedPages).toHaveLength(2);
    expect(snapshot.hasNextPage).toBe(false);
    expect(snapshot.nextCursor).toBeNull();
  });

  it('prefetches the full local favorites set after the first slice loads', async () => {
    const firstBatch = makePages(36);
    const secondBatch = makePages(24, 37);
    const api = {
      isExtension: true,
      getCachedPages: vi.fn(async () => null),
      setCachedPages: vi.fn(async () => {}),
      getFavorites: vi
        .fn()
        .mockResolvedValueOnce({
          pages: firstBatch,
          pagination: {
            total: 60,
            hasNextPage: true,
            nextCursor: 'page-36'
          },
          meta: {
            fromCache: false
          }
        })
        .mockResolvedValueOnce({
          pages: secondBatch,
          pagination: {
            total: 60,
            hasNextPage: false,
            nextCursor: null
          },
          meta: {
            fromCache: false
          }
        })
    };
    const store = new FavoritesStore(api, {
      initialFetchLimit: 36,
      prefetchBatchLimit: 24,
      maxItems: 300,
      warmCacheScope: { surface: 'favorites-prefetch' },
      initialLayout: { pageSize: 30, columns: 10, rows: 3, tileWidth: 88, gridWidth: 1008 }
    });

    await store.hydrate();
    await vi.waitFor(() => {
      expect(store.getSnapshot().allPages).toHaveLength(60);
    });

    const snapshot = store.getSnapshot();
    expect(snapshot.allPages).toHaveLength(60);
    expect(snapshot.pagedPages[1]).toHaveLength(30);
    expect(snapshot.hasNextPage).toBe(false);
    expect(api.getFavorites).toHaveBeenCalledTimes(2);
  });

  it('navigates using local pages without triggering on-demand fetches', async () => {
    const firstBatch = makePages(30);
    const secondBatch = makePages(30, 31);
    const api = {
      isExtension: false,
      getCachedPages: vi.fn(async () => null),
      setCachedPages: vi.fn(async () => {}),
      getFavorites: vi
        .fn()
        .mockResolvedValueOnce({
          pages: firstBatch,
          pagination: {
            total: 60,
            hasNextPage: true,
            nextCursor: 'page-30'
          },
          meta: {
            fromCache: false
          }
        })
        .mockResolvedValueOnce({
          pages: secondBatch,
          pagination: {
            total: 60,
            hasNextPage: false,
            nextCursor: null
          },
          meta: {
            fromCache: false
          }
        })
    };
    const store = new FavoritesStore(api, {
      initialFetchLimit: 30,
      prefetchBatchLimit: 30,
      maxItems: 300,
      initialLayout: { pageSize: 30, columns: 10, rows: 3, tileWidth: 88, gridWidth: 1008 }
    });

    await store.hydrate();
    await vi.waitFor(() => {
      expect(store.getSnapshot().pagedPages).toHaveLength(2);
    });

    const callCountBeforeNavigation = api.getFavorites.mock.calls.length;
    await store.goToPage(1);

    const snapshot = store.getSnapshot();
    expect(snapshot.currentPage).toBe(1);
    expect(snapshot.pagedPages).toHaveLength(2);
    expect(snapshot.pagedPages[1][0].id).toBe('page-31');
    expect(api.getFavorites).toHaveBeenCalledTimes(callCountBeforeNavigation);
  });
});
