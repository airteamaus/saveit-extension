import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createApiTestHarness } from './test-api-harness.js';

describe('API - CRUD Operations', () => {
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
    global.MOCK_PROJECTS = [];
    global.getMockProjectsData = vi.fn(() => []);
    global.createMockProjectData = vi.fn(project => ({ id: 'project-1', ...project, page_count: 0 }));
    global.updateMockProjectData = vi.fn((projectId, updates) => ({ id: projectId, ...updates, page_count: 1 }));
    global.addPageToMockProjectData = vi.fn((projectId, pageId) => ({ id: pageId, project_ids: [projectId] }));
    global.removePageFromMockProjectData = vi.fn((projectId, pageId) => ({ id: pageId, project_ids: [] }));
    API = harness.API;
    API._cacheManager = null;
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
      harness.setStandaloneMode();
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
      harness.setExtensionMode({ local: {} }, { id: 'test' });

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

      expect(result).toEqual({
        ...cachedData,
        meta: { fromCache: true }
      });
      expect(API._cacheManager.getCachedPages).toHaveBeenCalled();
    });

    it('should skip cache when skipCache option is true', async () => {
      harness.setExtensionMode({ local: {} }, { id: 'test' });
      harness.setCloudFunctionUrl('https://test.run.app');

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
      harness.setStandaloneMode();
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
      harness.setExtensionMode({ local: {} }, { id: 'test' });
      harness.setCloudFunctionUrl('https://test.run.app');

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
      harness.setExtensionMode({ local: {} }, { id: 'test' });
      harness.setCloudFunctionUrl('https://test.run.app');

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
      harness.setStandaloneMode();
      global.MOCK_DATA = [
        { id: '1', title: 'Original', notes: '' }
      ];
      global.debug = vi.fn();

      const result = await API.updatePage('1', { notes: 'Updated notes' });

      expect(result.notes).toBe('Updated notes');
      expect(global.MOCK_DATA[0].notes).toBe('Updated notes');
    });

    it('should call PATCH endpoint in extension mode', async () => {
      harness.setExtensionMode({ local: {} }, { id: 'test' });
      harness.setCloudFunctionUrl('https://test.run.app');

      global.window.firebaseAuth = { currentUser: { uid: 'user123' } };
      global.window.firebaseGetIdToken = vi.fn(async () => 'token');

      const mockResponse = {
        ok: true,
        json: async () => ({ id: 'page-123', notes: 'New notes' })
      };
      global.fetch = vi.fn(async () => mockResponse);
      API._cacheManager = {
        invalidateCache: vi.fn()
      };

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
      expect(API._cacheManager.invalidateCache).toHaveBeenCalled();
    });

    it('should throw error when page not found in standalone mode', async () => {
      harness.setStandaloneMode();
      global.MOCK_DATA = [];
      global.debug = vi.fn();

      await expect(API.updatePage('nonexistent', { notes: 'test' }))
        .rejects.toThrow('Page not found');
    });
  });

  describe('project operations', () => {
    it('should return mock projects in standalone mode', async () => {
      const projects = [{ id: 'project-1', name: "Buckley's product" }];
      global.getMockProjectsData = vi.fn(() => projects);

      const result = await API.getProjects();

      expect(result).toEqual(projects);
      expect(global.getMockProjectsData).toHaveBeenCalled();
    });

    it('should create project in standalone mode', async () => {
      const result = await API.createProject({ name: 'New project', visibility: 'private' });

      expect(global.createMockProjectData).toHaveBeenCalledWith({
        name: 'New project',
        visibility: 'private'
      });
      expect(result.id).toBe('project-1');
    });

    it('should send a minimal create payload in extension mode', async () => {
      harness.setExtensionMode({ local: {} }, { id: 'test' });
      harness.setCloudFunctionUrl('https://test.run.app');
      global.window.firebaseAuth = { currentUser: { uid: 'user123' } };
      global.window.firebaseGetIdToken = vi.fn(async () => 'token');
      global.fetch = vi.fn(async () => ({
        ok: true,
        json: async () => ({ id: 'project-1', name: 'New project', visibility: 'private' })
      }));
      API._cacheManager = {
        invalidateCache: vi.fn()
      };

      await API.createProject({
        name: '  New project  ',
        owner_user_id: 'user123',
        visibility: 'private',
        company_domain: null
      });

      expect(global.fetch).toHaveBeenCalledWith(
        'https://test.run.app/projects',
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({
            'Content-Type': 'application/json',
            'Authorization': 'Bearer token'
          }),
          body: JSON.stringify({ name: 'New project' })
        })
      );
      expect(API._cacheManager.invalidateCache).toHaveBeenCalled();
    });

    it('should update project in standalone mode', async () => {
      const result = await API.updateProject('project-1', { name: 'Renamed' });

      expect(global.updateMockProjectData).toHaveBeenCalledWith('project-1', { name: 'Renamed' });
      expect(result.id).toBe('project-1');
      expect(result.name).toBe('Renamed');
    });

    it('should omit null company_domain in extension update payloads', async () => {
      harness.setExtensionMode({ local: {} }, { id: 'test' });
      harness.setCloudFunctionUrl('https://test.run.app');
      global.window.firebaseAuth = { currentUser: { uid: 'user123' } };
      global.window.firebaseGetIdToken = vi.fn(async () => 'token');
      global.fetch = vi.fn(async () => ({
        ok: true,
        json: async () => ({ id: 'project-1', visibility: 'private' })
      }));
      API._cacheManager = {
        invalidateCache: vi.fn()
      };

      await API.updateProject('project-1', {
        visibility: 'private',
        company_domain: null
      });

      expect(global.fetch).toHaveBeenCalledWith(
        'https://test.run.app/projects/project-1',
        expect.objectContaining({
          method: 'PATCH',
          body: JSON.stringify({ visibility: 'private' })
        })
      );
    });

    it('should add page to project in standalone mode', async () => {
      const result = await API.addPageToProject('project-1', 'page-123');

      expect(global.addPageToMockProjectData).toHaveBeenCalledWith('project-1', 'page-123');
      expect(result.project_ids).toEqual(['project-1']);
    });

    it('should remove page from project in standalone mode', async () => {
      const result = await API.removePageFromProject('project-1', 'page-123');

      expect(global.removePageFromMockProjectData).toHaveBeenCalledWith('project-1', 'page-123');
      expect(result.project_ids).toEqual([]);
    });

    it('should call projects endpoint in extension mode', async () => {
      harness.setExtensionMode({ local: {} }, { id: 'test' });
      harness.setCloudFunctionUrl('https://test.run.app');
      global.window.firebaseAuth = { currentUser: { uid: 'user123' } };
      global.window.firebaseGetIdToken = vi.fn(async () => 'token');
      API._cacheManager = {
        getCachedPages: vi.fn(async () => null),
        setCachedPages: vi.fn(async () => {})
      };
      global.fetch = vi.fn(async () => ({
        ok: true,
        json: async () => ([{ id: 'project-1', name: 'Shared project' }])
      }));

      const result = await API.getProjects({ includeArchived: true });

      expect(global.fetch).toHaveBeenCalledWith(
        'https://test.run.app/projects?includeArchived=true',
        expect.objectContaining({
          method: 'GET',
          headers: expect.objectContaining({
            'Authorization': 'Bearer token'
          })
        })
      );
      expect(result).toHaveLength(1);
    });

    it('should return cached projects in extension mode when available', async () => {
      harness.setExtensionMode({ local: {} }, { id: 'test' });

      API._cacheManager = {
        getCachedPages: vi.fn(async () => [{ id: 'project-1', name: 'Cached project' }]),
        setCachedPages: vi.fn()
      };

      const result = await API.getProjects();

      expect(API._cacheManager.getCachedPages).toHaveBeenCalled();
      expect(result).toHaveLength(1);
      expect(result.meta.fromCache).toBe(true);
    });

    it('should treat non-project responses as unsupported project backends', async () => {
      harness.setExtensionMode({ local: {} }, { id: 'test' });
      harness.setCloudFunctionUrl('https://test.run.app');
      global.window.firebaseAuth = { currentUser: { uid: 'user123' } };
      global.window.firebaseGetIdToken = vi.fn(async () => 'token');
      API._cacheManager = {
        getCachedPages: vi.fn(async () => null),
        setCachedPages: vi.fn(async () => {})
      };
      global.fetch = vi.fn(async () => ({
        ok: true,
        json: async () => ({ pages: [{ id: 'page-1', title: 'A page' }] })
      }));

      await expect(API.getProjects()).rejects.toMatchObject({
        code: 'PROJECTS_UNSUPPORTED'
      });
    });
  });

  describe('Cache Operations', () => {
    it('should return null for getCachedPages in standalone mode', async () => {
      harness.setStandaloneMode();

      const cached = await API.getCachedPages();
      expect(cached).toBeNull();
    });

    it('should do nothing for setCachedPages in standalone mode', async () => {
      harness.setStandaloneMode();

      // Should not throw
      await expect(API.setCachedPages({ pages: [] })).resolves.toBeUndefined();
    });

    it('should do nothing for invalidateCache in standalone mode', async () => {
      harness.setStandaloneMode();

      // Should not throw
      await expect(API.invalidateCache()).resolves.toBeUndefined();
    });
  });
});
