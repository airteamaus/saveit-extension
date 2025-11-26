// components.js - Reusable UI component builders
// Simple template functions for rendering dashboard elements

/**
 * Page data shape (matches BigQuery things table schema)
 * @typedef {Object} Page
 *
 * REQUIRED FIELDS:
 * @property {string} id - Unique identifier (UUID)
 * @property {string} thing_type - Type of saved item (currently always 'bookmark')
 * @property {string} user_email - User's email address
 *
 * OPTIONAL CORE FIELDS:
 * @property {string} [url] - Full URL of saved page
 * @property {string} [title] - Page title
 * @property {string} [thumbnail] - Thumbnail image URL
 * @property {string} [description] - Meta description or extracted content summary
 * @property {string} [domain] - Domain name (e.g., 'example.com')
 * @property {number} [reading_time_minutes] - Estimated reading time in minutes
 * @property {string} [saved_at] - ISO timestamp when page was saved (TIMESTAMP)
 * @property {string} [user_notes] - User's personal notes about the page
 * @property {string[]} [manual_tags] - User-added tags (REPEATED field in BigQuery)
 *
 * INTERNAL FIELDS (not displayed in UI):
 * @property {boolean} [deleted] - Soft delete flag (default: false)
 * @property {string} [deleted_at] - ISO timestamp when deleted (TIMESTAMP)
 * @property {string} [updated_at] - ISO timestamp of last update (TIMESTAMP)
 * @property {string} [user_id] - OAuth user ID (Google sub claim)
 * @property {string} [content_ref] - GCS reference to full-text markdown (format: gs://bucket/hash.md)
 *
 * AI ENRICHMENT FIELDS (populated by cloud-function-enrich):
 * @property {string} [ai_summary_brief] - 1-2 sentence AI-generated summary
 * @property {string} [ai_summary_extended] - Longer AI-generated summary (not currently displayed)
 * @property {Array<{type: string, label: string, confidence: number, embedding: number[]}>} [classifications] - Multi-level AI classifications (general/domain/topic)
 * @property {string} [primary_classification_label] - Primary classification label extracted from classifications array
 * @property {string} [ai_enriched_at] - ISO timestamp when AI enrichment completed (TIMESTAMP)
 *
 * LEGACY FIELDS (from mock data, not in schema):
 * @property {string} [author] - Article author (from OpenGraph meta tags)
 * @property {string} [published_date] - ISO timestamp of article publication (TIMESTAMP)
 *
 * NOTE: All TIMESTAMP fields from BigQuery are serialized as ISO 8601 strings
 * NOTE: UI prioritizes ai_summary_brief over description for display
 */

const Components = {
  /**
   * Render classification tags with type-specific styling
   * Supports multi-level classifications and primary_classification_label fallback
   *
   * @param {Page} page - Page data object
   * @returns {string} HTML string of classification tags
   */
  renderClassifications(page) {
    // Use new classifications if available
    if (page.classifications && page.classifications.length > 0) {
      return page.classifications
        .map(c => {
          const typeClass = `tag-${c.type}`; // tag-general, tag-domain, tag-topic
          return `<span class="tag ai-tag ${typeClass}" data-type="${this.escapeHtml(c.type)}" data-label="${this.escapeHtml(c.label)}" title="AI-generated ${c.type} (confidence: ${Math.round(c.confidence * 100)}%)">${this.escapeHtml(c.label)}</span>`;
        })
        .join('');
    }

    // Fallback to primary_classification_label if no full classifications
    if (page.primary_classification_label) {
      return `<span class="tag ai-tag" title="AI-generated classification">${this.escapeHtml(page.primary_classification_label)}</span>`;
    }

    return '';
  },

  /**
   * Build metadata items array for a page
   * @private
   * @param {Object} page - Page data
   * @returns {Array<string>} Array of metadata items (author, date, domain, reading time)
   */
  _buildMetadataItems(page) {
    const metaItems = [];
    if (page.author) metaItems.push(this.escapeHtml(page.author));
    if (page.published_date) {
      const pubDate = new Date(page.published_date);
      metaItems.push(pubDate.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }));
    }
    if (page.domain) metaItems.push(this.escapeHtml(page.domain));
    if (page.reading_time_minutes) metaItems.push(`${page.reading_time_minutes} min read`);
    return metaItems;
  },

  /**
   * Render tags footer section (classifications + manual tags)
   * @private
   * @param {Object} page - Page data
   * @returns {string} HTML string for tags section or empty string
   */
  _renderTagsFooterSection(page) {
    const hasTags = (page.classifications && page.classifications.length > 0) ||
                    page.primary_classification_label ||
                    (page.manual_tags && page.manual_tags.length > 0);

    if (!hasTags) return '';

    return `
      <div class="row-tags">
        ${this.renderClassifications(page)}
        ${page.manual_tags && page.manual_tags.length > 0 ?
          page.manual_tags.map(tag => `<span class="tag">${this.escapeHtml(tag)}</span>`).join('')
        : ''}
      </div>
    `;
  },

  /**
   * Create a saved page row element (returns HTML string)
   *
   * Renders a single page item with:
   * - Header: favicon + title
   * - Summary: AI brief summary (preferred) or description
   * - Footer: tags (AI-generated and manual) + metadata
   * - Notes: user's personal notes (if present)
   * - Delete button: hover-activated trash icon
   *
   * @param {Page} page - Page data object
   * @returns {string} HTML string
   */
  savedPageCard(page) {
    const metaItems = this._buildMetadataItems(page);

    return `
      <div class="saved-page-card" data-id="${page.id}" data-url="${this.escapeHtml(page.url)}">
        <div class="row-content">
          <div class="row-header">
            ${page.domain ? `<img class="favicon" src="https://www.google.com/s2/favicons?domain=${this.escapeHtml(page.domain)}&sz=32" alt="" width="20" height="20">` : ''}
            <h3 class="row-title">${this.escapeHtml(page.title)}</h3>
            <button class="btn-pin" data-id="${page.id}" title="${page.pinned ? 'Unpin page' : 'Pin page'}">
              ${page.pinned ? '⭐' : '☆'}
            </button>
          </div>

          ${page.ai_summary_brief ? `
            <p class="row-summary">${this.escapeHtml(page.ai_summary_brief)}</p>
          ` : (page.description ? `
            <p class="row-summary">${this.escapeHtml(this.truncate(page.description, 200))}</p>
          ` : '')}

          <div class="row-footer">
            ${this._renderTagsFooterSection(page)}

            <button class="btn-delete" data-id="${page.id}" title="Delete page">
              <svg class="icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <polyline points="3 6 5 6 21 6"></polyline>
                <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
              </svg>
            </button>
          </div>

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

        ${metaItems.length > 0 ? `
          <div class="row-meta">
            ${metaItems.map(item => `<span class="meta-item">${item}</span>`).join('')}
          </div>
        ` : ''}
      </div>
    `;
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
   * Create welcome/onboarding state for new users
   * @returns {string} HTML string
   */
  welcomeState() {
    return `
      <div class="welcome-state">
        <svg class="welcome-icon" width="80" height="80" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
          <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"></path>
        </svg>
        <h2>Welcome to SaveIt</h2>
        <p class="welcome-subtitle">AI-powered bookmarks that you can actually find again</p>

        <ul class="welcome-features">
          <li>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"></path>
            </svg>
            <span>Save pages with one click</span>
          </li>
          <li>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <circle cx="12" cy="12" r="10"></circle>
              <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"></path>
              <line x1="12" y1="17" x2="12.01" y2="17"></line>
            </svg>
            <span>AI reads and classifies content</span>
          </li>
          <li>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <circle cx="11" cy="11" r="8"></circle>
              <path d="m21 21-4.35-4.35"></path>
            </svg>
            <span>Discover through semantic search</span>
          </li>
        </ul>

        <button id="welcome-sign-in-btn" class="btn btn-primary btn-large">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4"></path>
            <polyline points="10 17 15 12 10 7"></polyline>
            <line x1="15" y1="12" x2="3" y2="12"></line>
          </svg>
          Sign in with Google
        </button>
      </div>
    `;
  },

  /**
   * Create sign-in state (unauthenticated) - redirects to welcome state
   * @returns {string} HTML string
   */
  signInState() {
    return this.welcomeState();
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
   * Render semantic search discovery results view
   * @param {Object} results - Search results with exact_matches, similar_matches, related_matches
   * @returns {string} HTML string
   */
  discoveryResults(results) {
    const totalResults = (results.exact_matches?.length || 0) +
                         (results.similar_matches?.length || 0) +
                         (results.related_matches?.length || 0);

    if (totalResults === 0) {
      return `
        <div class="empty-state">
          <svg class="empty-icon" width="60" height="60" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
            <circle cx="11" cy="11" r="8"></circle>
            <path d="m21 21-4.35-4.35"></path>
          </svg>
          <h3>No related pages</h3>
          <p>Try clicking a different tag to discover related content</p>
        </div>
      `;
    }

    let html = '';

    // Exact matches tier
    if (results.exact_matches && results.exact_matches.length > 0) {
      html += results.exact_matches.map(match => this.savedPageCard(match.thing_data)).join('');
    }

    // Similar matches tier
    if (results.similar_matches && results.similar_matches.length > 0) {
      html += results.similar_matches.map(match => this.savedPageCard(match.thing_data)).join('');
    }

    // Related matches tier
    if (results.related_matches && results.related_matches.length > 0) {
      html += results.related_matches.map(match => this.savedPageCard(match.thing_data)).join('');
    }

    return html;
  }
};

// Export for testing
/* eslint-disable no-undef */
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { Components };
}
/* eslint-enable no-undef */
