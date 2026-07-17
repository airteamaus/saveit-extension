import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createApiTestHarness } from './test-api-harness.js';

// Verifies the per-surface cache isolation invariant: a mutation on one
// surface invalidates only that surface's cache (plus any other surface whose
// data it can change), not every surface wholesale. This is the fix for the
// architectural finding that "every mutation nukes the whole user cache".
describe('API - per-surface cache isolation', () => {
  let API;
  let harness;
  let originalWindow;

  beforeEach(() => {
    originalWindow = { ...global.window };
    global.window = {
      firebaseAuth: { currentUser: { uid: 'user123' } },
      firebaseReady: null,
      firebaseGetIdToken: vi.fn(async () => 'token'),
      SentryHelpers: null
    };

    harness = createApiTestHarness({ cloudFunctionUrl: 'https://test.run.app' });
    harness.setExtensionMode({ local: {} }, { id: 'test' });
    API = harness.API;

    // Stand up three distinct mock managers so we can assert which surface
    // each mutation touched. Each tracks its own invalidateCache calls.
    API._cacheManager = { invalidateCache: vi.fn(async () => {}) };
    API._projectsCacheManager = { invalidateCache: vi.fn(async () => {}) };
    API._domainsCacheManager = { invalidateCache: vi.fn(async () => {}) };

    global.fetch = vi.fn(async () => ({
      ok: true,
      json: async () => ({ id: 'ok' })
    }));
  });

  afterEach(() => {
    global.window = originalWindow;
    vi.clearAllMocks();
  });

  it('createProject invalidates only the projects surface', async () => {
    await API.createProject({ name: 'New project' });

    expect(API._projectsCacheManager.invalidateCache).toHaveBeenCalledTimes(1);
    // A project create does not touch saved pages or domains.
    expect(API._cacheManager.invalidateCache).not.toHaveBeenCalled();
    expect(API._domainsCacheManager.invalidateCache).not.toHaveBeenCalled();
  });

  it('updateProject invalidates only the projects surface', async () => {
    await API.updateProject('project-1', { name: 'Renamed' });

    expect(API._projectsCacheManager.invalidateCache).toHaveBeenCalledTimes(1);
    expect(API._cacheManager.invalidateCache).not.toHaveBeenCalled();
    expect(API._domainsCacheManager.invalidateCache).not.toHaveBeenCalled();
  });

  it('pinPage invalidates only the saved-pages surface', async () => {
    await API.pinPage('page-1', true);

    expect(API._cacheManager.invalidateCache).toHaveBeenCalledTimes(1);
    // Pinning does not change project membership or domain counts.
    expect(API._projectsCacheManager.invalidateCache).not.toHaveBeenCalled();
    expect(API._domainsCacheManager.invalidateCache).not.toHaveBeenCalled();
  });

  it('deletePage invalidates saved-pages and domains (not projects)', async () => {
    await API.deletePage('page-1');

    expect(API._cacheManager.invalidateCache).toHaveBeenCalledTimes(1);
    expect(API._domainsCacheManager.invalidateCache).toHaveBeenCalledTimes(1);
    // Deleting a page does not change project membership.
    expect(API._projectsCacheManager.invalidateCache).not.toHaveBeenCalled();
  });

  it('addPageToProject invalidates both projects and saved-pages', async () => {
    await API.addPageToProject('project-1', 'page-1');

    // Membership changes the projects cache; the page's project_ids changes
    // the saved-pages cache.
    expect(API._projectsCacheManager.invalidateCache).toHaveBeenCalledTimes(1);
    expect(API._cacheManager.invalidateCache).toHaveBeenCalledTimes(1);
    expect(API._domainsCacheManager.invalidateCache).not.toHaveBeenCalled();
  });

  it('invalidateAllCaches touches every surface', async () => {
    await API.invalidateAllCaches();

    expect(API._cacheManager.invalidateCache).toHaveBeenCalledTimes(1);
    expect(API._projectsCacheManager.invalidateCache).toHaveBeenCalledTimes(1);
    expect(API._domainsCacheManager.invalidateCache).toHaveBeenCalledTimes(1);
  });
});
