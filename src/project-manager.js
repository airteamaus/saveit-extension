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
import {
  getProjectActionIcon,
  renderProjectEditor,
  renderProjectSidebar
} from './project-manager-renderer.js';

class ProjectManager {
  constructor(api, htmlUtils) {
    this.api = api;
    this.htmlUtils = htmlUtils;
  }

  getProjectActionIcon(action) {
    return getProjectActionIcon(action);
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
    renderProjectSidebar(container, {
      dashboard,
      htmlUtils: this.htmlUtils,
      isProjectsUnavailable: currentDashboard => this.isProjectsUnavailable(currentDashboard),
      getProjectsUnavailableMessage: currentDashboard => this.getProjectsUnavailableMessage(currentDashboard),
      getSelectedProject: currentDashboard => this.getSelectedProject(currentDashboard)
    });
  }

  renderEditor(dashboard) {
    const backdrop = document.getElementById('project-editor-backdrop');
    const dialog = document.getElementById('project-editor-dialog');
    renderProjectEditor(backdrop, dialog, {
      dashboard,
      htmlUtils: this.htmlUtils,
      isProjectsUnavailable: currentDashboard => this.isProjectsUnavailable(currentDashboard),
      getProjectsUnavailableMessage: currentDashboard => this.getProjectsUnavailableMessage(currentDashboard),
      getProjectPills: (page, currentDashboard) => this.getProjectPills(page, currentDashboard),
      onMissingPage: () => this.closeEditor(dashboard)
    });
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
