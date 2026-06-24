import { createDrawerRenderer } from './newtab-drawer-renderer.js';
import { PINNED_PAGES_SCOPE_ID } from './project-manager-state.js';

export function getDrawerProjectScopeLabel(projectManager, savedPagesView) {
  if (savedPagesView.selectedProjectId === PINNED_PAGES_SCOPE_ID) {
    return 'Pinned';
  }

  const selectedProject = projectManager.getSelectedProject(savedPagesView);
  return selectedProject ? selectedProject.name : 'All pages';
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
    getEditingPageId: () => state.editingPageId,
    getSavingEditPageId: () => state.savingEditPageId,
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
    if (!resultsContainer) {
      return;
    }

    const trimmedQuery = (state.query || '').trim();
    const hasQuery = Boolean(trimmedQuery);

    // With a query, the saved-page list may be empty while semantic results
    // still have matches. In that case keep the pane (so the semantic section
    // can render) rather than swapping in the full-container empty state.
    if (!state.pages.length && !hasQuery) {
      renderEmptyState(state.query);
      return;
    }

    drawerRenderer.renderResults(state.pages);
    drawerRenderer.renderSemanticResults(state.semanticResults, {
      loading: state.semanticLoading,
      query: state.semanticQuery
    });
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
