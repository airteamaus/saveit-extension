import {
  renderProjectEditor,
  renderProjectSidebar
} from './project-manager-renderer.js';

export function focusProjectEditorSearchInput(documentObj = document, query = '') {
  const input = documentObj.getElementById('project-editor-search-input');
  if (!input) {
    return;
  }

  input.focus();
  input.setSelectionRange(query.length, query.length);
}

export function createProjectManagerUi({
  htmlUtils,
  alertFn = (...args) => globalThis.alert?.(...args),
  documentObj = document,
  isProjectsUnavailable,
  getProjectsUnavailableMessage,
  getSelectedProject,
  getProjectPills
}) {
  const renderSidebar = dashboard => {
    const container = documentObj.getElementById('project-sidebar');
    renderProjectSidebar(container, {
      dashboard,
      htmlUtils,
      isProjectsUnavailable,
      getProjectsUnavailableMessage,
      getSelectedProject
    });
  };

  const renderEditor = dashboard => {
    const backdrop = documentObj.getElementById('project-editor-backdrop');
    const dialog = documentObj.getElementById('project-editor-dialog');
    renderProjectEditor(backdrop, dialog, {
      dashboard,
      htmlUtils,
      isProjectsUnavailable,
      getProjectsUnavailableMessage,
      getProjectPills,
      onMissingPage: () => closeEditor(dashboard)
    });
  };

  const openEditor = (dashboard, pageId) => {
    if (isProjectsUnavailable(dashboard)) {
      alertFn(getProjectsUnavailableMessage(dashboard));
      return;
    }

    dashboard.projectEditorState = {
      pageId,
      query: ''
    };
    renderEditor(dashboard);
    focusProjectEditorSearchInput(documentObj);
  };

  const closeEditor = dashboard => {
    dashboard.projectEditorState = {
      pageId: null,
      query: ''
    };
    renderEditor(dashboard);
  };

  const updateEditorQuery = (dashboard, query) => {
    dashboard.projectEditorState = {
      ...(dashboard.projectEditorState || {}),
      query
    };
    renderEditor(dashboard);
    focusProjectEditorSearchInput(documentObj, query);
  };

  return {
    renderSidebar,
    renderEditor,
    openEditor,
    closeEditor,
    updateEditorQuery
  };
}
