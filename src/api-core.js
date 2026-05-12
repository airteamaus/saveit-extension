// api-core.js - Core API runtime, auth, transport, and cache helpers

function applyApiCore(API) {
  API._cacheManager = null;

  Object.defineProperty(API, 'cacheManager', {
    configurable: true,
    enumerable: true,
    get() {
      if (!this._cacheManager && this.isExtension) {
        this._cacheManager = new globalThis.CacheManager_Export(
          () => this.getCurrentUserId(),
          () => this.getStorage()
        );
      }
      return this._cacheManager;
    }
  });

  Object.defineProperty(API, 'isExtension', {
    configurable: true,
    enumerable: true,
    get() {
      return globalThis.getBrowserRuntime() !== null && globalThis.getStorageAPI() !== null;
    }
  });

  Object.assign(API, {
    getCurrentUserId() {
      if (!this.isExtension || !window.firebaseAuth) {
        return null;
      }
      const user = window.firebaseAuth.currentUser;
      return user ? user.uid : null;
    },

    getStorage() {
      return globalThis.getStorageAPI();
    },

    _buildListCacheScope(surface, options = {}) {
      return {
        surface,
        limit: options.limit,
        sort: options.sort || 'newest',
        pinnedFirst: options.pinnedFirst,
        search: options.search || '',
        cursor: options.cursor || null,
        projectId: options.projectId || null
      };
    },

    _withCacheMetadata(response, fromCache) {
      return {
        ...response,
        meta: {
          ...(response.meta || {}),
          fromCache
        }
      };
    },

    async parseErrorResponse(response) {
      try {
        const data = await response.json();
        return data.message || data.error || `HTTP ${response.status}`;
      } catch {
        if (typeof response.text === 'function') {
          try {
            const text = (await response.text()).trim();
            if (text) {
              return text;
            }
          } catch {
            // Fall through to status text fallback.
          }
        }
        return response.statusText || `HTTP ${response.status}`;
      }
    },

    async getIdToken() {
      if (this.isExtension) {
        if (window.firebaseReady) {
          await window.firebaseReady;
        }

        if (!window.firebaseAuth) {
          throw new Error('Firebase not initialized');
        }

        const user = window.firebaseAuth.currentUser;
        if (!user) {
          throw new Error('No user signed in');
        }

        if (!window.firebaseGetIdToken) {
          throw new Error('getIdToken not available');
        }

        return await window.firebaseGetIdToken(user);
      }

      return null;
    },

    async getCachedPages(scope = {}) {
      if (!this.isExtension) return null;
      return await this.cacheManager.getCachedPages(scope);
    },

    async setCachedPages(response, scope = {}) {
      if (!this.isExtension) return;
      return await this.cacheManager.setCachedPages(response, scope);
    },

    async invalidateCache(scope = null) {
      if (!this.isExtension) return;
      return await this.cacheManager.invalidateCache(scope);
    },

    async clearAllCache() {
      if (!this.isExtension) return;
      return await this.cacheManager.clearAllCache();
    },

    async cleanupLegacyCache() {
      if (!this.isExtension) return;
      return await this.cacheManager.cleanupLegacyCache();
    },

    async _executeWithErrorHandling(operation, context, metadata = {}) {
      try {
        return await operation();
      } catch (error) {
        console.error(`[${context}] Error:`, error);
        window.SentryHelpers?.captureError(error, { context, ...metadata });
        throw error;
      }
    },

    async _fetchWithAuth(endpoint, params = null, options = {}) {
      const idToken = await this.getIdToken();

      let url = endpoint.startsWith('http') ? endpoint : `${CONFIG.cloudFunctionUrl}${endpoint}`;
      if (params) {
        const searchParams = params instanceof URLSearchParams
          ? params
          : new URLSearchParams(params);
        url = `${url}?${searchParams}`;
      }

      // eslint-disable-next-line no-unused-vars
      const { headers: _, ...fetchOptions } = options;

      const response = await fetch(url, {
        ...fetchOptions,
        method: options.method || 'GET',
        headers: {
          'Authorization': `Bearer ${idToken}`,
          ...options.headers
        }
      });

      if (!response.ok) {
        const errorMessage = await this.parseErrorResponse(response);
        const error = new Error(errorMessage);
        error.status = response.status;
        throw error;
      }

      return await response.json();
    }
  });

  return API;
}

const ApiCore_Export = { applyApiCore };
globalThis.ApiCore_Export = ApiCore_Export;

/* eslint-disable no-undef */
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { applyApiCore };
}
/* eslint-enable no-undef */
