// search-manager.js - Search and filtering logic
// Handles client-side text search across page content and metadata

/**
 * SearchManager - Manages search and filtering operations
 * Provides client-side text search across multiple page fields
 */
/* eslint-disable-next-line no-unused-vars */
class SearchManager {
  constructor() {
    // SearchManager is stateless - operates on data passed to methods
  }

  /**
   * Apply client-side search filter
   * Searches across all content and metadata fields
   * @param {Array} pages - Array of pages to filter
   * @param {string} query - Search query string
   * @returns {Array} Filtered pages
   */
  applyClientFilters(pages, query) {
    if (!query || query.trim() === '') {
      return [...pages];
    }

    const searchQuery = query.toLowerCase();

    return pages.filter(page => {
      // Core content fields
      if (page.title && page.title.toLowerCase().includes(searchQuery)) return true;
      if (page.url && page.url.toLowerCase().includes(searchQuery)) return true;
      if (page.description && page.description.toLowerCase().includes(searchQuery)) return true;
      if (page.user_notes && page.user_notes.toLowerCase().includes(searchQuery)) return true;

      // AI-generated fields
      if (page.ai_summary_brief && page.ai_summary_brief.toLowerCase().includes(searchQuery)) return true;
      if (page.ai_summary_extended && page.ai_summary_extended.toLowerCase().includes(searchQuery)) return true;
      if (page.primary_classification_label && page.primary_classification_label.toLowerCase().includes(searchQuery)) return true;

      // Tags (both manual and AI)
      if (page.manual_tags && page.manual_tags.some(tag => tag.toLowerCase().includes(searchQuery))) return true;

      // Metadata fields
      if (page.domain && page.domain.toLowerCase().includes(searchQuery)) return true;
      if (page.author && page.author.toLowerCase().includes(searchQuery)) return true;

      return false;
    });
  }

  /**
   * Apply text search filter on pages
   * Same as applyClientFilters but with logging for debugging
   * Searches across multiple content and metadata fields
   * @param {Array} pages - Array of pages to filter
   * @param {string} query - Search query string
   * @returns {Array} Filtered pages
   */
  applySearchFilter(pages, query) {
    const searchQuery = query.toLowerCase();
    console.log('[applySearchFilter] Filtering with query:', query);

    const filtered = pages.filter(page => {
      if (page.title && page.title.toLowerCase().includes(searchQuery)) return true;
      if (page.url && page.url.toLowerCase().includes(searchQuery)) return true;
      if (page.description && page.description.toLowerCase().includes(searchQuery)) return true;
      if (page.user_notes && page.user_notes.toLowerCase().includes(searchQuery)) return true;
      if (page.ai_summary_brief && page.ai_summary_brief.toLowerCase().includes(searchQuery)) return true;
      if (page.ai_summary_extended && page.ai_summary_extended.toLowerCase().includes(searchQuery)) return true;
      if (page.primary_classification_label && page.primary_classification_label.toLowerCase().includes(searchQuery)) return true;
      if (page.manual_tags && page.manual_tags.some(tag => tag.toLowerCase().includes(searchQuery))) return true;
      if (page.domain && page.domain.toLowerCase().includes(searchQuery)) return true;
      if (page.author && page.author.toLowerCase().includes(searchQuery)) return true;
      return false;
    });

    console.log('[applySearchFilter] Filtered to', filtered.length, 'pages');
    return filtered;
  }
}
