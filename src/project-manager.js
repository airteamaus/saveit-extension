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
} from './project-manager-renderer.js';
import { createProjectManagerActions } from './project-manager-actions.js';
import { createProjectManagerUi } from './project-manager-ui.js';

class ProjectManager {
  constructor(api, htmlUtils) {
    this.api = api;
    this.htmlUtils = htmlUtils;
    this.ui = createProjectManagerUi({
      htmlUtils,
      isProjectsUnavailable: dashboard => this.isProjectsUnavailable(dashboard),
      getProjectsUnavailableMessage: dashboard => this.getProjectsUnavailableMessage(dashboard),
      getSelectedProject: dashboard => this.getSelectedProject(dashboard),
      getProjectPills: (page, dashboard) => this.getProjectPills(page, dashboard)
    });
    this.actions = createProjectManagerActions({
      api,
      refreshProjectCounts: dashboard => this.refreshProjectCounts(dashboard),
      adjustProjectCount: (dashboard, projectId, delta) => this.adjustProjectCount(dashboard, projectId, delta),
      renderEditor: dashboard => this.ui.renderEditor(dashboard),
      closeEditor: dashboard => this.ui.closeEditor(dashboard),
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
    this.ui.renderSidebar(dashboard);
  }

  renderEditor(dashboard) {
    this.ui.renderEditor(dashboard);
  }

  openEditor(dashboard, pageId) {
    this.ui.openEditor(dashboard, pageId);
  }

  closeEditor(dashboard) {
    this.ui.closeEditor(dashboard);
  }

  updateEditorQuery(dashboard, query) {
    this.ui.updateEditorQuery(dashboard, query);
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
