import { SAVED_PAGES_CACHE_PREFIX, DOMAINS_CACHE_PREFIX } from './cache-keys.js';

export function getSavedPagesCacheKeys(storageEntries = {}) {
  return Object.keys(storageEntries).filter(key => (
    key === SAVED_PAGES_CACHE_PREFIX || key.startsWith(`${SAVED_PAGES_CACHE_PREFIX}_`)
  ));
}

function getCacheKeysForPrefix(storageEntries, prefix) {
  return Object.keys(storageEntries).filter(key => (
    key === prefix || key.startsWith(`${prefix}_`)
  ));
}

export async function invalidateSavedPagesCacheStorage(storage) {
  if (!storage?.get || !storage?.remove) {
    return 0;
  }

  const storageEntries = await storage.get(null);
  const cacheKeys = getSavedPagesCacheKeys(storageEntries);
  if (cacheKeys.length > 0) {
    await storage.remove(cacheKeys);
  }

  return cacheKeys.length;
}

// Mark every savedPages_cache_* entry stale without deleting the cached pages.
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
// background. The hard-remove path (invalidateSavedPagesCacheStorage) stays
// available for callers that genuinely need to drop the data (sign-out,
// forceReload, imports).
export async function markSavedPagesCacheStale(storage) {
  if (!storage?.get || !storage?.set) {
    return 0;
  }

  const storageEntries = await storage.get(null);
  const cacheKeys = getSavedPagesCacheKeys(storageEntries);
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

// Storage-direct invalidation for the domains surface. The toolbar save path
// (background.js) doesn't load the full API facade, so it can't call
// API.invalidateDomainsCache(); this helper gives it the same narrow-scope
// eviction via storage.local directly. A new save can shift domain counts, so
// the toolbar save and realtime-enrichment relay invalidate both surfaces.
export async function invalidateDomainsCacheStorage(storage) {
  if (!storage?.get || !storage?.remove) {
    return 0;
  }

  const storageEntries = await storage.get(null);
  const cacheKeys = getCacheKeysForPrefix(storageEntries, DOMAINS_CACHE_PREFIX);
  if (cacheKeys.length > 0) {
    await storage.remove(cacheKeys);
  }

  return cacheKeys.length;
}

// Mark every domains_cache_* entry stale without deleting the cached data.
// Mirrors markSavedPagesCacheStale for the domains surface — a save can shift
// domain counts, but the existing list is still useful as a fast first paint
// until the background refresh reconciles.
export async function markDomainsCacheStale(storage) {
  if (!storage?.get || !storage?.set) {
    return 0;
  }

  const storageEntries = await storage.get(null);
  const cacheKeys = getCacheKeysForPrefix(storageEntries, DOMAINS_CACHE_PREFIX);
  if (cacheKeys.length === 0) {
    return 0;
  }

  const patch = {};
  for (const key of cacheKeys) {
    const entry = storageEntries[key];
    if (entry && typeof entry === 'object' && 'response' in entry) {
      patch[key] = { ...entry, timestamp: 0 };
    }
  }

  if (Object.keys(patch).length > 0) {
    await storage.set(patch);
  }
  return Object.keys(patch).length;
}

// Mark every surface cache the toolbar save path can affect stale, without
// deleting the cached data. Use this on the common save + realtime-enrichment
// relay paths so a save between newtab sessions doesn't destroy the warm cache
// (which forces the next newtab to repaint from a 50-page initial fetch).
// Hard-remove callers (sign-out, forceReload, imports) use the surface-specific
// invalidateSavedPagesCacheStorage / invalidateDomainsCacheStorage helpers
// directly, since they need to drop the data rather than mark it stale.
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
