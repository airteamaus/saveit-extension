// scroll-manager.js - Infinite scroll and pagination management
// Handles IntersectionObserver setup and loading indicators

/**
 * ScrollManager - Manages infinite scroll functionality
 * Uses IntersectionObserver to detect when user scrolls near bottom
 * and triggers loading of additional pages
 */
/* eslint-disable-next-line no-unused-vars */
class ScrollManager {
  constructor() {
    this.scrollObserver = null;
    this.sentinel = null;
  }

  /**
   * Setup infinite scroll using Intersection Observer
   * @param {Function} onLoadMore - Callback function when more pages should load
   * @param {Function} shouldLoad - Function returning {hasMorePages, isLoading} state
   */
  setupInfiniteScroll(onLoadMore, shouldLoad) {
    // Create sentinel element to observe
    this.sentinel = document.createElement('div');
    this.sentinel.id = 'scroll-sentinel';
    this.sentinel.style.height = '1px';
    document.getElementById('content').appendChild(this.sentinel);

    // Create observer
    this.scrollObserver = new IntersectionObserver(
      (entries) => {
        const entry = entries[0];
        const { hasMorePages, isLoading } = shouldLoad();

        if (entry.isIntersecting && hasMorePages && !isLoading) {
          onLoadMore();
        }
      },
      {
        root: null, // viewport
        rootMargin: '200px', // Trigger 200px before reaching sentinel
        threshold: 0
      }
    );

    this.scrollObserver.observe(this.sentinel);
  }

  /**
   * Show loading indicator for infinite scroll
   */
  showLoadingIndicator() {
    let indicator = document.getElementById('loading-indicator');
    if (!indicator) {
      indicator = document.createElement('div');
      indicator.id = 'loading-indicator';
      indicator.className = 'loading-indicator';
      indicator.innerHTML = `
        <div class="loading-spinner"></div>
        <span>Loading more pages...</span>
      `;
      document.getElementById('content').appendChild(indicator);
    }
    indicator.style.display = 'flex';
  }

  /**
   * Hide loading indicator
   */
  hideLoadingIndicator() {
    const indicator = document.getElementById('loading-indicator');
    if (indicator) {
      indicator.style.display = 'none';
    }
  }

  /**
   * Cleanup - disconnect observer
   * Call this when dashboard is destroyed or reset
   */
  cleanup() {
    if (this.scrollObserver) {
      this.scrollObserver.disconnect();
      this.scrollObserver = null;
    }

    if (this.sentinel && this.sentinel.parentNode) {
      this.sentinel.parentNode.removeChild(this.sentinel);
      this.sentinel = null;
    }
  }
}
