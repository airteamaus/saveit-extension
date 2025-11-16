// newtab.js - Main dashboard logic
// Handles page loading, filtering, and user interactions
//
// Security Note: This file uses innerHTML for rendering UI components.
// All user-provided data is sanitized via Components.escapeHtml() which uses
// textContent to prevent XSS attacks. See components.js:204 for implementation.

/* global TagManager, SearchManager, ScrollManager, AuthUIManager, DiscoveryManager, ThemeManager, TagInteractionManager */

/**
 * Get browser runtime API (works with both Firefox and Chrome/Brave/Edge)
 * @returns {Object|null} browser.runtime or chrome.runtime
 */
function getBrowserRuntime() {
  if (typeof browser !== 'undefined' && browser.runtime) {
    return browser.runtime;
  }
  if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.id) {
    return chrome.runtime;
  }
  return null;
}

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
  }

  /**
   * Initialize the dashboard
   */
  async init() {
    this.themeManager.initTheme();
    this.showLoading();
    this.themeManager.updateModeIndicator(API.isExtension);
    this.themeManager.updateVersionIndicator(getBrowserRuntime);

    // Clean up legacy cache (migration for v0.13.5+)
    await API.cleanupLegacyCache();

    // Wait for Firebase to be ready in extension mode
    if (API.isExtension && window.firebaseReady) {
      await window.firebaseReady;

      if (window.firebaseAuth && window.firebaseOnAuthStateChanged) {
        // Wait for initial auth state (one-time check with timeout)
        const initialUser = await Promise.race([
          new Promise((resolve) => {
            const unsubscribe = window.firebaseOnAuthStateChanged(window.firebaseAuth, (user) => {
              unsubscribe(); // Unregister after first callback
              resolve(user);
            });
          }),
          new Promise((_, reject) =>
            setTimeout(() => reject(new Error('Firebase auth timeout')), 10000)
          )
        ]).catch(error => {
          console.error('[init] Firebase auth failed:', error);
          return null; // Continue without auth
        });

        // Update UI based on initial auth state
        this.authUIManager.updateSignInButton(initialUser ? {
          email: initialUser.email,
          name: initialUser.displayName
        } : null);

        // Register persistent listener for auth changes (after init)
        window.firebaseOnAuthStateChanged(window.firebaseAuth, async (user) => {
          if (!this.isInitialized) return; // Skip during initialization

          // Auth changed after init - clear cache and reload
          console.log('[auth state changed] Clearing cache for user switch');
          await API.invalidateCache();

          this.authUIManager.updateSignInButton(user ? {
            email: user.email,
            name: user.displayName
          } : null);

          if (user) {
            await this.loadPages();
            this.render();
            this.refreshInBackground();
          } else {
            this.showSignInPrompt();
          }
        });
      }
    }

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
    console.log('[Dashboard] Initialization complete');
  }

  /**
   * Get current Firebase user
   */
  getCurrentUser() {
    if (!API.isExtension || !window.firebaseAuth) return null;

    const user = window.firebaseAuth.currentUser;
    if (!user) return null;

    return {
      email: user.email,
      name: user.displayName
    };
  }


  showLoading() {
    const content = document.getElementById('content');
    content.innerHTML = Components.loadingState();
  }

  showError(error) {
    const content = document.getElementById('content');
    content.innerHTML = Components.errorState(error);
  }

  /**
   * Load pages from API
   */
  async loadPages() {
    try {
      const response = await API.getSavedPages(this.currentFilter);

      // API always returns {pages, pagination} format
      this.allPages = response.pages || [];
      this.totalPages = response.pagination?.total || 0;
      this.hasMorePages = response.pagination?.hasNextPage || false;
      this.nextCursor = response.pagination?.nextCursor || null;

      // Initially show all pages (no tag selected)
      this.pages = [...this.allPages];
    } catch (error) {
      console.error('Failed to load pages:', error);
      this.showError(error);
    }
  }

  /**
   * Refresh data in background (after showing cached data)
   */
  async refreshInBackground() {
    if (!API.isExtension) return;

    // Don't try to refresh if user isn't signed in
    if (!this.getCurrentUser()) return;

    try {
      // Wait a bit to avoid competing with initial render
      await new Promise(resolve => setTimeout(resolve, 500));

      const freshResponse = await API.getSavedPages({
        ...this.currentFilter,
        skipCache: true
      });

      const freshPages = freshResponse.pages || [];

      // Only update if data changed
      if (JSON.stringify(freshPages) !== JSON.stringify(this.allPages)) {
        this.allPages = freshPages;
        this.totalPages = freshResponse.pagination?.total || 0;
        this.hasMorePages = freshResponse.pagination?.hasNextPage || false;
        this.nextCursor = freshResponse.pagination?.nextCursor || null;

        // If a tag is selected, re-run similarity search to update results
        const activeLabel = this.tagInteractionManager.getActiveLabel();
        if (activeLabel) {
          // Re-trigger tag click to refresh similarity results with new data
          const activeType = this.tagInteractionManager.getActiveType();
          await this.handleTagClick(activeType, activeLabel);
        } else {
          // No tag selected - show all pages
          this.pages = [...this.allPages];
          this.render();
        }
      }
    } catch (error) {
      console.error('Background refresh failed:', error);
      // Don't show error to user - they already have cached data
    }
  }


  /**
   * Update stats display
   */
  updateStats() {
    const statsEl = document.getElementById('stats');
    const total = this.totalPages; // Use total from backend
    const filtered = this.pages.length;

    if (filtered < total) {
      statsEl.textContent = `Showing ${filtered} of ${total} pages`;
    } else {
      statsEl.textContent = `${total} ${total === 1 ? 'page' : 'pages'} saved`;
    }
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
   * Render pages to DOM
   */
  render() {
    // Render tag bar first
    this.renderTagBar();

    const container = document.getElementById('content');

    // Preserve scroll sentinel before ANY innerHTML modifications
    const sentinel = document.getElementById('scroll-sentinel');

    if (this.pages.length === 0) {
      if (this.currentFilter.search) {
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
      } else {
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
      }

      // Re-append sentinel even for empty states
      if (sentinel) {
        container.appendChild(sentinel);
      }
      this.updateStats();
      return;
    }

    const cardsHtml = this.pages.map(page => Components.savedPageCard(page)).join('');
    container.innerHTML = cardsHtml;

    // Re-append sentinel after updating content
    if (sentinel) {
      container.appendChild(sentinel);
    }

    // Update stats after rendering
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
    // Logo click - reset to default view
    const logo = document.querySelector('.logo');
    if (logo) {
      logo.style.cursor = 'pointer';
      logo.addEventListener('click', () => this.resetToDefaultView());
    }

    // Sign-in button
    const signInBtn = document.getElementById('sign-in-btn');
    if (signInBtn) {
      signInBtn.addEventListener('click', () => this.authUIManager.handleSignIn(getBrowserRuntime));
    }

    // User profile button (toggle dropdown)
    const userProfileBtn = document.getElementById('user-profile-btn');
    if (userProfileBtn) {
      userProfileBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        this.authUIManager.toggleUserDropdown();
      });
    }

    // Sign-out button
    const signOutBtn = document.getElementById('sign-out-btn');
    if (signOutBtn) {
      signOutBtn.addEventListener('click', () => this.authUIManager.handleSignOut(() => this.showSignInPrompt()));
    }

    // Close dropdown when clicking outside
    document.addEventListener('click', (e) => {
      const dropdown = document.getElementById('user-dropdown');
      const userProfile = document.getElementById('user-profile');
      if (dropdown && userProfile && !userProfile.contains(e.target)) {
        dropdown.style.display = 'none';
      }
    });

    // Search input
    const searchInput = document.getElementById('search');
    const clearSearch = document.getElementById('clear-search');

    searchInput.addEventListener('input', (e) => {
      this.currentFilter.search = e.target.value;
      clearSearch.style.display = e.target.value ? 'block' : 'none';
      this.debounce(() => this.handleFilterChange(), 300);
    });

    clearSearch.addEventListener('click', () => {
      searchInput.value = '';
      this.currentFilter.search = '';
      clearSearch.style.display = 'none';
      this.handleFilterChange();
    });

    // Theme toggle buttons
    document.querySelectorAll('.theme-option').forEach(btn => {
      btn.addEventListener('click', () => {
        const theme = btn.dataset.theme;
        localStorage.setItem('theme-preference', theme);
        this.themeManager.applyTheme(theme);
        this.themeManager.updateThemeButtons(theme);
      });
    });

    // Card actions (event delegation)
    document.getElementById('content').addEventListener('click', (e) => {
      // Welcome sign-in button
      const welcomeSignInBtn = e.target.closest('#welcome-sign-in-btn');
      if (welcomeSignInBtn) {
        e.stopPropagation();
        this.authUIManager.handleSignIn(getBrowserRuntime);
        return;
      }

      // Delete button - handle and stop propagation
      const deleteBtn = e.target.closest('.btn-delete');
      if (deleteBtn) {
        e.stopPropagation();
        const id = deleteBtn.dataset.id;
        this.deletePage(id);
        return;
      }

      // Tag click - handle tags anywhere (tag bar OR search results)
      const tag = e.target.closest('.tag.ai-tag');
      if (tag) {
        e.stopPropagation();
        const label = tag.dataset.label;
        const type = tag.dataset.type;
        if (label && type) {
          this.handleTagClick(type, label);
        }
        return;
      }

      // Row click - open URL in new tab
      const row = e.target.closest('.saved-page-card');
      if (row) {
        const url = row.dataset.url;
        this.openPage(url);
      }
    });

    // Tag bar actions (event delegation)
    document.getElementById('tag-bar').addEventListener('click', (e) => {
      const tag = e.target.closest('.tag.ai-tag');
      if (tag) {
        e.stopPropagation();
        const label = tag.dataset.label;
        const type = tag.dataset.type;
        if (label && type) {
          this.handleTagClick(type, label);
        }
      }
    });

    // About link
    document.getElementById('about-link').addEventListener('click', (e) => {
      e.preventDefault();
      this.showAbout();
    });

    // Setup infinite scroll observer
    this.setupInfiniteScroll();
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
    if (this.isLoadingMore || !this.hasMorePages) return;

    this.isLoadingMore = true;
    this.scrollManager.showLoadingIndicator();

    try {
      // Update offset for next batch
      this.currentFilter.offset += this.currentFilter.limit;

      const response = await API.getSavedPages(this.currentFilter);

      // API always returns {pages, pagination} format
      const newPages = response.pages || [];
      this.totalPages = response.pagination?.total || this.totalPages; // Update total (should be same)
      this.hasMorePages = response.pagination?.hasNextPage || false;
      this.nextCursor = response.pagination?.nextCursor || null;

      // Append new pages to existing
      this.allPages = [...this.allPages, ...newPages];

      // Also append to filtered pages (they'll match same criteria)
      this.pages = [...this.pages, ...newPages];

      this.updateStats();
      this.render();

    } catch (error) {
      console.error('Failed to load more pages:', error);
      this.showError(error);
    } finally {
      this.isLoadingMore = false;
      this.scrollManager.hideLoadingIndicator();
    }
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
    const runtime = getBrowserRuntime();
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
    const toast = document.createElement('div');
    toast.style.cssText = `
      position: fixed;
      bottom: 24px;
      right: 24px;
      background: #1e293b;
      color: white;
      padding: 12px 24px;
      border-radius: 8px;
      box-shadow: 0 10px 15px -3px rgb(0 0 0 / 0.1);
      z-index: 1000;
      animation: slideIn 0.3s ease-out;
    `;
    toast.textContent = message;
    document.body.appendChild(toast);

    setTimeout(() => {
      toast.style.animation = 'slideOut 0.3s ease-out';
      setTimeout(() => toast.remove(), 300);
    }, 3000);
  }

  /**
   * Debounce helper for search input
   */
  debounce(func, wait) {
    clearTimeout(this.debounceTimer);
    this.debounceTimer = setTimeout(func, wait);
  }

  /**
   * Enter discovery mode - search for pages by tag similarity
   * @param {string} label - Tag label to search for
   * @param {string} type - Classification type (general/domain/topic)
   */
  async discoverByTag(label, type) {
    try {
      const results = await this.discoveryManager.discover(
        label,
        type,
        this.allPages,
        this.pages,
        () => this.showLoading(),
        (error) => this.showError(error)
      );
      this.renderDiscoveryResults(results);
    } catch {
      // Error already logged and displayed by discoveryManager
    }
  }

  /**
   * Render discovery results
   * Uses Components.discoveryResults to render the full discovery view
   */
  renderDiscoveryResults(results) {
    // Use discoveryManager to render results and get page data
    this.pages = this.discoveryManager.renderResults(results);

    // Render tag bar after updating pages
    this.renderTagBar();
  }

  /**
   * Exit discovery mode and return to main view
   */
  exitDiscoveryMode() {
    this.discoveryManager.exit();

    // Restore pages based on current tag selection
    const activeLabel = this.tagInteractionManager.getActiveLabel();
    if (activeLabel) {
      // Re-trigger similarity search for selected tag
      const activeType = this.tagInteractionManager.getActiveType();
      this.handleTagClick(activeType, activeLabel);
    } else {
      // No tag selected - show all pages
      this.pages = [...this.allPages];
      this.updateStats();
      this.render();
    }
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

if (!document.getElementById('toast-styles')) {
  const style = document.createElement('style');
  style.id = 'toast-styles';
  style.textContent = `
    @keyframes slideIn {
      from {
        transform: translateX(400px);
        opacity: 0;
      }
      to {
        transform: translateX(0);
        opacity: 1;
      }
    }
    @keyframes slideOut {
      from {
        transform: translateX(0);
        opacity: 1;
      }
      to {
        transform: translateX(400px);
        opacity: 0;
      }
    }
  `;
  document.head.appendChild(style);
}
