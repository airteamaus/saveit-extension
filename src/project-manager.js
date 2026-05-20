// project-manager.js - Saved pages project navigation and membership UI

import {
  adjustProjectCount,
  getCompanyDomain,
  getProjectMap,
  getProjectPills,
  getProjectsUnavailableMessage,
  getScopedPages,
  getSelectedProject,
  getStatsTotal,
  isProjectsUnavailable,
  refreshProjectCounts
} from './project-manager-state.js';

class ProjectManager {
  constructor(api, htmlUtils) {
    this.api = api;
    this.htmlUtils = htmlUtils;
  }

  getProjectActionIcon(action) {
    if (action === 'rename') {
      return `
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
          <path d="M12 20h9"></path>
          <path d="M16.5 3.5a2.12 2.12 0 1 1 3 3L7 19l-4 1 1-4 12.5-12.5z"></path>
        </svg>
      `;
    }

    if (action === 'visibility') {
      return `
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
          <path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path>
          <circle cx="8.5" cy="7" r="4"></circle>
          <path d="M20 8v6"></path>
          <path d="M23 11h-6"></path>
        </svg>
      `;
    }

    return `
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
        <polyline points="21 8 21 21 3 21 3 8"></polyline>
        <rect x="1" y="3" width="22" height="5"></rect>
        <line x1="10" y1="12" x2="14" y2="12"></line>
      </svg>
    `;
  }

  isProjectsUnavailable(dashboard) {
    return isProjectsUnavailable(dashboard);
  }

  getProjectsUnavailableMessage(dashboard) {
    return getProjectsUnavailableMessage(dashboard);
  }

  async loadProjects(dashboard) {
    if (dashboard.projectsStore?.hydrate) {
      try {
        const snapshot = await dashboard.projectsStore.hydrate();
        dashboard.projects = snapshot.projects || snapshot.allPages || [];
        dashboard.projectsAvailable = true;
        dashboard.projectsUnavailableMessage = '';
        this.refreshProjectCounts(dashboard);
      } catch (error) {
        console.error('Failed to load projects:', error);
        dashboard.projects = [];
        if (error?.code === 'PROJECTS_UNSUPPORTED') {
          dashboard.projectsAvailable = false;
          dashboard.projectsUnavailableMessage = error.message;
        } else {
          dashboard.projectsAvailable = true;
          dashboard.projectsUnavailableMessage = '';
        }
      }
      return;
    }

    try {
      const projects = await this.api.getProjects();
      dashboard.projects = projects;
      dashboard.projectsAvailable = true;
      dashboard.projectsUnavailableMessage = '';
      this.refreshProjectCounts(dashboard);

      if (projects?.meta?.fromCache) {
        this.api.getProjects({ skipCache: true })
          .then(freshProjects => {
            dashboard.projects = freshProjects;
            dashboard.projectsAvailable = true;
            dashboard.projectsUnavailableMessage = '';
            this.refreshProjectCounts(dashboard);
            dashboard.onProjectsUpdated?.();
          })
          .catch(error => {
            console.error('Failed to refresh projects:', error);
          });
      }
    } catch (error) {
      console.error('Failed to load projects:', error);
      dashboard.projects = [];
      if (error?.code === 'PROJECTS_UNSUPPORTED') {
        dashboard.projectsAvailable = false;
        dashboard.projectsUnavailableMessage = error.message;
      } else {
        dashboard.projectsAvailable = true;
        dashboard.projectsUnavailableMessage = '';
      }
    }
  }

  getSelectedProject(dashboard) {
    return getSelectedProject(dashboard);
  }

  getScopedPages(dashboard, pages) {
    return getScopedPages(dashboard, pages);
  }

  refreshProjectCounts(dashboard) {
    refreshProjectCounts(dashboard);
  }

  adjustProjectCount(dashboard, projectId, delta) {
    adjustProjectCount(dashboard, projectId, delta);
  }

  getStatsTotal(dashboard) {
    return getStatsTotal(dashboard);
  }

  getProjectMap(dashboard) {
    return getProjectMap(dashboard);
  }

  getProjectPills(page, dashboard) {
    return getProjectPills(page, dashboard);
  }

  renderSidebar(dashboard) {
    const container = document.getElementById('project-sidebar');
    if (!container) {
      return;
    }

    if (this.isProjectsUnavailable(dashboard)) {
      container.innerHTML = `
        <div class="project-sidebar-header">
          <div>
            <p class="project-sidebar-eyebrow">Projects</p>
            <h2 class="project-sidebar-title">Collections</h2>
          </div>
        </div>
        <p class="project-sidebar-empty">${this.htmlUtils.escapeHtml(this.getProjectsUnavailableMessage(dashboard))}</p>
      `;
      return;
    }

    if (dashboard.projectsLoading) {
      container.innerHTML = `
        <div class="project-sidebar-header">
          <div>
            <p class="project-sidebar-eyebrow">Projects</p>
            <h2 class="project-sidebar-title">Collections</h2>
          </div>
          <button class="project-sidebar-create" type="button" disabled>New</button>
        </div>
        <p class="project-sidebar-empty">Loading projects...</p>
      `;
      return;
    }

    const totalCount = typeof dashboard.allItemsTotal === 'number'
      ? dashboard.allItemsTotal
      : (typeof dashboard.totalPages === 'number' ? dashboard.totalPages : null);
    const selectedProject = this.getSelectedProject(dashboard);
    const projectRows = (dashboard.projects || [])
      .filter(project => !project.archived)
      .sort((a, b) => a.name.localeCompare(b.name))
      .map(project => {
        const activeClass = project.id === dashboard.selectedProjectId ? 'is-active' : '';
        const visibilityLabel = project.visibility === 'company' ? 'Shared' : 'Private';

        return `
          <div class="project-nav-row has-actions ${activeClass}" data-project-id="${this.htmlUtils.escapeHtml(project.id)}">
            <button class="project-nav-item ${activeClass}" data-project-id="${this.htmlUtils.escapeHtml(project.id)}">
              <span class="project-nav-name">${this.htmlUtils.escapeHtml(project.name)}</span>
            </button>
            <div class="project-nav-meta">
              <span class="project-nav-visibility">${visibilityLabel}</span>
              <div class="project-nav-meta-right">
                <span class="project-nav-count">${project.page_count || 0}</span>
                <div class="project-nav-actions" aria-label="Project actions for ${this.htmlUtils.escapeHtml(project.name)}">
                  <button
                    class="project-nav-action project-action-rename"
                    data-project-id="${this.htmlUtils.escapeHtml(project.id)}"
                    title="Rename project"
                    aria-label="Rename ${this.htmlUtils.escapeHtml(project.name)}"
                  >${this.getProjectActionIcon('rename')}</button>
                  <button
                    class="project-nav-action project-action-visibility"
                    data-project-id="${this.htmlUtils.escapeHtml(project.id)}"
                    title="${project.visibility === 'company' ? 'Make private' : 'Share with company'}"
                    aria-label="${project.visibility === 'company' ? 'Make private' : 'Share with company'}"
                  >${this.getProjectActionIcon('visibility')}</button>
                  <button
                    class="project-nav-action project-action-archive"
                    data-project-id="${this.htmlUtils.escapeHtml(project.id)}"
                    title="Archive project"
                    aria-label="Archive ${this.htmlUtils.escapeHtml(project.name)}"
                  >${this.getProjectActionIcon('archive')}</button>
                </div>
              </div>
            </div>
          </div>
        `;
      })
      .join('');

    container.innerHTML = `
      <div class="project-sidebar-header">
        <div>
          <p class="project-sidebar-eyebrow">Projects</p>
          <h2 class="project-sidebar-title">Collections</h2>
        </div>
        <button class="project-sidebar-create" type="button">New</button>
      </div>

      <div class="project-nav">
        <div class="project-nav-row ${selectedProject ? '' : 'is-active'}" data-project-id="">
          <button class="project-nav-item ${selectedProject ? '' : 'is-active'}" data-project-id="">
            <span class="project-nav-name">All saved items</span>
          </button>
          <div class="project-nav-meta">
            <span class="project-nav-visibility">Default feed</span>
            ${typeof totalCount === 'number'
              ? `<div class="project-nav-meta-right"><span class="project-nav-count">${totalCount}</span></div>`
              : ''}
          </div>
        </div>

        <div class="project-nav-section-label">My projects</div>
        ${projectRows || '<p class="project-sidebar-empty">No projects yet. Create one to group related pages.</p>'}
      </div>
    `;
  }

  renderEditor(dashboard) {
    const backdrop = document.getElementById('project-editor-backdrop');
    const dialog = document.getElementById('project-editor-dialog');
    if (!backdrop || !dialog) {
      return;
    }

    if (this.isProjectsUnavailable(dashboard)) {
      backdrop.classList.remove('hidden');
      dialog.classList.remove('hidden');
      dialog.innerHTML = `
        <div class="project-editor-header">
          <div>
            <p class="project-editor-eyebrow">Page projects</p>
            <h2 id="project-editor-title" class="project-editor-title">Projects unavailable</h2>
          </div>
          <button class="project-editor-close" type="button" aria-label="Close project editor">Close</button>
        </div>
        <p class="project-editor-empty">${this.htmlUtils.escapeHtml(this.getProjectsUnavailableMessage(dashboard))}</p>
      `;
      return;
    }

    const pageId = dashboard.projectEditorState?.pageId;
    if (!pageId) {
      backdrop.classList.add('hidden');
      dialog.classList.add('hidden');
      dialog.innerHTML = '';
      return;
    }

    const page = dashboard.allPages.find(entry => entry.id === pageId) || dashboard.pages.find(entry => entry.id === pageId);
    if (!page) {
      this.closeEditor(dashboard);
      return;
    }

    const query = dashboard.projectEditorState.query || '';
    const filteredProjects = (dashboard.projects || [])
      .filter(project => !project.archived)
      .filter(project => project.name.toLowerCase().includes(query.trim().toLowerCase()))
      .sort((a, b) => a.name.localeCompare(b.name));
    const exactNameMatch = (dashboard.projects || []).some(project => project.name.toLowerCase() === query.trim().toLowerCase());
    const assignedProjects = this.getProjectPills(page, dashboard);

    const projectOptions = filteredProjects.length > 0
      ? filteredProjects.map(project => {
        const isChecked = page.project_ids?.includes(project.id);
        return `
          <label class="project-editor-option">
            <input
              class="project-editor-checkbox"
              type="checkbox"
              data-page-id="${this.htmlUtils.escapeHtml(page.id)}"
              data-project-id="${this.htmlUtils.escapeHtml(project.id)}"
              ${isChecked ? 'checked' : ''}
            >
            <span class="project-editor-option-main">
              <span class="project-editor-option-name">${this.htmlUtils.escapeHtml(project.name)}</span>
              <span class="project-editor-option-meta">${project.visibility === 'company' ? 'Shared with company' : 'Private project'}</span>
            </span>
          </label>
        `;
      }).join('')
      : '<p class="project-editor-empty">No matching projects yet.</p>';

    const createButton = query.trim() && !exactNameMatch
      ? `
        <button
          class="project-editor-create"
          type="button"
          data-page-id="${this.htmlUtils.escapeHtml(page.id)}"
          data-project-name="${this.htmlUtils.escapeHtml(query.trim())}"
        >
          Create "${this.htmlUtils.escapeHtml(query.trim())}"
        </button>
      `
      : '';

    dialog.innerHTML = `
      <div class="project-editor-header">
        <div>
          <p class="project-editor-eyebrow">Page projects</p>
          <h2 id="project-editor-title" class="project-editor-title">${this.htmlUtils.escapeHtml(page.title || 'Saved page')}</h2>
        </div>
        <button class="project-editor-close" type="button" aria-label="Close project editor">Close</button>
      </div>

      <div class="project-editor-assigned">
        ${assignedProjects.length > 0
          ? assignedProjects.map(project => `<span class="project-chip">${this.htmlUtils.escapeHtml(project.name)}</span>`).join('')
          : '<span class="project-editor-empty-inline">Not assigned to any projects yet.</span>'}
      </div>

      <label class="project-editor-search">
        <span class="project-editor-search-label">Search projects</span>
        <input
          id="project-editor-search-input"
          class="search-input project-editor-search-input"
          type="text"
          value="${this.htmlUtils.escapeHtml(query)}"
          placeholder="Find or create a project"
          autocomplete="off"
        >
      </label>

      ${createButton}

      <div class="project-editor-list">
        ${projectOptions}
      </div>
    `;

    backdrop.classList.remove('hidden');
    dialog.classList.remove('hidden');
  }

  openEditor(dashboard, pageId) {
    if (this.isProjectsUnavailable(dashboard)) {
      alert(this.getProjectsUnavailableMessage(dashboard));
      return;
    }

    dashboard.projectEditorState = {
      pageId,
      query: ''
    };
    this.renderEditor(dashboard);
    const input = document.getElementById('project-editor-search-input');
    input?.focus();
  }

  closeEditor(dashboard) {
    dashboard.projectEditorState = {
      pageId: null,
      query: ''
    };
    this.renderEditor(dashboard);
  }

  updateEditorQuery(dashboard, query) {
    dashboard.projectEditorState = {
      ...(dashboard.projectEditorState || {}),
      query
    };
    this.renderEditor(dashboard);
    const input = document.getElementById('project-editor-search-input');
    if (input) {
      input.focus();
      input.setSelectionRange(query.length, query.length);
    }
  }

  async promptCreateProject(dashboard, initialName = '', autoAssignPageId = null) {
    if (this.isProjectsUnavailable(dashboard)) {
      alert(this.getProjectsUnavailableMessage(dashboard));
      return null;
    }

    const proposedName = prompt('Project name', initialName);
    const name = proposedName?.trim();
    if (!name) {
      return null;
    }

    return await this.createProject(dashboard, name, autoAssignPageId);
  }

  async createProject(dashboard, name, autoAssignPageId = null) {
    if (this.isProjectsUnavailable(dashboard)) {
      alert(this.getProjectsUnavailableMessage(dashboard));
      return null;
    }

    try {
      const newProject = await this.api.createProject({
        name,
        visibility: 'private'
      });

      dashboard.projects = [...dashboard.projects, { ...newProject, page_count: newProject.page_count || 0 }];
      await dashboard.persistProjects?.();
      if (autoAssignPageId) {
        await this.togglePageProject(dashboard, autoAssignPageId, newProject.id, true);
        dashboard.projectEditorState.query = '';
      } else {
        this.refreshProjectCounts(dashboard);
        dashboard.render();
      }

      return newProject;
    } catch (error) {
      console.error('Failed to create project:', error);
      alert(error.message || 'Failed to create project. Please try again.');
      return null;
    }
  }

  async renameProject(dashboard, projectId) {
    const project = dashboard.projects.find(entry => entry.id === projectId);
    if (!project) {
      return;
    }

    const nextName = prompt('Rename project', project.name)?.trim();
    if (!nextName || nextName === project.name) {
      return null;
    }

    const updatedProject = await this.api.updateProject(projectId, { name: nextName });
    dashboard.projects = dashboard.projects.map(entry => (
      entry.id === projectId ? { ...entry, ...updatedProject } : entry
    ));
    await dashboard.persistProjects?.();
    dashboard.render();
    return updatedProject;
  }

  async toggleProjectVisibility(dashboard, projectId) {
    const project = dashboard.projects.find(entry => entry.id === projectId);
    if (!project) {
      return;
    }

    const nextVisibility = project.visibility === 'company' ? 'private' : 'company';
    const nextDomain = nextVisibility === 'company' ? this.getCompanyDomain(dashboard) : null;
    const updatedProject = await this.api.updateProject(projectId, {
      visibility: nextVisibility,
      company_domain: nextDomain
    });

    dashboard.projects = dashboard.projects.map(entry => (
      entry.id === projectId ? { ...entry, ...updatedProject } : entry
    ));
    await dashboard.persistProjects?.();
    dashboard.render();
    return updatedProject;
  }

  async archiveProject(dashboard, projectId) {
    const project = dashboard.projects.find(entry => entry.id === projectId);
    if (!project) {
      return;
    }

    if (!confirm(`Archive "${project.name}"?`)) {
      return null;
    }

    await this.api.updateProject(projectId, { archived: true });
    dashboard.projects = dashboard.projects.filter(entry => entry.id !== projectId);
    await dashboard.persistProjects?.();

    if (dashboard.selectedProjectId === projectId) {
      dashboard.selectedProjectId = null;
      if (dashboard.currentFilter) {
        dashboard.currentFilter.projectId = null;
        dashboard.currentFilter.cursor = null;
      }
      dashboard.tagInteractionManager.clearSelection();
      dashboard.discoveryManager.exit();
      dashboard.showLoading?.();
      await dashboard.loadPages?.();
      await dashboard.handleFilterChange();
      return project;
    }

    dashboard.render();
    return project;
  }

  async selectProject(dashboard, projectId) {
    dashboard.selectedProjectId = projectId || null;
    dashboard.currentFilter.projectId = dashboard.selectedProjectId;
    dashboard.currentFilter.cursor = null;
    dashboard.tagInteractionManager.clearSelection();
    dashboard.discoveryManager.exit();
    this.closeEditor(dashboard);
    dashboard.showLoading();
    await dashboard.loadPages();
    await dashboard.handleFilterChange();
  }

  async togglePageProject(dashboard, pageId, projectId, shouldAssign) {
    if (shouldAssign) {
      await this.api.addPageToProject(projectId, pageId);
    } else {
      await this.api.removePageFromProject(projectId, pageId);
    }

    const applyMembership = page => {
      if (page.id !== pageId) {
        return page;
      }

      const nextProjectIds = new Set(page.project_ids || []);
      if (shouldAssign) {
        nextProjectIds.add(projectId);
      } else {
        nextProjectIds.delete(projectId);
      }

      return {
        ...page,
        project_ids: Array.from(nextProjectIds)
      };
    };

    dashboard.allPages = dashboard.allPages.map(applyMembership);
    dashboard.pages = dashboard.pages.map(applyMembership);
    this.adjustProjectCount(dashboard, projectId, shouldAssign ? 1 : -1);
    await dashboard.persistAllPages?.();
    dashboard.handleProjectMembershipChange?.(pageId, projectId);
    this.renderEditor(dashboard);
  }

  getCompanyDomain(dashboard) {
    return getCompanyDomain(dashboard);
  }
}

window.ProjectManager = ProjectManager;

/* eslint-disable no-undef */
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { ProjectManager };
}
/* eslint-enable no-undef */
