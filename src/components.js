// components.js - Reusable UI component builders
// Simple template functions for rendering dashboard elements

const Components = {
  /**
   * Create a saved page card element
   * @param {Object} page - Page data
   * @returns {HTMLElement} Card element
   */
  savedPageCard(page) {
    const card = document.createElement('article');
    card.className = 'saved-page-card';
    card.dataset.id = page.id;

    card.innerHTML = `
      <div class="card-content">
        <h3 class="card-title">
          ${page.domain ? `<img class="favicon" src="https://www.google.com/s2/favicons?domain=${this.escapeHtml(page.domain)}&sz=32" alt="" width="20" height="20">` : ''}
          <span>${this.escapeHtml(page.title)}</span>
        </h3>

        ${page.description ? `
          <p class="card-description">${this.escapeHtml(this.truncate(page.description, 150))}</p>
        ` : ''}

        <div class="card-meta">
          <span class="meta-item domain" title="${page.domain}">
            <svg class="icon" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"></path>
              <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"></path>
            </svg>
            ${this.escapeHtml(page.domain)}
          </span>

          ${page.reading_time_minutes ? `
            <span class="meta-item reading-time" title="Estimated reading time">
              <svg class="icon" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <circle cx="12" cy="12" r="10"></circle>
                <polyline points="12 6 12 12 16 14"></polyline>
              </svg>
              ${page.reading_time_minutes} min
            </span>
          ` : ''}

          <span class="meta-item date" title="${new Date(page.timestamp).toLocaleString()}">
            <svg class="icon" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect>
              <line x1="16" y1="2" x2="16" y2="6"></line>
              <line x1="8" y1="2" x2="8" y2="6"></line>
              <line x1="3" y1="10" x2="21" y2="10"></line>
            </svg>
            ${this.formatDate(page.timestamp)}
          </span>

          ${page.author ? `
            <span class="meta-item author" title="Author">
              <svg class="icon" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path>
                <circle cx="12" cy="7" r="4"></circle>
              </svg>
              ${this.escapeHtml(page.author)}
            </span>
          ` : ''}
        </div>

        ${page.manual_tags && page.manual_tags.length > 0 ? `
          <div class="card-tags">
            ${page.manual_tags.map(tag =>
              `<span class="tag">${this.escapeHtml(tag)}</span>`
            ).join('')}
          </div>
        ` : ''}

        ${page.user_notes ? `
          <div class="card-notes">
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
          <svg class="icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"></path>
            <polyline points="15 3 21 3 21 9"></polyline>
            <line x1="10" y1="14" x2="21" y2="3"></line>
          </svg>
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

    return card;
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
