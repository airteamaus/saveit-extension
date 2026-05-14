import { describe, it, expect, vi } from 'vitest';

import { SearchResultsStore } from '../../src/search-results-store.js';

function createStorage() {
  const data = new Map();
  return {
    getItem: vi.fn((key) => data.get(key) || null),
    setItem: vi.fn((key, value) => {
      data.set(key, value);
    }),
    removeItem: vi.fn((key) => {
      data.delete(key);
    })
  };
}

describe('SearchResultsStore', () => {
  it('returns cached results for repeated searches in the same session', async () => {
    const api = {
      searchContent: vi.fn(async () => ({
        results: [{ thing_id: '1' }],
        pagination: { total: 1 }
      }))
    };
    const storage = createStorage();
    const store = new SearchResultsStore(api, { storage });

    const firstResponse = await store.search('test', { limit: 20, offset: 0, threshold: 0.58 });
    const secondResponse = await store.search('test', { limit: 20, offset: 0, threshold: 0.58 });

    expect(api.searchContent).toHaveBeenCalledTimes(1);
    expect(firstResponse.meta.fromCache).toBe(false);
    expect(secondResponse.meta.fromCache).toBe(true);
  });

  it('keeps cache entries separated by offset', async () => {
    const api = {
      searchContent: vi
        .fn()
        .mockResolvedValueOnce({
          results: [{ thing_id: '1' }],
          pagination: { total: 2 }
        })
        .mockResolvedValueOnce({
          results: [{ thing_id: '2' }],
          pagination: { total: 2 }
        })
    };
    const storage = createStorage();
    const store = new SearchResultsStore(api, { storage });

    await store.search('test', { limit: 20, offset: 0, threshold: 0.58 });
    await store.search('test', { limit: 20, offset: 20, threshold: 0.58 });

    expect(api.searchContent).toHaveBeenCalledTimes(2);
  });

  it('restores cached entries from session storage', async () => {
    const storage = createStorage();
    const seededStore = new SearchResultsStore({
      searchContent: vi.fn(async () => ({
        results: [{ thing_id: '1' }],
        pagination: { total: 1 }
      }))
    }, { storage });

    await seededStore.search('test', { limit: 20, offset: 0, threshold: 0.58 });

    const api = {
      searchContent: vi.fn(async () => ({
        results: [{ thing_id: 'new' }],
        pagination: { total: 1 }
      }))
    };
    const restoredStore = new SearchResultsStore(api, { storage });
    const response = await restoredStore.search('test', { limit: 20, offset: 0, threshold: 0.58 });

    expect(api.searchContent).not.toHaveBeenCalled();
    expect(response.meta.fromCache).toBe(true);
    expect(response.results[0].thing_id).toBe('1');
  });
});
