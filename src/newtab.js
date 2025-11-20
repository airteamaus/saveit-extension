// newtab.js - Main dashboard logic
// Handles page loading, filtering, and user interactions
//
// Security Note: This file uses innerHTML for rendering UI components.
// All user-provided data is sanitized via Components.escapeHtml() which uses
// textContent to prevent XSS attacks. See components.js:204 for implementation.

/* global TagManager, SearchManager, ScrollManager, AuthUIManager, DiscoveryManager, ThemeManager, TagInteractionManager, StatsManager, NotificationManager, EventManager, FirebaseAuthManager, PageLoaderManager */

class SaveItDashboard {
  constructor() {
    this.pages = [];
    this.allPages = []; // Keep unfiltered copy for client-side filtering
    this.totalPages = 0; // Total count from backend (all user's pages)
    this.currentFilter = {
      search: '',
      sort: 'newest',
      category: '',
      offset: 0,
      limit: 50 // Pages per batch for infinite scroll
    };
    this.debounceTimer = null;

    // Infinite scroll state
    this.isLoadingMore = false;
    this.hasMorePages = true;
    this.nextCursor = null;

    // Initialization state
    this.isInitialized = false;

    // Initialize managers
    this.tagManager = new TagManager();
    this.searchManager = new SearchManager();
    this.scrollManager = new ScrollManager();
    this.authUIManager = new AuthUIManager();
    this.discoveryManager = new DiscoveryManager(API, Components, this.tagManager);
    this.themeManager = new ThemeManager();
    this.tagInteractionManager = new TagInteractionManager(API, this.tagManager, Components);
    this.statsManager = new StatsManager();
    this.notificationManager = new NotificationManager();
    this.eventManager = new EventManager();
    this.firebaseAuthManager = new FirebaseAuthManager();
    this.pageLoaderManager = new PageLoaderManager();
  }

  /**
   * Get browser runtime API (works with both Firefox and Chrome/Brave/Edge)
   * @returns {Object|null} browser.runtime or chrome.runtime
   */
  getBrowserRuntime() {
    if (typeof browser !== 'undefined' && browser.runtime) {
      return browser.runtime;
    }
    if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.id) {
      return chrome.runtime;
    }
    return null;
  }

  /**
   * Initialize the dashboard
   */
  async init() {
    this.themeManager.initTheme();
    this.showLoading();
    this.themeManager.updateModeIndicator(API.isExtension);
    this.themeManager.updateVersionIndicator(() => this.getBrowserRuntime());

    // Clean up legacy cache (migration for v0.13.5+)
    await API.cleanupLegacyCache();

    // Initialize Firebase auth
    await this.firebaseAuthManager.initAuth(this);

    // Load pages and render based on auth state
    if (!API.isExtension || this.getCurrentUser()) {
      // Standalone mode OR authenticated user
      await this.loadPages();
      this.render();
      if (API.isExtension && this.getCurrentUser()) {
        this.refreshInBackground();
      }
    } else {
      // Extension mode with no authenticated user
      this.showSignInPrompt();
    }

    try {
      this.setupEventListeners();
    } catch (error) {
      console.error('[init] Failed to setup event listeners:', error);
      // Continue anyway - dashboard may still be partially usable
    }

    // Mark initialization complete
    this.isInitialized = true;
    debug('[Dashboard] Initialization complete');
  }

  /**
   * Get current Firebase user
   */
  getCurrentUser() {
    return this.firebaseAuthManager.getCurrentUser();
  }


  showLoading() {
    const content = document.getElementById('content');
    content.innerHTML = Components.loadingState();
  }

  showError(error) {
    const content = document.getElementById('content');
    content.innerHTML = Components.errorState(error);

    // Capture error in Sentry
    window.SentryHelpers?.captureError(error, { context: 'showError' });
  }

  /**
   * Load pages from API
   */
  async loadPages() {
    await this.pageLoaderManager.loadPages(this);
  }

  /**
   * Refresh data in background (after showing cached data)
   */
  async refreshInBackground() {
    await this.pageLoaderManager.refreshInBackground(this);
  }


  /**
   * Update stats display
   */
  updateStats() {
    this.statsManager.updateStats(this.totalPages, this.pages.length);
  }









  /**
   * Render tag bar with hierarchical selection
   */
  renderTagBar() {
    this.tagInteractionManager.renderTagBar(this.allPages, this.pages);
  }

  /**
   * Handle tag click in hierarchical selection mode
   * Uses async similarity search to find related pages
   * @param {string} type - Classification type (general/domain/topic)
   * @param {string} label - Tag label
   */
  async handleTagClick(type, label) {
    try {
      const result = await this.tagInteractionManager.handleTagClick(
        type,
        label,
        this.allPages,
        this.pages,
        () => this.showLoading(),
        (error) => this.showError(error)
      );

      if (!result) return;

      // Update pages from result
      this.pages = result.pages;

      // Apply search filter if active
      if (this.currentFilter.search) {
        this.pages = this.searchManager.applySearchFilter(this.pages, this.currentFilter.search);
      }

      this.updateStats();
      this.render();
    } catch {
      // Error already handled by tagInteractionManager
    }
  }


  /**
   * Render empty search state (search active but no matches)
   * @private
   * @param {HTMLElement} container - Content container element
   * @param {HTMLElement} sentinel - Scroll sentinel element
   */
  renderEmptySearchState(container, sentinel) {
    container.innerHTML = `
      <div class="empty-state">
        <svg class="empty-icon" width="80" height="80" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
          <circle cx="11" cy="11" r="8"></circle>
          <path d="m21 21-4.35-4.35"></path>
        </svg>
        <h2>No matching pages</h2>
        <p>Try adjusting your search</p>
      </div>
    `;

    // Re-append sentinel
    if (sentinel) {
      container.appendChild(sentinel);
    }
    this.updateStats();
  }

  /**
   * Render empty state (no pages at all)
   * @private
   * @param {HTMLElement} container - Content container element
   * @param {HTMLElement} sentinel - Scroll sentinel element
   */
  renderEmptyState(container, sentinel) {
    // Check if user is authenticated before showing empty state
    if (API.isExtension) {
      const user = this.getCurrentUser();

      if (user) {
        container.innerHTML = Components.emptyState();
      } else {
        container.innerHTML = Components.signInState();
      }
    } else {
      // In standalone mode, always show empty state (mock data)
      container.innerHTML = Components.emptyState();
    }

    // Re-append sentinel
    if (sentinel) {
      container.appendChild(sentinel);
    }
    this.updateStats();
  }

  /**
   * Render pages to DOM
   */
  render() {
    // Render tag bar first
    this.renderTagBar();

    const container = document.getElementById('content');
    const sentinel = document.getElementById('scroll-sentinel');

    // Handle empty states
    if (this.pages.length === 0) {
      if (this.currentFilter.search) {
        this.renderEmptySearchState(container, sentinel);
      } else {
        this.renderEmptyState(container, sentinel);
      }
      return;
    }

    // Render page cards
    const cardsHtml = this.pages.map(page => Components.savedPageCard(page)).join('');
    container.innerHTML = cardsHtml;

    // Re-append sentinel
    if (sentinel) {
      container.appendChild(sentinel);
    }

    this.updateStats();
  }

  /**
   * Show sign-in prompt
   */
  showSignInPrompt() {
    const content = document.getElementById('content');
    content.innerHTML = Components.signInState();
  }


  /**
   * Reset all filters and return to default view
   */
  resetToDefaultView() {
    // Clear search
    const searchInput = document.getElementById('search');
    const clearSearch = document.getElementById('clear-search');
    if (searchInput) {
      searchInput.value = '';
    }
    if (clearSearch) {
      clearSearch.style.display = 'none';
    }

    // Reset all filter state
    this.currentFilter.search = '';
    this.tagInteractionManager.clearSelection();
    this.discoveryManager.exit();

    // Restore pages to show all items (unfiltered)
    this.pages = [...this.allPages];

    // Re-render the view
    this.render();
  }

  /**
   * Setup all event listeners
   */
  setupEventListeners() {
    this.eventManager.setupEventListeners(this);
  }

  /**
   * Handle filter changes (search box)
   * Applies search filter on top of tag-filtered results
   */
  handleFilterChange() {
    // Get currently displayed pages (either similarity results or all pages)
    const basePages = this.pages.length > 0 ? this.pages : [...this.allPages];

    if (this.currentFilter.search) {
      // Apply search filter using SearchManager
      this.pages = this.searchManager.applySearchFilter(basePages, this.currentFilter.search);
    } else {
      // No search - restore base pages
      const activeLabel = this.tagInteractionManager.getActiveLabel();
      if (!activeLabel) {
        // No tag selected either - show all
        this.pages = [...this.allPages];
      }
      // If tag is selected, pages already contains similarity results
    }

    this.updateStats();
    this.render();
  }

  /**
   * Setup infinite scroll using Intersection Observer
   */
  setupInfiniteScroll() {
    this.scrollManager.setupInfiniteScroll(
      () => this.loadMorePages(),
      () => ({
        hasMorePages: this.hasMorePages,
        isLoading: this.isLoadingMore
      })
    );
  }

  /**
   * Load more pages (infinite scroll)
   */
  async loadMorePages() {
    await this.pageLoaderManager.loadMorePages(this);
  }


  /**
   * Open a saved page in new tab
   */
  openPage(url) {
    window.open(url, '_blank', 'noopener,noreferrer');
  }

  /**
   * Delete a saved page
   */
  async deletePage(id) {
    if (!confirm('Delete this saved page? This cannot be undone.')) {
      return;
    }

    // Find the row element and add transition class
    const row = document.querySelector(`.saved-page-card[data-id="${id}"]`);
    if (row) {
      row.classList.add('deleting');

      // Wait for transition to complete before removing from DOM
      await new Promise(resolve => setTimeout(resolve, 300));
    }

    try {
      await API.deletePage(id);

      // Remove from both allPages and pages
      this.allPages = this.allPages.filter(p => p.id !== id);
      this.pages = this.pages.filter(p => p.id !== id);

      this.updateStats();
      this.render();
      this.showToast('Page deleted successfully');
    } catch (error) {
      console.error('Failed to delete page:', error);

      // Remove transition class on error to restore row
      if (row) {
        row.classList.remove('deleting');
      }

      alert('Failed to delete page. Please try again.');
    }
  }

  /**
   * Show about dialog
   */
  showAbout() {
    const mode = API.isExtension ? 'Extension' : 'Development';
    const runtime = this.getBrowserRuntime();
    const version = runtime ? runtime.getManifest().version : 'standalone';
    const message = `SaveIt

SaveIt uses AI to read and semantically index the subject of each page based on its content. This lets you recall saved pages through similarity of subject matter, as opposed to having to remember the domain name, title, or URL.

When you save a page, the extension:
• Extracts and analyzes the page content
• Generates a semantic classification of the subject matter
• Creates vector embeddings for similarity search
• Provides AI-generated summaries

You can then discover related pages by browsing through automatically-generated topic hierarchies, or by searching for pages similar to a given topic—even if you never explicitly tagged them.

Version ${version} • ${mode} Mode${!API.isExtension ? '\n\n⚠️  Currently viewing mock data. Load as browser extension to see your saved pages.' : ''}`;

    alert(message);
  }

  /**
   * Show toast notification
   */
  showToast(message) {
    this.notificationManager.showToast(message);
  }

}

async function initDashboard() {
  try {
    window.dashboard = new SaveItDashboard();
    await window.dashboard.init();

    // Signal that dashboard is fully initialized (for E2E tests)
    window.dashboardReady = true;
  } catch (error) {
    console.error('Fatal error during dashboard initialization:', error.message || error);
    console.error('Stack trace:', error.stack);
    window.dashboardReady = false;

    // Capture fatal error in Sentry
    window.SentryHelpers?.captureError(error, { context: 'initDashboard', fatal: true });

    // Show user-friendly error message
    const content = document.getElementById('content');
    if (content) {
      content.innerHTML = `
        <div class="error-state">
          <svg class="error-icon" width="60" height="60" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <circle cx="12" cy="12" r="10"></circle>
            <line x1="12" y1="8" x2="12" y2="12"></line>
            <line x1="12" y1="16" x2="12.01" y2="16"></line>
          </svg>
          <h2>Failed to initialize dashboard</h2>
          <p>${error.message || 'An unexpected error occurred'}</p>
          <button class="btn btn-primary" onclick="location.reload()">Reload</button>
        </div>
      `;
    }
  }
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initDashboard);
} else {
  initDashboard();
}

// Expose API for debugging in console
window.API = API;
