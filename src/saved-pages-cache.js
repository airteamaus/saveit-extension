import { SAVED_PAGES_CACHE_PREFIX } from './cache-keys.js';

export function getSavedPagesCacheKeys(storageEntries = {}) {
  return Object.keys(storageEntries).filter(key => (
    key === SAVED_PAGES_CACHE_PREFIX || key.startsWith(`${SAVED_PAGES_CACHE_PREFIX}_`)
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
