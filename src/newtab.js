// newtab.js - Main dashboard logic
// Handles page loading, filtering, and user interactions
//
// Security Note: This file uses innerHTML for rendering UI components.
// All user-provided data is sanitized via Components.escapeHtml() which uses
// textContent to prevent XSS attacks. See components.js:204 for implementation.

/**
 * Get browser runtime API (works with both Firefox and Chrome/Brave/Edge)
 * @returns {Object|null} browser.runtime or chrome.runtime
 */
function getBrowserRuntime() {
  if (typeof browser !== 'undefined' && browser.runtime) {
    return browser.runtime;
  }
  if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.id) {
    return chrome.runtime;
  }
  return null;
}

class SaveItDashboard {
  constructor() {
    this.pages = [];
    this.allPages = []; // Keep unfiltered copy for client-side filtering
    this.currentFilter = {
      search: '',
      sort: 'newest',
      category: '',
      offset: 0,
      limit: 50 // Pages per batch for infinite scroll
    };
    this.debounceTimer = null;
    this.discoveryMode = false; // Track if we're in discovery view
    this.currentDiscoveryLabel = null; // Store current discovery query
    this.currentDiscoveryType = null; // Store classification type (general/domain/topic)
    this.currentDiscoveryContext = null; // Store parent context for breadcrumbs

    // Hierarchical tag selection state
    this.selectedL1 = null; // Currently selected L1 (general) tag
    this.selectedL2 = null; // Currently selected L2 (domain) tag
    this.selectedL3 = null; // Currently selected L3 (topic) tag

    // Similarity search configuration
    this.similarityThreshold = 0.5; // Filter out results below this threshold

    // Infinite scroll state
    this.isLoadingMore = false;
    this.hasMorePages = true;
    this.nextCursor = null;
    this.scrollObserver = null;
  }

  /**
   * Initialize the dashboard
   */
  async init() {
    this.initTheme();
    this.showLoading();
    this.updateModeIndicator();
    this.updateVersionIndicator();

    // Clean up legacy cache (migration for v0.13.5+)
    await API.cleanupLegacyCache();

    // Wait for Firebase to be ready in extension mode
    let initialAuthResolved = false;
    if (API.isExtension && window.firebaseReady) {
      await window.firebaseReady;

      if (window.firebaseAuth && window.firebaseOnAuthStateChanged) {
        // Wait for initial auth state before loading pages
        await new Promise((resolve) => {
          window.firebaseOnAuthStateChanged(window.firebaseAuth, async (user) => {
            this.updateSignInButton(user ? {
              email: user.email,
              name: user.displayName
            } : null);

            // First time: resolve to continue init
            if (!initialAuthResolved) {
              initialAuthResolved = true;
              resolve();
            } else {
              // Subsequent auth changes: clear cache and reload
              // IMPORTANT: Clear cache to prevent showing previous user's data
              console.log('[auth state changed] Clearing cache for user switch');
              await API.invalidateCache();

              if (user) {
                await this.loadPages();
                this.render();
              } else {
                this.showSignInPrompt();
              }
            }
          });
        });
      }
    }

    await this.loadPages();
    this.setupEventListeners();
    this.render();
    this.refreshInBackground();
  }

  /**
   * Get current Firebase user
   */
  getCurrentUser() {
    if (!API.isExtension || !window.firebaseAuth) return null;

    const user = window.firebaseAuth.currentUser;
    if (!user) return null;

    return {
      email: user.email,
      name: user.displayName
    };
  }

  initTheme() {
    const savedTheme = localStorage.getItem('theme-preference') || 'auto';
    this.applyTheme(savedTheme);
    this.updateThemeButtons(savedTheme);
  }

  applyTheme(theme) {
    const html = document.documentElement;
    if (theme === 'auto') {
      html.removeAttribute('data-theme');
    } else {
      html.setAttribute('data-theme', theme);
    }
  }

  updateThemeButtons(activeTheme) {
    document.querySelectorAll('.theme-option').forEach(btn => {
      if (btn.dataset.theme === activeTheme) {
        btn.classList.add('active');
        btn.setAttribute('aria-checked', 'true');
      } else {
        btn.classList.remove('active');
        btn.setAttribute('aria-checked', 'false');
      }
    });
  }

  /**
   * Update mode indicator in footer
   */
  updateModeIndicator() {
    const modeLabel = document.getElementById('mode-label');
    if (API.isExtension) {
      modeLabel.textContent = 'Extension Mode';
      modeLabel.style.color = '#10b981';
    } else {
      modeLabel.textContent = 'Development Mode (using mock data)';
      modeLabel.style.color = '#f59e0b';
    }
  }

  /**
   * Update version indicator in footer
   * Only shows version in extension mode where manifest is available
   */
  updateVersionIndicator() {
    const versionNumber = document.getElementById('version-number');
    const buildDate = document.getElementById('build-date');

    if (versionNumber && typeof browser !== 'undefined' && browser.runtime) {
      const runtime = getBrowserRuntime();
      const manifest = runtime?.getManifest();
      versionNumber.textContent = manifest.version;

      // Show build date if available (added during release process)
      if (buildDate && manifest.build_date) {
        const date = new Date(manifest.build_date);
        buildDate.textContent = `(${date.toLocaleDateString()})`;
      }
    }
  }

  showLoading() {
    const content = document.getElementById('content');
    content.innerHTML = Components.loadingState();
  }

  showError(error) {
    const content = document.getElementById('content');
    content.innerHTML = Components.errorState(error);
  }

  /**
   * Load pages from API
   */
  async loadPages() {
    try {
      const response = await API.getSavedPages(this.currentFilter);

      // Handle response structure (pages array or object with pagination)
      if (Array.isArray(response)) {
        this.allPages = response;
        this.hasMorePages = response.length >= this.currentFilter.limit;
      } else {
        this.allPages = response.pages || [];
        this.hasMorePages = response.pagination?.hasNextPage || false;
        this.nextCursor = response.pagination?.nextCursor || null;
      }

      // Initially show all pages (no tag selected)
      this.pages = [...this.allPages];
    } catch (error) {
      console.error('Failed to load pages:', error);

      // Check if error is authentication-related
      const isAuthError = error.message && (
        error.message.includes('401') ||
        error.message.includes('Unauthorized') ||
        error.message.includes('Authentication failed') ||
        error.message.includes('Sign-in failed')
      );

      if (isAuthError) {
        this.showSignInPrompt();
      } else {
        this.showError(error);
      }
    }
  }

  /**
   * Refresh data in background (after showing cached data)
   */
  async refreshInBackground() {
    if (!API.isExtension) return;

    try {
      // Wait a bit to avoid competing with initial render
      await new Promise(resolve => setTimeout(resolve, 500));

      const freshPages = await API.getSavedPages({
        ...this.currentFilter,
        skipCache: true
      });

      // Only update if data changed
      if (JSON.stringify(freshPages) !== JSON.stringify(this.allPages)) {
        this.allPages = freshPages;
        // If a tag is selected, re-run similarity search to update results
        const activeLabel = this.selectedL3 || this.selectedL2 || this.selectedL1;
        if (activeLabel) {
          // Re-trigger tag click to refresh similarity results with new data
          const activeType = this.selectedL3 ? 'topic' : (this.selectedL2 ? 'domain' : 'general');
          await this.handleTagClick(activeType, activeLabel);
        } else {
          // No tag selected - show all pages
          this.pages = [...this.allPages];
          this.render();
        }
      }
    } catch (error) {
      console.error('Background refresh failed:', error);
      // Don't show error to user - they already have cached data
    }
  }

  /**
   * Apply client-side search filter
   */
  applyClientFilters() {
    let filtered = [...this.allPages];

    // Apply search filter across all content and metadata fields
    if (this.currentFilter.search) {
      const query = this.currentFilter.search.toLowerCase();
      filtered = filtered.filter(page => {
        // Core content fields
        if (page.title && page.title.toLowerCase().includes(query)) return true;
        if (page.url && page.url.toLowerCase().includes(query)) return true;
        if (page.description && page.description.toLowerCase().includes(query)) return true;
        if (page.user_notes && page.user_notes.toLowerCase().includes(query)) return true;

        // AI-generated fields
        if (page.ai_summary_brief && page.ai_summary_brief.toLowerCase().includes(query)) return true;
        if (page.ai_summary_extended && page.ai_summary_extended.toLowerCase().includes(query)) return true;
        if (page.primary_classification_label && page.primary_classification_label.toLowerCase().includes(query)) return true;

        // Tags (both manual and AI)
        if (page.manual_tags && page.manual_tags.some(tag => tag.toLowerCase().includes(query))) return true;

        // Metadata fields
        if (page.domain && page.domain.toLowerCase().includes(query)) return true;
        if (page.author && page.author.toLowerCase().includes(query)) return true;

        return false;
      });
    }

    this.pages = filtered;
  }

  /**
   * Update stats display
   */
  updateStats() {
    const statsEl = document.getElementById('stats');
    const total = this.allPages.length;
    const filtered = this.pages.length;

    if (filtered < total) {
      statsEl.textContent = `Showing ${filtered} of ${total} pages`;
    } else {
      statsEl.textContent = `${total} ${total === 1 ? 'page' : 'pages'} saved`;
    }
  }

  /**
   * Extract unique general-level tags from all pages
   * @returns {Array<{type: string, label: string}>}
   */
  extractGeneralTags() {
    const tagMap = new Map();

    this.allPages.forEach(page => {
      if (page.classifications && page.classifications.length > 0) {
        page.classifications.forEach(c => {
          if (c.type === 'general' && c.label) {
            tagMap.set(c.label, { type: 'general', label: c.label });
          }
        });
      }
    });

    return Array.from(tagMap.values()).sort((a, b) => a.label.localeCompare(b.label));
  }

  /**
   * Extract L2 (domain) tags for a given L1 (general) tag
   * @param {string} l1Label - The L1 tag label
   * @returns {Array<{type: string, label: string}>}
   */
  extractL2TagsForL1(l1Label) {
    const tagMap = new Map();

    this.allPages.forEach(page => {
      if (page.classifications && page.classifications.length > 0) {
        const pageGeneral = page.classifications.find(c => c.type === 'general');
        if (pageGeneral && pageGeneral.label === l1Label) {
          const domainTags = page.classifications.filter(c => c.type === 'domain');
          domainTags.forEach(tag => {
            tagMap.set(tag.label, { type: 'domain', label: tag.label });
          });
        }
      }
    });

    return Array.from(tagMap.values()).sort((a, b) => a.label.localeCompare(b.label));
  }

  /**
   * Extract L3 (topic) tags for a given L2 (domain) tag
   * @param {string} l2Label - The L2 tag label
   * @returns {Array<{type: string, label: string}>}
   */
  extractL3TagsForL2(l2Label) {
    const tagMap = new Map();

    this.allPages.forEach(page => {
      if (page.classifications && page.classifications.length > 0) {
        const pageDomain = page.classifications.find(c => c.type === 'domain');
        if (pageDomain && pageDomain.label === l2Label) {
          const topicTags = page.classifications.filter(c => c.type === 'topic');
          topicTags.forEach(tag => {
            tagMap.set(tag.label, { type: 'topic', label: tag.label });
          });
        }
      }
    });

    return Array.from(tagMap.values()).sort((a, b) => a.label.localeCompare(b.label));
  }

  /**
   * Extract all domain tags (L2) across all pages
   * @returns {Array<{type: string, label: string}>}
   */
  extractDomainTags() {
    const tagMap = new Map();

    this.allPages.forEach(page => {
      if (page.classifications && page.classifications.length > 0) {
        const domainTags = page.classifications.filter(c => c.type === 'domain');
        domainTags.forEach(tag => {
          tagMap.set(tag.label, { type: 'domain', label: tag.label });
        });
      }
    });

    return Array.from(tagMap.values()).sort((a, b) => a.label.localeCompare(b.label));
  }

  /**
   * Extract all topic tags (L3) across all pages
   * @returns {Array<{type: string, label: string}>}
   */
  extractTopicTags() {
    const tagMap = new Map();

    this.allPages.forEach(page => {
      if (page.classifications && page.classifications.length > 0) {
        const topicTags = page.classifications.filter(c => c.type === 'topic');
        topicTags.forEach(tag => {
          tagMap.set(tag.label, { type: 'topic', label: tag.label });
        });
      }
    });

    return Array.from(tagMap.values()).sort((a, b) => a.label.localeCompare(b.label));
  }

  /**
   * Extract topic tags (L3) for a given L1 (general) tag
   * Shows all topics under the selected general category
   * @param {string} l1Label - The L1 tag label
   * @returns {Array<{type: string, label: string}>}
   */
  extractTopicTagsForL1(l1Label) {
    const tagMap = new Map();

    this.allPages.forEach(page => {
      if (page.classifications && page.classifications.length > 0) {
        const pageGeneral = page.classifications.find(c => c.type === 'general');
        if (pageGeneral && pageGeneral.label === l1Label) {
          const topicTags = page.classifications.filter(c => c.type === 'topic');
          topicTags.forEach(tag => {
            tagMap.set(tag.label, { type: 'topic', label: tag.label });
          });
        }
      }
    });

    return Array.from(tagMap.values()).sort((a, b) => a.label.localeCompare(b.label));
  }

  /**
   * Extract sibling tags based on current discovery context
   * Uses allPages to ensure we search across all data, not just filtered results
   * @param {string} currentType - Current classification type (general/domain/topic)
   * @param {string} currentLabel - Current tag label
   * @returns {Array<{type: string, label: string}>}
   */
  extractSiblingTags(currentType, currentLabel) {
    const tagMap = new Map();
    const searchPages = this.allPages.length > 0 ? this.allPages : this.pages;

    if (currentType === 'general') {
      // For general level, show all domain tags within this general category
      searchPages.forEach(page => {
        if (page.classifications) {
          const pageGeneral = page.classifications.find(c => c.type === 'general');
          if (pageGeneral && pageGeneral.label === currentLabel) {
            const domainTags = page.classifications.filter(c => c.type === 'domain');
            domainTags.forEach(tag => {
              tagMap.set(tag.label, { type: 'domain', label: tag.label });
            });
          }
        }
      });
    } else if (currentType === 'domain') {
      // Find the general parent of this domain
      let generalParent = null;
      for (const page of searchPages) {
        if (page.classifications) {
          const domainTag = page.classifications.find(c => c.type === 'domain' && c.label === currentLabel);
          if (domainTag) {
            generalParent = page.classifications.find(c => c.type === 'general');
            break;
          }
        }
      }

      // Extract all domain tags that share the same general parent
      if (generalParent) {
        searchPages.forEach(page => {
          if (page.classifications) {
            const pageGeneral = page.classifications.find(c => c.type === 'general');
            if (pageGeneral && pageGeneral.label === generalParent.label) {
              const domainTags = page.classifications.filter(c => c.type === 'domain');
              domainTags.forEach(tag => {
                if (tag.label !== currentLabel) { // Exclude current tag
                  tagMap.set(tag.label, { type: 'domain', label: tag.label });
                }
              });
            }
          }
        });
      }
    } else if (currentType === 'topic') {
      // Find the domain parent of this topic
      let domainParent = null;
      for (const page of searchPages) {
        if (page.classifications) {
          const topicTag = page.classifications.find(c => c.type === 'topic' && c.label === currentLabel);
          if (topicTag) {
            domainParent = page.classifications.find(c => c.type === 'domain');
            break;
          }
        }
      }

      // Extract all topic tags that share the same domain parent
      if (domainParent) {
        searchPages.forEach(page => {
          if (page.classifications) {
            const pageDomain = page.classifications.find(c => c.type === 'domain');
            if (pageDomain && pageDomain.label === domainParent.label) {
              const topicTags = page.classifications.filter(c => c.type === 'topic');
              topicTags.forEach(tag => {
                if (tag.label !== currentLabel) { // Exclude current tag
                  tagMap.set(tag.label, { type: 'topic', label: tag.label });
                }
              });
            }
          }
        });
      }
    }

    return Array.from(tagMap.values()).sort((a, b) => a.label.localeCompare(b.label));
  }

  /**
   * Build breadcrumb context for a given classification
   * Uses allPages to ensure we search across all data
   * @param {string} type - Classification type (general/domain/topic)
   * @param {string} label - Classification label
   * @returns {Object|null} Context object with hierarchy info
   */
  buildBreadcrumbContext(type, label) {
    const searchPages = this.allPages.length > 0 ? this.allPages : this.pages;

    // Find a page that has this classification
    for (const page of searchPages) {
      if (!page.classifications) continue;

      const targetTag = page.classifications.find(c => c.type === type && c.label === label);
      if (!targetTag) continue;

      if (type === 'general') {
        return {
          type: 'general',
          label: label
        };
      } else if (type === 'domain') {
        const generalTag = page.classifications.find(c => c.type === 'general');
        return {
          type: 'domain',
          label: label,
          parentLabel: generalTag ? generalTag.label : null
        };
      } else if (type === 'topic') {
        const domainTag = page.classifications.find(c => c.type === 'domain');
        const generalTag = page.classifications.find(c => c.type === 'general');
        return {
          type: 'topic',
          label: label,
          parentLabel: domainTag ? domainTag.label : null,
          grandparentLabel: generalTag ? generalTag.label : null
        };
      }
    }

    return null;
  }

  /**
   * Render tag bar with hierarchical selection
   */
  renderTagBar() {
    const tagBarContainer = document.getElementById('tag-bar');
    if (!tagBarContainer) {
      console.warn('Tag bar container not found');
      return;
    }

    console.log('[renderTagBar] Selection state:', { L1: this.selectedL1, L2: this.selectedL2, L3: this.selectedL3 });

    // Always show L1 tags
    const l1Tags = this.extractGeneralTags();

    // Build L1 row HTML
    const l1Html = l1Tags.map(tag => {
      const isActive = this.selectedL1 === tag.label;
      const activeClass = isActive ? 'active' : '';
      return `<button class="tag ai-tag tag-general ${activeClass}" data-type="general" data-label="${Components.escapeHtml(tag.label)}">${Components.escapeHtml(tag.label)}</button>`;
    }).join('');

    let l2Html = '';
    let l3Html = '';

    // Only show L2 tags if L1 is selected
    if (this.selectedL1) {
      const l2Tags = this.extractL2TagsForL1(this.selectedL1);

      if (l2Tags.length > 0) {
        l2Html = l2Tags.map(tag => {
          const isActive = this.selectedL2 === tag.label;
          const activeClass = isActive ? 'active' : '';
          return `<button class="tag ai-tag tag-domain ${activeClass}" data-type="domain" data-label="${Components.escapeHtml(tag.label)}">${Components.escapeHtml(tag.label)}</button>`;
        }).join('');
      }
    }

    // Only show L3 tags if L2 is selected
    if (this.selectedL2) {
      const l3Tags = this.extractL3TagsForL2(this.selectedL2);

      if (l3Tags.length > 0) {
        l3Html = l3Tags.map(tag => {
          const isActive = this.selectedL3 === tag.label;
          const activeClass = isActive ? 'active' : '';
          return `<button class="tag ai-tag tag-topic ${activeClass}" data-type="topic" data-label="${Components.escapeHtml(tag.label)}">${Components.escapeHtml(tag.label)}</button>`;
        }).join('');
      }
    }

    // Build complete tag bar HTML
    tagBarContainer.innerHTML = `
      <div class="tag-bar-tags">${l1Html}</div>
      ${l2Html ? `<div class="tag-bar-tags tag-bar-l2">${l2Html}</div>` : ''}
      ${l3Html ? `<div class="tag-bar-tags tag-bar-l3">${l3Html}</div>` : ''}
    `;

    // Add click handlers for all tags
    tagBarContainer.querySelectorAll('.tag.ai-tag').forEach(tagElement => {
      tagElement.addEventListener('click', (e) => {
        e.stopPropagation();
        const label = tagElement.dataset.label;
        const type = tagElement.dataset.type;
        if (label && type) {
          this.handleTagClick(type, label);
        }
      });
    });
  }

  /**
   * Handle tag click in hierarchical selection mode
   * Uses async similarity search to find related pages
   * @param {string} type - Classification type (general/domain/topic)
   * @param {string} label - Tag label
   */
  async handleTagClick(type, label) {
    // Update selection state
    if (type === 'general') {
      // Toggle L1 selection, clear deeper levels
      this.selectedL1 = (this.selectedL1 === label) ? null : label;
      this.selectedL2 = null;
      this.selectedL3 = null;
    } else if (type === 'domain') {
      // Toggle L2 selection, clear L3
      this.selectedL2 = (this.selectedL2 === label) ? null : label;
      this.selectedL3 = null;
    } else if (type === 'topic') {
      // Toggle L3 selection
      this.selectedL3 = (this.selectedL3 === label) ? null : label;
    }

    // Determine which tag to search by (deepest selected level)
    const activeLabel = this.selectedL3 || this.selectedL2 || this.selectedL1;

    if (!activeLabel) {
      // No tag selected - show all pages, sorted by newest
      this.pages = [...this.allPages];
      this.updateStats();
      this.render();
      return;
    }

    // Show loading state
    this.showLoading();

    try {
      console.log('[handleTagClick] Searching for:', activeLabel, 'threshold:', this.similarityThreshold);

      // Call backend similarity search
      const results = await API.searchByTag(activeLabel, this.similarityThreshold);

      console.log('[handleTagClick] Got results:', {
        exact: results.exact_matches?.length || 0,
        similar: results.similar_matches?.length || 0,
        related: results.related_matches?.length || 0
      });

      // Extract and score pages
      this.pages = this.extractSimilarityResults(results);

      // Apply search filter if active
      if (this.currentFilter.search) {
        this.applySearchFilter();
      }

      this.updateStats();
      this.render();
    } catch (error) {
      console.error('Similarity search failed:', error);
      // Show error to user - NO fallback
      this.showError(error);
    }
  }

  /**
   * Extract pages from similarity search results
   * Maps thing_id to full page objects and preserves similarity scores
   * @param {Object} results - Results from API.searchByTag()
   * @returns {Array} Array of page objects with _similarity scores
   */
  extractSimilarityResults(results) {
    const pages = [];

    // Combine all tiers (already sorted by similarity in backend)
    const allMatches = [
      ...(results.exact_matches || []),
      ...(results.similar_matches || []),
      ...(results.related_matches || [])
    ];

    console.log('[extractSimilarityResults] Processing', allMatches.length, 'matches');

    // Map thing_id to page from allPages and preserve similarity score
    for (const match of allMatches) {
      // Backend may return thing_data embedded, or just thing_id
      let page;
      if (match.thing_data) {
        page = match.thing_data;
      } else {
        page = this.allPages.find(p => p.id === match.thing_id);
      }

      if (page) {
        // Attach similarity score for potential display
        page._similarity = match.similarity;
        page._matched_label = match.matched_label;
        pages.push(page);
      }
    }

    console.log('[extractSimilarityResults] Extracted', pages.length, 'pages');
    return pages;
  }

  /**
   * Apply text search filter on already-filtered pages
   * Searches across multiple content and metadata fields
   */
  applySearchFilter() {
    const query = this.currentFilter.search.toLowerCase();
    console.log('[applySearchFilter] Filtering with query:', query);

    this.pages = this.pages.filter(page => {
      if (page.title && page.title.toLowerCase().includes(query)) return true;
      if (page.url && page.url.toLowerCase().includes(query)) return true;
      if (page.description && page.description.toLowerCase().includes(query)) return true;
      if (page.user_notes && page.user_notes.toLowerCase().includes(query)) return true;
      if (page.ai_summary_brief && page.ai_summary_brief.toLowerCase().includes(query)) return true;
      if (page.ai_summary_extended && page.ai_summary_extended.toLowerCase().includes(query)) return true;
      if (page.primary_classification_label && page.primary_classification_label.toLowerCase().includes(query)) return true;
      if (page.manual_tags && page.manual_tags.some(tag => tag.toLowerCase().includes(query))) return true;
      if (page.domain && page.domain.toLowerCase().includes(query)) return true;
      if (page.author && page.author.toLowerCase().includes(query)) return true;
      return false;
    });

    console.log('[applySearchFilter] Filtered to', this.pages.length, 'pages');
  }

  /**
   * Render pages to DOM
   */
  render() {
    // Render tag bar first
    this.renderTagBar();

    const container = document.getElementById('content');

    // Preserve scroll sentinel before ANY innerHTML modifications
    const sentinel = document.getElementById('scroll-sentinel');

    if (this.pages.length === 0) {
      if (this.currentFilter.search) {
        container.innerHTML = `
          <div class="empty-state">
            <svg class="empty-icon" width="80" height="80" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
              <circle cx="11" cy="11" r="8"></circle>
              <path d="m21 21-4.35-4.35"></path>
            </svg>
            <h2>No matching pages</h2>
            <p>Try adjusting your search</p>
          </div>
        `;
      } else {
        // Check if user is authenticated before showing empty state
        if (API.isExtension) {
          const user = this.getCurrentUser();

          if (user) {
            container.innerHTML = Components.emptyState();
          } else {
            container.innerHTML = Components.signInState();
          }
        } else {
          // In standalone mode, always show empty state (mock data)
          container.innerHTML = Components.emptyState();
        }
      }

      // Re-append sentinel even for empty states
      if (sentinel) {
        container.appendChild(sentinel);
      }
      this.updateStats();
      return;
    }

    const cardsHtml = this.pages.map(page => Components.savedPageCard(page)).join('');
    container.innerHTML = cardsHtml;

    // Re-append sentinel after updating content
    if (sentinel) {
      container.appendChild(sentinel);
    }

    // Update stats after rendering
    this.updateStats();
  }

  /**
   * Show sign-in prompt
   */
  showSignInPrompt() {
    const content = document.getElementById('content');
    content.innerHTML = Components.signInState();
  }

  /**
   * Update sign-in button visibility based on auth state
   */
  updateSignInButton(user) {
    const signInBtn = document.getElementById('sign-in-btn');
    const userProfile = document.getElementById('user-profile');

    if (!signInBtn || !userProfile) return;

    if (user) {
      // User is signed in - hide sign-in button, show profile
      signInBtn.style.display = 'none';
      userProfile.style.display = 'block';

      // Update user info
      const userName = document.getElementById('user-name');
      const userEmail = document.getElementById('user-email');

      if (userName && user.name) {
        userName.textContent = user.name.split(' ')[0]; // First name only
      }
      if (userEmail && user.email) {
        userEmail.textContent = user.email;
      }
    } else {
      // User is signed out - show sign-in button, hide profile
      signInBtn.style.display = 'flex';
      userProfile.style.display = 'none';
    }
  }

  /**
   * Handle sign-in button click
   * Triggers Firebase OAuth without requiring a page save
   */
  async handleSignIn() {
    try {
      // Send message to background script to trigger sign-in
      const runtime = getBrowserRuntime();
      if (!runtime) {
        throw new Error('Browser runtime not available');
      }
      await runtime.sendMessage({ action: 'signIn' });
      // Auth state listener will handle UI updates
    } catch (error) {
      console.error('Sign-in failed:', error);
      alert('Failed to sign in. Please try again.');
    }
  }

  /**
   * Handle sign-out button click
   */
  async handleSignOut() {
    try {
      if (window.firebaseAuth && window.firebaseSignOut) {
        await window.firebaseSignOut(window.firebaseAuth);
        this.updateSignInButton(null);
        this.showSignInPrompt();
      }
    } catch (error) {
      console.error('Sign-out failed:', error);
      alert('Failed to sign out. Please try again.');
    }
  }

  /**
   * Toggle user profile dropdown
   */
  toggleUserDropdown() {
    const dropdown = document.getElementById('user-dropdown');
    if (!dropdown) return;

    const isVisible = dropdown.style.display === 'block';
    dropdown.style.display = isVisible ? 'none' : 'block';
  }

  /**
   * Reset all filters and return to default view
   */
  resetToDefaultView() {
    // Clear search
    const searchInput = document.getElementById('search');
    const clearSearch = document.getElementById('clear-search');
    if (searchInput) {
      searchInput.value = '';
    }
    if (clearSearch) {
      clearSearch.style.display = 'none';
    }

    // Reset all filter state
    this.currentFilter.search = '';
    this.selectedL1 = null;
    this.selectedL2 = null;
    this.selectedL3 = null;
    this.discoveryMode = false;
    this.currentDiscoveryLabel = null;
    this.currentDiscoveryType = null;
    this.currentDiscoveryContext = null;

    // Restore pages to show all items (unfiltered)
    this.pages = [...this.allPages];

    // Re-render the view
    this.render();
  }

  /**
   * Setup all event listeners
   */
  setupEventListeners() {
    // Logo click - reset to default view
    const logo = document.querySelector('.logo');
    if (logo) {
      logo.style.cursor = 'pointer';
      logo.addEventListener('click', () => this.resetToDefaultView());
    }

    // Sign-in button
    const signInBtn = document.getElementById('sign-in-btn');
    if (signInBtn) {
      signInBtn.addEventListener('click', () => this.handleSignIn());
    }

    // User profile button (toggle dropdown)
    const userProfileBtn = document.getElementById('user-profile-btn');
    if (userProfileBtn) {
      userProfileBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        this.toggleUserDropdown();
      });
    }

    // Sign-out button
    const signOutBtn = document.getElementById('sign-out-btn');
    if (signOutBtn) {
      signOutBtn.addEventListener('click', () => this.handleSignOut());
    }

    // Close dropdown when clicking outside
    document.addEventListener('click', (e) => {
      const dropdown = document.getElementById('user-dropdown');
      const userProfile = document.getElementById('user-profile');
      if (dropdown && userProfile && !userProfile.contains(e.target)) {
        dropdown.style.display = 'none';
      }
    });

    // Search input
    const searchInput = document.getElementById('search');
    const clearSearch = document.getElementById('clear-search');

    searchInput.addEventListener('input', (e) => {
      this.currentFilter.search = e.target.value;
      clearSearch.style.display = e.target.value ? 'block' : 'none';
      this.debounce(() => this.handleFilterChange(), 300);
    });

    clearSearch.addEventListener('click', () => {
      searchInput.value = '';
      this.currentFilter.search = '';
      clearSearch.style.display = 'none';
      this.handleFilterChange();
    });

    // Theme toggle buttons
    document.querySelectorAll('.theme-option').forEach(btn => {
      btn.addEventListener('click', () => {
        const theme = btn.dataset.theme;
        localStorage.setItem('theme-preference', theme);
        this.applyTheme(theme);
        this.updateThemeButtons(theme);
      });
    });

    // Card actions (event delegation)
    document.getElementById('content').addEventListener('click', (e) => {
      // Welcome sign-in button
      const welcomeSignInBtn = e.target.closest('#welcome-sign-in-btn');
      if (welcomeSignInBtn) {
        e.stopPropagation();
        this.handleSignIn();
        return;
      }

      // Delete button - handle and stop propagation
      const deleteBtn = e.target.closest('.btn-delete');
      if (deleteBtn) {
        e.stopPropagation();
        const id = deleteBtn.dataset.id;
        this.deletePage(id);
        return;
      }

      // Row click - open URL in new tab
      const row = e.target.closest('.saved-page-card');
      if (row) {
        const url = row.dataset.url;
        this.openPage(url);
      }
    });

    // About link
    document.getElementById('about-link').addEventListener('click', (e) => {
      e.preventDefault();
      this.showAbout();
    });

    // Setup infinite scroll observer
    this.setupInfiniteScroll();
  }

  /**
   * Handle filter changes (search box)
   * Applies search filter on top of tag-filtered results
   */
  handleFilterChange() {
    // Get currently displayed pages (either similarity results or all pages)
    const basePages = this.pages.length > 0 ? this.pages : [...this.allPages];

    if (this.currentFilter.search) {
      // Apply search filter
      this.pages = basePages;
      this.applySearchFilter();
    } else {
      // No search - restore base pages
      const activeLabel = this.selectedL3 || this.selectedL2 || this.selectedL1;
      if (!activeLabel) {
        // No tag selected either - show all
        this.pages = [...this.allPages];
      }
      // If tag is selected, pages already contains similarity results
    }

    this.updateStats();
    this.render();
  }

  /**
   * Setup infinite scroll using Intersection Observer
   */
  setupInfiniteScroll() {
    // Create sentinel element to observe
    const sentinel = document.createElement('div');
    sentinel.id = 'scroll-sentinel';
    sentinel.style.height = '1px';
    document.getElementById('content').appendChild(sentinel);

    // Create observer
    this.scrollObserver = new IntersectionObserver(
      (entries) => {
        const entry = entries[0];
        if (entry.isIntersecting && this.hasMorePages && !this.isLoadingMore) {
          this.loadMorePages();
        }
      },
      {
        root: null, // viewport
        rootMargin: '200px', // Trigger 200px before reaching sentinel
        threshold: 0
      }
    );

    this.scrollObserver.observe(sentinel);
  }

  /**
   * Load more pages (infinite scroll)
   */
  async loadMorePages() {
    if (this.isLoadingMore || !this.hasMorePages) return;

    this.isLoadingMore = true;
    this.showLoadingIndicator();

    try {
      // Update offset for next batch
      this.currentFilter.offset += this.currentFilter.limit;

      const response = await API.getSavedPages(this.currentFilter);

      // Handle response structure (pages array or object with pagination)
      let newPages = [];
      if (Array.isArray(response)) {
        newPages = response;
        this.hasMorePages = response.length >= this.currentFilter.limit;
      } else {
        newPages = response.pages || [];
        this.hasMorePages = response.pagination?.hasNextPage || false;
        this.nextCursor = response.pagination?.nextCursor || null;
      }

      // Append new pages to existing
      this.allPages = [...this.allPages, ...newPages];

      // Also append to filtered pages (they'll match same criteria)
      this.pages = [...this.pages, ...newPages];

      this.updateStats();
      this.render();

    } catch (error) {
      console.error('Failed to load more pages:', error);
      this.showError(error);
    } finally {
      this.isLoadingMore = false;
      this.hideLoadingIndicator();
    }
  }

  /**
   * Show loading indicator for infinite scroll
   */
  showLoadingIndicator() {
    let indicator = document.getElementById('loading-indicator');
    if (!indicator) {
      indicator = document.createElement('div');
      indicator.id = 'loading-indicator';
      indicator.className = 'loading-indicator';
      indicator.innerHTML = `
        <div class="loading-spinner"></div>
        <span>Loading more pages...</span>
      `;
      document.getElementById('content').appendChild(indicator);
    }
    indicator.style.display = 'flex';
  }

  /**
   * Hide loading indicator
   */
  hideLoadingIndicator() {
    const indicator = document.getElementById('loading-indicator');
    if (indicator) {
      indicator.style.display = 'none';
    }
  }

  /**
   * Open a saved page in new tab
   */
  openPage(url) {
    window.open(url, '_blank', 'noopener,noreferrer');
  }

  /**
   * Delete a saved page
   */
  async deletePage(id) {
    if (!confirm('Delete this saved page? This cannot be undone.')) {
      return;
    }

    // Find the row element and add transition class
    const row = document.querySelector(`.saved-page-card[data-id="${id}"]`);
    if (row) {
      row.classList.add('deleting');

      // Wait for transition to complete before removing from DOM
      await new Promise(resolve => setTimeout(resolve, 300));
    }

    try {
      await API.deletePage(id);

      // Remove from both allPages and pages
      this.allPages = this.allPages.filter(p => p.id !== id);
      this.pages = this.pages.filter(p => p.id !== id);

      this.updateStats();
      this.render();
      this.showToast('Page deleted successfully');
    } catch (error) {
      console.error('Failed to delete page:', error);

      // Remove transition class on error to restore row
      if (row) {
        row.classList.remove('deleting');
      }

      alert('Failed to delete page. Please try again.');
    }
  }

  /**
   * Show about dialog
   */
  showAbout() {
    const mode = API.isExtension ? 'Extension' : 'Development';
    const runtime = getBrowserRuntime();
    const version = runtime ? runtime.getManifest().version : 'standalone';
    const message = `SaveIt

SaveIt uses AI to read and semantically index the subject of each page based on its content. This lets you recall saved pages through similarity of subject matter, as opposed to having to remember the domain name, title, or URL.

When you save a page, the extension:
• Extracts and analyzes the page content
• Generates a semantic classification of the subject matter
• Creates vector embeddings for similarity search
• Provides AI-generated summaries

You can then discover related pages by browsing through automatically-generated topic hierarchies, or by searching for pages similar to a given topic—even if you never explicitly tagged them.

Version ${version} • ${mode} Mode${!API.isExtension ? '\n\n⚠️  Currently viewing mock data. Load as browser extension to see your saved pages.' : ''}`;

    alert(message);
  }

  /**
   * Show toast notification
   */
  showToast(message) {
    const toast = document.createElement('div');
    toast.style.cssText = `
      position: fixed;
      bottom: 24px;
      right: 24px;
      background: #1e293b;
      color: white;
      padding: 12px 24px;
      border-radius: 8px;
      box-shadow: 0 10px 15px -3px rgb(0 0 0 / 0.1);
      z-index: 1000;
      animation: slideIn 0.3s ease-out;
    `;
    toast.textContent = message;
    document.body.appendChild(toast);

    setTimeout(() => {
      toast.style.animation = 'slideOut 0.3s ease-out';
      setTimeout(() => toast.remove(), 300);
    }, 3000);
  }

  /**
   * Debounce helper for search input
   */
  debounce(func, wait) {
    clearTimeout(this.debounceTimer);
    this.debounceTimer = setTimeout(func, wait);
  }

  /**
   * Enter discovery mode - search for pages by tag similarity
   * @param {string} label - Tag label to search for
   * @param {string} type - Classification type (general/domain/topic)
   */
  async discoverByTag(label, type) {
    console.log('[discoverByTag] Starting discovery for:', label, type);
    this.discoveryMode = true;
    this.currentDiscoveryLabel = label;
    this.currentDiscoveryType = type;

    // Build breadcrumb context for this classification
    this.currentDiscoveryContext = this.buildBreadcrumbContext(type, label);

    // Show loading state
    this.showLoading();

    try {
      console.log('[discoverByTag] Calling API.searchByTag');
      const results = await API.searchByTag(label);
      console.log('[discoverByTag] Got results, rendering:', results);
      this.renderDiscoveryResults(results);
      console.log('[discoverByTag] Discovery complete');
    } catch (error) {
      console.error('[discoverByTag] Failed to search by tag:', error);
      this.showError(error);
    }
  }

  /**
   * Render discovery results
   * Uses Components.discoveryResults to render the full discovery view
   */
  renderDiscoveryResults(results) {
    // Flatten all tiers into single array for tag extraction
    const allResults = [
      ...(results.exact_matches || []),
      ...(results.similar_matches || []),
      ...(results.related_matches || [])
    ];

    // Store results as pages for tag extraction
    this.pages = allResults.map(match => match.thing_data);

    // Use Components.discoveryResults to render full discovery view
    const container = document.getElementById('content');

    // Preserve scroll sentinel before modifying content
    const sentinel = document.getElementById('scroll-sentinel');

    container.innerHTML = Components.discoveryResults(results);

    // Re-append sentinel after updating content
    if (sentinel) {
      container.appendChild(sentinel);
    }

    // Render tag bar after updating pages
    this.renderTagBar();
  }

  /**
   * Exit discovery mode and return to main view
   */
  exitDiscoveryMode() {
    this.discoveryMode = false;
    this.currentDiscoveryLabel = null;
    this.currentDiscoveryType = null;
    this.currentDiscoveryContext = null;

    // Restore pages based on current tag selection
    const activeLabel = this.selectedL3 || this.selectedL2 || this.selectedL1;
    if (activeLabel) {
      // Re-trigger similarity search for selected tag
      const activeType = this.selectedL3 ? 'topic' : (this.selectedL2 ? 'domain' : 'general');
      this.handleTagClick(activeType, activeLabel);
    } else {
      // No tag selected - show all pages
      this.pages = [...this.allPages];
      this.updateStats();
      this.render();
    }
  }
}

async function initDashboard() {
  try {
    window.dashboard = new SaveItDashboard();
    await window.dashboard.init();

    // Signal that dashboard is fully initialized (for E2E tests)
    window.dashboardReady = true;
    console.log('[Dashboard] Initialization complete');
  } catch (error) {
    console.error('Fatal error during dashboard initialization:', error.message || error);
    console.error('Stack trace:', error.stack);
    window.dashboardReady = false;

    // Show user-friendly error message
    const content = document.getElementById('content');
    if (content) {
      content.innerHTML = `
        <div class="error-state">
          <svg class="error-icon" width="60" height="60" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <circle cx="12" cy="12" r="10"></circle>
            <line x1="12" y1="8" x2="12" y2="12"></line>
            <line x1="12" y1="16" x2="12.01" y2="16"></line>
          </svg>
          <h2>Failed to initialize dashboard</h2>
          <p>${error.message || 'An unexpected error occurred'}</p>
          <button class="btn btn-primary" onclick="location.reload()">Reload</button>
        </div>
      `;
    }
  }
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initDashboard);
} else {
  initDashboard();
}

// Expose API for debugging in console
window.API = API;

if (!document.getElementById('toast-styles')) {
  const style = document.createElement('style');
  style.id = 'toast-styles';
  style.textContent = `
    @keyframes slideIn {
      from {
        transform: translateX(400px);
        opacity: 0;
      }
      to {
        transform: translateX(0);
        opacity: 1;
      }
    }
    @keyframes slideOut {
      from {
        transform: translateX(0);
        opacity: 1;
      }
      to {
        transform: translateX(400px);
        opacity: 0;
      }
    }
  `;
  document.head.appendChild(style);
}
