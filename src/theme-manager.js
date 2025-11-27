// theme-manager.js - Theme and UI indicator management
// Handles theme switching, mode indicator, and version display

/**
 * ThemeManager - Manages theme preferences and footer indicators
 * Handles light/dark/auto theme switching and displays mode/version info
 */
/* eslint-disable-next-line no-unused-vars */
class ThemeManager {
  /**
   * Initialize theme manager
   * No dependencies needed - operates on DOM and localStorage
   */
  constructor() {
    // Stateless - all methods are self-contained
  }

  /**
   * Static factory: Initialize theme and optionally inject toggle
   * Single entry point for pages that just need theme support
   * @param {string} [toggleContainerId='theme-toggle-container'] - ID of container for toggle buttons
   * @returns {ThemeManager} The initialized instance
   */
  static init(toggleContainerId = 'theme-toggle-container') {
    const manager = new ThemeManager();
    manager.initTheme();
    const container = document.getElementById(toggleContainerId);
    if (container) {
      manager.injectThemeToggle(container);
    }
    return manager;
  }

  /**
   * Initialize theme from localStorage and apply to UI
   * Called during dashboard initialization
   */
  initTheme() {
    const savedTheme = localStorage.getItem('theme-preference') || 'auto';
    this.applyTheme(savedTheme);
    this.updateThemeButtons(savedTheme);
    this.initCrossTabSync();
    this.initSystemPreferenceListener();
  }

  /**
   * Listen for theme changes from other tabs via localStorage
   * Ensures all open pages stay in sync when user changes theme
   */
  initCrossTabSync() {
    window.addEventListener('storage', (e) => {
      if (e.key === 'theme-preference') {
        const newTheme = e.newValue || 'auto';
        this.applyTheme(newTheme);
        this.updateThemeButtons(newTheme);
      }
    });
  }

  /**
   * Listen for system color scheme changes when theme is 'auto'
   * Triggers CSS recalculation when OS switches light/dark mode
   */
  initSystemPreferenceListener() {
    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
    mediaQuery.addEventListener('change', () => {
      const currentTheme = localStorage.getItem('theme-preference') || 'auto';
      if (currentTheme === 'auto') {
        // Re-apply to trigger any JS-based theme updates
        this.applyTheme('auto');
      }
    });
  }

  /**
   * Create and inject theme toggle HTML into a container
   * @param {HTMLElement} container - Container element to inject toggle into
   */
  injectThemeToggle(container) {
    if (!container) return;

    const toggle = document.createElement('div');
    toggle.className = 'theme-toggle-compact';
    toggle.setAttribute('role', 'radiogroup');
    toggle.setAttribute('aria-label', 'Theme selection');
    toggle.innerHTML = `
      <button class="theme-option-icon" data-theme="auto" aria-label="Auto theme" title="System preference">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <rect x="2" y="3" width="20" height="14" rx="2" ry="2"></rect>
          <line x1="8" y1="21" x2="16" y2="21"></line>
          <line x1="12" y1="17" x2="12" y2="21"></line>
        </svg>
      </button>
      <button class="theme-option-icon" data-theme="light" aria-label="Light theme" title="Light mode">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <circle cx="12" cy="12" r="5"></circle>
          <line x1="12" y1="1" x2="12" y2="3"></line>
          <line x1="12" y1="21" x2="12" y2="23"></line>
          <line x1="4.22" y1="4.22" x2="5.64" y2="5.64"></line>
          <line x1="18.36" y1="18.36" x2="19.78" y2="19.78"></line>
          <line x1="1" y1="12" x2="3" y2="12"></line>
          <line x1="21" y1="12" x2="23" y2="12"></line>
          <line x1="4.22" y1="19.78" x2="5.64" y2="18.36"></line>
          <line x1="18.36" y1="5.64" x2="19.78" y2="4.22"></line>
        </svg>
      </button>
      <button class="theme-option-icon" data-theme="dark" aria-label="Dark theme" title="Dark mode">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"></path>
        </svg>
      </button>
    `;
    container.appendChild(toggle);

    // Setup click handlers
    toggle.querySelectorAll('.theme-option-icon').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const theme = btn.dataset.theme;
        localStorage.setItem('theme-preference', theme);
        this.applyTheme(theme);
        this.updateThemeButtons(theme);
      });
    });

    // Set initial active state
    const savedTheme = localStorage.getItem('theme-preference') || 'auto';
    this.updateThemeButtons(savedTheme);
  }

  /**
   * Apply theme to document
   * @param {string} theme - Theme name ('light', 'dark', or 'auto')
   */
  applyTheme(theme) {
    const html = document.documentElement;
    if (theme === 'auto') {
      html.removeAttribute('data-theme');
    } else {
      html.setAttribute('data-theme', theme);
    }
  }

  /**
   * Update theme button UI states
   * @param {string} activeTheme - Currently active theme
   */
  updateThemeButtons(activeTheme) {
    // Update both full-size and compact theme buttons
    document.querySelectorAll('.theme-option, .theme-option-icon').forEach(btn => {
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
   * Shows whether running in extension mode or development mode
   * @param {boolean} isExtension - True if running as extension
   */
  updateModeIndicator(isExtension) {
    const modeLabel = document.getElementById('mode-label');
    if (!modeLabel) return;

    if (isExtension) {
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
   * @param {Function} getBrowserRuntimeFn - Function to get browser runtime
   */
  updateVersionIndicator(getBrowserRuntimeFn) {
    const versionNumber = document.getElementById('version-number');
    const buildDate = document.getElementById('build-date');

    if (versionNumber && typeof browser !== 'undefined' && browser.runtime) {
      const runtime = getBrowserRuntimeFn();
      const manifest = runtime?.getManifest();
      if (manifest) {
        versionNumber.textContent = manifest.version;

        // Show build date if available (added during release process)
        if (buildDate && manifest.build_date) {
          const date = new Date(manifest.build_date);
          buildDate.textContent = `(${date.toLocaleDateString()})`;
        }
      }
    }
  }

  /**
   * Background image management for minimal new tab
   * Fetches from Unsplash and caches for 3 hours
   */

  /**
   * Get cached background data from browser storage
   * @param {string} cacheKey - Storage key for background data
   * @param {number} cacheDurationMs - Cache duration in milliseconds
   * @param {Object} storage - Storage API (browser.storage.local or chrome.storage.local)
   * @returns {Promise<Object|null>} Cached background data or null
   */
  async getCachedBackground(cacheKey, cacheDurationMs, storage) {
    if (!storage) return null;

    try {
      const result = await storage.get(cacheKey);
      const cached = result[cacheKey];

      if (!cached) return null;

      // Check if cache is expired
      const age = Date.now() - cached.cachedAt;
      if (age > cacheDurationMs) {
        await storage.remove(cacheKey);
        return null;
      }

      return cached;
    } catch {
      return null;
    }
  }

  /**
   * Save background data to browser storage
   * @param {Object} data - Background data to cache
   * @param {string} cacheKey - Storage key for background data
   * @param {Object} storage - Storage API (browser.storage.local or chrome.storage.local)
   */
  async cacheBackground(data, cacheKey, storage) {
    if (!storage) return;

    try {
      await storage.set({
        [cacheKey]: {
          ...data,
          cachedAt: Date.now()
        }
      });
    } catch (error) {
      console.error('[ThemeManager] Failed to cache background:', error);
    }
  }

  /**
   * Fetch random photo from Unsplash API
   * @param {string} unsplashAccessKey - Unsplash API access key
   * @returns {Promise<Object|null>} Photo data or null on failure
   */
  async fetchUnsplashPhoto(unsplashAccessKey) {
    if (!unsplashAccessKey) return null;

    try {
      const response = await fetch(
        'https://api.unsplash.com/photos/random?orientation=landscape&topics=architecture,textures,wallpapers',
        {
          headers: {
            'Authorization': `Client-ID ${unsplashAccessKey}`
          }
        }
      );

      if (!response.ok) {
        console.error('[ThemeManager] Unsplash API error:', response.status);
        return null;
      }

      const photo = await response.json();

      return {
        imageUrl: photo.urls.full,
        photographerName: photo.user.name,
        photographerUrl: `${photo.user.links.html}?utm_source=saveit&utm_medium=referral`
      };
    } catch (error) {
      console.error('[ThemeManager] Failed to fetch Unsplash photo:', error);
      return null;
    }
  }

  /**
   * Apply background image and show photo credit
   * @param {Object} data - Background data with imageUrl, photographerName, photographerUrl
   * @param {HTMLElement} backgroundEl - Background container element
   * @param {HTMLElement} photographerLinkEl - Photographer link element
   * @param {HTMLElement} photoCreditEl - Photo credit container element
   */
  applyBackground(data, backgroundEl, photographerLinkEl, photoCreditEl) {
    if (!data || !data.imageUrl) return;

    // Preload image before displaying
    const img = new Image();
    img.onload = () => {
      if (backgroundEl) {
        backgroundEl.style.backgroundImage = `url(${data.imageUrl})`;
        backgroundEl.classList.add('loaded');
        document.body.classList.add('has-background');
      }

      // Update photo credit
      if (photographerLinkEl && photoCreditEl) {
        photographerLinkEl.textContent = data.photographerName;
        photographerLinkEl.href = data.photographerUrl;
        photoCreditEl.classList.remove('hidden');
      }
    };
    img.src = data.imageUrl;
  }

  /**
   * Initialize background image from cache or Unsplash
   * @param {Object} config - Configuration object
   * @param {string} config.cacheKey - Storage key for background data
   * @param {number} config.cacheDurationMs - Cache duration in milliseconds
   * @param {Object} config.storage - Storage API
   * @param {string} config.unsplashAccessKey - Unsplash API access key
   * @param {HTMLElement} config.backgroundEl - Background container element
   * @param {HTMLElement} config.photographerLinkEl - Photographer link element
   * @param {HTMLElement} config.photoCreditEl - Photo credit container element
   */
  async initBackground(config) {
    // Try cache first
    let backgroundData = await this.getCachedBackground(
      config.cacheKey,
      config.cacheDurationMs,
      config.storage
    );

    if (backgroundData) {
      this.applyBackground(
        backgroundData,
        config.backgroundEl,
        config.photographerLinkEl,
        config.photoCreditEl
      );
      return;
    }

    // Fetch new photo
    backgroundData = await this.fetchUnsplashPhoto(config.unsplashAccessKey);
    if (backgroundData) {
      await this.cacheBackground(backgroundData, config.cacheKey, config.storage);
      this.applyBackground(
        backgroundData,
        config.backgroundEl,
        config.photographerLinkEl,
        config.photoCreditEl
      );
    }
  }

  /**
   * Refresh background image (fetch new photo and apply immediately)
   * @param {Object} config - Configuration object (same as initBackground)
   */
  async refreshBackground(config) {
    // Fetch new photo (ignore cache)
    const backgroundData = await this.fetchUnsplashPhoto(config.unsplashAccessKey);
    if (backgroundData) {
      await this.cacheBackground(backgroundData, config.cacheKey, config.storage);
      this.applyBackground(
        backgroundData,
        config.backgroundEl,
        config.photographerLinkEl,
        config.photoCreditEl
      );
    }
  }
}
