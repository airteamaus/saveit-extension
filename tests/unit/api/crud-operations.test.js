import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

describe('API - CRUD Operations', () => {
  let API;
  let originalWindow;

  beforeEach(async () => {
    // Save original window state
    originalWindow = { ...global.window };

    // Set up minimal global environment
    global.window = {
      firebaseAuth: null,
      firebaseReady: null,
      firebaseGetIdToken: null,
      SentryHelpers: null
    };

    // Mock CONFIG
    global.CONFIG = {
      cloudFunctionUrl: 'https://test-function.run.app'
    };

    // Mock global functions from config-loader
    global.getBrowserRuntime = vi.fn(() => null);
    global.getStorageAPI = vi.fn(() => null);

    // Load API module
    const apiModule = await import('../../../src/api.js');
    API = apiModule.API;
  });

  afterEach(() => {
    // Restore original window
    global.window = originalWindow;
    vi.clearAllMocks();
  });

  describe('getSavedPages', () => {
    beforeEach(() => {
      // Mock debug function
      global.debug = vi.fn();
    });

    it('should return mock data in standalone mode', async () => {
      global.getBrowserRuntime = vi.fn(() => null);
      global.getStorageAPI = vi.fn(() => null);
      global.MOCK_DATA = [
        { id: '1', title: 'Test Page', url: 'https://test.com' }
      ];
      global.filterMockData = vi.fn((data) => data);

      const result = await API.getSavedPages();

      expect(result.pages).toBeDefined();
      expect(result.pagination).toBeDefined();
      expect(global.filterMockData).toHaveBeenCalled();
    });

    it('should use cache in extension mode when available', async () => {
      global.getBrowserRuntime = vi.fn(() => ({ id: 'test' }));
      global.getStorageAPI = vi.fn(() => ({ local: {} }));

      const cachedData = {
        pages: [{ id: '1', title: 'Cached' }],
        pagination: { total: 1 }
      };

      // Mock cache manager
      API._cacheManager = {
        getCachedPages: vi.fn(async () => cachedData),
        setCachedPages: vi.fn()
      };

      const result = await API.getSavedPages();

      expect(result).toEqual(cachedData);
      expect(API._cacheManager.getCachedPages).toHaveBeenCalled();
    });

    it('should skip cache when skipCache option is true', async () => {
      global.getBrowserRuntime = vi.fn(() => ({ id: 'test' }));
      global.getStorageAPI = vi.fn(() => ({ local: {} }));
      global.CONFIG = { cloudFunctionUrl: 'https://test.run.app' };

      // Mock Firebase auth
      global.window.firebaseAuth = { currentUser: { uid: 'user123' } };
      global.window.firebaseGetIdToken = vi.fn(async () => 'token');

      // Mock fetch
      const mockResponse = {
        ok: true,
        json: async () => ({ pages: [{ id: '1', title: 'Fresh' }] })
      };
      global.fetch = vi.fn(async () => mockResponse);

      // Mock cache manager
      API._cacheManager = {
        getCachedPages: vi.fn(async () => ({ pages: [], pagination: {} })),
        setCachedPages: vi.fn()
      };

      const result = await API.getSavedPages({ skipCache: true });

      expect(API._cacheManager.getCachedPages).not.toHaveBeenCalled();
      expect(global.fetch).toHaveBeenCalled();
      expect(result.pages).toHaveLength(1);
    });
  });

  describe('deletePage', () => {
    it('should delete from mock data in standalone mode', async () => {
      global.getBrowserRuntime = vi.fn(() => null);
      global.MOCK_DATA = [
        { id: '1', title: 'Page 1' },
        { id: '2', title: 'Page 2' }
      ];
      global.debug = vi.fn();

      const result = await API.deletePage('1');

      expect(result.success).toBe(true);
      expect(global.MOCK_DATA).toHaveLength(1);
      expect(global.MOCK_DATA[0].id).toBe('2');
    });

    it('should call DELETE endpoint in extension mode', async () => {
      global.getBrowserRuntime = vi.fn(() => ({ id: 'test' }));
      global.getStorageAPI = vi.fn(() => ({ local: {} }));
      global.CONFIG = { cloudFunctionUrl: 'https://test.run.app' };

      // Mock Firebase
      global.window.firebaseAuth = { currentUser: { uid: 'user123' } };
      global.window.firebaseGetIdToken = vi.fn(async () => 'token');

      // Mock fetch
      const mockResponse = {
        ok: true,
        json: async () => ({ success: true })
      };
      global.fetch = vi.fn(async () => mockResponse);

      // Mock cache manager
      API._cacheManager = {
        invalidateCache: vi.fn()
      };

      const result = await API.deletePage('page-123');

      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining('id=page-123'),
        expect.objectContaining({
          method: 'DELETE',
          headers: expect.objectContaining({
            'Authorization': 'Bearer token'
          })
        })
      );
      expect(API._cacheManager.invalidateCache).toHaveBeenCalled();
      expect(result.success).toBe(true);
    });

    it('should throw error when delete fails', async () => {
      global.getBrowserRuntime = vi.fn(() => ({ id: 'test' }));
      global.getStorageAPI = vi.fn(() => ({ local: {} }));
      global.CONFIG = { cloudFunctionUrl: 'https://test.run.app' };

      global.window.firebaseAuth = { currentUser: { uid: 'user123' } };
      global.window.firebaseGetIdToken = vi.fn(async () => 'token');

      const mockResponse = {
        ok: false,
        status: 404,
        json: async () => ({ error: 'Page not found' })
      };
      global.fetch = vi.fn(async () => mockResponse);

      await expect(API.deletePage('nonexistent')).rejects.toThrow('Page not found');
    });
  });

  describe('updatePage', () => {
    it('should update mock data in standalone mode', async () => {
      global.getBrowserRuntime = vi.fn(() => null);
      global.MOCK_DATA = [
        { id: '1', title: 'Original', notes: '' }
      ];
      global.debug = vi.fn();

      const result = await API.updatePage('1', { notes: 'Updated notes' });

      expect(result.notes).toBe('Updated notes');
      expect(global.MOCK_DATA[0].notes).toBe('Updated notes');
    });

    it('should call PATCH endpoint in extension mode', async () => {
      global.getBrowserRuntime = vi.fn(() => ({ id: 'test' }));
      global.getStorageAPI = vi.fn(() => ({ local: {} }));
      global.CONFIG = { cloudFunctionUrl: 'https://test.run.app' };

      global.window.firebaseAuth = { currentUser: { uid: 'user123' } };
      global.window.firebaseGetIdToken = vi.fn(async () => 'token');

      const mockResponse = {
        ok: true,
        json: async () => ({ id: 'page-123', notes: 'New notes' })
      };
      global.fetch = vi.fn(async () => mockResponse);

      const result = await API.updatePage('page-123', { notes: 'New notes' });

      expect(global.fetch).toHaveBeenCalledWith(
        'https://test.run.app/updatePage',
        expect.objectContaining({
          method: 'PATCH',
          headers: expect.objectContaining({
            'Content-Type': 'application/json',
            'Authorization': 'Bearer token'
          }),
          body: JSON.stringify({ id: 'page-123', notes: 'New notes' })
        })
      );
      expect(result.notes).toBe('New notes');
    });

    it('should throw error when page not found in standalone mode', async () => {
      global.getBrowserRuntime = vi.fn(() => null);
      global.MOCK_DATA = [];
      global.debug = vi.fn();

      await expect(API.updatePage('nonexistent', { notes: 'test' }))
        .rejects.toThrow('Page not found');
    });
  });

  describe('Cache Operations', () => {
    it('should return null for getCachedPages in standalone mode', async () => {
      global.getBrowserRuntime = vi.fn(() => null);

      const cached = await API.getCachedPages();
      expect(cached).toBeNull();
    });

    it('should do nothing for setCachedPages in standalone mode', async () => {
      global.getBrowserRuntime = vi.fn(() => null);

      // Should not throw
      await expect(API.setCachedPages({ pages: [] })).resolves.toBeUndefined();
    });

    it('should do nothing for invalidateCache in standalone mode', async () => {
      global.getBrowserRuntime = vi.fn(() => null);

      // Should not throw
      await expect(API.invalidateCache()).resolves.toBeUndefined();
    });
  });
});
