// api-pages-domains.js - Domains list API method for the sidebar Domains section.
//
// Adds getDomains() to the shared API facade. Domains are read-only (derived
// from saved pages server-side), so there's no CRUD — just a cached list fetch.

import { getStandaloneDomains } from './api-pages-standalone.js';

function buildDomainsCacheScope() {
  return { surface: 'domains' };
}

export function applyApiDomains(API) {
  Object.assign(API, {
    /**
     * Fetch the user's distinct domains with page counts.
     * @param {object} [options]
     * @param {boolean} [options.skipCache] - Bypass the cache.
     * @returns {Promise<Array<{domain: string, count: number}>>}
     */
    async getDomains(options = {}) {
      if (this.isExtension) {
        return this._getCachedOrFreshList({
          cacheScope: buildDomainsCacheScope(),
          readCache: (scope) => this.getDomainsCachedPages(scope),
          writeCache: (value, scope) => this.setDomainsCachedPages(value, scope),
          fetcher: () => this._fetchWithAuth('', { domains: 'true' }),
          normalize: (response) => Array.isArray(response?.domains) ? response.domains : [],
          mockFetcher: getStandaloneDomains,
          context: 'getDomains',
          options
        });
      }

      return this._withCacheMetadata(getStandaloneDomains(options), false);
    }
  });

  return API;
}
