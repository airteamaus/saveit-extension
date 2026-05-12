// event-manager.js - Event listener management for dashboard
// Handles all DOM event binding and delegation
/* global AuthMenu */

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

    // Refresh background button
    const refreshBackgroundBtn = document.getElementById('refresh-background-btn');
    if (refreshBackgroundBtn) {
      refreshBackgroundBtn.addEventListener('click', async (e) => {
        e.stopPropagation();
        await dashboard.refreshBackground();
      });
    }

    // Close dropdown when clicking outside
    document.addEventListener('click', (e) => {
      const dropdown = document.getElementById('user-dropdown');
      const userProfile = document.getElementById('user-profile');
      if (dropdown && userProfile && !userProfile.contains(e.target)) {
        AuthMenu.hideDropdown(dropdown);
      }
    });

    // Search input
    const searchInput = document.getElementById('search');
    const clearSearch = document.getElementById('clear-search');

    searchInput.addEventListener('input', (e) => {
      dashboard.currentFilter.search = e.target.value;
      clearSearch.classList.toggle('hidden', !e.target.value);
      clearTimeout(dashboard.debounceTimer);
      dashboard.debounceTimer = setTimeout(() => dashboard.handleFilterChange(), 300);
    });

    clearSearch.addEventListener('click', () => {
      searchInput.value = '';
      dashboard.currentFilter.search = '';
      clearSearch.classList.add('hidden');
      dashboard.handleFilterChange();
    });

    // Theme toggle - inject into user dropdown
    const themeToggleContainer = document.getElementById('theme-toggle-container');
    if (themeToggleContainer) {
      dashboard.themeManager.injectThemeToggle(themeToggleContainer);
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

      // Pin button - handle and stop propagation
      const pinBtn = e.target.closest('.btn-pin');
      if (pinBtn) {
        e.stopPropagation();
        const id = pinBtn.dataset.id;
        dashboard.togglePin(id);
        return;
      }

      const projectsBtn = e.target.closest('.btn-projects');
      if (projectsBtn) {
        e.stopPropagation();
        const id = projectsBtn.dataset.id;
        dashboard.openProjectEditor(id);
        return;
      }

      const projectPillRemoveBtn = e.target.closest('.project-pill-remove');
      if (projectPillRemoveBtn) {
        e.stopPropagation();
        const pageId = projectPillRemoveBtn.dataset.pageId;
        const projectId = projectPillRemoveBtn.dataset.projectId;
        dashboard.togglePageProject(pageId, projectId, false);
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

    const projectSidebar = document.getElementById('project-sidebar');
    if (projectSidebar) {
      projectSidebar.addEventListener('click', (e) => {
        const createButton = e.target.closest('.project-sidebar-create');
        if (createButton) {
          dashboard.createProject();
          return;
        }

        const renameButton = e.target.closest('.project-action-rename');
        if (renameButton) {
          e.stopPropagation();
          dashboard.renameProject(renameButton.dataset.projectId);
          return;
        }

        const visibilityButton = e.target.closest('.project-action-visibility');
        if (visibilityButton) {
          e.stopPropagation();
          dashboard.toggleProjectVisibility(visibilityButton.dataset.projectId);
          return;
        }

        const archiveButton = e.target.closest('.project-action-archive');
        if (archiveButton) {
          e.stopPropagation();
          dashboard.archiveProject(archiveButton.dataset.projectId);
          return;
        }

        const projectButton = e.target.closest('.project-nav-item');
        if (projectButton) {
          dashboard.handleProjectSelect(projectButton.dataset.projectId || null);
        }
      });
    }

    const projectEditorBackdrop = document.getElementById('project-editor-backdrop');
    if (projectEditorBackdrop) {
      projectEditorBackdrop.addEventListener('click', () => dashboard.closeProjectEditor());
    }

    const projectEditorDialog = document.getElementById('project-editor-dialog');
    if (projectEditorDialog) {
      projectEditorDialog.addEventListener('click', (e) => {
        const closeButton = e.target.closest('.project-editor-close');
        if (closeButton) {
          dashboard.closeProjectEditor();
          return;
        }

        const createButton = e.target.closest('.project-editor-create');
        if (createButton) {
          dashboard.createProject(createButton.dataset.projectName, createButton.dataset.pageId);
        }
      });

      projectEditorDialog.addEventListener('input', (e) => {
        const searchInputEl = e.target.closest('.project-editor-search-input');
        if (searchInputEl) {
          dashboard.updateProjectEditorQuery(searchInputEl.value);
          return;
        }

        const checkbox = e.target.closest('.project-editor-checkbox');
        if (checkbox) {
          dashboard.togglePageProject(checkbox.dataset.pageId, checkbox.dataset.projectId, checkbox.checked);
        }
      });
    }

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
