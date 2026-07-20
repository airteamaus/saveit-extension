// api-core.js - Core API runtime, auth, transport, and cache helpers

import { CacheManager } from './cache-manager.js';
import { requestWithAuth } from './api-transport.js';
import {
  CONFIG as defaultConfig,
  getBrowserRuntime as defaultGetBrowserRuntime,
  getStorageAPI as defaultGetStorageAPI
} from './config.js';
import {
  PROJECTS_CACHE_PREFIX,
  DOMAINS_CACHE_PREFIX
} from './cache-keys.js';
import {
  getSessionToken,
  getCurrentUserId as getSessionUserId,
  setSession
} from './session-store.js';

// Parse a non-ok fetch Response into a human-readable error string. Extracted
// as a standalone so background.js's lean fetch path can reuse it without
// constructing the full API facade. The instance method below delegates here.
export async function parseErrorResponse(response) {
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
}

// Sliding session refresh: when the backend rotates a session token it returns
// the replacement via response headers. Read the new token/expiry and persist
// it. Shared by the API facade (_applySessionRotation below) and background.js's
// lean fetch path. Best-effort: a failure here does not invalidate the request
// that carried the rotation. The optional logger lets the background surface
// rotation outcomes (the facade stays silent — the request already succeeded).
export async function applySessionRotation(response, { logger } = {}) {
  const headers = response.headers;
  if (!headers || typeof headers.get !== 'function') {
    return;
  }
  const newToken = headers.get('X-Session-Token');
  const newExpiry = headers.get('X-Session-Expires-At');
  if (!newToken || !newExpiry) {
    return;
  }
  try {
    const uid = await getSessionUserId();
    if (uid) {
      await setSession({ sessionToken: newToken, uid, expiresAt: newExpiry });
      logger?.log?.('Session token rotated by backend');
    }
  } catch (error) {
    // Non-fatal: the current request already succeeded.
    logger?.warn?.('Failed to apply session rotation', { error: error.message });
  }
}

export function applyApiCore(API, dependencies = {}) {
  const {
    cacheManagerClass = CacheManager,
    config = defaultConfig,
    getBrowserRuntime = defaultGetBrowserRuntime,
    getStorageAPI = defaultGetStorageAPI
  } = dependencies;

  API._cacheManager = null;
  API._projectsCacheManager = null;
  API._domainsCacheManager = null;
  API._lastKnownUserId = undefined;
  API.LAST_KNOWN_USER_KEY = 'saveit_lastKnownUser';

  // Each data surface gets its own CacheManager with its own storage prefix, so
  // a mutation on one surface (e.g. a project edit) can invalidate narrowly
  // without dropping the others (saved pages, domains). This satisfies the
  // caching-redux rules "cache keys match query shape" (#6) and "invalidate
  // narrowly, recover broadly" (#8). The default cacheManager is the
  // saved-pages surface; projects and domains get their own below.
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

  Object.defineProperty(API, 'projectsCacheManager', {
    configurable: true,
    enumerable: true,
    get() {
      if (!this._projectsCacheManager && this.isExtension) {
        this._projectsCacheManager = new cacheManagerClass(
          () => this.getCurrentUserId(),
          () => this.getStorage(),
          {
            getBootstrapUserId: () => this.getLastKnownUserId(),
            keyPrefix: PROJECTS_CACHE_PREFIX
          }
        );
      }
      return this._projectsCacheManager;
    }
  });

  Object.defineProperty(API, 'domainsCacheManager', {
    configurable: true,
    enumerable: true,
    get() {
      if (!this._domainsCacheManager && this.isExtension) {
        this._domainsCacheManager = new cacheManagerClass(
          () => this.getCurrentUserId(),
          () => this.getStorage(),
          {
            getBootstrapUserId: () => this.getLastKnownUserId(),
            keyPrefix: DOMAINS_CACHE_PREFIX
          }
        );
      }
      return this._domainsCacheManager;
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
    async getCurrentUserId() {
      if (!this.isExtension) {
        return null;
      }
      return await getSessionUserId();
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
        window.SentryHelpers?.captureError(error, { context: 'get-last-known-user-id' });
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
        window.SentryHelpers?.captureError(error, { context: 'set-last-known-user' });
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
        window.SentryHelpers?.captureError(error, { context: 'clear-last-known-user' });
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

    // Attach a { fromCache } meta flag to a response. Lists return a plain
    // object ({ pages, pagination }) so meta is merged in via spread; projects
    // and domains return Arrays, where spread would destroy array-ness
    // (Array.isArray({...arr}) === false), so those use a non-enumerable
    // defineProperty instead. Either way, consumers read meta?.fromCache.
    _withCacheMetadata(response, fromCache) {
      if (Array.isArray(response)) {
        Object.defineProperty(response, 'meta', {
          value: { ...(response.meta || {}), fromCache },
          configurable: true,
          enumerable: false,
          writable: true
        });
        return response;
      }
      return {
        ...response,
        meta: {
          ...(response.meta || {}),
          fromCache
        }
      };
    },

    async parseErrorResponse(response) {
      return parseErrorResponse(response);
    },

    // Shared cached-read flow used by the saved-pages, projects, and domains
    // surfaces. Each surface inlined its own version of this 5-step dance
    // (build scope → check skipCache → read cache → fetch+normalize → write
    // cache → tag meta); this factors it into one place. Callers pass:
    //   - cacheScope: the scope key for the surface's own CacheManager
    //   - readCache / writeCache: bound to the surface's CM methods
    //   - fetcher: () => Promise<raw backend data>
    //   - normalize: (raw) => value-to-cache-and-return (only called on a
    //     fresh fetch; cache hits return the stored value as-is, since it was
    //     normalized before being written)
    //   - mockFetcher: standalone-mode fallback (options) => value
    //   - context: label for telemetry/logging
    //   - options: the caller's options (carries skipCache etc.)
    async _getCachedOrFreshList({
      cacheScope,
      readCache,
      writeCache,
      fetcher,
      normalize,
      mockFetcher,
      context,
      options = {}
    }) {
      if (this.isExtension) {
        if (!options.skipCache) {
          const cached = await readCache(cacheScope);
          if (cached) {
            return this._withCacheMetadata(cached, true);
          }
        }

        return this._executeWithErrorHandling(
          async () => {
            const data = await fetcher();
            const normalized = normalize(data);
            await writeCache(normalized, cacheScope);
            return this._withCacheMetadata(normalized, false);
          },
          context,
          { options }
        );
      }

      return this._withCacheMetadata(mockFetcher(options), false);
    },

    async getIdToken() {
      if (this.isExtension) {
        const token = await getSessionToken();
        if (!token) {
          throw new Error('No session token. Please sign in.');
        }
        return token;
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

    // --- projects surface cache (own prefix: PROJECTS_CACHE_PREFIX) ---
    async getProjectsCachedPages(scope = {}, options = {}) {
      if (!this.isExtension) return null;
      return await this.projectsCacheManager.getCachedPages(scope, options);
    },

    async getProjectsCachedPagesState(scope = {}, options = {}) {
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
      return await this.projectsCacheManager.getCachedPagesState(scope, options);
    },

    async setProjectsCachedPages(response, scope = {}) {
      if (!this.isExtension) return;
      return await this.projectsCacheManager.setCachedPages(response, scope);
    },

    async invalidateProjectsCache(scope = null) {
      if (!this.isExtension) return;
      return await this.projectsCacheManager.invalidateCache(scope);
    },

    // --- domains surface cache (own prefix: DOMAINS_CACHE_PREFIX) ---
    async getDomainsCachedPages(scope = {}, options = {}) {
      if (!this.isExtension) return null;
      return await this.domainsCacheManager.getCachedPages(scope, options);
    },

    async getDomainsCachedPagesState(scope = {}, options = {}) {
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
      return await this.domainsCacheManager.getCachedPagesState(scope, options);
    },

    async setDomainsCachedPages(response, scope = {}) {
      if (!this.isExtension) return;
      return await this.domainsCacheManager.setCachedPages(response, scope);
    },

    async invalidateDomainsCache(scope = null) {
      if (!this.isExtension) return;
      return await this.domainsCacheManager.invalidateCache(scope);
    },

    // Invalidate every surface cache. Used by the user-facing "reload from
    // server" affordance, where the intent is to bust everything and re-fetch.
    async invalidateAllCaches() {
      if (!this.isExtension) return;
      await Promise.all([
        this.invalidateCache(),
        this.invalidateProjectsCache(),
        this.invalidateDomainsCache()
      ]);
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
      // Delegate to the shared transport (api-transport.js) so the facade and
      // the background SW use one authenticated-fetch implementation. Facade
      // callers pre-serialize `body` (a JSON string) and may set Content-Type
      // in headers; both are passed through verbatim.
      return await requestWithAuth({
        url: endpoint,
        baseUrl: config.cloudFunctionUrl,
        params,
        method: options.method || 'GET',
        body: options.body,
        headers: options.headers,
        getIdToken: () => this.getIdToken(),
        onRotation: (response) => this._applySessionRotation(response),
        parseError: (response) => this.parseErrorResponse(response)
      });
    },

    async _applySessionRotation(response) {
      await applySessionRotation(response);
    },

    async _fetchWithAuth(endpoint, params = null, options = {}) {
      const response = await this._requestWithAuth(endpoint, params, options);
      return await response.json();
    }
  });

  return API;
}
