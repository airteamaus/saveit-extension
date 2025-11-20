// discovery-manager.js - Discovery mode management
// Handles tag-based discovery search and rendering

/**
 * DiscoveryManager - Manages discovery mode functionality
 * Allows users to explore their saved pages by searching for similar content based on tags
 */
/* eslint-disable-next-line no-unused-vars */
class DiscoveryManager {
  /**
   * @param {Object} api - API instance for making search requests
   * @param {Object} components - Components instance for rendering UI
   * @param {Object} tagManager - TagManager instance for building breadcrumb context
   */
  constructor(api, components, tagManager) {
    this.api = api;
    this.components = components;
    this.tagManager = tagManager;

    // Discovery state
    this.discoveryMode = false;
    this.currentDiscoveryLabel = null;
    this.currentDiscoveryType = null;
    this.currentDiscoveryContext = null;
  }

  /**
   * Check if discovery mode is currently active
   * @returns {boolean} True if in discovery mode
   */
  isActive() {
    return this.discoveryMode;
  }

  /**
   * Get current discovery label
   * @returns {string|null} Current discovery label or null
   */
  getCurrentLabel() {
    return this.currentDiscoveryLabel;
  }

  /**
   * Get current discovery type
   * @returns {string|null} Current discovery type (general/domain/topic) or null
   */
  getCurrentType() {
    return this.currentDiscoveryType;
  }

  /**
   * Get current discovery context (breadcrumb)
   * @returns {Object|null} Current discovery context or null
   */
  getCurrentContext() {
    return this.currentDiscoveryContext;
  }

  /**
   * Enter discovery mode - search for pages by tag similarity
   * @param {string} label - Tag label to search for
   * @param {string} type - Classification type (general/domain/topic)
   * @param {Array} allPages - All pages for building context
   * @param {Array} filteredPages - Currently filtered pages for building context
   * @param {Function} showLoadingCallback - Callback to show loading state
   * @param {Function} showErrorCallback - Callback to show error state
   * @returns {Promise<Object>} Discovery results from API
   */
  async discover(label, type, allPages, filteredPages, showLoadingCallback, showErrorCallback) {
    debug('[DiscoveryManager.discover] Starting discovery for:', label, type);
    this.discoveryMode = true;
    this.currentDiscoveryLabel = label;
    this.currentDiscoveryType = type;

    // Build breadcrumb context for this classification
    this.currentDiscoveryContext = this.tagManager.buildBreadcrumbContext(
      type,
      label,
      allPages,
      filteredPages
    );

    // Show loading state
    showLoadingCallback();

    try {
      debug('[DiscoveryManager.discover] Calling API.searchByTag');
      const results = await this.api.searchByTag(label);
      debug('[DiscoveryManager.discover] Got results:', results);
      return results;
    } catch (error) {
      console.error('[DiscoveryManager.discover] Failed to search by tag:', error);
      showErrorCallback(error);
      throw error;
    }
  }

  /**
   * Render discovery results
   * Uses Components.discoveryResults to render the full discovery view
   * @param {Object} results - Discovery results from API
   * @returns {Array} Flattened array of page data from all result tiers
   */
  renderResults(results) {
    // Flatten all tiers into single array for tag extraction
    const allResults = [
      ...(results.exact_matches || []),
      ...(results.similar_matches || []),
      ...(results.related_matches || [])
    ];

    // Extract page data from results
    const pages = allResults.map(match => match.thing_data);

    // Use Components.discoveryResults to render full discovery view
    const container = document.getElementById('content');

    // Preserve scroll sentinel before modifying content
    const sentinel = document.getElementById('scroll-sentinel');

    container.innerHTML = this.components.discoveryResults(results);

    // Re-append sentinel after updating content
    if (sentinel) {
      container.appendChild(sentinel);
    }

    return pages;
  }

  /**
   * Exit discovery mode and clear state
   * Returns information about what state should be restored
   * @returns {Object} Object with isActive flag (false when exiting)
   */
  exit() {
    this.discoveryMode = false;
    this.currentDiscoveryLabel = null;
    this.currentDiscoveryType = null;
    this.currentDiscoveryContext = null;

    return {
      isActive: false
    };
  }
}
