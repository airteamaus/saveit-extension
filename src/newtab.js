// newtab.js - Main dashboard logic
// Handles page loading, filtering, and user interactions
//
// Security Note: This file uses innerHTML for rendering UI components.
// All user-provided data is sanitized via Components.escapeHtml() which uses
// textContent to prevent XSS attacks. See components.js:204 for implementation.

class SaveItDashboard {
  constructor() {
    this.pages = [];
    this.allPages = []; // Keep unfiltered copy for client-side filtering
    this.currentFilter = {
      search: '',
      sort: 'newest',
      category: '',
      offset: 0,
      limit: 100 // Load more for client-side filtering
    };
    this.debounceTimer = null;
    this.discoveryMode = false; // Track if we're in discovery view
    this.currentDiscoveryLabel = null; // Store current discovery query
  }

  /**
   * Initialize the dashboard
   */
  async init() {
    this.initTheme();
    this.showLoading();
    this.updateModeIndicator();
    this.updateVersionIndicator();

    // Set up Firebase auth state listener for extension mode
    if (API.isExtension && window.firebaseAuth) {
      window.firebaseOnAuthStateChanged(window.firebaseAuth, (user) => {
        console.log('Auth state changed:', user ? user.email : 'signed out');
        this.updateSignInButton(user ? {
          email: user.email,
          name: user.displayName
        } : null);
      });
    }

    await this.loadPages();
    this.setupEventListeners();
    this.render();

    // Refresh in background if we showed cached data
    this.refreshInBackground();
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

  /**
   * Initialize theme from localStorage
   */
  initTheme() {
    const savedTheme = localStorage.getItem('theme-preference') || 'auto';
    this.applyTheme(savedTheme);
    this.updateThemeButtons(savedTheme);
  }

  /**
   * Apply theme to document
   */
  applyTheme(theme) {
    const html = document.documentElement;
    if (theme === 'auto') {
      html.removeAttribute('data-theme');
    } else {
      html.setAttribute('data-theme', theme);
    }
  }

  /**
   * Update theme button active states
   */
  updateThemeButtons(activeTheme) {
    document.querySelectorAll('.theme-option').forEach(btn => {
      if (btn.dataset.theme === activeTheme) {
        btn.classList.add('active');
        btn.setAttribute('aria-checked', 'true');
      } else {
        btn.classList.remove('active');
        btn.setAttribute('aria-checked', 'false');
      }
    });
  }

  /**
   * Update mode indicator in footer
   */
  updateModeIndicator() {
    const modeLabel = document.getElementById('mode-label');
    if (API.isExtension) {
      modeLabel.textContent = 'Extension Mode';
      modeLabel.style.color = '#10b981';
    } else {
      modeLabel.textContent = 'Development Mode (using mock data)';
      modeLabel.style.color = '#f59e0b';
    }
  }

  /**
   * Update version indicator in footer
   */
  updateVersionIndicator() {
    const versionNumber = document.getElementById('version-number');
    if (!versionNumber) return;

    if (API.isExtension && typeof browser !== 'undefined' && browser.runtime) {
      // Extension mode: read from manifest
      const manifest = browser.runtime.getManifest();
      versionNumber.textContent = manifest.version;
    } else {
      // Standalone mode: use hardcoded version (matches manifest.json)
      versionNumber.textContent = '0.12.0';
    }
  }

  /**
   * Show loading state
   */
  showLoading() {
    const content = document.getElementById('content');
    content.innerHTML = Components.loadingState();
  }

  /**
   * Show error state
   */
  showError(error) {
    const content = document.getElementById('content');
    content.innerHTML = Components.errorState(error);
  }

  /**
   * Load pages from API
   */
  async loadPages() {
    try {
      this.allPages = await API.getSavedPages(this.currentFilter);
      this.applyClientFilters();
      this.updateStats();
    } catch (error) {
      console.error('Failed to load pages:', error);

      // Check if error is authentication-related
      const isAuthError = error.message && (
        error.message.includes('401') ||
        error.message.includes('Unauthorized') ||
        error.message.includes('Authentication failed') ||
        error.message.includes('Sign-in failed')
      );

      if (isAuthError) {
        this.showSignInPrompt();
      } else {
        this.showError(error);
      }
    }
  }

  /**
   * Refresh data in background (after showing cached data)
   */
  async refreshInBackground() {
    if (!API.isExtension) return;

    try {
      // Wait a bit to avoid competing with initial render
      await new Promise(resolve => setTimeout(resolve, 500));

      console.log('Refreshing data in background...');
      const freshPages = await API.getSavedPages({
        ...this.currentFilter,
        skipCache: true
      });

      // Only update if data changed
      if (JSON.stringify(freshPages) !== JSON.stringify(this.allPages)) {
        console.log('Data updated, re-rendering');
        this.allPages = freshPages;
        this.applyClientFilters();
        this.updateStats();
        this.render();
      } else {
        console.log('No changes detected');
      }
    } catch (error) {
      console.error('Background refresh failed:', error);
      // Don't show error to user - they already have cached data
    }
  }

  /**
   * Apply client-side search filter
   */
  applyClientFilters() {
    let filtered = [...this.allPages];

    // Apply search filter across all content and metadata fields
    if (this.currentFilter.search) {
      const query = this.currentFilter.search.toLowerCase();
      filtered = filtered.filter(page => {
        // Core content fields
        if (page.title && page.title.toLowerCase().includes(query)) return true;
        if (page.url && page.url.toLowerCase().includes(query)) return true;
        if (page.description && page.description.toLowerCase().includes(query)) return true;
        if (page.user_notes && page.user_notes.toLowerCase().includes(query)) return true;

        // AI-generated fields
        if (page.ai_summary_brief && page.ai_summary_brief.toLowerCase().includes(query)) return true;
        if (page.ai_summary_extended && page.ai_summary_extended.toLowerCase().includes(query)) return true;
        if (page.dewey_primary_label && page.dewey_primary_label.toLowerCase().includes(query)) return true;

        // Tags (both manual and AI)
        if (page.manual_tags && page.manual_tags.some(tag => tag.toLowerCase().includes(query))) return true;

        // Metadata fields
        if (page.domain && page.domain.toLowerCase().includes(query)) return true;
        if (page.author && page.author.toLowerCase().includes(query)) return true;

        return false;
      });
    }

    this.pages = filtered;
  }

  /**
   * Update stats display
   */
  updateStats() {
    const statsEl = document.getElementById('stats');
    const total = this.allPages.length;
    const filtered = this.pages.length;

    if (filtered < total) {
      statsEl.textContent = `Showing ${filtered} of ${total} pages`;
    } else {
      statsEl.textContent = `${total} ${total === 1 ? 'page' : 'pages'} saved`;
    }
  }

  /**
   * Render pages to DOM
   */
  render() {
    const container = document.getElementById('content');

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
      return;
    }

    const cardsHtml = this.pages.map(page => Components.savedPageCard(page)).join('');
    container.innerHTML = cardsHtml;
  }

  /**
   * Show sign-in prompt
   */
  showSignInPrompt() {
    const content = document.getElementById('content');
    content.innerHTML = Components.signInState();
  }

  /**
   * Update sign-in button visibility based on auth state
   */
  updateSignInButton(user) {
    const signInBtn = document.getElementById('sign-in-btn');
    const userProfile = document.getElementById('user-profile');

    if (!signInBtn || !userProfile) return;

    if (user) {
      // User is signed in - hide sign-in button, show profile
      signInBtn.style.display = 'none';
      userProfile.style.display = 'block';

      // Update user info
      const userName = document.getElementById('user-name');
      const userEmail = document.getElementById('user-email');

      if (userName && user.name) {
        userName.textContent = user.name.split(' ')[0]; // First name only
      }
      if (userEmail && user.email) {
        userEmail.textContent = user.email;
      }
    } else {
      // User is signed out - show sign-in button, hide profile
      signInBtn.style.display = 'flex';
      userProfile.style.display = 'none';
    }
  }

  /**
   * Handle sign-in button click
   * In this architecture, OAuth happens when user clicks extension icon to save a page
   */
  async handleSignIn() {
    alert('To sign in, click the SaveIt extension icon in your toolbar while viewing any web page.\n\nThis will trigger Google OAuth and save that page.');
  }

  /**
   * Handle sign-out button click
   */
  async handleSignOut() {
    try {
      if (window.firebaseAuth && window.firebaseSignOut) {
        await window.firebaseSignOut(window.firebaseAuth);
        this.updateSignInButton(null);
        this.showSignInPrompt();
      }
    } catch (error) {
      console.error('Sign-out failed:', error);
      alert('Failed to sign out. Please try again.');
    }
  }

  /**
   * Toggle user profile dropdown
   */
  toggleUserDropdown() {
    const dropdown = document.getElementById('user-dropdown');
    if (!dropdown) return;

    const isVisible = dropdown.style.display === 'block';
    dropdown.style.display = isVisible ? 'none' : 'block';
  }

  /**
   * Setup all event listeners
   */
  setupEventListeners() {
    // Sign-in button
    const signInBtn = document.getElementById('sign-in-btn');
    if (signInBtn) {
      signInBtn.addEventListener('click', () => this.handleSignIn());
    }

    // User profile button (toggle dropdown)
    const userProfileBtn = document.getElementById('user-profile-btn');
    if (userProfileBtn) {
      userProfileBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        this.toggleUserDropdown();
      });
    }

    // Sign-out button
    const signOutBtn = document.getElementById('sign-out-btn');
    if (signOutBtn) {
      signOutBtn.addEventListener('click', () => this.handleSignOut());
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
        this.applyTheme(theme);
        this.updateThemeButtons(theme);
      });
    });

    // Card actions (event delegation)
    document.getElementById('content').addEventListener('click', (e) => {
      // Back button - return to main view from discovery
      const backBtn = e.target.closest('#back-to-main');
      if (backBtn) {
        e.stopPropagation();
        this.exitDiscoveryMode();
        return;
      }

      // Tag click - trigger semantic discovery
      const tagElement = e.target.closest('.ai-tag');
      if (tagElement) {
        e.stopPropagation();
        const label = tagElement.dataset.label;
        if (label) {
          this.discoverByTag(label);
        }
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

      // Row click - open URL in new tab
      const row = e.target.closest('.saved-page-card');
      if (row) {
        const url = row.dataset.url;
        this.openPage(url);
      }
    });

    // About link
    document.getElementById('about-link').addEventListener('click', (e) => {
      e.preventDefault();
      this.showAbout();
    });
  }

  /**
   * Handle filter changes (search, category)
   */
  handleFilterChange() {
    this.applyClientFilters();
    this.updateStats();
    this.render();
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

      this.allPages = this.allPages.filter(p => p.id !== id);
      this.applyClientFilters();
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
    const message = `SaveIt Dashboard

Mode: ${mode}
Version: 0.10.0

SaveIt helps you save and rediscover web pages with AI-powered metadata and intelligent discovery.

${!API.isExtension ? '\n⚠️  Currently viewing mock data in standalone mode. Load as browser extension to see your real saved pages.' : ''}`;

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
   */
  async discoverByTag(label) {
    this.discoveryMode = true;
    this.currentDiscoveryLabel = label;

    // Show loading state
    this.showLoading();

    try {
      const results = await API.searchByTag(label);
      this.renderDiscoveryResults(results, label);
    } catch (error) {
      console.error('Failed to search by tag:', error);
      this.showError(error);
    }
  }

  /**
   * Render discovery results
   */
  renderDiscoveryResults(results, queryLabel) {
    const container = document.getElementById('content');
    container.innerHTML = Components.discoveryResults(results, queryLabel);
  }

  /**
   * Exit discovery mode and return to main view
   */
  exitDiscoveryMode() {
    this.discoveryMode = false;
    this.currentDiscoveryLabel = null;
    this.render();
  }
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    window.dashboard = new SaveItDashboard();
    window.dashboard.init();
  });
} else {
  window.dashboard = new SaveItDashboard();
  window.dashboard.init();
}

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
