// components.js - Reusable UI component builders
// Simple template functions for rendering dashboard elements

const Components = {
  /**
   * Create a saved page row element
   * @param {Object} page - Page data
   * @returns {HTMLElement} Row element
   */
  savedPageCard(page) {
    const row = document.createElement('div');
    row.className = 'saved-page-card';
    row.dataset.id = page.id;
    row.dataset.url = page.url;

    // Build metadata line with bullet separators
    const metaItems = [];
    if (page.author) metaItems.push(this.escapeHtml(page.author));
    if (page.published_date) {
      const pubDate = new Date(page.published_date);
      metaItems.push(pubDate.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }));
    }
    if (page.domain) metaItems.push(this.escapeHtml(page.domain));
    if (page.reading_time_minutes) metaItems.push(`${page.reading_time_minutes} min read`);

    row.innerHTML = `
      <div class="row-content">
        <div class="row-header">
          ${page.domain ? `<img class="favicon" src="https://www.google.com/s2/favicons?domain=${this.escapeHtml(page.domain)}&sz=32" alt="" width="20" height="20">` : ''}
          <h3 class="row-title">${this.escapeHtml(page.title)}</h3>
        </div>

        ${page.ai_summary_brief ? `
          <p class="row-summary">${this.escapeHtml(page.ai_summary_brief)}</p>
        ` : (page.description ? `
          <p class="row-summary">${this.escapeHtml(this.truncate(page.description, 200))}</p>
        ` : '')}

        ${metaItems.length > 0 ? `
          <div class="row-meta">
            ${metaItems.join(' • ')}
          </div>
        ` : ''}

        ${(page.dewey_primary_label || (page.manual_tags && page.manual_tags.length > 0)) ? `
          <div class="row-tags">
            ${page.dewey_primary_label ? `<span class="tag ai-tag" title="AI-generated classification">${this.escapeHtml(page.dewey_primary_label)}</span>` : ''}
            ${page.manual_tags && page.manual_tags.length > 0 ?
              page.manual_tags.map(tag => `<span class="tag">${this.escapeHtml(tag)}</span>`).join('')
            : ''}
          </div>
        ` : ''}

        ${page.user_notes ? `
          <div class="row-notes">
            <svg class="icon" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path>
              <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path>
            </svg>
            ${this.escapeHtml(page.user_notes)}
          </div>
        ` : ''}
      </div>

      <div class="card-actions">
        <button class="btn btn-primary btn-open" data-url="${this.escapeHtml(page.url)}" title="Open page">
          Open
        </button>
        <button class="btn btn-secondary btn-delete" data-id="${page.id}" title="Delete page">
          <svg class="icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <polyline points="3 6 5 6 21 6"></polyline>
            <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
          </svg>
          Delete
        </button>
      </div>
    `;

    return row;
  },

  /**
   * Create empty state message
   * @returns {string} HTML string
   */
  emptyState() {
    return `
      <div class="empty-state">
        <svg class="empty-icon" width="80" height="80" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
          <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"></path>
        </svg>
        <h2>No saved pages yet</h2>
        <p>Click the SaveIt extension icon while browsing to save your first page!</p>
      </div>
    `;
  },

  /**
   * Create loading state
   * @returns {string} HTML string
   */
  loadingState() {
    return `
      <div class="loading-state">
        <div class="spinner"></div>
        <p>Loading your saved pages...</p>
      </div>
    `;
  },

  /**
   * Create error state
   * @param {Error} error - Error object
   * @returns {string} HTML string
   */
  errorState(error) {
    return `
      <div class="error-state">
        <svg class="error-icon" width="60" height="60" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <circle cx="12" cy="12" r="10"></circle>
          <line x1="12" y1="8" x2="12" y2="12"></line>
          <line x1="12" y1="16" x2="12.01" y2="16"></line>
        </svg>
        <h2>Failed to load pages</h2>
        <p>${this.escapeHtml(error.message || 'Unknown error occurred')}</p>
        <button class="btn btn-primary" onclick="location.reload()">Retry</button>
      </div>
    `;
  },

  /**
   * Escape HTML to prevent XSS
   * @param {string} text - Text to escape
   * @returns {string} Escaped text
   */
  escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  },

  /**
   * Truncate text to max length
   * @param {string} text - Text to truncate
   * @param {number} maxLength - Max character length
   * @returns {string} Truncated text
   */
  truncate(text, maxLength) {
    if (!text || text.length <= maxLength) return text;
    return text.substring(0, maxLength).trim() + '...';
  },

  /**
   * Format timestamp as human-readable date
   * @param {string} timestamp - ISO timestamp
   * @returns {string} Formatted date
   */
  formatDate(timestamp) {
    const date = new Date(timestamp);
    const now = new Date();
    const diffMs = now - date;
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
    const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
    const diffMinutes = Math.floor(diffMs / (1000 * 60));

    if (diffMinutes < 1) return 'Just now';
    if (diffMinutes < 60) return `${diffMinutes}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays === 0) return 'Today';
    if (diffDays === 1) return 'Yesterday';
    if (diffDays < 7) return `${diffDays} days ago`;
    if (diffDays < 30) return `${Math.floor(diffDays / 7)} weeks ago`;

    // For older dates, show actual date
    return date.toLocaleDateString(undefined, {
      month: 'short',
      day: 'numeric',
      year: date.getFullYear() !== now.getFullYear() ? 'numeric' : undefined
    });
  }
};
