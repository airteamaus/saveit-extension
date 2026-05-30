import { describe, it, expect, vi } from 'vitest';

import { SavedPagesStore } from '../../src/saved-pages-store.js';

function makePages(count, start = 1) {
  return Array.from({ length: count }, (_, index) => ({
    id: `page-${start + index}`,
    title: `Page ${start + index}`,
    url: `https://example.com/${start + index}`
  }));
}

function buildCachePayload(pages, pagination, fromCache = false) {
  return {
    pages,
    pagination: {
      total: pagination?.total ?? pages.length,
      hasNextPage: pagination?.hasNextPage === true,
      nextCursor: pagination?.nextCursor || null
    },
    meta: {
      fromCache
    }
  };
}

describe('SavedPagesStore', () => {
  it('keeps the full warm cache when the initial refresh only returns the first slice', async () => {
    const cachedPages = makePages(120);
    const api = {
      isExtension: true,
      getCachedPages: vi.fn(async () => buildCachePayload(cachedPages, {
        total: 120,
        hasNextPage: false,
        nextCursor: null
      }, true)),
      setCachedPages: vi.fn(async () => {}),
      getSavedPages: vi.fn().mockResolvedValue({
        pages: cachedPages.slice(0, 50),
        pagination: {
          total: 120,
          hasNextPage: true,
          nextCursor: 'page-50'
        },
        meta: {
          fromCache: false
        }
      })
    };
    const store = new SavedPagesStore(api, {
      initialFetchLimit: 50,
      prefetchBatchLimit: 100,
      warmCacheScope: { surface: 'saved-pages-drawer' }
    });

    await store.hydrate();
    await vi.waitFor(() => {
      expect(api.getSavedPages).toHaveBeenCalledTimes(1);
    });

    const snapshot = store.getSnapshot();
    expect(snapshot.allPages).toHaveLength(120);
    expect(snapshot.hasNextPage).toBe(false);
    expect(api.setCachedPages.mock.calls.at(-1)[0].pages).toHaveLength(120);
  });

  it('prefetches all pages after the initial slice when no warm cache exists', async () => {
    const firstBatch = makePages(50);
    const secondBatch = makePages(40, 51);
    const api = {
      isExtension: true,
      getCachedPages: vi.fn(async () => null),
      setCachedPages: vi.fn(async () => {}),
      getSavedPages: vi
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
        })
    };
    const store = new SavedPagesStore(api, {
      initialFetchLimit: 50,
      prefetchBatchLimit: 100,
      warmCacheScope: { surface: 'saved-pages-drawer' }
    });

    await store.hydrate();
    await vi.waitFor(() => {
      expect(store.getSnapshot().allPages).toHaveLength(90);
    });

    expect(api.getSavedPages).toHaveBeenCalledTimes(2);
    expect(store.getSnapshot().hasNextPage).toBe(false);
  });

  it('persists optimistic local mutations back into the warm cache', async () => {
    const pages = makePages(3);
    const api = {
      isExtension: true,
      getCachedPages: vi.fn(async () => null),
      setCachedPages: vi.fn(async () => {}),
      getSavedPages: vi.fn(async () => ({
        pages,
        pagination: {
          total: 3,
          hasNextPage: false,
          nextCursor: null
        },
        meta: {
          fromCache: false
        }
      }))
    };
    const store = new SavedPagesStore(api, {
      initialFetchLimit: 50,
      prefetchBatchLimit: 100,
      warmCacheScope: { surface: 'saved-pages-drawer' }
    });

    await store.hydrate();
    await store.updatePage('page-2', page => ({ ...page, pinned: true }));
    await store.removePage('page-1');

    const snapshot = store.getSnapshot();
    expect(snapshot.allPages).toHaveLength(2);
    expect(snapshot.allPages.find(page => page.id === 'page-2')?.pinned).toBe(true);
    expect(api.setCachedPages).toHaveBeenCalled();
  });

  it('supports pinned-first canonical loads when requested', async () => {
    const api = {
      isExtension: true,
      getCachedPages: vi.fn(async () => null),
      setCachedPages: vi.fn(async () => {}),
      getSavedPages: vi.fn(async () => ({
        pages: makePages(2),
        pagination: {
          total: 2,
          hasNextPage: false,
          nextCursor: null
        },
        meta: {
          fromCache: false
        }
      }))
    };
    const store = new SavedPagesStore(api, {
      initialFetchLimit: 50,
      prefetchBatchLimit: 100,
      pinnedFirst: true,
      warmCacheScope: { surface: 'saved-pages-drawer', pinnedFirst: true }
    });

    await store.hydrate();

    expect(api.getSavedPages).toHaveBeenCalledWith({
      limit: 50,
      sort: 'newest',
      pinnedFirst: true
    });
  });
});
