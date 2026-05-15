import { describe, expect, it } from 'vitest';

import {
  getSavedPagesCacheKeys,
  invalidateSavedPagesCacheStorage,
  isSavedPagesCacheInvalidation
} from '../../src/saved-pages-cache.js';

describe('saved-pages cache sync', () => {
  it('detects saved pages cache removals', () => {
    const changes = {
      'savedPages_cache_user123_surface%3Ddashboard': {
        oldValue: { response: { pages: [] } },
        newValue: undefined
      }
    };

    expect(isSavedPagesCacheInvalidation(changes, 'local')).toBe(true);
  });

  it('ignores saved pages cache writes', () => {
    const changes = {
      'savedPages_cache_user123_surface%3Ddashboard': {
        oldValue: undefined,
        newValue: { response: { pages: [] } }
      }
    };

    expect(isSavedPagesCacheInvalidation(changes, 'local')).toBe(false);
  });

  it('ignores unrelated storage changes', () => {
    const changes = {
      theme_preference: {
        oldValue: 'dark',
        newValue: undefined
      }
    };

    expect(isSavedPagesCacheInvalidation(changes, 'local')).toBe(false);
    expect(isSavedPagesCacheInvalidation(changes, 'sync')).toBe(false);
  });

  it('finds all saved pages cache keys in storage data', () => {
    const keys = getSavedPagesCacheKeys({
      theme_preference: 'dark',
      savedPages_cache_user123: {},
      'savedPages_cache_user123_surface%3Ddashboard': {}
    });

    expect(keys).toEqual([
      'savedPages_cache_user123',
      'savedPages_cache_user123_surface%3Ddashboard'
    ]);
  });

  it('invalidates saved pages cache keys through shared storage helper', async () => {
    const removedKeys = [];
    const storage = {
      get: async () => ({
        theme_preference: 'dark',
        savedPages_cache_user123: {},
        'savedPages_cache_user123_surface%3Ddashboard': {}
      }),
      remove: async (keys) => {
        removedKeys.push(...keys);
      }
    };

    const removedCount = await invalidateSavedPagesCacheStorage(storage);

    expect(removedCount).toBe(2);
    expect(removedKeys).toEqual([
      'savedPages_cache_user123',
      'savedPages_cache_user123_surface%3Ddashboard'
    ]);
  });
});
