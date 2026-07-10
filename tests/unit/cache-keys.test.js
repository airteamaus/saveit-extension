import { describe, it, expect } from 'vitest';
import {
  SAVED_PAGES_CACHE_PREFIX,
  PROJECTS_CACHE_PREFIX,
  migrateProjectsCacheKeys
} from '../../src/cache-keys.js';

function makeStorage(entries) {
  const data = { ...entries };
  return {
    get: async (key) => (key === null ? { ...data } : { [key]: data[key] }),
    remove: async (keys) => {
      for (const k of (Array.isArray(keys) ? keys : [keys])) delete data[k];
    },
    _data: data
  };
}

describe('cache-keys constants', () => {
  it('exports distinct prefixes for each surface', () => {
    expect(SAVED_PAGES_CACHE_PREFIX).toBe('savedPages_cache');
    expect(PROJECTS_CACHE_PREFIX).toBe('projects_cache');
    expect(SAVED_PAGES_CACHE_PREFIX).not.toBe(PROJECTS_CACHE_PREFIX);
  });
});

describe('migrateProjectsCacheKeys', () => {
  it('removes stale projects keys written under the savedPages prefix', async () => {
    const storage = makeStorage({
      'savedPages_cache_user1_surface%3Dprojects': { response: [] },
      'savedPages_cache_user1_surface%3Ddashboard': { response: [] },
      'projects_cache_user1_surface%3Dprojects': { response: [] }
    });

    const removed = await migrateProjectsCacheKeys(storage);

    expect(removed).toBe(1);
    expect(storage._data['savedPages_cache_user1_surface%3Dprojects']).toBeUndefined();
    // Legitimate saved-pages keys must survive.
    expect(storage._data['savedPages_cache_user1_surface%3Ddashboard']).toBeDefined();
    // New-namespace keys are untouched.
    expect(storage._data['projects_cache_user1_surface%3Dprojects']).toBeDefined();
  });

  it('is a no-op when no stale keys exist', async () => {
    const storage = makeStorage({
      'projects_cache_user1_surface%3Dprojects': {},
      'savedPages_cache_user1_surface%3Ddashboard': {}
    });

    const removed = await migrateProjectsCacheKeys(storage);

    expect(removed).toBe(0);
  });

  it('returns 0 when storage is unavailable', async () => {
    expect(await migrateProjectsCacheKeys(null)).toBe(0);
    expect(await migrateProjectsCacheKeys({})).toBe(0);
  });
});
