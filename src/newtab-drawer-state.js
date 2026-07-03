import { PINNED_PAGES_SCOPE_ID } from './project-manager-state.js';

// Render windowing for the All-pages browse view. Only this many cards render
// on first paint; scrolling grows the window by RENDER_LIMIT_INCREMENT.
export const INITIAL_RENDER_LIMIT = 10;
export const RENDER_LIMIT_INCREMENT = 100;

export function createInitialDrawerState() {
  return {
    hasInitialized: false,
    isLoading: false,
    // 'home' (sparse: recent + topics) shows on initial idle load; any intent
    // (search, topic pill, scope select, Browse all) flips to 'browse'.
    view: 'home',
    query: '',
    currentFilter: {
      search: '',
      projectId: null,
      cursor: null
    },
    pages: [],
    allPages: [],
    // Cap on how many of `pages` are rendered to the DOM. Grown on scroll;
    // reset to INITIAL_RENDER_LIMIT whenever the scope or query changes.
    renderLimit: INITIAL_RENDER_LIMIT,
    loadedProjectPages: null,
    projects: [],
    projectsLoading: false,
    projectsAvailable: true,
    projectsUnavailableMessage: '',
    selectedProjectId: null,
    domains: [],
    selectedDomainId: null,
    projectEditorState: {
      pageId: null,
      query: ''
    },
    editingPageId: null,
    savingEditPageId: null,
    total: null,
    allItemsTotal: null,
    requestId: 0,
    semanticResults: [],
    semanticQuery: '',
    semanticLoading: false,
    semanticRequestId: 0,
    // Post-login full cache warm-up phase. This is the single source of truth
    // for "the warming UI owns the drawer right now." While true, the dispatcher
    // renders the warming pane and never cards/empty/dog — eliminating the race
    // where loadDrawerBasePages paints cards mid-warm and the warming subscriber
    // tramples them. Set by the subscriber when the warm-up is active; cleared on
    // completion (or by resetDrawerState on sign-out). The clamp fields persist
    // the warming bar's monotonic progress across renders; warmUpProgress holds
    // the last computed {percent, indeterminate} for the dispatcher to read.
    warmUpInProgress: false,
    warmUpProgress: { percent: 0, indeterminate: true },
    warmUpLastPercent: 0,
    warmUpDeterminate: false
  };
}

// Computes the warming progress bar value from the store snapshot, persisting
// the clamp state on `state` so the bar never decreases across renders. Once a
// determinate reading has been shown, it never goes back below it; an unknown
// total keeps the last known % but caps it at 99 (so an indeterminate server
// response can't lock the bar at 100 before completion).
//
// `complete` forces 100% — used by the subscriber on the terminal
// {prefetch, idle, complete} emit so the bar always fills at the end.
export function computeWarmingProgress(snapshot, state, { complete = false } = {}) {
  if (complete) {
    state.warmUpDeterminate = true;
    state.warmUpLastPercent = 100;
    return { percent: 100, indeterminate: false };
  }

  const total = typeof snapshot?.total === 'number' && snapshot.total > 0
    ? snapshot.total
    : null;
  const loaded = Array.isArray(snapshot?.allPages) ? snapshot.allPages.length : 0;

  if (total == null) {
    return {
      percent: state.warmUpDeterminate ? Math.min(state.warmUpLastPercent, 99) : 0,
      indeterminate: !state.warmUpDeterminate
    };
  }

  const computed = total > 0 ? Math.min(100, Math.round((loaded / total) * 100)) : 0;
  const percent = state.warmUpDeterminate ? Math.max(state.warmUpLastPercent, computed) : computed;
  state.warmUpDeterminate = true;
  state.warmUpLastPercent = percent;
  return { percent, indeterminate: false };
}

// Returns true when the store snapshot reflects the terminal warm-up emit. The
// warm-up window itself is bounded by state.warmUpInProgress (set by the
// subscriber); this predicate only detects the completion transition that
// clears it.
export function isWarmUpComplete(snapshot) {
  return snapshot?.refreshState?.phase === 'prefetch'
    && snapshot?.refreshState?.status === 'idle'
    && snapshot?.refreshState?.reason === 'complete';
}

export function getDrawerSearchableText(page = {}) {
  const fields = [
    page.title,
    page.url,
    page.domain,
    page.description,
    page.ai_summary_brief,
    page.primary_classification_label,
    ...(page.manual_tags || []),
    ...(page.classifications || []).map(classification => classification.label)
  ];

  return fields
    .filter(Boolean)
    .join(' ')
    .toLowerCase();
}

export function applyDrawerFilters({
  state,
  projectManager,
  savedPagesView,
  query = state.query
}) {
  const trimmedQuery = query.trim();
  state.query = trimmedQuery;
  state.currentFilter.search = trimmedQuery;

  // When a project or domain scope is active, use the scoped page set
  // (loadedProjectPages holds domain pages too). Otherwise use all pages.
  const hasScopedSource = Array.isArray(state.loadedProjectPages)
    && ((state.selectedProjectId && state.selectedProjectId !== PINNED_PAGES_SCOPE_ID)
      || state.selectedDomainId);
  const scopeSourcePages = hasScopedSource
    ? state.loadedProjectPages
    : state.allPages;
  const scopedPages = projectManager.getScopedPages(savedPagesView, scopeSourcePages);
  state.total = scopedPages.length;

  if (!trimmedQuery) {
    state.pages = [...scopedPages];
    return;
  }

  const loweredQuery = trimmedQuery.toLowerCase();
  state.pages = scopedPages.filter(page => getDrawerSearchableText(page).includes(loweredQuery));
}

export function syncDrawerStateFromStore({
  snapshot,
  state,
  savedPagesView,
  projectManager,
  applyDrawerFilters,
  renderDrawerResults,
  query = state.query,
  render = state.hasInitialized
}) {
  state.allPages = snapshot.allPages || [];
  state.loadedProjectPages = null;
  state.allItemsTotal = Math.max(
    typeof snapshot.total === 'number' ? snapshot.total : 0,
    state.allPages.length
  );
  state.total = state.allItemsTotal;
  projectManager.refreshProjectCounts(savedPagesView);
  applyDrawerFilters(query);

  if (render) {
    renderDrawerResults();
  }
}

export function syncProjectsStateFromStore({
  snapshot,
  state,
  savedPagesView,
  projectManager,
  renderDrawerChrome,
  render = state.hasInitialized
}) {
  state.projects = snapshot.projects || snapshot.allPages || [];
  state.projectsAvailable = true;
  state.projectsUnavailableMessage = '';
  projectManager.refreshProjectCounts(savedPagesView);

  if (render) {
    renderDrawerChrome();
  }
}
