// cache-manager.js - Browser storage cache management
// Handles user-isolated caching with expiration and validation

/**
 * CacheManager handles browser storage caching for saved pages
 * - User-isolated cache keys to prevent cross-user data leakage
 * - Automatic expiration (5 minutes default)
 * - Cache validation (user_id mismatch detection)
 */
class CacheManager {
  constructor(getCurrentUserId, getStorage) {
    this.getCurrentUserId = getCurrentUserId;
    this.getStorage = getStorage;
    this.CACHE_KEY_PREFIX = 'savedPages_cache';
    this.CACHE_MAX_AGE_MS = 5 * 60 * 1000; // 5 minutes
  }

  /**
   * Get cache key for current user
   * Includes user_id to prevent cross-user data leakage
   * @private
   */
  getCacheKey(userId) {
    return `${this.CACHE_KEY_PREFIX}_${userId}`;
  }

  /**
   * Get cached response from browser storage
   * Cache is isolated per user to prevent cross-user data leakage
   * Returns full response object with pagination metadata
   */
  async getCachedPages() {
    try {
      const userId = this.getCurrentUserId();
      if (!userId) {
        console.log('[getCachedPages] No user logged in, skipping cache');
        return null;
      }

      const storage = this.getStorage();
      if (!storage) return null;

      const cacheKey = this.getCacheKey(userId);
      const result = await storage.get(cacheKey);
      const cached = result[cacheKey];

      if (!cached) {
        console.log('[getCachedPages] No cache found for user:', userId);
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
      if (age > this.CACHE_MAX_AGE_MS) {
        console.log('[getCachedPages] Cache expired, fetching fresh data');
        return null;
      }

      console.log(`[getCachedPages] Using cached data (${Math.round(age / 1000)}s old)`, {
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
  async setCachedPages(response) {
    try {
      const userId = this.getCurrentUserId();
      if (!userId) {
        console.log('[setCachedPages] No user logged in, skipping cache write');
        return;
      }

      const storage = this.getStorage();
      if (!storage) return;

      const cacheKey = this.getCacheKey(userId);
      await storage.set({
        [cacheKey]: {
          userId: userId, // Store user_id for validation
          response: response, // Store full response with pagination
          timestamp: Date.now()
        }
      });
      console.log('[setCachedPages] Cache updated for user:', userId, {
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
  async invalidateCache() {
    try {
      const userId = this.getCurrentUserId();
      if (!userId) {
        console.log('[invalidateCache] No user logged in');
        return;
      }

      const storage = this.getStorage();
      if (!storage) return;

      const cacheKey = this.getCacheKey(userId);
      await storage.remove(cacheKey);
      console.log('[invalidateCache] Cache invalidated for user:', userId);
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
      console.log('[clearAllCache] All cache cleared');
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
      const storage = this.getStorage();
      if (!storage) return;

      // Remove old global cache key
      const legacyKey = 'savedPages_cache';
      await storage.remove(legacyKey);
      console.log('[cleanupLegacyCache] Removed legacy global cache');
    } catch (error) {
      console.error('[cleanupLegacyCache] Failed to cleanup legacy cache:', error);
    }
  }
}

// Export for use in api.js
/* eslint-disable-next-line no-unused-vars */
const CacheManager_Export = CacheManager;
