// cache-manager.js - Browser storage cache management
// Handles user-isolated caching with expiration and validation

function debugLog(...args) {
  if (typeof globalThis.debug === 'function') {
    globalThis.debug(...args);
  }
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
    this.CACHE_KEY_PREFIX = 'savedPages_cache';
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
  async getCachedPages(scope = {}, options = {}) {
    try {
      const userId = await this.resolveReadUserId();
      if (!userId) {
        debugLog('[getCachedPages] No user logged in, skipping cache');
        return null;
      }

      const storage = this.getStorage();
      if (!storage) return null;

      const cacheKey = this.getCacheKey(userId, scope);
      const result = await storage.get(cacheKey);
      const cached = result[cacheKey];

      if (!cached) {
        debugLog('[getCachedPages] No cache found for user:', userId);
        return null;
      }

      // Validate that cached data belongs to current user (extra safety)
      if (cached.userId && cached.userId !== userId) {
        console.warn('[getCachedPages] Cache user_id mismatch! Clearing invalid cache.', {
          cached_user: cached.userId,
          current_user: userId
        });
        await storage.remove(cacheKey);
        return null;
      }

      const age = Date.now() - cached.timestamp;
      if (age > this.CACHE_MAX_AGE_MS && options.allowExpired !== true) {
        debugLog('[getCachedPages] Cache expired, fetching fresh data');
        return null;
      }

      const cacheState = age > this.CACHE_MAX_AGE_MS ? 'stale' : 'fresh';
      debugLog(`[getCachedPages] Using ${cacheState} cached data (${Math.round(age / 1000)}s old)`, {
        user_id: userId,
        pages_count: cached.response?.pages ? cached.response.pages.length : 0,
        total: cached.response?.pagination?.total,
        first_item: cached.response?.pages?.[0] ? { id: cached.response.pages[0].id, title: cached.response.pages[0].title } : null
      });
      return cached.response; // Return full response object with pagination
    } catch (error) {
      console.error('[getCachedPages] Failed to read cache:', error);
      return null;
    }
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
    }
  }

  /**
   * Clear all cached data (for debugging)
   */
  async clearAllCache() {
    try {
      const storage = this.getStorage();
      if (!storage) return;

      await storage.clear();
      debugLog('[clearAllCache] All cache cleared');
    } catch (error) {
      console.error('[clearAllCache] Failed to clear cache:', error);
    }
  }

  /**
   * Clean up legacy cache (migration helper)
   * Removes old global cache key that wasn't user-isolated
   * Called once on extension upgrade to v0.13.5+
   */
  async cleanupLegacyCache() {
    try {
      const userId = await this.resolveWriteUserId();
      const storage = this.getStorage();
      if (!storage) return;

      // Remove old global cache key
      const legacyKey = 'savedPages_cache';
      const keysToRemove = [legacyKey];
      if (userId) {
        keysToRemove.push(`${this.CACHE_KEY_PREFIX}_${userId}`);
      }

      await storage.remove(keysToRemove);
      debugLog('[cleanupLegacyCache] Removed legacy global cache');
    } catch (error) {
      console.error('[cleanupLegacyCache] Failed to cleanup legacy cache:', error);
    }
  }
}
