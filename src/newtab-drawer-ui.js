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
    const semanticActive = state.semanticLoading || (state.semanticResults?.length ?? 0) > 0;

    // With a query (or semantic results in flight), the saved-page list may
    // be empty while semantic matches are still loading. In that case keep the
    // pane so the semantic section can render, rather than swapping in the
    // full-container empty state that would hide the loading indicator.
    if (!state.pages.length && !hasQuery && !semanticActive) {
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
