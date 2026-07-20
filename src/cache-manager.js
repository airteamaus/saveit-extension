// cache-manager.js - Browser storage cache management
// Handles user-isolated caching with expiration and validation

import { SAVED_PAGES_CACHE_PREFIX } from './cache-keys.js';

function debugLog(...args) {
  if (typeof globalThis.debug === 'function') {
    globalThis.debug(...args);
  }
}

function createCacheReadResult(status, {
  response = null,
  error = null,
  ageMs = null,
  timestamp = null,
  reason = null,
  usable = false
} = {}) {
  return {
    status,
    response,
    error,
    ageMs,
    timestamp,
    reason,
    usable
  };
}

/**
 * CacheManager handles browser storage caching for saved pages
 * - User-isolated cache keys to prevent cross-user data leakage
 * - Automatic expiration (5 minutes default)
 * - Cache validation (user_id mismatch detection)
 */
export class CacheManager {
  constructor(getCurrentUserId, getStorage, options = {}) {
    this.getCurrentUserId = getCurrentUserId;
    this.getStorage = getStorage;
    this.getBootstrapUserId = options.getBootstrapUserId || (async () => null);
    // Each surface (saved pages, projects) gets its own prefix so cache keys
    // match their query shape and invalidation can be narrow.
    this.CACHE_KEY_PREFIX = options.keyPrefix || SAVED_PAGES_CACHE_PREFIX;
    this.CACHE_MAX_AGE_MS = 5 * 60 * 1000; // 5 minutes
  }

  async resolveReadUserId() {
    const currentUserId = await this.getCurrentUserId();
    if (currentUserId) {
      return currentUserId;
    }

    return await this.getBootstrapUserId();
  }

  async resolveWriteUserId() {
    return await this.getCurrentUserId();
  }

  /**
   * Serialize cache scope into a deterministic string
   * @private
   * @param {Object} scope - Request scope
   * @returns {string} Serialized scope string
   */
  serializeScope(scope = {}) {
    const entries = Object.entries(scope)
      .filter(([, value]) => value !== undefined && value !== null && value !== '')
      .sort(([a], [b]) => a.localeCompare(b));

    if (entries.length === 0) {
      return 'default';
    }

    return entries
      .map(([key, value]) => `${key}=${encodeURIComponent(String(value))}`)
      .join('&');
  }

  /**
   * Get cache key for current user and request scope
   * @private
   * @param {string} userId - Current user ID
   * @param {Object} [scope={}] - Request scope
   * @returns {string} Cache key
   */
  getCacheKey(userId, scope = {}) {
    return `${this.CACHE_KEY_PREFIX}_${userId}_${this.serializeScope(scope)}`;
  }

  /**
   * Get all cache keys for current user
   * @private
   * @param {Object} storage - Browser storage API
   * @param {string} userId - Current user ID
   * @returns {Promise<string[]>} Matching cache keys
   */
  async getUserCacheKeys(storage, userId) {
    const allItems = await storage.get(null);
    const userPrefix = `${this.CACHE_KEY_PREFIX}_${userId}`;

    return Object.keys(allItems).filter(key =>
      key === userPrefix || key.startsWith(`${userPrefix}_`)
    );
  }

  /**
   * Get cached response from browser storage
   * Cache is isolated per user to prevent cross-user data leakage
   * Returns full response object with pagination metadata
   */
  async getCachedPagesState(scope = {}, options = {}) {
    try {
      const userId = await this.resolveReadUserId();
      if (!userId) {
        debugLog('[getCachedPages] No user logged in, skipping cache');
        return createCacheReadResult('empty', {
          reason: 'missing-user'
        });
      }

      const storage = this.getStorage();
      if (!storage) {
        return createCacheReadResult('empty', {
          reason: 'storage-unavailable'
        });
      }

      const cacheKey = this.getCacheKey(userId, scope);
      const result = await storage.get(cacheKey);
      const cached = result[cacheKey];

      if (!cached) {
        debugLog('[getCachedPages] No cache found for user:', userId);
        return createCacheReadResult('empty', {
          reason: 'missing-entry'
        });
      }

      if (cached.userId && cached.userId !== userId) {
        console.warn('[getCachedPages] Cache user_id mismatch! Clearing invalid cache.', {
          cached_user: cached.userId,
          current_user: userId
        });
        await storage.remove(cacheKey);
        return createCacheReadResult('empty', {
          reason: 'user-mismatch'
        });
      }

      const ageMs = Date.now() - cached.timestamp;
      const isStale = ageMs > this.CACHE_MAX_AGE_MS;
      const status = isStale ? 'stale' : 'fresh';

      debugLog(`[getCachedPages] Using ${status} cached data (${Math.round(ageMs / 1000)}s old)`, {
        user_id: userId,
        pages_count: cached.response?.pages ? cached.response.pages.length : 0,
        total: cached.response?.pagination?.total,
        first_item: cached.response?.pages?.[0]
          ? { id: cached.response.pages[0].id, title: cached.response.pages[0].title }
          : null
      });

      return createCacheReadResult(status, {
        response: cached.response,
        ageMs,
        timestamp: cached.timestamp,
        reason: isStale ? 'expired' : 'hit',
        usable: !isStale || options.allowExpired === true
      });
    } catch (error) {
      console.error('[getCachedPages] Failed to read cache:', error);
      window.SentryHelpers?.captureError(error, { context: 'cache-get-cached-pages' });
      return createCacheReadResult('error', {
        error,
        reason: 'read-failed'
      });
    }
  }

  async getCachedPages(scope = {}, options = {}) {
    const cacheState = await this.getCachedPagesState(scope, options);
    if (cacheState.status === 'fresh') {
      return cacheState.response;
    }

    if (cacheState.status === 'stale' && cacheState.usable) {
      return cacheState.response;
    }

    return null;
  }

  /**
   * Store response in browser storage cache
   * Cache is isolated per user to prevent cross-user data leakage
   * Stores full response object with pagination metadata
   */
  async setCachedPages(response, scope = {}) {
    try {
      const userId = await this.resolveWriteUserId();
      if (!userId) {
        debugLog('[setCachedPages] No user logged in, skipping cache write');
        return;
      }

      const storage = this.getStorage();
      if (!storage) return;

      const cacheKey = this.getCacheKey(userId, scope);
      await storage.set({
        [cacheKey]: {
          userId: userId, // Store user_id for validation
          response: response, // Store full response with pagination
          timestamp: Date.now()
        }
      });
      debugLog('[setCachedPages] Cache updated for user:', userId, {
        pages_count: response?.pages?.length,
        total: response?.pagination?.total
      });
    } catch (error) {
      console.error('[setCachedPages] Failed to write cache:', error);
      window.SentryHelpers?.captureError(error, { context: 'cache-set-cached-pages' });
    }
  }

  /**
   * Invalidate the cache (call after delete, update operations)
   * Clears cache for current user only
   */
  async invalidateCache(scope = null) {
    try {
      const userId = await this.resolveWriteUserId();
      if (!userId) {
        debugLog('[invalidateCache] No user logged in');
        return;
      }

      const storage = this.getStorage();
      if (!storage) return;

      if (scope) {
        const cacheKey = this.getCacheKey(userId, scope);
        await storage.remove(cacheKey);
      } else {
        const keys = await this.getUserCacheKeys(storage, userId);
        if (keys.length > 0) {
          await storage.remove(keys);
        }
      }
      debugLog('[invalidateCache] Cache invalidated for user:', userId, { scope });
    } catch (error) {
      console.error('[invalidateCache] Failed to invalidate cache:', error);
      window.SentryHelpers?.captureError(error, { context: 'cache-invalidate' });
    }
  }
}
