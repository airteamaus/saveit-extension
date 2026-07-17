import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createApiTestHarness } from './test-api-harness.js';

// Mock debug function — api-pages-domains delegates to api-pages-standalone which
// references bare global `debug` until the Phase 3 ESM-cleanup lands.
globalThis.debug = vi.fn();

describe('API - getDomains', () => {
  let API;
  let harness;
  let originalWindow;

  beforeEach(() => {
    originalWindow = { ...global.window };
    global.window = {
      firebaseAuth: null,
      firebaseReady: null,
      firebaseGetIdToken: null,
      SentryHelpers: null
    };

    harness = createApiTestHarness({ cloudFunctionUrl: 'https://test-function.run.app' });
    API = harness.API;
    API._cacheManager = null;
    API._projectsCacheManager = null;
    API._domainsCacheManager = null;
    vi.clearAllMocks();
  });

  afterEach(() => {
    global.window = originalWindow;
    vi.clearAllMocks();
  });

  describe('standalone mode', () => {
    beforeEach(() => {
      harness.setStandaloneMode();
    });

    it('derives domains from MOCK_DATA general classifications', async () => {
      globalThis.MOCK_DATA = [
        { classifications: [{ type: 'general', label: 'Geography' }] },
        { classifications: [{ type: 'general', label: 'Geography' }] },
        { classifications: [{ type: 'general', label: 'Computer Science' }] },
        { classifications: [{ type: 'domain', label: 'Ignored' }] }
      ];

      const result = await API.getDomains();

      // Only 'general' classifications are counted; sorted by domain name.
      expect(result).toEqual([
        { domain: 'Computer Science', count: 1 },
        { domain: 'Geography', count: 2 }
      ]);
    });

    it('marks the result as not from cache', async () => {
      globalThis.MOCK_DATA = [];

      const result = await API.getDomains();

      expect(result.meta).toEqual({ fromCache: false });
    });

    it('returns an empty array when no classifications exist', async () => {
      globalThis.MOCK_DATA = [{ id: '1' }, { id: '2' }];

      const result = await API.getDomains();

      expect(result).toEqual([]);
      // meta is attached to the (empty) array via defineProperty.
      expect(result.meta).toEqual({ fromCache: false });
    });
  });

  describe('extension mode', () => {
    it('serves from cache when available', async () => {
      harness.setExtensionMode({ local: {} }, { id: 'test' });
      const cachedDomains = [
        { domain: 'cached.example', count: 5 }
      ];
      API._domainsCacheManager = {
        getCachedPages: vi.fn(async () => cachedDomains),
        setCachedPages: vi.fn()
      };

      const result = await API.getDomains();

      expect(result).toBe(cachedDomains);
      expect(result.meta).toEqual({ fromCache: true });
      // Cache hit must short-circuit before a network fetch.
      expect(API._domainsCacheManager.setCachedPages).not.toHaveBeenCalled();
    });

    it('fetches and caches domains on a cache miss', async () => {
      harness.setExtensionMode({ local: {} }, { id: 'test' });
      harness.setCloudFunctionUrl('https://test.run.app');
      global.window.firebaseAuth = { currentUser: { uid: 'user123' } };
      global.window.firebaseGetIdToken = vi.fn(async () => 'token');
      const fetchedDomains = [{ domain: 'fresh.example', count: 3 }];
      global.fetch = vi.fn(async () => ({
        ok: true,
        json: async () => ({ domains: fetchedDomains })
      }));
      API._domainsCacheManager = {
        getCachedPages: vi.fn(async () => null),
        setCachedPages: vi.fn()
      };

      const result = await API.getDomains();

      expect(result).toEqual(fetchedDomains);
      expect(result.meta).toEqual({ fromCache: false });
      // The fetched batch must be written back to the cache.
      expect(API._domainsCacheManager.setCachedPages).toHaveBeenCalledWith(
        fetchedDomains,
        { surface: 'domains' }
      );
    });

    it('bypasses the cache when skipCache is true', async () => {
      harness.setExtensionMode({ local: {} }, { id: 'test' });
      harness.setCloudFunctionUrl('https://test.run.app');
      global.window.firebaseAuth = { currentUser: { uid: 'user123' } };
      global.window.firebaseGetIdToken = vi.fn(async () => 'token');
      global.fetch = vi.fn(async () => ({
        ok: true,
        json: async () => ({ domains: [{ domain: 'skipped-cache', count: 1 }] })
      }));
      const cachedDomains = [{ domain: 'stale.example', count: 9 }];
      API._domainsCacheManager = {
        getCachedPages: vi.fn(async () => cachedDomains),
        setCachedPages: vi.fn()
      };

      const result = await API.getDomains({ skipCache: true });

      // skipCache must skip the read entirely and go to the network.
      expect(API._domainsCacheManager.getCachedPages).not.toHaveBeenCalled();
      expect(global.fetch).toHaveBeenCalled();
      expect(result[0].domain).toBe('skipped-cache');
    });

    it('defaults to an empty domain list when the response omits domains', async () => {
      harness.setExtensionMode({ local: {} }, { id: 'test' });
      harness.setCloudFunctionUrl('https://test.run.app');
      global.window.firebaseAuth = { currentUser: { uid: 'user123' } };
      global.window.firebaseGetIdToken = vi.fn(async () => 'token');
      global.fetch = vi.fn(async () => ({
        ok: true,
        json: async () => ({})
      }));
      API._domainsCacheManager = {
        getCachedPages: vi.fn(async () => null),
        setCachedPages: vi.fn()
      };

      const result = await API.getDomains();

      expect(result).toEqual([]);
      expect(result.meta).toEqual({ fromCache: false });
    });

    it('surfaces fetch errors through the error-handling wrapper', async () => {
      harness.setExtensionMode({ local: {} }, { id: 'test' });
      harness.setCloudFunctionUrl('https://test.run.app');
      global.window.firebaseAuth = { currentUser: { uid: 'user123' } };
      global.window.firebaseGetIdToken = vi.fn(async () => 'token');
      global.fetch = vi.fn(async () => {
        throw new Error('network down');
      });
      API._domainsCacheManager = {
        getCachedPages: vi.fn(async () => null),
        setCachedPages: vi.fn()
      };

      // _executeWithErrorHandling rethrows after capturing telemetry; the
      // underlying error must propagate rather than being swallowed.
      await expect(API.getDomains()).rejects.toThrow('network down');
      // Nothing should be written to the cache when the fetch failed.
      expect(API._domainsCacheManager.setCachedPages).not.toHaveBeenCalled();
    });
  });
});
