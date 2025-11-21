// event-manager.js - Event listener management for dashboard
// Handles all DOM event binding and delegation

class EventManager {
  constructor() {
    // EventManager is stateless - just binds events
  }

  /**
   * Setup all event listeners for the dashboard
   * @param {Object} dashboard - Dashboard instance with callbacks
   */
  setupEventListeners(dashboard) {
    // Logo click - reset to default view
    const logo = document.querySelector('.logo');
    if (logo) {
      logo.style.cursor = 'pointer';
      logo.addEventListener('click', () => dashboard.resetToDefaultView());
    }

    // Sign-in button
    const signInBtn = document.getElementById('sign-in-btn');
    if (signInBtn) {
      signInBtn.addEventListener('click', () => dashboard.authUIManager.handleSignIn(dashboard.getBrowserRuntime));
    }

    // User profile button (toggle dropdown)
    const userProfileBtn = document.getElementById('user-profile-btn');
    if (userProfileBtn) {
      userProfileBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        dashboard.authUIManager.toggleUserDropdown();
      });
    }

    // Sign-out button
    const signOutBtn = document.getElementById('sign-out-btn');
    if (signOutBtn) {
      signOutBtn.addEventListener('click', () => dashboard.authUIManager.handleSignOut(() => dashboard.showSignInPrompt()));
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
      dashboard.currentFilter.search = e.target.value;
      clearSearch.style.display = e.target.value ? 'block' : 'none';
      clearTimeout(dashboard.debounceTimer);
      dashboard.debounceTimer = setTimeout(() => dashboard.handleFilterChange(), 300);
    });

    clearSearch.addEventListener('click', () => {
      searchInput.value = '';
      dashboard.currentFilter.search = '';
      clearSearch.style.display = 'none';
      dashboard.handleFilterChange();
    });

    // Theme toggle buttons
    document.querySelectorAll('.theme-option').forEach(btn => {
      btn.addEventListener('click', () => {
        const theme = btn.dataset.theme;
        localStorage.setItem('theme-preference', theme);
        dashboard.themeManager.applyTheme(theme);
        dashboard.themeManager.updateThemeButtons(theme);
      });
    });

    // Graph button - open knowledge graph in new tab
    const graphBtn = document.getElementById('graph-btn');
    if (graphBtn) {
      graphBtn.addEventListener('click', () => {
        // Get extension URL for graph.html
        const runtime = dashboard.getBrowserRuntime();
        if (runtime) {
          const graphUrl = runtime.getURL('src/graph.html');
          window.location.href = graphUrl;
        } else {
          // Standalone mode - try relative path
          window.location.href = 'graph.html';
        }
      });
    }

    // Card actions (event delegation)
    document.getElementById('content').addEventListener('click', (e) => {
      // Welcome sign-in button
      const welcomeSignInBtn = e.target.closest('#welcome-sign-in-btn');
      if (welcomeSignInBtn) {
        e.stopPropagation();
        dashboard.authUIManager.handleSignIn(dashboard.getBrowserRuntime);
        return;
      }

      // Delete button - handle and stop propagation
      const deleteBtn = e.target.closest('.btn-delete');
      if (deleteBtn) {
        e.stopPropagation();
        const id = deleteBtn.dataset.id;
        dashboard.deletePage(id);
        return;
      }

      // Tag click - handle tags anywhere (tag bar OR search results)
      const tag = e.target.closest('.tag.ai-tag');
      if (tag) {
        e.stopPropagation();
        const label = tag.dataset.label;
        const type = tag.dataset.type;
        if (label && type) {
          dashboard.handleTagClick(type, label);
        }
        return;
      }

      // Row click - open URL in new tab
      const row = e.target.closest('.saved-page-card');
      if (row) {
        const url = row.dataset.url;
        dashboard.openPage(url);
      }
    });

    // Tag bar actions (event delegation)
    document.getElementById('tag-bar').addEventListener('click', (e) => {
      const tag = e.target.closest('.tag.ai-tag');
      if (tag) {
        e.stopPropagation();
        const label = tag.dataset.label;
        const type = tag.dataset.type;
        if (label && type) {
          dashboard.handleTagClick(type, label);
        }
      }
    });

    // About link
    document.getElementById('about-link').addEventListener('click', (e) => {
      e.preventDefault();
      dashboard.showAbout();
    });

    // Setup infinite scroll observer
    dashboard.setupInfiniteScroll();
  }
}

// Export for use in newtab.js
window.EventManager = EventManager;
