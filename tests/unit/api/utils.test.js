import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createApiTestHarness } from './test-api-harness.js';
import { getSessionToken } from '../../../src/session-store.js';

describe('API - Utility Functions', () => {
  let API;
  let harness;
  let originalWindow;

  beforeEach(() => {
    // Save original window state
    originalWindow = { ...global.window };

    // Set up minimal global environment
    global.window = {
      firebaseAuth: null,
      firebaseReady: null,
      firebaseGetIdToken: null,
      SentryHelpers: null
    };

    harness = createApiTestHarness({ cloudFunctionUrl: 'https://test-function.run.app' });
    harness.setStandaloneMode();
    API = harness.API;
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
      expect(result.pagination).toEqual({
        total: 2,
        hasNextPage: false,
        nextCursor: null
      });
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

    it('should normalize legacy top-level pagination fields', () => {
      const data = {
        pages: [{ id: '1' }, { id: '2' }],
        total: 410,
        hasMore: true,
        nextCursor: 'page-2'
      };

      const result = API._normalizeResponse(data);

      expect(result.pages).toEqual(data.pages);
      expect(result.pagination).toEqual({
        total: 410,
        hasNextPage: true,
        nextCursor: 'page-2'
      });
    });

    it('should normalize snake_case pagination fields', () => {
      const data = {
        pages: [{ id: '1' }, { id: '2' }],
        pagination: {
          total: 410,
          has_more: true,
          next_cursor: 'page-2'
        }
      };

      const result = API._normalizeResponse(data);

      expect(result.pages).toEqual(data.pages);
      expect(result.pagination).toEqual({
        total: 410,
        hasNextPage: true,
        nextCursor: 'page-2'
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
      harness.setExtensionMode({ local: {} }, { id: 'test' });
      harness.setCloudFunctionUrl('https://test.run.app');
      getSessionToken.mockResolvedValue('test-token');
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

  describe('checkSavedPagesUpdates', () => {
    beforeEach(() => {
      harness.setExtensionMode({ local: {} }, { id: 'test' });
      harness.setCloudFunctionUrl('https://test.run.app');
      getSessionToken.mockResolvedValue('test-token');
    });

    it('returns no updates when the HEAD probe responds 204', async () => {
      global.fetch = vi.fn(async () => ({
        ok: true,
        status: 204,
        headers: {
          get: vi.fn(() => null)
        }
      }));

      const result = await API.checkSavedPagesUpdates({ latestKnownId: 'page-1' });

      expect(result).toEqual({
        hasUpdates: false,
        anchorFound: true,
        canIncrementalSync: true
      });
      expect(global.fetch).toHaveBeenCalledWith(
        'https://test.run.app?limit=50&search=&sort=newest&latestKnownId=page-1',
        expect.objectContaining({
          method: 'HEAD'
        })
      );
    });

    it('returns update metadata from HEAD response headers', async () => {
      global.fetch = vi.fn(async () => ({
        ok: true,
        status: 200,
        headers: {
          get: vi.fn((header) => {
            if (header === 'x-saveit-anchor-found') return 'false';
            if (header === 'x-saveit-can-incremental-sync') return 'false';
            return null;
          })
        }
      }));

      const result = await API.checkSavedPagesUpdates({ latestKnownId: 'page-1' });

      expect(result).toEqual({
        hasUpdates: true,
        anchorFound: false,
        canIncrementalSync: false
      });
    });
  });
});
