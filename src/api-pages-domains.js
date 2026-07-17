// api-pages-domains.js - Domains list API method for the sidebar Domains section.
//
// Adds getDomains() to the shared API facade. Domains are read-only (derived
// from saved pages server-side), so there's no CRUD — just a cached list fetch.

import { getStandaloneDomains } from './api-pages-standalone.js';

function buildDomainsCacheScope() {
  return { surface: 'domains' };
}

function withDomainsCacheMetadata(domains, fromCache) {
  Object.defineProperty(domains, 'meta', {
    value: { fromCache },
    configurable: true,
    enumerable: false,
    writable: true
  });

  return domains;
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
        return this._executeWithErrorHandling(
          async () => {
            const cacheScope = buildDomainsCacheScope();
            if (!options.skipCache) {
              const cached = await this.getDomainsCachedPages(cacheScope);
              if (cached) {
                return withDomainsCacheMetadata(cached, true);
              }
            }

            const response = await this._fetchWithAuth('', { domains: 'true' });
            const domains = Array.isArray(response?.domains) ? response.domains : [];
            await this.setDomainsCachedPages(domains, cacheScope);
            return withDomainsCacheMetadata(domains, false);
          },
          'getDomains',
          { options }
        );
      }

      return withDomainsCacheMetadata(getStandaloneDomains(options), false);
    }
  });

  return API;
}
