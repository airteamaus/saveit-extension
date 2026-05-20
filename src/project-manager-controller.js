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
import { getProjectActionIcon } from './project-manager-renderer.js';
import { createProjectManagerActions } from './project-manager-actions.js';
import { createProjectManagerUi } from './project-manager-ui.js';

export function createProjectManagerController({
  api,
  htmlUtils,
  alertFn = (...args) => globalThis.alert?.(...args),
  documentObj = document
}) {
  const controller = {
    api,
    htmlUtils,
    getProjectActionIcon(action) {
      return getProjectActionIcon(action);
    },
    isProjectsUnavailable(dashboard) {
      return isProjectsUnavailable(dashboard);
    },
    getProjectsUnavailableMessage(dashboard) {
      return getProjectsUnavailableMessage(dashboard);
    },
    getSelectedProject(dashboard) {
      return getSelectedProject(dashboard);
    },
    getScopedPages(dashboard, pages) {
      return getScopedPages(dashboard, pages);
    },
    refreshProjectCounts(dashboard) {
      refreshProjectCounts(dashboard);
    },
    adjustProjectCount(dashboard, projectId, delta) {
      adjustProjectCount(dashboard, projectId, delta);
    },
    getStatsTotal(dashboard) {
      return getStatsTotal(dashboard);
    },
    getProjectMap(dashboard) {
      return getProjectMap(dashboard);
    },
    getProjectPills(page, dashboard) {
      return getProjectPills(page, dashboard);
    },
    getCompanyDomain(dashboard) {
      return getCompanyDomain(dashboard);
    }
  };

  const ui = createProjectManagerUi({
    htmlUtils,
    alertFn,
    documentObj,
    isProjectsUnavailable: dashboard => controller.isProjectsUnavailable(dashboard),
    getProjectsUnavailableMessage: dashboard => controller.getProjectsUnavailableMessage(dashboard),
    getSelectedProject: dashboard => controller.getSelectedProject(dashboard),
    getProjectPills: (page, dashboard) => controller.getProjectPills(page, dashboard)
  });
  const actions = createProjectManagerActions({
    api,
    alertFn,
    refreshProjectCounts: dashboard => controller.refreshProjectCounts(dashboard),
    adjustProjectCount: (dashboard, projectId, delta) => controller.adjustProjectCount(dashboard, projectId, delta),
    renderEditor: dashboard => ui.renderEditor(dashboard),
    closeEditor: dashboard => ui.closeEditor(dashboard),
    getCompanyDomain: dashboard => controller.getCompanyDomain(dashboard),
    isProjectsUnavailable: dashboard => controller.isProjectsUnavailable(dashboard),
    getProjectsUnavailableMessage: dashboard => controller.getProjectsUnavailableMessage(dashboard)
  });

  return Object.assign(controller, {
    renderSidebar(dashboard) {
      ui.renderSidebar(dashboard);
    },
    renderEditor(dashboard) {
      ui.renderEditor(dashboard);
    },
    openEditor(dashboard, pageId) {
      ui.openEditor(dashboard, pageId);
    },
    closeEditor(dashboard) {
      ui.closeEditor(dashboard);
    },
    updateEditorQuery(dashboard, query) {
      ui.updateEditorQuery(dashboard, query);
    },
    async loadProjects(dashboard) {
      return actions.loadProjects(dashboard);
    },
    async promptCreateProject(dashboard, initialName = '', autoAssignPageId = null) {
      return actions.promptCreateProject(dashboard, initialName, autoAssignPageId);
    },
    async createProject(dashboard, name, autoAssignPageId = null) {
      return actions.createProject(dashboard, name, autoAssignPageId);
    },
    async renameProject(dashboard, projectId) {
      return actions.renameProject(dashboard, projectId);
    },
    async toggleProjectVisibility(dashboard, projectId) {
      return actions.toggleProjectVisibility(dashboard, projectId);
    },
    async archiveProject(dashboard, projectId) {
      return actions.archiveProject(dashboard, projectId);
    },
    async selectProject(dashboard, projectId) {
      return actions.selectProject(dashboard, projectId);
    },
    async togglePageProject(dashboard, pageId, projectId, shouldAssign) {
      return actions.togglePageProject(dashboard, pageId, projectId, shouldAssign);
    }
  });
}
