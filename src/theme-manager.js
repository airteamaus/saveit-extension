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
   * Initialize theme from localStorage and apply to UI
   * Called during dashboard initialization
   */
  initTheme() {
    const savedTheme = localStorage.getItem('theme-preference') || 'auto';
    this.applyTheme(savedTheme);
    this.updateThemeButtons(savedTheme);
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
          <circle cx="12" cy="12" r="4"></circle>
          <path d="M12 2v2m0 16v2M4.93 4.93l1.41 1.41m11.32 11.32l1.41 1.41M2 12h2m16 0h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41"></path>
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
}
