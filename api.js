// api.js - API abstraction layer
// Automatically detects standalone mode (testing) vs extension mode (production)
// and uses mock data or real Cloud Function accordingly

const API = {
  /**
   * Detect if we're running inside the browser extension or as standalone HTML
   */
  get isExtension() {
    return typeof browser !== 'undefined' && browser.storage;
  },

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
   * Fetch saved pages with optional filters
   * @param {Object} options - Filter options
   * @param {string} options.search - Search query
   * @param {string} options.sort - Sort order ('newest' or 'oldest')
   * @param {number} options.limit - Max results
   * @param {number} options.offset - Pagination offset
   * @returns {Promise<Array>} Array of saved pages
   */
  async getSavedPages(options = {}) {
    if (this.isExtension) {
      // Production: Call real Cloud Function
      try {
        const userId = await this.getUserId();
        if (!userId) {
          console.warn('No user ID found - using default user (click extension icon to authenticate)');
          // Use default user_id instead of returning empty
          const params = new URLSearchParams({
            action: 'getSavedPages',
            user_id: 'mock-user-123',
            limit: options.limit || 50,
            offset: options.offset || 0,
            search: options.search || '',
            sort: options.sort || 'newest'
          });

          const response = await fetch(`${CONFIG.cloudFunctionUrl}?${params}`);

          if (!response.ok) {
            throw new Error(`HTTP ${response.status}: ${response.statusText}`);
          }

          const data = await response.json();
          return data.pages || data;
        }

        const params = new URLSearchParams({
          action: 'getSavedPages',
          user_id: userId,
          limit: options.limit || 50,
          offset: options.offset || 0,
          search: options.search || '',
          sort: options.sort || 'newest'
        });

        const response = await fetch(`${CONFIG.cloudFunctionUrl}?${params}`);

        if (!response.ok) {
          throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }

        const data = await response.json();
        return data.pages || data; // Handle different response formats
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

    // Apply search filter
    if (options.search) {
      const query = options.search.toLowerCase();
      filtered = filtered.filter(item =>
        item.title.toLowerCase().includes(query) ||
        item.url.toLowerCase().includes(query) ||
        (item.description && item.description.toLowerCase().includes(query)) ||
        (item.manual_tags && item.manual_tags.some(tag => tag.toLowerCase().includes(query)))
      );
    }

    // Apply sorting
    if (options.sort === 'newest') {
      filtered.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
    } else if (options.sort === 'oldest') {
      filtered.sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
    }

    // Apply pagination
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
        const userId = await this.getUserId();
        if (!userId) {
          throw new Error('No user ID found');
        }

        const response = await fetch(
          `${CONFIG.cloudFunctionUrl}/deletePage?id=${id}&user_id=${userId}`,
          { method: 'DELETE' }
        );

        if (!response.ok) {
          throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }

        return await response.json();
      } catch (error) {
        console.error('Failed to delete page:', error);
        throw error;
      }
    } else {
      // Mock delete
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
        const userId = await this.getUserId();
        if (!userId) {
          throw new Error('No user ID found');
        }

        const response = await fetch(
          `${CONFIG.cloudFunctionUrl}/updatePage`,
          {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              id,
              user_id: userId,
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
      // Mock update
      console.log('✏️  Mock update:', id, updates);
      const page = MOCK_DATA.find(p => p.id === id);
      if (page) {
        Object.assign(page, updates);
        return page;
      }
      throw new Error('Page not found');
    }
  }
};
