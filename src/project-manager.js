// project-manager.js - Dashboard project navigation and project membership UI

class ProjectManager {
  constructor(api, components) {
    this.api = api;
    this.components = components;
  }

  async loadProjects(dashboard) {
    try {
      dashboard.projects = await this.api.getProjects();
      this.refreshProjectCounts(dashboard);
    } catch (error) {
      console.error('Failed to load projects:', error);
      dashboard.projects = [];
    }
  }

  getSelectedProject(dashboard) {
    return dashboard.projects.find(project => project.id === dashboard.selectedProjectId) || null;
  }

  getScopedPages(dashboard, pages) {
    if (!dashboard.selectedProjectId) {
      return [...pages];
    }

    return pages.filter(page => page.project_ids?.includes(dashboard.selectedProjectId));
  }

  refreshProjectCounts(dashboard) {
    const activeProjects = dashboard.projects || [];
    const computedCounts = new Map(
      dashboard.allPages.reduce((counts, page) => {
        (page.project_ids || []).forEach(projectId => {
          counts.set(projectId, (counts.get(projectId) || 0) + 1);
        });
        return counts;
      }, new Map())
    );

    dashboard.projects = activeProjects.map(project => ({
      ...project,
      page_count: typeof project.page_count === 'number'
        ? project.page_count
        : (computedCounts.get(project.id) || 0)
    }));
  }

  adjustProjectCount(dashboard, projectId, delta) {
    dashboard.projects = (dashboard.projects || []).map(project => {
      if (project.id !== projectId) {
        return project;
      }

      const currentCount = typeof project.page_count === 'number' ? project.page_count : 0;
      return {
        ...project,
        page_count: Math.max(0, currentCount + delta)
      };
    });
  }

  getStatsTotal(dashboard) {
    if (dashboard.selectedProjectId) {
      return this.getScopedPages(dashboard, dashboard.allPages).length;
    }

    return dashboard.totalPages;
  }

  getProjectMap(dashboard) {
    return Object.fromEntries((dashboard.projects || []).map(project => [project.id, project]));
  }

  getProjectPills(page, dashboard) {
    const projectMap = this.getProjectMap(dashboard);
    return (page.project_ids || [])
      .map(projectId => projectMap[projectId])
      .filter(Boolean);
  }

  renderSidebar(dashboard) {
    const container = document.getElementById('project-sidebar');
    if (!container) {
      return;
    }

    const totalCount = dashboard.allItemsTotal || dashboard.totalPages || dashboard.allPages.length;
    const selectedProject = this.getSelectedProject(dashboard);
    const projectRows = (dashboard.projects || [])
      .filter(project => !project.archived)
      .sort((a, b) => a.name.localeCompare(b.name))
      .map(project => {
        const activeClass = project.id === dashboard.selectedProjectId ? 'is-active' : '';
        const visibilityLabel = project.visibility === 'company' ? 'Shared' : 'Private';

        return `
          <div class="project-nav-row ${activeClass}">
            <button class="project-nav-item ${activeClass}" data-project-id="${this.components.escapeHtml(project.id)}">
              <span class="project-nav-main">
                <span class="project-nav-name">${this.components.escapeHtml(project.name)}</span>
                <span class="project-nav-visibility">${visibilityLabel}</span>
              </span>
              <span class="project-nav-count">${project.page_count || 0}</span>
            </button>
            <div class="project-nav-actions">
              <button
                class="project-nav-action project-action-rename"
                data-project-id="${this.components.escapeHtml(project.id)}"
                title="Rename project"
                aria-label="Rename ${this.components.escapeHtml(project.name)}"
              >Rename</button>
              <button
                class="project-nav-action project-action-visibility"
                data-project-id="${this.components.escapeHtml(project.id)}"
                title="${project.visibility === 'company' ? 'Make private' : 'Share with company'}"
                aria-label="${project.visibility === 'company' ? 'Make private' : 'Share with company'}"
              >${project.visibility === 'company' ? 'Private' : 'Share'}</button>
              <button
                class="project-nav-action project-action-archive"
                data-project-id="${this.components.escapeHtml(project.id)}"
                title="Archive project"
                aria-label="Archive ${this.components.escapeHtml(project.name)}"
              >Archive</button>
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
        <button class="project-nav-item ${selectedProject ? '' : 'is-active'}" data-project-id="">
          <span class="project-nav-main">
            <span class="project-nav-name">All saved items</span>
            <span class="project-nav-visibility">Default feed</span>
          </span>
          <span class="project-nav-count">${totalCount}</span>
        </button>

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
              data-page-id="${this.components.escapeHtml(page.id)}"
              data-project-id="${this.components.escapeHtml(project.id)}"
              ${isChecked ? 'checked' : ''}
            >
            <span class="project-editor-option-main">
              <span class="project-editor-option-name">${this.components.escapeHtml(project.name)}</span>
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
          data-page-id="${this.components.escapeHtml(page.id)}"
          data-project-name="${this.components.escapeHtml(query.trim())}"
        >
          Create "${this.components.escapeHtml(query.trim())}"
        </button>
      `
      : '';

    dialog.innerHTML = `
      <div class="project-editor-header">
        <div>
          <p class="project-editor-eyebrow">Page projects</p>
          <h2 class="project-editor-title">${this.components.escapeHtml(page.title || 'Saved page')}</h2>
        </div>
        <button class="project-editor-close" type="button" aria-label="Close project editor">Close</button>
      </div>

      <div class="project-editor-assigned">
        ${assignedProjects.length > 0
          ? assignedProjects.map(project => `<span class="project-chip">${this.components.escapeHtml(project.name)}</span>`).join('')
          : '<span class="project-editor-empty-inline">Not assigned to any projects yet.</span>'}
      </div>

      <label class="project-editor-search">
        <span class="project-editor-search-label">Search projects</span>
        <input
          id="project-editor-search-input"
          class="search-input project-editor-search-input"
          type="text"
          value="${this.components.escapeHtml(query)}"
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
    const proposedName = prompt('Project name', initialName);
    const name = proposedName?.trim();
    if (!name) {
      return null;
    }

    return await this.createProject(dashboard, name, autoAssignPageId);
  }

  async createProject(dashboard, name, autoAssignPageId = null) {
    const currentUser = dashboard.getCurrentUser();
    const newProject = await this.api.createProject({
      name,
      owner_user_id: currentUser?.uid || currentUser?.email || 'standalone-user',
      visibility: 'private',
      company_domain: null
    });

    dashboard.projects = [...dashboard.projects, { ...newProject, page_count: newProject.page_count || 0 }];
    if (autoAssignPageId) {
      await this.togglePageProject(dashboard, autoAssignPageId, newProject.id, true);
      dashboard.projectEditorState.query = '';
    } else {
      this.refreshProjectCounts(dashboard);
      dashboard.render();
    }

    return newProject;
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

    if (dashboard.selectedProjectId === projectId) {
      dashboard.selectedProjectId = null;
      dashboard.tagInteractionManager.clearSelection();
      dashboard.discoveryManager.exit();
      dashboard.handleFilterChange();
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
    await dashboard.handleFilterChange();
    this.renderEditor(dashboard);
  }

  getCompanyDomain(dashboard) {
    const currentUser = dashboard.getCurrentUser();
    if (currentUser?.email?.includes('@')) {
      return currentUser.email.split('@')[1];
    }

    return 'airteam.com.au';
  }
}

window.ProjectManager = ProjectManager;
