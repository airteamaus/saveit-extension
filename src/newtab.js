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
        container.innerHTML = Components.emptyState();
      }
      return;
    }

    const cardsHtml = this.pages.map(page => Components.savedPageCard(page)).join('');
    container.innerHTML = cardsHtml;
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

    // Card actions (event delegation)
    document.getElementById('content').addEventListener('click', (e) => {
      // Delete button - handle first and stop propagation
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
