import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createApiTestHarness } from './test-api-harness.js';

// Focused tests for the shared cached-read flow (_getCachedOrFreshList) that
// backs getSavedPages, getProjects, and getDomains. Each surface previously
// inlined its own copy; this locks in the shared contract.
describe('API - _getCachedOrFreshList (shared cached-read flow)', () => {
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
    harness = createApiTestHarness({ cloudFunctionUrl: 'https://test.run.app' });
    API = harness.API;
  });

  afterEach(() => {
    global.window = originalWindow;
    vi.restoreAllMocks();
  });

  function setupExtension() {
    harness.setExtensionMode({ local: {} }, { id: 'test' });
  }

  describe('extension mode', () => {
    it('returns the cached value as-is on a cache hit (no re-normalization)', async () => {
      setupExtension();
      const cached = { value: 'cached', preserved: true };

      const result = await API._getCachedOrFreshList({
        cacheScope: { surface: 'test' },
        readCache: vi.fn(async () => cached),
        writeCache: vi.fn(async () => {}),
        fetcher: vi.fn(async () => { throw new Error('should not fetch on cache hit'); }),
        normalize: vi.fn(() => { throw new Error('should not normalize on cache hit'); }),
        mockFetcher: vi.fn(() => { throw new Error('should not mock in extension mode'); }),
        context: 'test-context',
        options: {}
      });

      // The cached value is returned without re-normalization. For plain
      // objects _withCacheMetadata spreads into a new object (attaching meta);
      // for arrays it mutates in place. Either way the cached fields survive.
      expect(result).toMatchObject(cached);
      expect(result.meta.fromCache).toBe(true);
    });

    it('fetches, normalizes, writes the cache, and tags meta on a miss', async () => {
      setupExtension();
      const readCache = vi.fn(async () => null);
      const writeCache = vi.fn(async () => {});
      const fetcher = vi.fn(async () => ({ raw: 'data' }));
      const normalize = vi.fn((data) => ({ normalized: data }));

      const result = await API._getCachedOrFreshList({
        cacheScope: { surface: 'test' },
        readCache,
        writeCache,
        fetcher,
        normalize,
        mockFetcher: vi.fn(),
        context: 'test',
        options: {}
      });

      expect(fetcher).toHaveBeenCalled();
      expect(normalize).toHaveBeenCalledWith({ raw: 'data' });
      expect(writeCache).toHaveBeenCalledWith({ normalized: { raw: 'data' } }, { surface: 'test' });
      expect(result).toEqual({ normalized: { raw: 'data' }, meta: { fromCache: false } });
    });

    it('skips the cache read entirely when options.skipCache is true', async () => {
      setupExtension();
      const readCache = vi.fn(async () => ({ value: 'would-be-cached' }));
      const fetcher = vi.fn(async () => ({ raw: 'fresh' }));

      await API._getCachedOrFreshList({
        cacheScope: { surface: 'test' },
        readCache,
        writeCache: vi.fn(async () => {}),
        fetcher,
        normalize: (d) => d,
        mockFetcher: vi.fn(),
        context: 'test',
        options: { skipCache: true }
      });

      expect(readCache).not.toHaveBeenCalled();
      expect(fetcher).toHaveBeenCalled();
    });

    it('preserves the cache value exactly (does not add hasNextPage/nextCursor)', async () => {
      // Regression guard: a prior version of the helper re-normalized on a
      // cache hit, which mutated the stored shape (adding pagination fields the
      // stored payload didn't have). Cache hits must return the stored value
      // byte-for-byte (apart from the meta tag).
      setupExtension();
      const stored = { pages: [{ id: '1' }], pagination: { total: 1 } };

      const result = await API._getCachedOrFreshList({
        cacheScope: { surface: 'test' },
        readCache: vi.fn(async () => stored),
        writeCache: vi.fn(async () => {}),
        fetcher: vi.fn(),
        normalize: vi.fn((d) => d),
        mockFetcher: vi.fn(),
        context: 'test',
        options: {}
      });

      expect(result.pagination).toEqual({ total: 1 });
      expect(result.pagination).not.toHaveProperty('hasNextPage');
    });
  });

  describe('standalone mode', () => {
    it('falls back to the mock fetcher with fromCache: false', async () => {
      harness.setStandaloneMode();
      const mockFetcher = vi.fn(() => ({ value: 'mock' }));

      const result = await API._getCachedOrFreshList({
        cacheScope: { surface: 'test' },
        readCache: vi.fn(async () => null),
        writeCache: vi.fn(async () => {}),
        fetcher: vi.fn(async () => { throw new Error('should not fetch in standalone'); }),
        normalize: vi.fn(),
        mockFetcher,
        context: 'test',
        options: {}
      });

      expect(mockFetcher).toHaveBeenCalled();
      expect(result.meta.fromCache).toBe(false);
    });
  });
});
