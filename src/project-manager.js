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
import { createProjectManagerActions } from './project-manager-actions.js';

class ProjectManager {
  constructor(api, htmlUtils) {
    this.api = api;
    this.htmlUtils = htmlUtils;
    this.actions = createProjectManagerActions({
      api,
      refreshProjectCounts: dashboard => this.refreshProjectCounts(dashboard),
      adjustProjectCount: (dashboard, projectId, delta) => this.adjustProjectCount(dashboard, projectId, delta),
      renderEditor: dashboard => this.renderEditor(dashboard),
      closeEditor: dashboard => this.closeEditor(dashboard),
      getCompanyDomain: dashboard => this.getCompanyDomain(dashboard),
      isProjectsUnavailable: dashboard => this.isProjectsUnavailable(dashboard),
      getProjectsUnavailableMessage: dashboard => this.getProjectsUnavailableMessage(dashboard)
    });
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
    return this.actions.loadProjects(dashboard);
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
    return this.actions.promptCreateProject(dashboard, initialName, autoAssignPageId);
  }

  async createProject(dashboard, name, autoAssignPageId = null) {
    return this.actions.createProject(dashboard, name, autoAssignPageId);
  }

  async renameProject(dashboard, projectId) {
    return this.actions.renameProject(dashboard, projectId);
  }

  async toggleProjectVisibility(dashboard, projectId) {
    return this.actions.toggleProjectVisibility(dashboard, projectId);
  }

  async archiveProject(dashboard, projectId) {
    return this.actions.archiveProject(dashboard, projectId);
  }

  async selectProject(dashboard, projectId) {
    return this.actions.selectProject(dashboard, projectId);
  }

  async togglePageProject(dashboard, pageId, projectId, shouldAssign) {
    return this.actions.togglePageProject(dashboard, pageId, projectId, shouldAssign);
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
