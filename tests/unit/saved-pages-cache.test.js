import { describe, expect, it } from 'vitest';

import {
  getSavedPagesCacheKeys,
  invalidateSavedPagesCacheStorage,
  isSavedPagesCacheInvalidation,
  markSavedPagesCacheStale,
  markToolbarSaveCachesStale
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

  describe('markSavedPagesCacheStale', () => {
    // The fix for the "cache truncates to 50 after every save" bug: marking
    // stale must preserve response.pages and only reset the timestamp. It must
    // NOT call storage.remove (which destroys the warm cache that lazily-grown
    // scroll pagination built up).
    it('preserves cached pages and resets only the timestamp', async () => {
      const originalEntry = {
        userId: 'user123',
        response: { pages: [{ id: 'p1' }, { id: 'p2' }], pagination: { total: 250 } },
        timestamp: Date.now()
      };
      const stored = {
        'savedPages_cache_user123_surface%3Dsaved-pages-drawer': originalEntry
      };
      const removedKeys = [];
      const setPatches = [];
      const storage = {
        get: async () => ({ ...stored }),
        set: async (patch) => { setPatches.push(patch); },
        remove: async (keys) => { removedKeys.push(...keys); }
      };

      const markedCount = await markSavedPagesCacheStale(storage);

      expect(markedCount).toBe(1);
      expect(removedKeys).toEqual([]);
      expect(setPatches).toHaveLength(1);
      const patch = setPatches[0];
      const patchedKey = 'savedPages_cache_user123_surface%3Dsaved-pages-drawer';
      expect(patchedKey in patch).toBe(true);
      expect(patch[patchedKey].timestamp).toBe(0);
      // pages must survive — this is the entire point of the fix
      expect(patch[patchedKey].response.pages).toEqual([
        { id: 'p1' }, { id: 'p2' }
      ]);
      expect(patch[patchedKey].response.pagination.total).toBe(250);
      expect(patch[patchedKey].userId).toBe('user123');
    });

    it('skips entries that do not carry a response', async () => {
      const stored = {
        // Malformed/legacy entry without a `response` — must be left alone.
        'savedPages_cache_user123_legacy': { userId: 'user123' }
      };
      const setPatches = [];
      const storage = {
        get: async () => ({ ...stored }),
        set: async (patch) => { setPatches.push(patch); }
      };

      const markedCount = await markSavedPagesCacheStale(storage);

      expect(markedCount).toBe(0);
      expect(setPatches).toEqual([]);
    });

    it('returns 0 when no saved-pages cache keys exist', async () => {
      const setPatches = [];
      const storage = {
        get: async () => ({ unrelated_key: 'value' }),
        set: async (patch) => { setPatches.push(patch); }
      };

      const markedCount = await markSavedPagesCacheStale(storage);

      expect(markedCount).toBe(0);
      expect(setPatches).toEqual([]);
    });

    it('is a no-op when storage lacks set', async () => {
      const storage = { get: async () => ({}) };

      const markedCount = await markSavedPagesCacheStale(storage);

      expect(markedCount).toBe(0);
    });
  });

  describe('markToolbarSaveCachesStale', () => {
    it('marks both saved-pages and domains surfaces stale, without removing', async () => {
      const stored = {
        'savedPages_cache_user123_surface%3Dsaved-pages-drawer': {
          userId: 'user123',
          response: { pages: [{ id: 'p1' }], pagination: { total: 250 } },
          timestamp: Date.now()
        },
        'domains_cache_user123_surface%3Ddomains': {
          userId: 'user123',
          response: { pages: [{ id: 'd1' }] },
          timestamp: Date.now()
        }
      };
      const removedKeys = [];
      const setPatches = [];
      const storage = {
        get: async () => ({ ...stored }),
        set: async (patch) => { setPatches.push(patch); },
        remove: async (keys) => { removedKeys.push(...keys); }
      };

      const markedCount = await markToolbarSaveCachesStale(storage);

      expect(markedCount).toBe(2);
      expect(removedKeys).toEqual([]);
      expect(setPatches).toHaveLength(2);
      // saved-pages surface should be in one of the patches
      const allPatchedKeys = new Set(setPatches.flatMap(p => Object.keys(p)));
      expect(allPatchedKeys.has('savedPages_cache_user123_surface%3Dsaved-pages-drawer')).toBe(true);
      expect(allPatchedKeys.has('domains_cache_user123_surface%3Ddomains')).toBe(true);
    });

    // Critical regression guard: the observer must NOT match a staleness-write.
    // isSavedPagesCacheInvalidation returns true only when newValue is undefined
    // (a hard remove). A staleness-write has newValue set, so the observer
    // ignores it — which is exactly why mark-stale avoids the truncating
    // hydrate() that a hard remove triggers in open newtabs.
    it('a staleness-write does not satisfy isSavedPagesCacheInvalidation', async () => {
      const stored = {
        'savedPages_cache_user123_surface%3Dsaved-pages-drawer': {
          userId: 'user123',
          response: { pages: [{ id: 'p1' }], pagination: { total: 250 } },
          timestamp: Date.now()
        }
      };
      let latestSnapshot = null;
      const storage = {
        get: async () => ({ ...stored }),
        set: async (patch) => { latestSnapshot = { ...stored, ...patch }; },
        // Simulate storage.onChanged firing after the set: the change record
        // carries newValue (a write), not undefined (a remove).
        onChangedFires: () => {
          const key = 'savedPages_cache_user123_surface%3Dsaved-pages-drawer';
          const newValue = latestSnapshot?.[key];
          const changes = { [key]: { oldValue: stored[key], newValue } };
          return isSavedPagesCacheInvalidation(changes, 'local');
        }
      };

      await markSavedPagesCacheStale(storage);
      expect(storage.onChangedFires()).toBe(false);
    });
  });
});
