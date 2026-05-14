function getSessionStorage() {
  try {
    return globalThis.sessionStorage || null;
  } catch {
    return null;
  }
}

function createCacheEntry(response) {
  return {
    response,
    updatedAt: Date.now()
  };
}

export class SearchResultsStore {
  constructor(api, options = {}) {
    this.api = api;
    this.storageKey = options.storageKey || 'saveit_search_results_cache';
    this.maxEntries = options.maxEntries || 30;
    this.storage = options.storage || getSessionStorage();
    this.cache = this.readCache();
  }

  resolveApi() {
    return typeof this.api === 'function' ? this.api() : this.api;
  }

  buildKey(query, options = {}) {
    return JSON.stringify({
      query,
      limit: options.limit || 50,
      offset: options.offset || 0,
      threshold: options.threshold || 0
    });
  }

  readCache() {
    if (!this.storage) {
      return new Map();
    }

    try {
      const rawValue = this.storage.getItem(this.storageKey);
      if (!rawValue) {
        return new Map();
      }

      const parsed = JSON.parse(rawValue);
      return new Map(Array.isArray(parsed) ? parsed : []);
    } catch {
      return new Map();
    }
  }

  writeCache() {
    if (!this.storage) {
      return;
    }

    try {
      this.storage.setItem(this.storageKey, JSON.stringify(Array.from(this.cache.entries())));
    } catch {
      // Ignore cache persistence failures and continue with in-memory cache.
    }
  }

  trimCache() {
    if (this.cache.size <= this.maxEntries) {
      return;
    }

    const oldestEntries = [...this.cache.entries()]
      .sort((a, b) => (a[1]?.updatedAt || 0) - (b[1]?.updatedAt || 0))
      .slice(0, this.cache.size - this.maxEntries);

    oldestEntries.forEach(([key]) => this.cache.delete(key));
  }

  getCachedResponse(query, options = {}) {
    const cacheEntry = this.cache.get(this.buildKey(query, options));
    if (!cacheEntry?.response) {
      return null;
    }

    return {
      ...cacheEntry.response,
      meta: {
        ...(cacheEntry.response.meta || {}),
        fromCache: true
      }
    };
  }

  setCachedResponse(query, options = {}, response) {
    if (!response) {
      return;
    }

    this.cache.set(this.buildKey(query, options), createCacheEntry(response));
    this.trimCache();
    this.writeCache();
  }

  clear() {
    this.cache.clear();

    if (!this.storage) {
      return;
    }

    try {
      this.storage.removeItem(this.storageKey);
    } catch {
      // Ignore storage cleanup failures.
    }
  }

  async search(query, options = {}) {
    const api = this.resolveApi();
    if (!api?.searchContent) {
      throw new Error('Search not available. Please sign in.');
    }

    if (!options.skipCache) {
      const cachedResponse = this.getCachedResponse(query, options);
      if (cachedResponse) {
        return cachedResponse;
      }
    }

    const response = await api.searchContent(query, options);
    this.setCachedResponse(query, options, {
      ...response,
      meta: {
        ...(response.meta || {}),
        fromCache: false
      }
    });
    return {
      ...response,
      meta: {
        ...(response.meta || {}),
        fromCache: false
      }
    };
  }
}
