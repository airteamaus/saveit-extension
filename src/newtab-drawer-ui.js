import { createDrawerRenderer } from './newtab-drawer-renderer.js';

export function getDrawerProjectScopeLabel(projectManager, savedPagesView) {
  const selectedProject = projectManager.getSelectedProject(savedPagesView);
  return selectedProject ? selectedProject.name : 'All saved items';
}

export function createDrawerUiController({
  state,
  projectManager,
  resultsContainer,
  getSavedPagesView,
  documentObj = document
}) {
  function getSavedPagesViewOrThrow() {
    return getSavedPagesView();
  }

  function getDrawerProjectPills(page) {
    return projectManager.getProjectPills(page, getSavedPagesViewOrThrow());
  }

  function renderProjectSidebar() {
    projectManager.renderSidebar(getSavedPagesViewOrThrow());
  }

  function renderProjectEditor() {
    projectManager.renderEditor(getSavedPagesViewOrThrow());
  }

  function renderDrawerChrome() {
    renderProjectSidebar();
    renderProjectEditor();
  }

  const drawerRenderer = createDrawerRenderer({
    documentObj,
    resultsContainer,
    renderChrome: renderDrawerChrome,
    getProjectPills: page => getDrawerProjectPills(page),
    isProjectsUnavailable: () => getSavedPagesViewOrThrow().projectsAvailable === false,
    getProjectScopeLabel: () => getDrawerProjectScopeLabel(projectManager, getSavedPagesViewOrThrow())
  });

  function renderLoadingState(message = 'Loading saved pages...') {
    drawerRenderer.renderLoadingState(message);
  }

  function renderErrorState(message) {
    drawerRenderer.renderErrorState(message);
  }

  function renderEmptyState(query = '') {
    drawerRenderer.renderEmptyState(query, {
      hasSelectedProject: Boolean(state.selectedProjectId)
    });
  }

  function renderSignInState() {
    drawerRenderer.renderSignInState();
  }

  function renderResults() {
    if (!state.pages.length) {
      renderEmptyState(state.query);
      return;
    }

    if (!resultsContainer) {
      return;
    }

    drawerRenderer.renderResults(state.pages);
  }

  function refreshDrawerCard(pageId) {
    drawerRenderer.refreshCard(pageId, state.pages, state.query, {
      onMissingPage: () => {
        if (!state.pages.length) {
          renderEmptyState(state.query);
        }
      }
    });
  }

  return {
    refreshDrawerCard,
    renderDrawerChrome,
    renderEmptyState,
    renderErrorState,
    renderLoadingState,
    renderProjectEditor,
    renderProjectSidebar,
    renderResults,
    renderSignInState
  };
}
