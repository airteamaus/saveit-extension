// api.js - API abstraction layer
// Automatically detects standalone mode (testing) vs extension mode (production)
// and uses mock data or real Cloud Function accordingly

/* global CacheManager_Export, filterMockData */

/* eslint-disable-next-line no-unused-vars */
const API = {
  /**
   * Initialize cache manager (lazy initialization)
   * @private
   */
  _cacheManager: null,
  get cacheManager() {
    if (!this._cacheManager && this.isExtension) {
      this._cacheManager = new CacheManager_Export(
        () => this.getCurrentUserId(),
        () => this.getStorage()
      );
    }
    return this._cacheManager;
  },

  /**
   * Detect if we're running inside the browser extension or as standalone HTML
   * Checks both browser (Firefox + polyfill) and chrome (Chrome/Brave/Edge)
   */
  get isExtension() {
    // Firefox native or polyfilled browser API
    if (typeof browser !== 'undefined' && browser.storage) {
      return true;
    }
    // Chrome native API (before polyfill loads)
    if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.id) {
      return true;
    }
    return false;
  },


  /**
   * Get current Firebase user ID
   * @private
   */
  getCurrentUserId() {
    if (!this.isExtension || !window.firebaseAuth) {
      return null;
    }
    const user = window.firebaseAuth.currentUser;
    return user ? user.uid : null;
  },

  /**
   * Get browser storage API (works with both browser and chrome APIs)
   * @private
   */
  getStorage() {
    // Prefer browser API (Firefox + polyfill)
    if (typeof browser !== 'undefined' && browser.storage) {
      return browser.storage.local;
    }
    // Fallback to chrome API (Chrome/Brave/Edge before polyfill loads)
    if (typeof chrome !== 'undefined' && chrome.storage) {
      return chrome.storage.local;
    }
    return null;
  },

  /**
   * Parse error response from HTTP fetch
   * Attempts to extract error message from JSON response, falls back to status text
   * @private
   */
  async parseErrorResponse(response) {
    try {
      const data = await response.json();
      return data.error || data.message || `HTTP ${response.status}`;
    } catch {
      return response.statusText || `HTTP ${response.status}`;
    }
  },

  /**
   * Get Firebase ID token for API authorization
   */
  async getIdToken() {
    if (this.isExtension) {
      // Wait for Firebase to be ready
      if (window.firebaseReady) {
        await window.firebaseReady;
      }

      if (!window.firebaseAuth) {
        throw new Error('Firebase not initialized');
      }

      const user = window.firebaseAuth.currentUser;
      if (!user) {
        throw new Error('No user signed in');
      }

      if (!window.firebaseGetIdToken) {
        throw new Error('getIdToken not available');
      }

      return await window.firebaseGetIdToken(user);
    }
    // Standalone mode: no token needed
    return null;
  },


  /**
   * Get cached response from browser storage (delegates to CacheManager)
   * @private
   */
  async getCachedPages() {
    if (!this.isExtension) return null;
    return await this.cacheManager.getCachedPages();
  },

  /**
   * Store response in browser storage cache (delegates to CacheManager)
   * @private
   */
  async setCachedPages(response) {
    if (!this.isExtension) return;
    return await this.cacheManager.setCachedPages(response);
  },

  /**
   * Invalidate the cache (delegates to CacheManager)
   */
  async invalidateCache() {
    if (!this.isExtension) return;
    return await this.cacheManager.invalidateCache();
  },

  /**
   * Execute async operation with consistent error handling
   * @private
   * @param {Function} operation - Async function to execute
   * @param {string} context - Context for error logging (e.g., 'getSavedPages')
   * @param {Object} metadata - Additional context for Sentry
   * @returns {Promise<*>} Operation result
   */
  async _executeWithErrorHandling(operation, context, metadata = {}) {
    try {
      return await operation();
    } catch (error) {
      console.error(`[${context}] Error:`, error);
      window.SentryHelpers?.captureError(error, { context, ...metadata });
      throw error;
    }
  },

  /**
   * Clear all cached data (delegates to CacheManager)
   */
  async clearAllCache() {
    if (!this.isExtension) return;
    return await this.cacheManager.clearAllCache();
  },

  /**
   * Clean up legacy cache (delegates to CacheManager)
   */
  async cleanupLegacyCache() {
    if (!this.isExtension) return;
    return await this.cacheManager.cleanupLegacyCache();
  },

  /**
   * Fetch data from Cloud Function (extension mode only)
   * @private
   * @param {Object} options - Filter options
   * @returns {Promise<Object>} Raw response data from Cloud Function
   */
  async _fetchFromCloudFunction(options) {
    debug('[getSavedPages] Fetching from Cloud Function...');
    const idToken = await this.getIdToken();

    const params = new URLSearchParams({
      limit: options.limit || 50,
      offset: options.offset || 0,
      search: options.search || '',
      sort: options.sort || 'newest'
    });

    const response = await fetch(`${CONFIG.cloudFunctionUrl}?${params}`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${idToken}`
      }
    });

    debug('[getSavedPages] HTTP response:', {
      status: response.status,
      statusText: response.statusText,
      ok: response.ok
    });

    if (!response.ok) {
      const errorMessage = await this.parseErrorResponse(response);
      throw new Error(errorMessage);
    }

    const data = await response.json();
    debug('[getSavedPages] Raw JSON response:', data);
    return data;
  },

  /**
   * Normalize response format (backend should return {pages, pagination})
   * @private
   * @param {Object} data - Raw response data
   * @returns {Object} Normalized response with pages and pagination
   */
  _normalizeResponse(data) {
    const normalizedResponse = {
      pages: data.pages || data,
      pagination: data.pagination || {
        total: (data.pages || data).length,
        hasNextPage: false,
        nextCursor: null
      }
    };

    debug('[getSavedPages] Normalized response:', {
      count: normalizedResponse.pages.length,
      total: normalizedResponse.pagination.total,
      first_item: normalizedResponse.pages[0] ? { id: normalizedResponse.pages[0].id, title: normalizedResponse.pages[0].title } : null
    });

    return normalizedResponse;
  },

  /**
   * Get mock data for standalone mode
   * @private
   * @param {Object} options - Filter options
   * @returns {Object} Normalized response with mock pages and pagination
   */
  _getMockData(options) {
    debug('[getSavedPages] Using mock data (standalone mode)');
    const filteredPages = filterMockData(MOCK_DATA, options);

    return {
      pages: filteredPages,
      pagination: {
        total: MOCK_DATA.length,
        hasNextPage: (options.offset || 0) + filteredPages.length < MOCK_DATA.length,
        nextCursor: null
      }
    };
  },

  /**
   * Fetch saved pages with optional filters
   * @param {Object} options - Filter options
   * @param {string} options.search - Search query
   * @param {string} options.sort - Sort order ('newest' or 'oldest')
   * @param {number} options.limit - Max results
   * @param {number} options.offset - Pagination offset
   * @param {boolean} options.skipCache - Force fresh fetch, skip cache
   * @returns {Promise<Object>} Response object with pages and pagination metadata
   */
  async getSavedPages(options = {}) {
    debug('[getSavedPages] START:', {
      isExtension: this.isExtension,
      skipCache: options.skipCache || false
    });

    if (this.isExtension) {
      // Try cache first (unless explicitly skipped)
      if (!options.skipCache) {
        const cached = await this.getCachedPages();
        if (cached) {
          debug('[getSavedPages] Returning cached data:', {
            count: cached.pages?.length,
            total: cached.pagination?.total
          });
          return cached;
        }
      }

      // Fetch fresh data from Cloud Function
      return this._executeWithErrorHandling(
        async () => {
          const data = await this._fetchFromCloudFunction(options);
          const normalized = this._normalizeResponse(data);

          // Cache and return
          await this.setCachedPages(normalized);
          return normalized;
        },
        'getSavedPages',
        { options }
      );
    } else {
      // Standalone mode: use mock data
      return this._getMockData(options);
    }
  },

  /**
   * Delete a saved page
   * @param {string} id - Page ID to delete
   * @returns {Promise<Object>} Result object
   */
  async deletePage(id) {
    if (this.isExtension) {
      return this._executeWithErrorHandling(
        async () => {
          const idToken = await this.getIdToken();

          const params = new URLSearchParams({ id });

          const response = await fetch(
            `${CONFIG.cloudFunctionUrl}?${params}`,
            {
              method: 'DELETE',
              headers: {
                'Authorization': `Bearer ${idToken}`
              }
            }
          );

          if (!response.ok) {
            const errorMessage = await this.parseErrorResponse(response);
            throw new Error(errorMessage);
          }

          // Invalidate cache after successful delete
          await this.invalidateCache();

          return await response.json();
        },
        'deletePage',
        { id }
      );
    } else {
      debug('Mock delete:', id);
      const index = MOCK_DATA.findIndex(p => p.id === id);
      if (index !== -1) {
        MOCK_DATA.splice(index, 1);
      }
      return { success: true };
    }
  },

  /**
   * Update a saved page (notes, tags, etc.)
   * @param {string} id - Page ID
   * @param {Object} updates - Fields to update
   * @returns {Promise<Object>} Updated page
   */
  async updatePage(id, updates) {
    if (this.isExtension) {
      return this._executeWithErrorHandling(
        async () => {
          const idToken = await this.getIdToken();

          const response = await fetch(
            `${CONFIG.cloudFunctionUrl}/updatePage`,
            {
              method: 'PATCH',
              headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${idToken}`
              },
              body: JSON.stringify({
                id,
                ...updates
              })
            }
          );

          if (!response.ok) {
            const errorMessage = await this.parseErrorResponse(response);
            throw new Error(errorMessage);
          }

          return await response.json();
        },
        'updatePage',
        { id, updates }
      );
    } else {
      debug('Mock update:', id, updates);
      const page = MOCK_DATA.find(p => p.id === id);
      if (page) {
        Object.assign(page, updates);
        return page;
      }
      throw new Error('Page not found');
    }
  },

  /**
   * Fetch tag search from Cloud Function (extension mode only)
   * @private
   * @param {string} label - Tag label to search for
   * @returns {Promise<Object>} Tag search results from Cloud Function
   */
  async _fetchTagSearchFromCloudFunction(label) {
    const idToken = await this.getIdToken();

    const params = new URLSearchParams({ label });

    const response = await fetch(`${CONFIG.cloudFunctionUrl}?${params}`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${idToken}`
      }
    });

    if (!response.ok) {
      const errorMessage = await this.parseErrorResponse(response);
      throw new Error(errorMessage);
    }

    return await response.json();
  },

  /**
   * Mock semantic tag search for standalone mode
   * @private
   * @param {string} label - Tag label to search for
   * @returns {Object} Mock results with exact_matches, similar_matches, related_matches
   */
  _mockSemanticTagSearch(label) {
    debug('Mock semantic search for:', label);
    const results = {
      query_label: label,
      exact_matches: [],
      similar_matches: [],
      related_matches: []
    };

    // Simple mock: find pages with matching or similar tags
    MOCK_DATA.forEach(page => {
      const pageTags = [];
      if (page.classifications) {
        pageTags.push(...page.classifications.map(c => c.label));
      }
      if (page.primary_classification_label) {
        pageTags.push(page.primary_classification_label);
      }
      if (page.manual_tags) {
        pageTags.push(...page.manual_tags);
      }

      // Check for exact or similar matches
      const lowerLabel = label.toLowerCase();
      const hasExactMatch = pageTags.some(tag => tag.toLowerCase() === lowerLabel);
      const hasSimilarMatch = pageTags.some(tag =>
        tag.toLowerCase().includes(lowerLabel) || lowerLabel.includes(tag.toLowerCase())
      );

      if (hasExactMatch) {
        results.exact_matches.push({
          thing_data: page,
          similarity: 1.0,
          matched_label: pageTags.find(t => t.toLowerCase() === lowerLabel)
        });
      } else if (hasSimilarMatch) {
        results.similar_matches.push({
          thing_data: page,
          similarity: 0.85,
          matched_label: pageTags.find(t =>
            t.toLowerCase().includes(lowerLabel) || lowerLabel.includes(t.toLowerCase())
          )
        });
      }
    });

    return results;
  },

  /**
   * Search for things by tag using semantic similarity
   * @param {string} label - Tag label to search for
   * @returns {Promise<Object>} Search results with grouped tiers (exact, similar, related)
   */
  async searchByTag(label) {
    if (this.isExtension) {
      return this._executeWithErrorHandling(
        async () => this._fetchTagSearchFromCloudFunction(label),
        'searchByTag',
        { label }
      );
    } else {
      return this._mockSemanticTagSearch(label);
    }
  },

  /**
   * Fetch similar things from Cloud Function using pregenerated embeddings
   * @private
   * @param {string} thingId - Source thing ID
   * @param {number} limit - Max results
   * @param {number} offset - Pagination offset
   * @returns {Promise<Object>} Similar things results
   */
  async _fetchSimilarFromCloudFunction(thingId, limit, offset) {
    const idToken = await this.getIdToken();

    const params = new URLSearchParams({
      thing_id: thingId,
      limit: limit.toString(),
      offset: offset.toString()
    });

    // Note: thing_id in query params triggers the similar things handler (not /similar path)
    const response = await fetch(`${CONFIG.cloudFunctionUrl}?${params}`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${idToken}`
      }
    });

    if (!response.ok) {
      const errorMessage = await this.parseErrorResponse(response);
      throw new Error(errorMessage);
    }

    return await response.json();
  },

  /**
   * Mock similar things search for standalone mode
   * @private
   * @param {string} thingId - Source thing ID
   * @param {number} limit - Max results
   * @param {number} offset - Pagination offset
   * @returns {Object} Mock results with similar structure to backend
   */
  _mockGetSimilarByThingId(thingId, limit, offset) {
    debug('Mock similar search for thing:', thingId);

    // Find the source thing
    const sourceThing = MOCK_DATA.find(p => p.id === thingId);
    if (!sourceThing) {
      return {
        results: [],
        pagination: { limit, offset, total: 0, has_more: false },
        source: { thing_id: thingId, label: null }
      };
    }

    // Get source thing's tags for matching
    const sourceTags = [];
    if (sourceThing.classifications) {
      sourceTags.push(...sourceThing.classifications.map(c => c.label.toLowerCase()));
    }
    if (sourceThing.primary_classification_label) {
      sourceTags.push(sourceThing.primary_classification_label.toLowerCase());
    }

    // Find similar things (those with matching tags)
    const similar = MOCK_DATA
      .filter(p => p.id !== thingId)
      .map(page => {
        const pageTags = [];
        if (page.classifications) {
          pageTags.push(...page.classifications.map(c => c.label.toLowerCase()));
        }
        if (page.primary_classification_label) {
          pageTags.push(page.primary_classification_label.toLowerCase());
        }

        // Calculate simple similarity based on tag overlap
        const overlap = sourceTags.filter(t => pageTags.includes(t)).length;
        const similarity = sourceTags.length > 0 ? overlap / sourceTags.length : 0;

        return { page, similarity };
      })
      .filter(item => item.similarity > 0)
      .sort((a, b) => b.similarity - a.similarity);

    // Apply pagination
    const paginatedResults = similar.slice(offset, offset + limit);

    return {
      results: paginatedResults.map(item => ({
        thing_id: item.page.id,
        similarity: item.similarity,
        thing_data: item.page
      })),
      pagination: {
        limit,
        offset,
        total: similar.length,
        has_more: offset + limit < similar.length
      },
      source: {
        thing_id: thingId,
        label: sourceThing.primary_classification_label || null
      }
    };
  },

  /**
   * Get similar things by thing ID using pregenerated embeddings
   * @param {string} thingId - Source thing ID to find similar items for
   * @param {number} [limit=50] - Max results to return
   * @param {number} [offset=0] - Pagination offset
   * @returns {Promise<Object>} Results with pagination metadata
   */
  async getSimilarByThingId(thingId, limit = 50, offset = 0) {
    if (this.isExtension) {
      return this._executeWithErrorHandling(
        async () => this._fetchSimilarFromCloudFunction(thingId, limit, offset),
        'getSimilarByThingId',
        { thingId, limit, offset }
      );
    } else {
      return this._mockGetSimilarByThingId(thingId, limit, offset);
    }
  },

  /**
   * Fetch graph data from Cloud Function
   * @private
   * @returns {Promise<Object>} Graph data with nodes and edges
   */
  async _fetchGraphFromCloudFunction() {
    const idToken = await this.getIdToken();

    const params = new URLSearchParams({ graph: 'true' });

    const response = await fetch(`${CONFIG.cloudFunctionUrl}?${params}`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${idToken}`
      }
    });

    if (!response.ok) {
      const errorMessage = await this.parseErrorResponse(response);
      throw new Error(errorMessage);
    }

    return await response.json();
  },

  /**
   * Get graph data for knowledge graph visualization
   * Returns nodes (generals, domains, topics) and edges (relationships)
   * @returns {Promise<Object>} Graph data { nodes: [], edges: [] }
   */
  async getGraphData() {
    if (this.isExtension) {
      return this._executeWithErrorHandling(
        async () => this._fetchGraphFromCloudFunction(),
        'getGraphData'
      );
    } else {
      // Mock data returned by graph.js getMockGraphData()
      throw new Error('Use getMockGraphData() in standalone mode');
    }
  }
};
