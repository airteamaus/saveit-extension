import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

describe('API - Utility Functions', () => {
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

  describe('_normalizeResponse', () => {
    beforeEach(() => {
      global.debug = vi.fn();
    });

    it('should normalize response with pages array', () => {
      const data = {
        pages: [{ id: '1' }, { id: '2' }],
        pagination: { total: 2, hasNextPage: false }
      };

      const result = API._normalizeResponse(data);

      expect(result.pages).toEqual(data.pages);
      expect(result.pagination).toEqual(data.pagination);
    });

    it('should normalize response without pagination', () => {
      const data = {
        pages: [{ id: '1' }, { id: '2' }]
      };

      const result = API._normalizeResponse(data);

      expect(result.pages).toEqual(data.pages);
      expect(result.pagination).toEqual({
        total: 2,
        hasNextPage: false,
        nextCursor: null
      });
    });

    it('should normalize response when data is bare array', () => {
      const data = [{ id: '1' }, { id: '2' }];

      const result = API._normalizeResponse(data);

      expect(result.pages).toEqual(data);
      expect(result.pagination.total).toBe(2);
    });
  });

  describe('_fetchWithAuth', () => {
    beforeEach(() => {
      global.getBrowserRuntime = vi.fn(() => ({ id: 'test' }));
      global.getStorageAPI = vi.fn(() => ({ local: {} }));
      global.CONFIG = { cloudFunctionUrl: 'https://test.run.app' };
      global.window.firebaseAuth = { currentUser: { uid: 'user123' } };
      global.window.firebaseGetIdToken = vi.fn(async () => 'test-token');
    });

    it('should build URL with params object', async () => {
      const mockResponse = {
        ok: true,
        json: async () => ({ success: true })
      };
      global.fetch = vi.fn(async () => mockResponse);

      await API._fetchWithAuth('/test', { foo: 'bar', baz: '123' });

      expect(global.fetch).toHaveBeenCalledWith(
        'https://test.run.app/test?foo=bar&baz=123',
        expect.any(Object)
      );
    });

    it('should build URL with URLSearchParams', async () => {
      const mockResponse = {
        ok: true,
        json: async () => ({ success: true })
      };
      global.fetch = vi.fn(async () => mockResponse);

      const params = new URLSearchParams({ key: 'value' });
      await API._fetchWithAuth('/test', params);

      expect(global.fetch).toHaveBeenCalledWith(
        'https://test.run.app/test?key=value',
        expect.any(Object)
      );
    });

    it('should handle full URL endpoints', async () => {
      const mockResponse = {
        ok: true,
        json: async () => ({ success: true })
      };
      global.fetch = vi.fn(async () => mockResponse);

      await API._fetchWithAuth('https://other-service.com/api', { test: '1' });

      expect(global.fetch).toHaveBeenCalledWith(
        'https://other-service.com/api?test=1',
        expect.any(Object)
      );
    });

    it('should include Authorization header', async () => {
      const mockResponse = {
        ok: true,
        json: async () => ({ success: true })
      };
      global.fetch = vi.fn(async () => mockResponse);

      await API._fetchWithAuth('/test');

      expect(global.fetch).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          headers: expect.objectContaining({
            'Authorization': 'Bearer test-token'
          })
        })
      );
    });

    it('should use custom headers when provided', async () => {
      const mockResponse = {
        ok: true,
        json: async () => ({ success: true })
      };
      global.fetch = vi.fn(async () => mockResponse);

      await API._fetchWithAuth('/test', null, {
        headers: { 'X-Custom': 'header' }
      });

      // Should include BOTH Authorization header AND custom headers
      expect(global.fetch).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          headers: {
            'Authorization': 'Bearer test-token',
            'X-Custom': 'header'
          },
          method: 'GET'
        })
      );
    });
  });
});
