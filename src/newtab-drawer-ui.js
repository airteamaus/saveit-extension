import { createDrawerRenderer } from './newtab-drawer-renderer.js';
import { getRecentPages, getTopicCounts } from './newtab-home.js';
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
    // Render-window cap (All-pages browse view only); grown on scroll. Scoped
    // views (project/domain) are not windowed, so they bypass the cap.
    getRenderLimit: () => {
      const hasScope = Boolean(state.selectedProjectId) || Boolean(state.selectedDomainId);
      return hasScope ? Number.POSITIVE_INFINITY : state.renderLimit;
    },
    renderChrome: renderDrawerChrome,
    getProjectPills: (page) => getDrawerProjectPills(page),
    isProjectsUnavailable: () => getSavedPagesViewOrThrow().projectsAvailable === false,
    getProjectScopeLabel: () =>
      getDrawerProjectScopeLabel(projectManager, getSavedPagesViewOrThrow())
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

  function renderWarmingState(options = {}) {
    drawerRenderer.renderWarmingState(options);
  }

  function renderResults() {
    if (!resultsContainer) {
      return;
    }

    // The warm-up phase owns the drawer exclusively. While a post-login full
    // cache warm-up is in progress, never render cards/empty/dog — only the
    // warming pane. This is the single render authority: both loadDrawerBasePages
    // and the warming subscriber route through here, so they can never paint
    // conflicting phases (the race that caused cards-flash-then-dog-stuck).
    if (state.warmUpInProgress) {
      drawerRenderer.renderWarmingState(state.warmUpProgress);
      return;
    }

    const trimmedQuery = (state.query || '').trim();
    const hasQuery = Boolean(trimmedQuery);

    // While a semantic search is loading, the dog takes over the full pane:
    // hide all saved-page cards and show only the centered illustration.
    if (state.semanticLoading) {
      drawerRenderer.renderSemanticLoadingState();
      return;
    }

    // Local saved-page results are a subset of the semantic matches, so once
    // semantic results return they own the full pane — no separate local card
    // list. (A query always yields at least the card the tag was clicked from.)
    if (hasQuery) {
      if ((state.semanticResults?.length ?? 0) > 0) {
        drawerRenderer.clearPagesSection();
        drawerRenderer.renderSemanticResults(state.semanticResults, {
          loading: false,
          query: state.semanticQuery
        });
        return;
      }

      // Query resolved with no semantic matches at all.
      drawerRenderer.clearPagesSection();
      drawerRenderer.renderSemanticResults([], {
        loading: false,
        query: state.semanticQuery
      });
      return;
    }

    // No query: show the sparse home view when idle (no scope selected), or
    // fall through to the browse list once the user takes any intent action.
    const hasScope = Boolean(state.selectedProjectId) || Boolean(state.selectedDomainId);
    if (state.view === 'home' && !hasScope && state.allPages.length) {
      drawerRenderer.renderHomeView({
        recentPages: getRecentPages(state.allPages),
        topics: getTopicCounts(state.allPages)
      });
      return;
    }

    // No query with a scope selected, or browse mode: the saved-page list.
    if (!state.pages.length) {
      // A project always contains at least one page, so an empty list while
      // loading means the API fetch is still in flight — show the digging dog
      // rather than a premature "no pages" empty state.
      if (state.isLoading) {
        drawerRenderer.renderSemanticLoadingState();
        return;
      }
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
    renderSignInState,
    renderWarmingState
  };
}
