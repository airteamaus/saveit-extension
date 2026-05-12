import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createMockDashboard } from '../fixtures/dashboard-fixture.js';

describe('PageLoaderManager', () => {
  let PageLoaderManager;
  let manager;
  let mockDashboard;
  let mockAPI;

  beforeEach(async () => {
    // Mock API
    mockAPI = {
      isExtension: false,
      getSavedPages: vi.fn(),
      searchContent: vi.fn()
    };
    global.API = mockAPI;

    // Create mock dashboard using fixture factory
    mockDashboard = createMockDashboard();

    // Load PageLoaderManager module
    const module = await import('../../src/page-loader-manager.js');
    PageLoaderManager = module.PageLoaderManager;

    // Create instance
    manager = new PageLoaderManager();
  });

  afterEach(() => {
    delete global.API;
    vi.clearAllMocks();
  });

  describe('Constructor', () => {
    it('should create instance without state', () => {
      const loader = new PageLoaderManager();
      expect(loader).toBeTruthy();
    });
  });

  describe('loadPages', () => {
    it('should load pages and update dashboard state', async () => {
      mockDashboard.currentFilter.search = 'bookmarks';
      const mockResponse = {
        pages: [
          { id: '1', title: 'Page 1' },
          { id: '2', title: 'Page 2' }
        ],
        pagination: {
          total: 10,
          hasNextPage: true,
          nextCursor: 'cursor-123'
        }
      };
      mockAPI.getSavedPages.mockResolvedValue(mockResponse);

      await manager.loadPages(mockDashboard);

      expect(mockAPI.getSavedPages).toHaveBeenCalledWith({
        ...mockDashboard.currentFilter,
        search: ''
      });
      expect(mockDashboard.allPages).toEqual(mockResponse.pages);
      expect(mockDashboard.pages).toEqual(mockResponse.pages);
      expect(mockDashboard.totalPages).toBe(10);
      expect(mockDashboard.hasMorePages).toBe(true);
      expect(mockDashboard.nextCursor).toBe('cursor-123');
    });

    it('should pass project scope through to the API', async () => {
      mockDashboard.currentFilter.projectId = 'project-saveit-product';
      mockAPI.getSavedPages.mockResolvedValue({
        pages: [{ id: '1', title: 'Scoped page' }],
        pagination: { total: 1, hasNextPage: false, nextCursor: null }
      });

      await manager.loadPages(mockDashboard);

      expect(mockAPI.getSavedPages).toHaveBeenCalledWith({
        ...mockDashboard.currentFilter,
        search: ''
      });
    });

    it('should handle response without pagination', async () => {
      const mockResponse = {
        pages: [{ id: '1', title: 'Page 1' }],
        pagination: null
      };
      mockAPI.getSavedPages.mockResolvedValue(mockResponse);

      await manager.loadPages(mockDashboard);

      expect(mockDashboard.allPages).toEqual(mockResponse.pages);
      expect(mockDashboard.totalPages).toBe(0);
      expect(mockDashboard.hasMorePages).toBe(false);
      expect(mockDashboard.nextCursor).toBeNull();
    });

    it('should handle empty response', async () => {
      const mockResponse = {
        pages: [],
        pagination: { total: 0, hasNextPage: false }
      };
      mockAPI.getSavedPages.mockResolvedValue(mockResponse);

      await manager.loadPages(mockDashboard);

      expect(mockDashboard.allPages).toEqual([]);
      expect(mockDashboard.pages).toEqual([]);
    });

    it('should handle errors gracefully', async () => {
      const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      const error = new Error('API failure');
      mockAPI.getSavedPages.mockRejectedValue(error);

      await manager.loadPages(mockDashboard);

      expect(consoleErrorSpy).toHaveBeenCalledWith('Failed to load pages:', error);
      expect(mockDashboard.showError).toHaveBeenCalledWith(error);

      consoleErrorSpy.mockRestore();
    });
  });

  describe('refreshInBackground', () => {
    beforeEach(() => {
      // Enable extension mode for background refresh
      mockAPI.isExtension = true;
      // Use fake timers for all tests that call refreshInBackground
      vi.useFakeTimers();
    });

    afterEach(() => {
      // Restore real timers after each test
      vi.useRealTimers();
    });

    it('should skip refresh in standalone mode', async () => {
      mockAPI.isExtension = false;

      await manager.refreshInBackground(mockDashboard);

      expect(mockAPI.getSavedPages).not.toHaveBeenCalled();
    });

    it('should skip refresh when user not signed in', async () => {
      mockDashboard.getCurrentUser.mockReturnValue(null);

      await manager.refreshInBackground(mockDashboard);

      expect(mockAPI.getSavedPages).not.toHaveBeenCalled();
    });

    it('should fetch fresh data with skipCache', async () => {
      mockDashboard.currentFilter.search = 'react';
      const mockResponse = {
        pages: [{ id: '1', title: 'Fresh' }],
        pagination: { total: 1 }
      };
      mockAPI.getSavedPages.mockResolvedValue(mockResponse);

      const refreshPromise = manager.refreshInBackground(mockDashboard);

      // Advance timers past the 500ms delay
      await vi.advanceTimersByTimeAsync(500);
      await refreshPromise;

      expect(mockAPI.getSavedPages).toHaveBeenCalledWith({
        ...mockDashboard.currentFilter,
        search: '',
        skipCache: true
      });
    });

    it('should update dashboard when data changed', async () => {
      mockDashboard.allPages = [{ id: '1', title: 'Old' }];

      const mockResponse = {
        pages: [{ id: '1', title: 'New' }],
        pagination: { total: 1, hasNextPage: false }
      };
      mockAPI.getSavedPages.mockResolvedValue(mockResponse);

      const refreshPromise = manager.refreshInBackground(mockDashboard);
      await vi.advanceTimersByTimeAsync(500);
      await refreshPromise;

      expect(mockDashboard.allPages).toEqual(mockResponse.pages);
      expect(mockDashboard.pages).toEqual(mockResponse.pages);
      expect(mockDashboard.render).toHaveBeenCalled();
    });

    it('should not update when data unchanged', async () => {
      const existingPages = [{ id: '1', title: 'Same' }];
      mockDashboard.allPages = existingPages;

      const mockResponse = {
        pages: [{ id: '1', title: 'Same' }],
        pagination: { total: 1 }
      };
      mockAPI.getSavedPages.mockResolvedValue(mockResponse);

      const refreshPromise = manager.refreshInBackground(mockDashboard);
      await vi.advanceTimersByTimeAsync(500);
      await refreshPromise;

      expect(mockDashboard.render).not.toHaveBeenCalled();
    });

    it('should re-trigger tag click when active tag exists', async () => {
      mockDashboard.tagInteractionManager.getActiveLabel.mockReturnValue('JavaScript');
      mockDashboard.tagInteractionManager.getActiveType.mockReturnValue('general');
      mockDashboard.allPages = [{ id: '1' }];

      const mockResponse = {
        pages: [{ id: '1' }, { id: '2' }],
        pagination: { total: 2 }
      };
      mockAPI.getSavedPages.mockResolvedValue(mockResponse);

      const refreshPromise = manager.refreshInBackground(mockDashboard);
      await vi.advanceTimersByTimeAsync(500);
      await refreshPromise;

      expect(mockDashboard.handleTagClick).toHaveBeenCalledWith('general', 'JavaScript');
      expect(mockDashboard.render).not.toHaveBeenCalled(); // handleTagClick handles rendering
    });

    it('should not show errors to user on failure', async () => {
      const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      mockAPI.getSavedPages.mockRejectedValue(new Error('Network error'));

      const refreshPromise = manager.refreshInBackground(mockDashboard);
      await vi.advanceTimersByTimeAsync(500);
      await refreshPromise;

      expect(consoleErrorSpy).toHaveBeenCalledWith(
        'Background refresh failed:',
        expect.any(Error)
      );
      expect(mockDashboard.showError).not.toHaveBeenCalled();

      consoleErrorSpy.mockRestore();
    });
  });

  describe('loadMorePages', () => {
    it('should not load when already loading', async () => {
      mockDashboard.isLoadingMore = true;
      mockDashboard.hasMorePages = true;

      await manager.loadMorePages(mockDashboard);

      expect(mockAPI.getSavedPages).not.toHaveBeenCalled();
    });

    it('should not load when no more pages', async () => {
      mockDashboard.isLoadingMore = false;
      mockDashboard.hasMorePages = false;

      await manager.loadMorePages(mockDashboard);

      expect(mockAPI.getSavedPages).not.toHaveBeenCalled();
    });

    it('should not load when user not signed in (extension mode)', async () => {
      mockAPI.isExtension = true;
      mockDashboard.getCurrentUser.mockReturnValue(null);
      mockDashboard.hasMorePages = true;
      mockDashboard.nextCursor = 'cursor-1';

      await manager.loadMorePages(mockDashboard);

      expect(mockAPI.getSavedPages).not.toHaveBeenCalled();
    });

    it('should not load more when local search is active', async () => {
      mockDashboard.hasMorePages = true;
      mockDashboard.nextCursor = 'cursor-1';
      mockDashboard.currentFilter.search = 'react';

      await manager.loadMorePages(mockDashboard);

      expect(mockAPI.getSavedPages).not.toHaveBeenCalled();
    });

    it('should not load more when tag filtering is active', async () => {
      mockDashboard.hasMorePages = true;
      mockDashboard.nextCursor = 'cursor-1';
      mockDashboard.tagInteractionManager.getActiveLabel.mockReturnValue('JavaScript');

      await manager.loadMorePages(mockDashboard);

      expect(mockAPI.getSavedPages).not.toHaveBeenCalled();
    });

    it('should load more semantic drawer search results via searchContent', async () => {
      mockDashboard.hasMorePages = true;
      mockDashboard.currentFilter.search = 'semantic bookmarks';
      mockDashboard.pages = [{ id: 'existing-1' }];
      mockDashboard.semanticSearchOffset = 1;
      mockDashboard.totalPages = 3;
      mockDashboard.isDrawerEmbedded.mockReturnValue(true);

      mockAPI.searchContent.mockResolvedValue({
        results: [
          { thing_id: '2', similarity: 0.8, thing_data: { id: '2', title: 'Result 2' } },
          { thing_id: '3', similarity: 0.7, thing_data: { id: '3', title: 'Result 3' } }
        ],
        pagination: { total: 3, has_more: false }
      });

      await manager.loadMorePages(mockDashboard);

      expect(mockAPI.searchContent).toHaveBeenCalledWith('semantic bookmarks', {
        limit: mockDashboard.currentFilter.limit,
        offset: 1,
        threshold: mockDashboard.semanticSearchThreshold
      });
      expect(mockAPI.getSavedPages).not.toHaveBeenCalled();
      expect(mockDashboard.pages).toEqual([
        { id: 'existing-1' },
        { id: '2', title: 'Result 2' },
        { id: '3', title: 'Result 3' }
      ]);
      expect(mockDashboard.semanticSearchOffset).toBe(3);
      expect(mockDashboard.hasMorePages).toBe(false);
    });

    it('should set loading state and show indicator', async () => {
      mockDashboard.hasMorePages = true;
      mockDashboard.nextCursor = 'cursor-2';
      const mockResponse = {
        pages: [{ id: '3' }],
        pagination: { total: 3, hasNextPage: false }
      };
      mockAPI.getSavedPages.mockResolvedValue(mockResponse);

      await manager.loadMorePages(mockDashboard);

      expect(mockDashboard.scrollManager.showLoadingIndicator).toHaveBeenCalled();
      expect(mockDashboard.scrollManager.hideLoadingIndicator).toHaveBeenCalled();
    });

    it('should use nextCursor to load next batch', async () => {
      mockDashboard.hasMorePages = true;
      mockDashboard.nextCursor = 'cursor-50';
      mockDashboard.currentFilter.limit = 50;

      const mockResponse = {
        pages: [{ id: '51' }],
        pagination: { total: 100, hasNextPage: true }
      };
      mockAPI.getSavedPages.mockResolvedValue(mockResponse);

      await manager.loadMorePages(mockDashboard);

      expect(mockDashboard.currentFilter.cursor).toBeNull();
      expect(mockAPI.getSavedPages).toHaveBeenCalledWith({
        ...mockDashboard.currentFilter,
        search: '',
        cursor: 'cursor-50',
        skipCache: true
      });
    });

    it('should append new pages to existing', async () => {
      mockDashboard.hasMorePages = true;
      mockDashboard.nextCursor = 'cursor-2';
      mockDashboard.allPages = [{ id: '1' }, { id: '2' }];
      mockDashboard.pages = [{ id: '1' }, { id: '2' }];

      const mockResponse = {
        pages: [{ id: '3' }, { id: '4' }],
        pagination: { total: 4, hasNextPage: false }
      };
      mockAPI.getSavedPages.mockResolvedValue(mockResponse);

      await manager.loadMorePages(mockDashboard);

      expect(mockDashboard.allPages).toEqual([
        { id: '1' }, { id: '2' }, { id: '3' }, { id: '4' }
      ]);
      expect(mockDashboard.pages).toEqual([
        { id: '1' }, { id: '2' }, { id: '3' }, { id: '4' }
      ]);
    });

    it('should update pagination state', async () => {
      mockDashboard.hasMorePages = true;
      mockDashboard.nextCursor = 'cursor-50';

      const mockResponse = {
        pages: [{ id: '51' }],
        pagination: {
          total: 100,
          hasNextPage: true,
          nextCursor: 'cursor-next'
        }
      };
      mockAPI.getSavedPages.mockResolvedValue(mockResponse);

      await manager.loadMorePages(mockDashboard);

      expect(mockDashboard.totalPages).toBe(100);
      expect(mockDashboard.hasMorePages).toBe(true);
      expect(mockDashboard.nextCursor).toBe('cursor-next');
    });

    it('should call updateStats and render', async () => {
      mockDashboard.hasMorePages = true;
      mockDashboard.nextCursor = 'cursor-2';

      const mockResponse = {
        pages: [{ id: '3' }],
        pagination: { total: 3, hasNextPage: false }
      };
      mockAPI.getSavedPages.mockResolvedValue(mockResponse);

      await manager.loadMorePages(mockDashboard);

      expect(mockDashboard.updateStats).toHaveBeenCalled();
      expect(mockDashboard.render).toHaveBeenCalled();
    });

    it('should handle errors and show to user', async () => {
      const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      mockDashboard.hasMorePages = true;
      mockDashboard.nextCursor = 'cursor-2';

      const error = new Error('Load failed');
      mockAPI.getSavedPages.mockRejectedValue(error);

      await manager.loadMorePages(mockDashboard);

      expect(consoleErrorSpy).toHaveBeenCalledWith('Failed to load more pages:', error);
      expect(mockDashboard.showError).toHaveBeenCalledWith(error);

      consoleErrorSpy.mockRestore();
    });

    it('should reset loading state even on error', async () => {
      vi.spyOn(console, 'error').mockImplementation(() => {});
      mockDashboard.hasMorePages = true;
      mockDashboard.nextCursor = 'cursor-2';
      mockAPI.getSavedPages.mockRejectedValue(new Error('Fail'));

      await manager.loadMorePages(mockDashboard);

      expect(mockDashboard.isLoadingMore).toBe(false);
      expect(mockDashboard.scrollManager.hideLoadingIndicator).toHaveBeenCalled();

      console.error.mockRestore();
    });

    it('should refresh cached pagination before loading more', async () => {
      mockDashboard.hasMorePages = true;
      mockDashboard.nextCursor = 'stale-cursor';
      mockDashboard.paginationStateFromCache = true;
      mockDashboard.allPages = [{ id: 'cached-1' }];
      mockDashboard.pages = [{ id: 'cached-1' }];

      mockAPI.getSavedPages
        .mockResolvedValueOnce({
          pages: [{ id: 'fresh-1' }],
          pagination: { total: 2, hasNextPage: true, nextCursor: 'fresh-cursor' }
        })
        .mockResolvedValueOnce({
          pages: [{ id: 'fresh-2' }],
          pagination: { total: 2, hasNextPage: false, nextCursor: null }
        });

      await manager.loadMorePages(mockDashboard);

      expect(mockAPI.getSavedPages).toHaveBeenNthCalledWith(1, {
        ...mockDashboard.currentFilter,
        search: '',
        skipCache: true
      });
      expect(mockAPI.getSavedPages).toHaveBeenNthCalledWith(2, {
        ...mockDashboard.currentFilter,
        search: '',
        cursor: 'fresh-cursor',
        skipCache: true
      });
      expect(mockDashboard.allPages).toEqual([{ id: 'fresh-1' }, { id: 'fresh-2' }]);
      expect(mockDashboard.paginationStateFromCache).toBe(false);
    });
  });
});
