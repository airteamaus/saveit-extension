// newtab.js - Main dashboard logic
// Handles page loading, filtering, and user interactions

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
  }

  /**
   * Initialize the dashboard
   */
  async init() {
    this.showLoading();
    this.updateModeIndicator();
    await this.loadPages();
    this.setupEventListeners();
    this.render();
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
      this.showError(error);
    }
  }

  /**
   * Apply client-side filters (search and category)
   */
  applyClientFilters() {
    let filtered = [...this.allPages];

    // Apply category filter
    if (this.currentFilter.category) {
      filtered = filtered.filter(page =>
        page.domain_category === this.currentFilter.category
      );
    }

    // Apply search filter (already done server-side for extension mode)
    // But we do it client-side too for instant feedback
    if (this.currentFilter.search) {
      const query = this.currentFilter.search.toLowerCase();
      filtered = filtered.filter(page =>
        page.title.toLowerCase().includes(query) ||
        page.url.toLowerCase().includes(query) ||
        (page.description && page.description.toLowerCase().includes(query)) ||
        (page.manual_tags && page.manual_tags.some(tag => tag.toLowerCase().includes(query)))
      );
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
      if (this.currentFilter.search || this.currentFilter.category) {
        container.innerHTML = `
          <div class="empty-state">
            <svg class="empty-icon" width="80" height="80" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
              <circle cx="11" cy="11" r="8"></circle>
              <path d="m21 21-4.35-4.35"></path>
            </svg>
            <h2>No matching pages</h2>
            <p>Try adjusting your search or filters</p>
          </div>
        `;
      } else {
        container.innerHTML = Components.emptyState();
      }
      return;
    }

    container.innerHTML = '';
    this.pages.forEach(page => {
      const card = Components.savedPageCard(page);
      container.appendChild(card);
    });
  }

  /**
   * Setup all event listeners
   */
  setupEventListeners() {
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

    // Sort select
    document.getElementById('sort').addEventListener('change', (e) => {
      this.currentFilter.sort = e.target.value;
      this.handleSortChange();
    });

    // Category filter
    document.getElementById('filter-category').addEventListener('change', (e) => {
      this.currentFilter.category = e.target.value;
      this.handleFilterChange();
    });

    // Card actions (event delegation)
    document.getElementById('content').addEventListener('click', (e) => {
      // Open button
      if (e.target.closest('.btn-open')) {
        const url = e.target.closest('.btn-open').dataset.url;
        this.openPage(url);
      }

      // Delete button
      if (e.target.closest('.btn-delete')) {
        const id = e.target.closest('.btn-delete').dataset.id;
        this.deletePage(id);
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
   * Handle sort changes (requires re-sorting)
   */
  handleSortChange() {
    if (this.currentFilter.sort === 'newest') {
      this.allPages.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
    } else if (this.currentFilter.sort === 'oldest') {
      this.allPages.sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
    }
    this.applyClientFilters();
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

    try {
      await API.deletePage(id);

      this.allPages = this.allPages.filter(p => p.id !== id);
      this.applyClientFilters();
      this.updateStats();
      this.render();

      this.showToast('Page deleted successfully');
    } catch (error) {
      console.error('Failed to delete page:', error);
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
Version: 0.5.0 (MVP)

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
