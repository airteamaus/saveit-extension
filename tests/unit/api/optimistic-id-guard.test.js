import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createApiTestHarness } from './test-api-harness.js';

// Regression: optimistic tile ids are `optimistic:<normalized-url>`, and the
// URL's protocol leaves `//` in the id — making it an invalid Firestore path.
// The renderer disables id-bearing actions on optimistic tiles, but a UI bug
// that lets one slip through would crash the backend call. The API boundary
// is the last gate: every method that sends a page id to the backend must
// reject an optimistic id before issuing the request.
describe('API - optimistic-id boundary guard', () => {
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
    harness.setExtensionMode({ local: {} }, { id: 'test-extension' });
    harness.setCloudFunctionUrl('https://test-function.run.app');
    // If fetch were called, the test would fail on the assertion below —
    // but also seed it to throw so a guard regression surfaces as an error
    // rather than a silent network roundtrip.
    global.fetch = vi.fn(() => {
      throw new Error('fetch should not be called for an optimistic id');
    });
    API = harness.API;
    API._cacheManager = { invalidateCache: vi.fn() };
    API._domainsCacheManager = { invalidateCache: vi.fn() };
    API._projectsCacheManager = { invalidateCache: vi.fn() };
  });

  afterEach(() => {
    global.window = originalWindow;
    vi.clearAllMocks();
  });

  const OPTIMISTIC_ID = 'optimistic:https://example.com/article';

  it('deletePage rejects an optimistic id before issuing the request', async () => {
    await expect(API.deletePage(OPTIMISTIC_ID)).rejects.toThrow(/optimistic/i);
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('updatePage rejects an optimistic id before issuing the request', async () => {
    await expect(API.updatePage(OPTIMISTIC_ID, { title: 'x' })).rejects.toThrow(/optimistic/i);
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('pinPage rejects an optimistic id before issuing the request', async () => {
    await expect(API.pinPage(OPTIMISTIC_ID, true)).rejects.toThrow(/optimistic/i);
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('addPageToProject rejects an optimistic page id before issuing the request', async () => {
    await expect(API.addPageToProject('project-1', OPTIMISTIC_ID)).rejects.toThrow(/optimistic/i);
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('removePageFromProject rejects an optimistic page id before issuing the request', async () => {
    await expect(API.removePageFromProject('project-1', OPTIMISTIC_ID)).rejects.toThrow(/optimistic/i);
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('does not affect real (enriched) page ids', async () => {
    // Real ids do NOT start with 'optimistic:' and must reach the transport.
    // Seed a successful fetch so the call resolves; the assertion is just that
    // the guard didn't throw.
    global.fetch = vi.fn(async () => ({ ok: true, json: async () => ({ success: true }) }));

    await expect(API.deletePage('user1_abc1234567890def')).resolves.toEqual({ success: true });
    expect(global.fetch).toHaveBeenCalled();
  });
});
