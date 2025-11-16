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
