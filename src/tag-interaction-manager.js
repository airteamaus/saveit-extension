// tag-interaction-manager.js - Tag interaction and similarity search management
// Handles hierarchical tag selection, rendering, and similarity-based filtering

/**
 * TagInteractionManager - Manages tag bar UI and hierarchical tag selection
 * Works with TagManager for tag extraction and API for similarity search
 */
/* eslint-disable-next-line no-unused-vars */
class TagInteractionManager {
  /**
   * @param {Object} api - API instance for similarity search
   * @param {Object} tagManager - TagManager instance for tag extraction
   * @param {Object} components - Components instance for HTML escaping
   */
  constructor(api, tagManager, components) {
    this.api = api;
    this.tagManager = tagManager;
    this.components = components;

    // Hierarchical selection state
    this.selectedL1 = null; // General (L1) tag
    this.selectedL2 = null; // Domain (L2) tag
    this.selectedL3 = null; // Topic (L3) tag

    // Similarity search threshold
    this.similarityThreshold = 0.5;
  }

  /**
   * Get current tag selection state
   * @returns {Object} Current selection {L1, L2, L3}
   */
  getSelection() {
    return {
      L1: this.selectedL1,
      L2: this.selectedL2,
      L3: this.selectedL3
    };
  }

  /**
   * Clear all tag selections
   */
  clearSelection() {
    this.selectedL1 = null;
    this.selectedL2 = null;
    this.selectedL3 = null;
  }

  /**
   * Render tag bar with hierarchical selection
   * @param {Array} allPages - All pages (for L1 extraction)
   * @param {Array} filteredPages - Currently filtered pages (for L2/L3 extraction)
   */
  renderTagBar(allPages, filteredPages) {
    const tagBarContainer = document.getElementById('tag-bar');
    if (!tagBarContainer) {
      console.warn('[TagInteractionManager] Tag bar container not found');
      return;
    }

    console.log('[TagInteractionManager.renderTagBar] Selection state:', {
      L1: this.selectedL1,
      L2: this.selectedL2,
      L3: this.selectedL3
    });

    // Always show L1 tags
    const l1Tags = this.tagManager.extractGeneralTags(allPages);

    // Build L1 row HTML
    const l1Html = l1Tags.map(tag => {
      const isActive = this.selectedL1 === tag.label;
      const activeClass = isActive ? 'active' : '';
      return `<button class="tag ai-tag tag-general ${activeClass}" data-type="general" data-label="${this.components.escapeHtml(tag.label)}">${this.components.escapeHtml(tag.label)}</button>`;
    }).join('');

    let l2Html = '';
    let l3Html = '';

    // Only show L2 tags if L1 is selected
    if (this.selectedL1) {
      const l2Tags = this.tagManager.extractL2TagsForL1(this.selectedL1, filteredPages);

      if (l2Tags.length > 0) {
        l2Html = l2Tags.map(tag => {
          const isActive = this.selectedL2 === tag.label;
          const activeClass = isActive ? 'active' : '';
          return `<button class="tag ai-tag tag-domain ${activeClass}" data-type="domain" data-label="${this.components.escapeHtml(tag.label)}">${this.components.escapeHtml(tag.label)}</button>`;
        }).join('');
      }
    }

    // Only show L3 tags if L2 is selected
    if (this.selectedL2) {
      const l3Tags = this.tagManager.extractL3TagsForL2(this.selectedL2, filteredPages);

      if (l3Tags.length > 0) {
        l3Html = l3Tags.map(tag => {
          const isActive = this.selectedL3 === tag.label;
          const activeClass = isActive ? 'active' : '';
          return `<button class="tag ai-tag tag-topic ${activeClass}" data-type="topic" data-label="${this.components.escapeHtml(tag.label)}">${this.components.escapeHtml(tag.label)}</button>`;
        }).join('');
      }
    }

    // Build complete tag bar HTML
    tagBarContainer.innerHTML = `
      <div class="tag-bar-tags">${l1Html}</div>
      ${l2Html ? `<div class="tag-bar-tags tag-bar-l2">${l2Html}</div>` : ''}
      ${l3Html ? `<div class="tag-bar-tags tag-bar-l3">${l3Html}</div>` : ''}
    `;
  }

  /**
   * Handle tag click in hierarchical selection mode
   * Uses async similarity search to find related pages
   * @param {string} type - Classification type (general/domain/topic)
   * @param {string} label - Tag label
   * @param {Array} allPages - All pages (for context building and fallback)
   * @param {Array} currentPages - Currently displayed pages
   * @param {Function} showLoadingCallback - Callback to show loading state
   * @param {Function} showErrorCallback - Callback to show error state
   * @returns {Promise<Object|null>} Object with {pages, clearSelection: boolean} or null
   */
  async handleTagClick(type, label, allPages, currentPages, showLoadingCallback, showErrorCallback) {
    // Check if clicking the same tag again (toggle off)
    const isAlreadySelected = (
      (type === 'general' && this.selectedL1 === label && !this.selectedL2 && !this.selectedL3) ||
      (type === 'domain' && this.selectedL2 === label && !this.selectedL3) ||
      (type === 'topic' && this.selectedL3 === label)
    );

    if (isAlreadySelected) {
      // Clear selection and return signal to show all pages
      this.clearSelection();
      return {
        pages: [...allPages],
        clearSelection: true
      };
    }

    // Build full hierarchy context for this tag
    const context = this.tagManager.buildBreadcrumbContext(type, label, allPages, currentPages);

    if (!context) {
      console.warn('[TagInteractionManager.handleTagClick] No context found for tag:', type, label);
      return null;
    }

    // Update selection state with full hierarchy
    if (type === 'general') {
      this.selectedL1 = label;
      this.selectedL2 = null;
      this.selectedL3 = null;
    } else if (type === 'domain') {
      this.selectedL1 = context.parentLabel || null;
      this.selectedL2 = label;
      this.selectedL3 = null;
    } else if (type === 'topic') {
      this.selectedL1 = context.grandparentLabel || null;
      this.selectedL2 = context.parentLabel || null;
      this.selectedL3 = label;
    }

    // Determine which tag to search by (deepest selected level)
    const activeLabel = this.selectedL3 || this.selectedL2 || this.selectedL1;

    // Show loading state
    showLoadingCallback();

    try {
      console.log('[TagInteractionManager.handleTagClick] Searching for:', activeLabel, 'threshold:', this.similarityThreshold);

      // Call backend similarity search
      const results = await this.api.searchByTag(activeLabel, this.similarityThreshold);

      console.log('[TagInteractionManager.handleTagClick] Got results:', {
        exact: results.exact_matches?.length || 0,
        similar: results.similar_matches?.length || 0,
        related: results.related_matches?.length || 0
      });

      // Extract and score pages
      const pages = this.extractSimilarityResults(results, allPages);

      return {
        pages,
        clearSelection: false
      };
    } catch (error) {
      console.error('[TagInteractionManager] Similarity search failed:', error);
      showErrorCallback(error);
      throw error;
    }
  }

  /**
   * Extract pages from similarity search results
   * Maps thing_id to full page objects and preserves similarity scores
   * @param {Object} results - Results from API.searchByTag()
   * @param {Array} allPages - All pages for lookup
   * @returns {Array} Array of page objects with _similarity scores
   */
  extractSimilarityResults(results, allPages) {
    const pages = [];

    // Combine all tiers (already sorted by similarity in backend)
    const allMatches = [
      ...(results.exact_matches || []),
      ...(results.similar_matches || []),
      ...(results.related_matches || [])
    ];

    console.log('[TagInteractionManager.extractSimilarityResults] Processing', allMatches.length, 'matches');

    // Map thing_id to page from allPages and preserve similarity score
    for (const match of allMatches) {
      // Backend may return thing_data embedded, or just thing_id
      let page;
      if (match.thing_data) {
        page = match.thing_data;
      } else {
        page = allPages.find(p => p.id === match.thing_id);
      }

      if (page) {
        // Attach similarity score for potential display
        page._similarity = match.similarity;
        page._matched_label = match.matched_label;
        pages.push(page);
      }
    }

    console.log('[TagInteractionManager.extractSimilarityResults] Extracted', pages.length, 'pages');
    return pages;
  }

  /**
   * Get the active tag label (deepest selected level)
   * @returns {string|null} Active tag label or null
   */
  getActiveLabel() {
    return this.selectedL3 || this.selectedL2 || this.selectedL1;
  }

  /**
   * Get the active tag type
   * @returns {string|null} Active tag type (general/domain/topic) or null
   */
  getActiveType() {
    if (this.selectedL3) return 'topic';
    if (this.selectedL2) return 'domain';
    if (this.selectedL1) return 'general';
    return null;
  }
}
