import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createApiTestHarness } from './api/test-api-harness.js';

describe('API - bulkImportBookmarks', () => {
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
    harness.setStandaloneMode();
    API = harness.API;
    API._cacheManager = null;
  });

  afterEach(() => {
    global.window = originalWindow;
    vi.clearAllMocks();
  });

  it('sends a bulk POST with the right shape in extension mode', async () => {
    harness.setExtensionMode({ local: {} }, { id: 'test' });
    harness.setCloudFunctionUrl('https://test.run.app');

    global.window.firebaseAuth = { currentUser: { uid: 'user123' } };
    global.window.firebaseGetIdToken = vi.fn(async () => 'token');

    const mockResponse = {
      ok: true,
      json: async () => ({ success: true, imported: 3, skipped: 1 })
    };
    global.fetch = vi.fn(async () => mockResponse);
    API._cacheManager = { invalidateCache: vi.fn() };

    const bookmarks = [
      { url: 'https://a.com', title: 'A' },
      { url: 'https://b.com', title: 'B' },
      { url: 'https://c.com' }
    ];

    const result = await API.bulkImportBookmarks({ bookmarks, projectId: 'project-1' });

    expect(global.fetch).toHaveBeenCalledWith(
      'https://test.run.app',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          'Content-Type': 'application/json',
          'Authorization': 'Bearer token'
        })
      })
    );

    // The body must flag bulk:true so the backend routes to handleBulkImport.
    const fetchCall = global.fetch.mock.calls[0][1];
    const body = JSON.parse(fetchCall.body);
    expect(body.bulk).toBe(true);
    expect(body.projectId).toBe('project-1');
    expect(body.bookmarks).toHaveLength(3);

    expect(result.imported).toBe(3);
    expect(result.skipped).toBe(1);
    expect(API._cacheManager.invalidateCache).toHaveBeenCalled();
  });

  it('omits projectId when none is provided', async () => {
    harness.setExtensionMode({ local: {} }, { id: 'test' });
    harness.setCloudFunctionUrl('https://test.run.app');

    global.window.firebaseAuth = { currentUser: { uid: 'user123' } };
    global.window.firebaseGetIdToken = vi.fn(async () => 'token');
    global.fetch = vi.fn(async () => ({
      ok: true,
      json: async () => ({ success: true, imported: 1, skipped: 0 })
    }));
    API._cacheManager = { invalidateCache: vi.fn() };

    await API.bulkImportBookmarks({ bookmarks: [{ url: 'https://a.com' }] });

    const body = JSON.parse(global.fetch.mock.calls[0][1].body);
    expect(body.projectId).toBeNull();
    expect(body.bulk).toBe(true);
  });

  it('uses the standalone mock in standalone mode', async () => {
    const bookmarks = [{ url: 'https://a.com', title: 'A' }];
    const result = await API.bulkImportBookmarks({ bookmarks });

    expect(result.success).toBe(true);
    expect(result.imported).toBe(1);
    expect(result.skipped).toBe(0);
  });

  it('throws when the backend rejects the batch', async () => {
    harness.setExtensionMode({ local: {} }, { id: 'test' });
    harness.setCloudFunctionUrl('https://test.run.app');

    global.window.firebaseAuth = { currentUser: { uid: 'user123' } };
    global.window.firebaseGetIdToken = vi.fn(async () => 'token');
    global.fetch = vi.fn(async () => ({
      ok: false,
      status: 400,
      json: async () => ({ error: 'bookmarks exceeds the maximum of 1000' })
    }));

    await expect(
      API.bulkImportBookmarks({ bookmarks: [{ url: 'https://a.com' }] })
    ).rejects.toThrow('bookmarks exceeds the maximum of 1000');
  });
});
