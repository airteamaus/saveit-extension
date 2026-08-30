import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createApiTestHarness } from './test-api-harness.js';

describe('feed cache surface', () => {
  let harness;
  let API;

  beforeEach(() => {
    harness = createApiTestHarness();
    harness.setExtensionMode({ local: {} }, { id: 'test' });
    API = harness.API;
  });

  it('lazily constructs a feedCacheManager with the feed prefix', () => {
    expect(API._feedCacheManager).toBeNull();
    const manager = API.feedCacheManager;
    expect(manager).toBeTruthy();
    expect(manager.CACHE_KEY_PREFIX).toBe('feed_cache');
  });

  it('getFeedCachedPages delegates to the feed cache manager', async () => {
    const cached = { pages: [], scope: null, pagination: {} };
    API._feedCacheManager = { getCachedPages: vi.fn(async () => cached), invalidateCache: vi.fn() };
    await expect(API.getFeedCachedPages({ surface: 'feed' })).resolves.toBe(cached);
    // options defaults to {} and is forwarded, mirroring the other surfaces
    expect(API._feedCacheManager.getCachedPages).toHaveBeenCalledWith({ surface: 'feed' }, {});
  });

  it('setFeedCachedPages and invalidateFeedCache delegate to the feed manager', async () => {
    API._feedCacheManager = { setCachedPages: vi.fn(), invalidateCache: vi.fn() };
    await API.setFeedCachedPages({ pages: [] }, { surface: 'feed' });
    await API.invalidateFeedCache();
    expect(API._feedCacheManager.setCachedPages).toHaveBeenCalled();
    expect(API._feedCacheManager.invalidateCache).toHaveBeenCalledWith(null);
  });

  it('invalidateAllCaches includes the feed surface', async () => {
    API._cacheManager = { invalidateCache: vi.fn() };
    API._projectsCacheManager = { invalidateCache: vi.fn() };
    API._domainsCacheManager = { invalidateCache: vi.fn() };
    API._feedCacheManager = { invalidateCache: vi.fn() };
    await API.invalidateAllCaches();
    expect(API._feedCacheManager.invalidateCache).toHaveBeenCalled();
  });

  it('feed cache manager never shares identity with the pages cache manager', () => {
    expect(API.feedCacheManager).not.toBe(API.cacheManager);
  });
});
