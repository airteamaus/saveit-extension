// api.js - API abstraction layer
// Automatically detects standalone mode (testing) vs extension mode (production)
// and uses mock data or real Cloud Function accordingly

// Import Firebase auth for token generation (only in extension mode)
let getFirebaseToken = null;
if (typeof browser !== 'undefined' && browser.storage) {
  // Dynamic import for extension mode only
  import('./firebase-auth.js').then(module => {
    getFirebaseToken = module.getFirebaseToken;
  });
}

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
   * Get the current user's ID (from extension storage or mock)
   */
  async getUserId() {
    if (this.isExtension) {
      try {
        const data = await browser.storage.local.get(['userId']);
        return data.userId || null;
      } catch (error) {
        console.error('Failed to get user ID:', error);
        return null;
      }
    }
    // Standalone mode: use mock user
    return 'mock-user-123';
  },

  /**
   * Get the current user's email (from extension storage or mock)
   */
  async getUserEmail() {
    if (this.isExtension) {
      try {
        const data = await browser.storage.local.get(['userEmail']);
        return data.userEmail || null;
      } catch (error) {
        console.error('Failed to get user email:', error);
        return null;
      }
    }
    // Standalone mode: use mock user
    return 'rich@airteam.com.au';
  },

  /**
   * Get the current user's name (from extension storage or mock)
   */
  async getUserName() {
    if (this.isExtension) {
      try {
        const data = await browser.storage.local.get(['userName']);
        return data.userName || null;
      } catch (error) {
        console.error('Failed to get user name:', error);
        return null;
      }
    }
    // Standalone mode: use mock user
    return 'Rich';
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

      if (!cached) return null;

      const age = Date.now() - cached.timestamp;
      if (age > this.CACHE_MAX_AGE_MS) {
        console.log('Cache expired, fetching fresh data');
        return null;
      }

      console.log(`Using cached data (${Math.round(age / 1000)}s old)`);
      return cached.pages;
    } catch (error) {
      console.error('Failed to read cache:', error);
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
      console.log('Cache invalidated');
    } catch (error) {
      console.error('Failed to invalidate cache:', error);
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
    if (this.isExtension) {
      // Try cache first (unless explicitly skipped)
      if (!options.skipCache) {
        const cached = await this.getCachedPages();
        if (cached) {
          return cached;
        }
      }

      // Production: Call real Cloud Function with GET method
      try {
        // Get Firebase ID token for authentication
        const token = await getFirebaseToken();

        const params = new URLSearchParams({
          // Note: user_id NOT sent - backend extracts from Firebase token
          limit: options.limit || 50,
          offset: options.offset || 0,
          search: options.search || '',
          sort: options.sort || 'newest'
        });

        const response = await fetch(`${CONFIG.cloudFunctionUrl}?${params}`, {
          method: 'GET',
          headers: {
            'Authorization': `Bearer ${token}`
          }
        });

        if (!response.ok) {
          throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }

        const data = await response.json();
        const pages = data.pages || data;

        // Cache the result
        await this.setCachedPages(pages);

        return pages;
      } catch (error) {
        console.error('Failed to fetch saved pages:', error);
        throw error;
      }
    } else {
      // Development: Use mock data
      console.log('📦 Using mock data (standalone mode)');
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
      filtered.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
    } else if (options.sort === 'oldest') {
      filtered.sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
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
        // Get Firebase ID token for authentication
        const token = await getFirebaseToken();

        const params = new URLSearchParams({
          id: id
          // Note: user_id NOT sent - backend extracts from Firebase token
        });

        const response = await fetch(
          `${CONFIG.cloudFunctionUrl}?${params}`,
          {
            method: 'DELETE',
            headers: {
              'Authorization': `Bearer ${token}`
            }
          }
        );

        if (!response.ok) {
          throw new Error(`HTTP ${response.status}: ${response.statusText}`);
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
        // Get Firebase ID token for authentication
        const token = await getFirebaseToken();

        const response = await fetch(
          `${CONFIG.cloudFunctionUrl}/updatePage`,
          {
            method: 'PATCH',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify({
              id,
              // Note: user_id NOT sent - backend extracts from Firebase token
              ...updates
            })
          }
        );

        if (!response.ok) {
          throw new Error(`HTTP ${response.status}: ${response.statusText}`);
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
        // Get Firebase ID token for authentication
        const token = await getFirebaseToken();

        const params = new URLSearchParams({
          label: label
          // Note: user_id NOT sent - backend extracts from Firebase token
        });

        const response = await fetch(`${CONFIG.cloudFunctionUrl}?${params}`, {
          method: 'GET',
          headers: {
            'Authorization': `Bearer ${token}`
          }
        });

        if (!response.ok) {
          throw new Error(`HTTP ${response.status}: ${response.statusText}`);
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
            ...page,
            similarity_score: 1.0,
            matching_label: pageTags.find(t => t.toLowerCase() === lowerLabel)
          });
        } else if (hasSimilarMatch) {
          results.similar_matches.push({
            ...page,
            similarity_score: 0.85,
            matching_label: pageTags.find(t =>
              t.toLowerCase().includes(lowerLabel) || lowerLabel.includes(t.toLowerCase())
            )
          });
        }
      });

      return results;
    }
  }
};
