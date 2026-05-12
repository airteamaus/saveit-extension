const SAVED_PAGES_CACHE_PREFIX = 'savedPages_cache';

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
