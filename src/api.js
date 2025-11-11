// api.js - API abstraction layer
// Automatically detects standalone mode (testing) vs extension mode (production)
// and uses mock data or real Cloud Function accordingly

/* eslint-disable-next-line no-unused-vars */
const API = {
  /**
   * Detect if we're running inside the browser extension or as standalone HTML
   */
  get isExtension() {
    return typeof browser !== 'undefined' && browser.storage;
  },

  /**
   * Cache configuration
   */
  CACHE_KEY: 'savedPages_cache',
  CACHE_MAX_AGE_MS: 5 * 60 * 1000, // 5 minutes

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
   * Get cached pages from browser storage
   * @private
   */
  async getCachedPages() {
    if (!this.isExtension) return null;

    try {
      const result = await browser.storage.local.get(this.CACHE_KEY);
      const cached = result[this.CACHE_KEY];

      if (!cached) {
        console.log('[getCachedPages] No cache found');
        return null;
      }

      const age = Date.now() - cached.timestamp;
      if (age > this.CACHE_MAX_AGE_MS) {
        console.log('[getCachedPages] Cache expired, fetching fresh data');
        return null;
      }

      console.log(`[getCachedPages] Using cached data (${Math.round(age / 1000)}s old)`, {
        pages_count: cached.pages ? cached.pages.length : 0,
        first_item: cached.pages?.[0] ? { id: cached.pages[0].id, title: cached.pages[0].title } : null
      });
      return cached.pages;
    } catch (error) {
      console.error('[getCachedPages] Failed to read cache:', error);
      return null;
    }
  },

  /**
   * Store pages in browser storage cache
   * @private
   */
  async setCachedPages(pages) {
    if (!this.isExtension) return;

    try {
      await browser.storage.local.set({
        [this.CACHE_KEY]: {
          pages: pages,
          timestamp: Date.now()
        }
      });
      console.log('Cached pages updated');
    } catch (error) {
      console.error('Failed to write cache:', error);
    }
  },

  /**
   * Invalidate the cache (call after delete, update operations)
   */
  async invalidateCache() {
    if (!this.isExtension) return;

    try {
      await browser.storage.local.remove(this.CACHE_KEY);
      console.log('[invalidateCache] Cache invalidated');
    } catch (error) {
      console.error('[invalidateCache] Failed to invalidate cache:', error);
    }
  },

  /**
   * Clear all cached data (for debugging)
   */
  async clearAllCache() {
    if (!this.isExtension) return;

    try {
      await browser.storage.local.clear();
      console.log('[clearAllCache] All cache cleared');
    } catch (error) {
      console.error('[clearAllCache] Failed to clear cache:', error);
    }
  },

  /**
   * Fetch saved pages with optional filters
   * @param {Object} options - Filter options
   * @param {string} options.search - Search query
   * @param {string} options.sort - Sort order ('newest' or 'oldest')
   * @param {number} options.limit - Max results
   * @param {number} options.offset - Pagination offset
   * @param {boolean} options.skipCache - Force fresh fetch, skip cache
   * @returns {Promise<Array>} Array of saved pages
   */
  async getSavedPages(options = {}) {
    console.log('[getSavedPages] START:', {
      isExtension: this.isExtension,
      skipCache: options.skipCache || false
    });

    if (this.isExtension) {
      // Try cache first (unless explicitly skipped)
      if (!options.skipCache) {
        const cached = await this.getCachedPages();
        if (cached) {
          console.log('[getSavedPages] Returning cached data:', {
            count: cached.length
          });
          return cached;
        }
      }

      // Production: Call real Cloud Function with GET method
      try {
        console.log('[getSavedPages] Fetching from Cloud Function...');
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

        console.log('[getSavedPages] HTTP response:', {
          status: response.status,
          statusText: response.statusText,
          ok: response.ok
        });

        if (!response.ok) {
          const errorMessage = await this.parseErrorResponse(response);
          throw new Error(errorMessage);
        }

        const data = await response.json();
        console.log('[getSavedPages] Raw JSON response:', data);

        const pages = data.pages || data;

        console.log('[getSavedPages] Parsed pages:', {
          count: pages.length,
          first_item: pages[0] ? { id: pages[0].id, title: pages[0].title } : null,
          data_structure: {
            has_pages_property: 'pages' in data,
            is_array: Array.isArray(data),
            data_keys: Object.keys(data)
          }
        });

        // Cache the result
        await this.setCachedPages(pages);

        return pages;
      } catch (error) {
        console.error('[getSavedPages] Failed to fetch saved pages:', error);
        throw error;
      }
    } else {
      // Development: Use mock data
      console.log('[getSavedPages] Using mock data (standalone mode)');
      return this.filterMockData(MOCK_DATA, options);
    }
  },

  /**
   * Filter and sort mock data (for standalone testing)
   * @private
   */
  filterMockData(data, options) {
    let filtered = [...data];

    if (options.search) {
      const query = options.search.toLowerCase();
      filtered = filtered.filter(item =>
        item.title.toLowerCase().includes(query) ||
        item.url.toLowerCase().includes(query) ||
        (item.description && item.description.toLowerCase().includes(query)) ||
        (item.manual_tags && item.manual_tags.some(tag => tag.toLowerCase().includes(query)))
      );
    }

    if (options.sort === 'newest') {
      filtered.sort((a, b) => new Date(b.saved_at || b.timestamp) - new Date(a.saved_at || a.timestamp));
    } else if (options.sort === 'oldest') {
      filtered.sort((a, b) => new Date(a.saved_at || a.timestamp) - new Date(b.saved_at || b.timestamp));
    }

    const offset = options.offset || 0;
    const limit = options.limit || 50;
    return filtered.slice(offset, offset + limit);
  },

  /**
   * Delete a saved page
   * @param {string} id - Page ID to delete
   * @returns {Promise<Object>} Result object
   */
  async deletePage(id) {
    if (this.isExtension) {
      try {
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
      } catch (error) {
        console.error('Failed to delete page:', error);
        throw error;
      }
    } else {
      console.log('🗑️  Mock delete:', id);
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
      try {
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
      } catch (error) {
        console.error('Failed to update page:', error);
        throw error;
      }
    } else {
      console.log('✏️  Mock update:', id, updates);
      const page = MOCK_DATA.find(p => p.id === id);
      if (page) {
        Object.assign(page, updates);
        return page;
      }
      throw new Error('Page not found');
    }
  },

  /**
   * Search for things by tag using semantic similarity
   * @param {string} label - Tag label to search for
   * @returns {Promise<Object>} Search results with grouped tiers (exact, similar, related)
   */
  async searchByTag(label) {
    if (this.isExtension) {
      try {
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

        const data = await response.json();
        return data;
      } catch (error) {
        console.error('Failed to search by tag:', error);
        throw error;
      }
    } else {
      // Development: Mock semantic search with simple filtering
      console.log('🔍 Mock semantic search for:', label);
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
        if (page.dewey_primary_label) {
          pageTags.push(page.dewey_primary_label);
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
    }
  }
};
