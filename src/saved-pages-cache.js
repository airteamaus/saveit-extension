import { SAVED_PAGES_CACHE_PREFIX, DOMAINS_CACHE_PREFIX } from './cache-keys.js';

// All cache surfaces share the same storage.local key shape:
// `<prefix>` or `<prefix>_<userId>_<serializedScope>`. These helpers take a
// prefix and operate on every key that matches it, so adding a new surface is
// just a new prefix constant — no per-surface duplication.

function getCacheKeysForPrefix(storageEntries, prefix) {
  return Object.keys(storageEntries).filter(key => (
    key === prefix || key.startsWith(`${prefix}_`)
  ));
}

export function getSavedPagesCacheKeys(storageEntries = {}) {
  return getCacheKeysForPrefix(storageEntries, SAVED_PAGES_CACHE_PREFIX);
}

// Hard-remove every key for a prefix. Used by callers that genuinely need to
// drop the data: sign-out, forceReload, imports. The toolbar save + realtime
// relay paths use markCacheStale instead so they don't destroy the warm cache
// (see markCacheStale for why).
async function removeCacheKeysForPrefix(storage, prefix) {
  if (!storage?.get || !storage?.remove) {
    return 0;
  }

  const storageEntries = await storage.get(null);
  const cacheKeys = getCacheKeysForPrefix(storageEntries, prefix);
  if (cacheKeys.length > 0) {
    await storage.remove(cacheKeys);
  }

  return cacheKeys.length;
}

// Mark every entry for a prefix stale without deleting the cached pages.
//
// The toolbar save path used to hard-remove these keys, which destroyed the
// warm cache (often hundreds of pages, lazily grown via scroll-driven loadMore)
// whenever no newtab was open to observe the invalidation. The next newtab
// then fell through to the network path and wrote back only the initial
// 50-page batch — so users saw ~43 pages instead of hundreds after every save.
//
// Setting `timestamp: 0` makes getCachedPagesState return status 'stale'
// (ageMs >> CACHE_MAX_AGE_MS) while keeping `response.pages` intact. The
// warm-cache reader passes allowExpired: true, so the next newtab paints the
// full cached list instantly and runs refreshInitial() to reconcile in the
// background.
async function markCacheStaleForPrefix(storage, prefix) {
  if (!storage?.get || !storage?.set) {
    return 0;
  }

  const storageEntries = await storage.get(null);
  const cacheKeys = getCacheKeysForPrefix(storageEntries, prefix);
  if (cacheKeys.length === 0) {
    return 0;
  }

  const patch = {};
  for (const key of cacheKeys) {
    const entry = storageEntries[key];
    // Only touch entries that actually carry a cached response. Legacy or
    // malformed entries get left alone — they'll be cleared by their owners.
    if (entry && typeof entry === 'object' && 'response' in entry) {
      patch[key] = { ...entry, timestamp: 0 };
    }
  }

  if (Object.keys(patch).length > 0) {
    await storage.set(patch);
  }
  return Object.keys(patch).length;
}

// Public surface-specific wrappers. Kept as named exports so callers read
// clearly at the call site ("mark the saved-pages cache stale") rather than
// passing a prefix string.
export const invalidateSavedPagesCacheStorage = storage =>
  removeCacheKeysForPrefix(storage, SAVED_PAGES_CACHE_PREFIX);

export const markSavedPagesCacheStale = storage =>
  markCacheStaleForPrefix(storage, SAVED_PAGES_CACHE_PREFIX);

export const markDomainsCacheStale = storage =>
  markCacheStaleForPrefix(storage, DOMAINS_CACHE_PREFIX);

// Mark every surface cache the toolbar save path can affect stale, without
// deleting the cached data. Use this on the common save + realtime-enrichment
// relay paths so a save between newtab sessions doesn't destroy the warm cache
// (which forces the next newtab to repaint from a 50-page initial fetch).
// Returns the total number of keys marked stale.
export async function markToolbarSaveCachesStale(storage) {
  const [savedPagesCount, domainsCount] = await Promise.all([
    markSavedPagesCacheStale(storage),
    markDomainsCacheStale(storage)
  ]);
  return savedPagesCount + domainsCount;
}

export function isSavedPagesCacheInvalidation(changes, areaName) {
  if (areaName !== 'local' || !changes || typeof changes !== 'object') {
    return false;
  }

  return Object.entries(changes).some(([key, change]) => {
    if (key !== SAVED_PAGES_CACHE_PREFIX && !key.startsWith(`${SAVED_PAGES_CACHE_PREFIX}_`)) {
      return false;
    }

    return change?.newValue === undefined;
  });
}
