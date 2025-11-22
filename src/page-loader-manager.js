// page-loader-manager.js - Page loading and data lifecycle management
// Handles fetching pages, background refresh, and infinite scroll loading

class PageLoaderManager {
  constructor() {
    // Manager state is stored in dashboard instance
  }

  /**
   * Load pages from API
   * @param {Object} dashboard - Dashboard instance
   */
  async loadPages(dashboard) {
    try {
      const response = await API.getSavedPages(dashboard.currentFilter);

      // API always returns {pages, pagination} format
      dashboard.allPages = response.pages || [];
      dashboard.totalPages = response.pagination?.total || 0;
      dashboard.hasMorePages = response.pagination?.hasNextPage || false;
      dashboard.nextCursor = response.pagination?.nextCursor || null;

      // Initially show all pages (no tag selected)
      dashboard.pages = [...dashboard.allPages];
    } catch (error) {
      console.error('Failed to load pages:', error);
      dashboard.showError(error);
    }
  }

  /**
   * Refresh data in background (after showing cached data)
   * @param {Object} dashboard - Dashboard instance
   */
  async refreshInBackground(dashboard) {
    if (!API.isExtension) return;

    // Don't try to refresh if user isn't signed in
    if (!dashboard.getCurrentUser()) return;

    try {
      // Wait a bit to avoid competing with initial render
      await new Promise(resolve => setTimeout(resolve, 500));

      const freshResponse = await API.getSavedPages({
        ...dashboard.currentFilter,
        skipCache: true
      });

      const freshPages = freshResponse.pages || [];

      // Only update if data changed
      if (JSON.stringify(freshPages) !== JSON.stringify(dashboard.allPages)) {
        dashboard.allPages = freshPages;
        dashboard.totalPages = freshResponse.pagination?.total || 0;
        dashboard.hasMorePages = freshResponse.pagination?.hasNextPage || false;
        dashboard.nextCursor = freshResponse.pagination?.nextCursor || null;

        // If a tag is selected, re-run similarity search to update results
        const activeLabel = dashboard.tagInteractionManager.getActiveLabel();
        if (activeLabel) {
          // Re-trigger tag click to refresh similarity results with new data
          const activeType = dashboard.tagInteractionManager.getActiveType();
          await dashboard.handleTagClick(activeType, activeLabel);
        } else {
          // No tag selected - show all pages
          dashboard.pages = [...dashboard.allPages];
          dashboard.render();
        }
      }
    } catch (error) {
      console.error('Background refresh failed:', error);
      // Don't show error to user - they already have cached data
    }
  }

  /**
   * Load more pages (infinite scroll)
   * @param {Object} dashboard - Dashboard instance
   */
  async loadMorePages(dashboard) {
    if (dashboard.isLoadingMore || !dashboard.hasMorePages) return;

    // Don't try to load more if user isn't signed in
    if (API.isExtension && !dashboard.getCurrentUser()) return;

    dashboard.isLoadingMore = true;
    dashboard.scrollManager.showLoadingIndicator();

    try {
      // Update offset for next batch
      dashboard.currentFilter.offset += dashboard.currentFilter.limit;

      const response = await API.getSavedPages(dashboard.currentFilter);

      // API always returns {pages, pagination} format
      const newPages = response.pages || [];
      dashboard.totalPages = response.pagination?.total || dashboard.totalPages; // Update total (should be same)
      dashboard.hasMorePages = response.pagination?.hasNextPage || false;
      dashboard.nextCursor = response.pagination?.nextCursor || null;

      // Append new pages to existing
      dashboard.allPages = [...dashboard.allPages, ...newPages];

      // Also append to filtered pages (they'll match same criteria)
      dashboard.pages = [...dashboard.pages, ...newPages];

      dashboard.updateStats();
      dashboard.render();

    } catch (error) {
      console.error('Failed to load more pages:', error);
      dashboard.showError(error);
    } finally {
      dashboard.isLoadingMore = false;
      dashboard.scrollManager.hideLoadingIndicator();
    }
  }
}

// Export for testing
/* eslint-disable no-undef */
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { PageLoaderManager };
}
/* eslint-enable no-undef */
