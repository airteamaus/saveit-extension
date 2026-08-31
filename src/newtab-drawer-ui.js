import { createDrawerRenderer } from './newtab-drawer-renderer.js';
import { getPinnedPages } from './newtab-home.js';
import { formatDeskDateline } from './newtab-shared.js';
import { PINNED_PAGES_SCOPE_ID } from './project-manager-state.js';

export function getDrawerProjectScopeLabel(projectManager, savedPagesView) {
  if (savedPagesView.selectedProjectId === PINNED_PAGES_SCOPE_ID) {
    return 'Pinned';
  }

  const selectedProject = projectManager.getSelectedProject(savedPagesView);
  return selectedProject ? selectedProject.name : 'All pages';
}

// Display-order toggle for the index. 'newest' is the server's order (the
// warm cache is keyed to it); 'oldest' reverses by saved_at client-side at
// render time only, so the store's cursor pipeline is untouched.
export function sortPagesForIndex(pages, indexSort) {
  if (indexSort !== 'oldest' || !Array.isArray(pages)) {
    return pages;
  }

  return [...pages].sort((a, b) =>
    String(a.saved_at || '').localeCompare(String(b.saved_at || ''))
  );
}

export function createDrawerUiController({
  state,
  projectManager,
  resultsContainer,
  launchStripContainer,
  datelineEl,
  getSavedPagesView,
  documentObj = document,
  feedController = null
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
    updateDateline();
  }

  // The dateline rides the chrome render so it refreshes with the data it
  // counts. Signed-out renders keep the date alone (count of zero).
  function updateDateline() {
    if (!datelineEl) {
      return;
    }
    const allPages = Array.isArray(state.allPages) ? state.allPages : [];
    datelineEl.textContent = formatDeskDateline(new Date(), allPages.length);
  }

  const drawerRenderer = createDrawerRenderer({
    documentObj,
    resultsContainer,
    launchStripContainer,
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
      drawerRenderer.clearLaunchStrip();
      drawerRenderer.renderWarmingState(state.warmUpProgress);
      return;
    }

    const trimmedQuery = (state.query || '').trim();
    const hasQuery = Boolean(trimmedQuery);

    // Any drawer activity (search, project/domain scope) retires the feed
    // surface until the desk is idle again.
    if (hasQuery || state.selectedProjectId || state.selectedDomainId) {
      feedController?.hide();
    }

    // While a semantic search is loading, the dog takes over the full pane:
    // hide all saved-page cards and show only the centered illustration.
    if (state.semanticLoading) {
      drawerRenderer.clearLaunchStrip();
      drawerRenderer.renderSemanticLoadingState();
      return;
    }

    // Local saved-page results are a subset of the semantic matches, so once
    // semantic results return they own the full pane — no separate local card
    // list. (A query always yields at least the card the tag was clicked from.)
    if (hasQuery) {
      drawerRenderer.clearLaunchStrip();
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

    // No query: render the browse list as the default. When idle (no scope
    // selected) and the user has pinned pages, show the Pinned shelf as a
    // header row above the list. Any query or scope hides the shelf.
    const hasScope = Boolean(state.selectedProjectId) || Boolean(state.selectedDomainId);
    const allPages = Array.isArray(state.allPages) ? state.allPages : [];
    const pinnedPages = !hasScope && allPages.length ? getPinnedPages(allPages) : [];
    if (pinnedPages.length) {
      drawerRenderer.renderLaunchStrip(pinnedPages);
    } else {
      drawerRenderer.clearLaunchStrip();
    }

    // Idle desk: the org feed owns the index. renderIdle() returning false
    // means the feed is unavailable (old backend / signed out / not loaded)
    // — fall through to the personal list exactly as before the feed.
    if (!hasScope && feedController?.renderIdle()) {
      // Every other render branch paints the chrome (sidebar/dateline) as a
      // side effect of drawerRenderer's renders; the feed renders its own
      // rows, so paint the chrome explicitly — otherwise the sidebar never
      // shows loaded projects when the feed owns the idle desk.
      renderDrawerChrome();
      return;
    }

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

    // The launch strip already shows pinned pages above the desk; repeating
    // them in the index doubles every pinned save. Scoped/searched lists keep
    // them (the strip is hidden there, so the list is their only surface).
    const indexPages = hasScope
      ? sortPagesForIndex(state.pages, state.indexSort)
      : sortPagesForIndex(state.pages, state.indexSort).filter((page) => !page.pinned);
    drawerRenderer.renderResults(indexPages);
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
