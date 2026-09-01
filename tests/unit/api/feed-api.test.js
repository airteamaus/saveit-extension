import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createApiTestHarness } from './test-api-harness.js';

const FEED_RESPONSE = {
  scope: { type: 'org', domain: 'acme.com', public: false },
  pages: [{ id: 'p1', votes: 2, voted: false, mine: false, saved_by: 'Ann' }],
  pagination: { total_in_window: 1, next_offset: null, has_more: false }
};

function extensionHarness() {
  const harness = createApiTestHarness();
  harness.setExtensionMode({ local: {} }, { id: 'test' });
  global.window = global.window || {};
  global.window.firebaseAuth = {};
  global.window.firebaseGetIdToken = async () => 'token';
  return harness;
}

describe('API.getFeed (extension mode)', () => {
  let API;

  beforeEach(() => {
    const harness = extensionHarness();
    API = harness.API;
    API._feedCacheManager = { getCachedPages: vi.fn(async () => null), setCachedPages: vi.fn() };
  });

  it('fetches /feed with limit/offset params and caches the response', async () => {
    global.fetch = vi.fn(async () => ({
      ok: true,
      json: async () => FEED_RESPONSE
    }));
    const result = await API.getFeed({ limit: 50 });
    expect(global.fetch).toHaveBeenCalledWith(
      expect.stringContaining('/feed'),
      expect.objectContaining({ method: 'GET' })
    );
    expect(result.scope.domain).toBe('acme.com');
    expect(API._feedCacheManager.setCachedPages).toHaveBeenCalled();
  });

  it('rejects a pages-list 200 from the pre-feed backend (deploy bridge)', async () => {
    // The old backend does not 404 unknown GETs — /feed falls through to the
    // pages-list handler. That response has no scope, and must be treated as
    // "feed unavailable" (error.status 404) so the desk falls back to the
    // personal list instead of rendering anonymous, button-less rows.
    global.fetch = vi.fn(async () => ({
      ok: true,
      json: async () => ({
        pages: [{ id: 'p1', title: 'A personal page' }],
        pagination: { total: 1, nextCursor: null, hasNextPage: false }
      })
    }));
    const error = await API.getFeed().catch((e) => e);
    expect(error).toBeInstanceOf(Error);
    expect(error.status).toBe(404);
    expect(API._feedCacheManager.setCachedPages).not.toHaveBeenCalled();
  });

  it('serves a fresh cache hit without fetching', async () => {
    API._feedCacheManager.getCachedPages = vi.fn(async () => FEED_RESPONSE);
    global.fetch = vi.fn();
    const result = await API.getFeed();
    expect(global.fetch).not.toHaveBeenCalled();
    expect(result.meta.fromCache).toBe(true);
  });

  it('passes scope=personal through to the request and its cache key', async () => {
    global.fetch = vi.fn(async () => ({
      ok: true,
      json: async () => ({ ...FEED_RESPONSE, scope: { type: 'personal', domain: 'acme.com', public: false } })
    }));
    await API.getFeed({ scope: 'personal' });
    expect(global.fetch).toHaveBeenCalledWith(
      expect.stringMatching(/\/feed\?.*scope=personal/),
      expect.objectContaining({ method: 'GET' })
    );
    // The cache read is keyed per view so an org response can never
    // warm-paint under the personal key.
    expect(API._feedCacheManager.getCachedPages).toHaveBeenCalledWith(
      { surface: 'feed', feedScope: 'personal' },
      expect.anything()
    );
    expect(API._feedCacheManager.setCachedPages).toHaveBeenCalledWith(
      expect.anything(),
      { surface: 'feed', feedScope: 'personal' }
    );
  });

  it('omits the scope param and keys the cache as org when no scope is requested', async () => {
    global.fetch = vi.fn(async () => ({
      ok: true,
      json: async () => FEED_RESPONSE
    }));
    await API.getFeed();
    expect(global.fetch).toHaveBeenCalledWith(
      expect.not.stringContaining('scope='),
      expect.anything()
    );
    expect(API._feedCacheManager.getCachedPages).toHaveBeenCalledWith(
      { surface: 'feed', feedScope: 'org' },
      expect.anything()
    );
  });

  it('load-more offsets skip the cache but still fetch', async () => {
    global.fetch = vi.fn(async () => ({
      ok: true,
      json: async () => FEED_RESPONSE
    }));
    await API.getFeed({ offset: 50, skipCache: true });
    expect(global.fetch).toHaveBeenCalled();
    expect(API._feedCacheManager.getCachedPages).not.toHaveBeenCalled();
  });

  it('propagates a 404 with error.status so the UI can bridge to the personal list', async () => {
    global.fetch = vi.fn(async () => ({
      ok: false,
      status: 404,
      json: async () => ({ error: 'Not Found', message: 'nope' })
    }));
    const error = await API.getFeed().catch((e) => e);
    expect(error).toBeInstanceOf(Error);
    expect(error.status).toBe(404);
  });
});

describe('API.votePage', () => {
  it('POSTs { id } to /vote in extension mode', async () => {
    const harness = extensionHarness();
    const API = harness.API;
    global.fetch = vi.fn(async () => ({
      ok: true,
      json: async () => ({ id: 'p1', votes: 3, voted: true })
    }));
    const result = await API.votePage('p1');
    expect(global.fetch).toHaveBeenCalledWith(
      expect.stringContaining('/vote'),
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ id: 'p1' })
      })
    );
    expect(result.voted).toBe(true);
  });

  it('rejects optimistic ids before any network call', async () => {
    const harness = extensionHarness();
    global.fetch = vi.fn();
    await expect(harness.API.votePage('optimistic:https://x.com')).rejects.toThrow();
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('toggles the standalone mock in standalone mode', async () => {
    const harness = createApiTestHarness();
    harness.setStandaloneMode();
    globalThis.MOCK_DATA = [{ id: '2', url: 'u', title: 'B', user_email: 'o@gmail.com' }];
    const first = await harness.API.votePage('2');
    const second = await harness.API.votePage('2');
    expect(first.voted).toBe(true);
    expect(second.voted).toBe(false);
  });
});
