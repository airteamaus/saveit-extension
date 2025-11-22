import { describe, it, expect, beforeEach, vi } from 'vitest';

describe('CacheManager', () => {
  let CacheManager;
  let mockStorage;
  let getCurrentUserId;
  let getStorage;
  let cacheManager;

  beforeEach(async () => {
    // Mock global debug function
    global.debug = vi.fn();

    // Mock storage with proper chrome.storage.local API behavior
    const storageData = {};
    mockStorage = {
      get: vi.fn(async (key) => {
        return { [key]: storageData[key] };
      }),
      set: vi.fn(async (obj) => {
        Object.assign(storageData, obj);
      }),
      remove: vi.fn(async (key) => {
        delete storageData[key];
      }),
      clear: vi.fn(async () => {
        Object.keys(storageData).forEach(key => delete storageData[key]);
      }),
      // Expose for test setup
      _testData: storageData
    };

    getCurrentUserId = vi.fn(() => 'user-123');
    getStorage = vi.fn(() => mockStorage);

    // Import CacheManager
    const cacheModule = await import('../../src/cache-manager.js');
    CacheManager = cacheModule.CacheManager;

    cacheManager = new CacheManager(getCurrentUserId, getStorage);
  });

  describe('Constructor', () => {
    it('should initialize with correct defaults', () => {
      expect(cacheManager.CACHE_KEY_PREFIX).toBe('savedPages_cache');
      expect(cacheManager.CACHE_MAX_AGE_MS).toBe(5 * 60 * 1000); // 5 minutes
    });

    it('should store callback functions', () => {
      expect(cacheManager.getCurrentUserId).toBe(getCurrentUserId);
      expect(cacheManager.getStorage).toBe(getStorage);
    });
  });

  describe('getCacheKey', () => {
    it('should generate user-specific cache key', () => {
      const key = cacheManager.getCacheKey('user-abc');
      expect(key).toBe('savedPages_cache_user-abc');
    });

    it('should generate different keys for different users', () => {
      const key1 = cacheManager.getCacheKey('user-1');
      const key2 = cacheManager.getCacheKey('user-2');
      expect(key1).not.toBe(key2);
    });
  });

  describe('getCachedPages', () => {
    it('should return null when no user is logged in', async () => {
      getCurrentUserId.mockReturnValue(null);

      const result = await cacheManager.getCachedPages();
      expect(result).toBeNull();
      expect(mockStorage.get).not.toHaveBeenCalled();
    });

    it('should return null when storage is not available', async () => {
      getStorage.mockReturnValue(null);

      const result = await cacheManager.getCachedPages();
      expect(result).toBeNull();
    });

    it('should return null when cache does not exist', async () => {
      const result = await cacheManager.getCachedPages();
      expect(result).toBeNull();
    });

    it('should return cached data when valid', async () => {
      const mockResponse = {
        pages: [{ id: '1', title: 'Test' }],
        pagination: { total: 1 }
      };

      mockStorage._testData['savedPages_cache_user-123'] = {
        userId: 'user-123',
        response: mockResponse,
        timestamp: Date.now()
      };

      const result = await cacheManager.getCachedPages();
      expect(result).toEqual(mockResponse);
    });

    it('should return null when cache is expired', async () => {
      const expiredTimestamp = Date.now() - (6 * 60 * 1000); // 6 minutes ago
      mockStorage._testData['savedPages_cache_user-123'] = {
        userId: 'user-123',
        response: { pages: [] },
        timestamp: expiredTimestamp
      };

      const result = await cacheManager.getCachedPages();
      expect(result).toBeNull();
    });

    it('should invalidate cache when user ID mismatch', async () => {
      mockStorage._testData['savedPages_cache_user-123'] = {
        userId: 'different-user',
        response: { pages: [] },
        timestamp: Date.now()
      };

      const result = await cacheManager.getCachedPages();
      expect(result).toBeNull();
      expect(mockStorage.remove).toHaveBeenCalledWith('savedPages_cache_user-123');
    });

    it('should return null and log error on storage failure', async () => {
      const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      mockStorage.get.mockRejectedValue(new Error('Storage error'));

      const result = await cacheManager.getCachedPages();
      expect(result).toBeNull();
      expect(consoleErrorSpy).toHaveBeenCalled();

      consoleErrorSpy.mockRestore();
    });

    it('should accept cache without userId field (legacy compatibility)', async () => {
      const mockResponse = {
        pages: [{ id: '1', title: 'Test' }]
      };

      mockStorage._testData['savedPages_cache_user-123'] = {
        response: mockResponse,
        timestamp: Date.now()
      };

      const result = await cacheManager.getCachedPages();
      expect(result).toEqual(mockResponse);
    });
  });

  describe('setCachedPages', () => {
    it('should not cache when no user is logged in', async () => {
      getCurrentUserId.mockReturnValue(null);

      await cacheManager.setCachedPages({ pages: [] });
      expect(mockStorage.set).not.toHaveBeenCalled();
    });

    it('should not cache when storage is not available', async () => {
      getStorage.mockReturnValue(null);

      await cacheManager.setCachedPages({ pages: [] });
      expect(mockStorage.set).not.toHaveBeenCalled();
    });

    it('should store cache with user ID and timestamp', async () => {
      const mockResponse = {
        pages: [{ id: '1', title: 'Test' }],
        pagination: { total: 1 }
      };

      await cacheManager.setCachedPages(mockResponse);

      expect(mockStorage.set).toHaveBeenCalled();
      const cached = mockStorage._testData['savedPages_cache_user-123'];
      expect(cached.userId).toBe('user-123');
      expect(cached.response).toEqual(mockResponse);
      expect(cached.timestamp).toBeGreaterThan(Date.now() - 1000);
    });

    it('should log error on storage failure', async () => {
      const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      mockStorage.set.mockRejectedValue(new Error('Storage error'));

      await cacheManager.setCachedPages({ pages: [] });
      expect(consoleErrorSpy).toHaveBeenCalled();

      consoleErrorSpy.mockRestore();
    });
  });

  describe('invalidateCache', () => {
    it('should not invalidate when no user is logged in', async () => {
      getCurrentUserId.mockReturnValue(null);

      await cacheManager.invalidateCache();
      expect(mockStorage.remove).not.toHaveBeenCalled();
    });

    it('should not invalidate when storage is not available', async () => {
      getStorage.mockReturnValue(null);

      await cacheManager.invalidateCache();
      expect(mockStorage.remove).not.toHaveBeenCalled();
    });

    it('should remove cache for current user', async () => {
      mockStorage._testData['savedPages_cache_user-123'] = {
        userId: 'user-123',
        response: { pages: [] },
        timestamp: Date.now()
      };

      await cacheManager.invalidateCache();
      expect(mockStorage.remove).toHaveBeenCalledWith('savedPages_cache_user-123');
    });

    it('should log error on storage failure', async () => {
      const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      mockStorage.remove.mockRejectedValue(new Error('Storage error'));

      await cacheManager.invalidateCache();
      expect(consoleErrorSpy).toHaveBeenCalled();

      consoleErrorSpy.mockRestore();
    });
  });

  describe('clearAllCache', () => {
    it('should not clear when storage is not available', async () => {
      getStorage.mockReturnValue(null);

      await cacheManager.clearAllCache();
      expect(mockStorage.clear).not.toHaveBeenCalled();
    });

    it('should clear entire storage', async () => {
      mockStorage._testData['savedPages_cache_user-123'] = { response: {} };
      mockStorage._testData['other_key'] = { data: 'test' };

      await cacheManager.clearAllCache();
      expect(mockStorage.clear).toHaveBeenCalled();
    });

    it('should log error on storage failure', async () => {
      const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      mockStorage.clear.mockRejectedValue(new Error('Storage error'));

      await cacheManager.clearAllCache();
      expect(consoleErrorSpy).toHaveBeenCalled();

      consoleErrorSpy.mockRestore();
    });
  });

  describe('cleanupLegacyCache', () => {
    it('should not cleanup when storage is not available', async () => {
      getStorage.mockReturnValue(null);

      await cacheManager.cleanupLegacyCache();
      expect(mockStorage.remove).not.toHaveBeenCalled();
    });

    it('should remove legacy global cache key', async () => {
      mockStorage._testData['savedPages_cache'] = { response: {} };

      await cacheManager.cleanupLegacyCache();
      expect(mockStorage.remove).toHaveBeenCalledWith('savedPages_cache');
    });

    it('should log error on storage failure', async () => {
      const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      mockStorage.remove.mockRejectedValue(new Error('Storage error'));

      await cacheManager.cleanupLegacyCache();
      expect(consoleErrorSpy).toHaveBeenCalled();

      consoleErrorSpy.mockRestore();
    });
  });

  describe('Cache Isolation', () => {
    it('should isolate cache between users', async () => {
      // User 1 sets cache
      getCurrentUserId.mockReturnValue('user-1');
      const manager1 = new CacheManager(getCurrentUserId, getStorage);
      await manager1.setCachedPages({ pages: [{ id: '1', title: 'User 1' }] });

      // User 2 sets cache
      getCurrentUserId.mockReturnValue('user-2');
      const manager2 = new CacheManager(getCurrentUserId, getStorage);
      await manager2.setCachedPages({ pages: [{ id: '2', title: 'User 2' }] });

      // Verify isolation
      getCurrentUserId.mockReturnValue('user-1');
      const cache1 = await manager1.getCachedPages();
      expect(cache1.pages[0].id).toBe('1');

      getCurrentUserId.mockReturnValue('user-2');
      const cache2 = await manager2.getCachedPages();
      expect(cache2.pages[0].id).toBe('2');
    });
  });

  describe('Cache Expiration', () => {
    it('should return fresh cache within expiration window', async () => {
      const recentTimestamp = Date.now() - (2 * 60 * 1000); // 2 minutes ago
      mockStorage._testData['savedPages_cache_user-123'] = {
        userId: 'user-123',
        response: { pages: [{ id: '1' }] },
        timestamp: recentTimestamp
      };

      const result = await cacheManager.getCachedPages();
      expect(result).not.toBeNull();
      expect(result.pages).toHaveLength(1);
    });

    it('should reject expired cache', async () => {
      const oldTimestamp = Date.now() - (10 * 60 * 1000); // 10 minutes ago
      mockStorage._testData['savedPages_cache_user-123'] = {
        userId: 'user-123',
        response: { pages: [{ id: '1' }] },
        timestamp: oldTimestamp
      };

      const result = await cacheManager.getCachedPages();
      expect(result).toBeNull();
    });
  });
});
