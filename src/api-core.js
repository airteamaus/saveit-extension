// api-core.js - Core API runtime, auth, transport, and cache helpers

import { CacheManager } from './cache-manager.js';
import {
  CONFIG as defaultConfig,
  getBrowserRuntime as defaultGetBrowserRuntime,
  getStorageAPI as defaultGetStorageAPI
} from './config.js';

export function applyApiCore(API, dependencies = {}) {
  const {
    cacheManagerClass = CacheManager,
    config = defaultConfig,
    getBrowserRuntime = defaultGetBrowserRuntime,
    getStorageAPI = defaultGetStorageAPI
  } = dependencies;

  API._cacheManager = null;
  API._lastKnownUserId = undefined;
  API.LAST_KNOWN_USER_KEY = 'saveit_lastKnownUser';

  Object.defineProperty(API, 'cacheManager', {
    configurable: true,
    enumerable: true,
    get() {
      if (!this._cacheManager && this.isExtension) {
        this._cacheManager = new cacheManagerClass(
          () => this.getCurrentUserId(),
          () => this.getStorage(),
          {
            getBootstrapUserId: () => this.getLastKnownUserId()
          }
        );
      }
      return this._cacheManager;
    }
  });

  Object.defineProperty(API, 'isExtension', {
    configurable: true,
    enumerable: true,
    get() {
      return getBrowserRuntime() !== null && getStorageAPI() !== null;
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
      return getStorageAPI();
    },

    async getLastKnownUserId() {
      if (!this.isExtension) {
        return null;
      }

      if (this._lastKnownUserId !== undefined) {
        return this._lastKnownUserId;
      }

      const storage = this.getStorage();
      if (!storage) {
        this._lastKnownUserId = null;
        return null;
      }

      try {
        const result = await storage.get(this.LAST_KNOWN_USER_KEY);
        const userId = result?.[this.LAST_KNOWN_USER_KEY]?.userId || null;
        this._lastKnownUserId = userId;
        return userId;
      } catch (error) {
        console.error('[getLastKnownUserId] Failed to read cached auth bootstrap:', error);
        this._lastKnownUserId = null;
        return null;
      }
    },

    async setLastKnownUser(user) {
      if (!this.isExtension) {
        return;
      }

      const storage = this.getStorage();
      if (!storage) {
        return;
      }

      const userId = user?.uid || null;
      this._lastKnownUserId = userId;

      try {
        if (!userId) {
          await storage.remove(this.LAST_KNOWN_USER_KEY);
          return;
        }

        await storage.set({
          [this.LAST_KNOWN_USER_KEY]: {
            userId,
            updatedAt: Date.now()
          }
        });
      } catch (error) {
        console.error('[setLastKnownUser] Failed to persist cached auth bootstrap:', error);
      }
    },

    async clearLastKnownUser() {
      if (!this.isExtension) {
        return;
      }

      this._lastKnownUserId = null;
      const storage = this.getStorage();
      if (!storage) {
        return;
      }

      try {
        await storage.remove(this.LAST_KNOWN_USER_KEY);
      } catch (error) {
        console.error('[clearLastKnownUser] Failed to clear cached auth bootstrap:', error);
      }
    },

    _buildListCacheScope(surface, options = {}) {
      return {
        surface,
        limit: options.limit,
        sort: options.sort || 'newest',
        pinnedFirst: options.pinnedFirst,
        search: options.search || '',
        cursor: options.cursor || null,
        projectId: options.projectId || null,
        domain: options.domain || null
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

    async getCachedPages(scope = {}, options = {}) {
      if (!this.isExtension) return null;
      return await this.cacheManager.getCachedPages(scope, options);
    },

    async getCachedPagesState(scope = {}, options = {}) {
      if (!this.isExtension) {
        return {
          status: 'empty',
          response: null,
          error: null,
          ageMs: null,
          timestamp: null,
          reason: 'not-extension',
          usable: false
        };
      }

      return await this.cacheManager.getCachedPagesState(scope, options);
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

    async _requestWithAuth(endpoint, params = null, options = {}) {
      const idToken = await this.getIdToken();

      let url = endpoint.startsWith('http') ? endpoint : `${config.cloudFunctionUrl}${endpoint}`;
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

      return response;
    },

    async _fetchWithAuth(endpoint, params = null, options = {}) {
      const response = await this._requestWithAuth(endpoint, params, options);
      return await response.json();
    }
  });

  return API;
}
