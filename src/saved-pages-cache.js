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

// Invalidate every surface cache the toolbar save path can affect: a new save
// appears in saved pages and can shift domain counts. Projects are unaffected
// (a save without a projectId doesn't change project membership). Returns the
// total number of keys removed across surfaces.
export async function invalidateToolbarSaveCaches(storage) {
  const [savedPagesCount, domainsCount] = await Promise.all([
    invalidateSavedPagesCacheStorage(storage),
    invalidateDomainsCacheStorage(storage)
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
