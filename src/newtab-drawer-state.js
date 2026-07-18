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

// --- Single mutation owner -------------------------------------------------
//
// Every write to the drawer `state` bag MUST go through one of the functions
// below. This module is the complete answer to "who sets a drawer state field?"
// — keeping all writes here means a render path can be followed without holding
// six files of mutation in your head, and the races that used to require
// long narrating comments (warming UI, hasInitialized resets) now have one
// search location.
//
// The bag stays a plain readable object: functions take `state` as their first
// arg and mutate it in place. Normalization that the savedPagesView proxy used
// to apply (array-coerce, `|| null`, the 'browse'|'home' clamp) lives here now,
// so direct-writers and proxy-writers share one path.

export function resetDrawerState(state) {
  Object.assign(state, createInitialDrawerState());
}

// --- Load lifecycle --------------------------------------------------------

export function setDrawerLoading(state, value) {
  state.isLoading = value === true;
}

// Monotonic stale-guard token. Returns the new id so callers can capture it
// before the await that may be superseded (the standard ++write/===read guard).
export function nextDrawerRequestId(state) {
  state.requestId += 1;
  return state.requestId;
}

export function setDrawerInitialized(state, value) {
  state.hasInitialized = value === true;
}

// --- Pages -----------------------------------------------------------------

export function setDrawerAllPages(state, pages) {
  state.allPages = Array.isArray(pages) ? pages : [];
}

export function setDrawerRenderedPages(state, pages) {
  state.pages = Array.isArray(pages) ? pages : [];
}

// null clears the scope-source overlay (back to the All-pages view); an array
// installs it for a project/domain scope. Stored on the same field for both.
export function setDrawerLoadedScopePages(state, pages) {
  state.loadedProjectPages = Array.isArray(pages) ? pages : null;
}

// Apply a single updater to the page collections the drawer renders from. Used
// by optimistic edit/pin/delete flows that must update the in-memory copy in
// lockstep. Returns the updated page for convenience.
export function updateDrawerPageCollections(state, id, updater) {
  if (typeof updater !== 'function') return null;
  const apply = (page) => (page.id === id ? updater(page) : page);
  state.allPages = state.allPages.map(apply);
  if (Array.isArray(state.loadedProjectPages)) {
    state.loadedProjectPages = state.loadedProjectPages.map(apply);
  }
  state.pages = state.pages.map(apply);
  return state.allPages.find(page => page.id === id) || null;
}

// --- Projects --------------------------------------------------------------

export function setDrawerProjects(state, projects) {
  state.projects = Array.isArray(projects) ? projects : [];
}

export function setDrawerProjectsLoading(state, value) {
  state.projectsLoading = value === true;
}

export function setDrawerProjectsAvailability(state, { available, message } = {}) {
  if (available !== undefined) state.projectsAvailable = available !== false;
  if (message !== undefined) state.projectsUnavailableMessage = message || '';
}

// --- Scope selection -------------------------------------------------------

export function selectDrawerProject(state, projectId) {
  state.selectedProjectId = projectId || null;
}

export function selectDrawerDomain(state, domainId) {
  state.selectedDomainId = domainId || null;
}

export function setDrawerView(state, value) {
  state.view = value === 'browse' ? 'browse' : 'home';
}

// --- Edit lifecycle --------------------------------------------------------

export function setDrawerEditingPage(state, id) {
  state.editingPageId = id || null;
}

export function setDrawerSavingEdit(state, id) {
  state.savingEditPageId = id || null;
}

// --- Render window ---------------------------------------------------------

export function resetDrawerRenderLimit(state) {
  state.renderLimit = INITIAL_RENDER_LIMIT;
}

export function growDrawerRenderLimit(state, increment = RENDER_LIMIT_INCREMENT) {
  state.renderLimit += increment;
}

// --- Semantic search -------------------------------------------------------

export function nextDrawerSemanticRequestId(state) {
  state.semanticRequestId += 1;
  return state.semanticRequestId;
}

export function setDrawerSemantic(state, { results, query, loading } = {}) {
  if (results !== undefined) state.semanticResults = Array.isArray(results) ? results : [];
  if (query !== undefined) state.semanticQuery = query;
  if (loading !== undefined) state.semanticLoading = loading === true;
}

// --- Domains ---------------------------------------------------------------

export function setDrawerDomains(state, domains) {
  state.domains = Array.isArray(domains) ? domains : [];
}

// --- Warming ---------------------------------------------------------------
// The most heavily cross-closure cluster: armed by loadDrawerBasePages, driven
// by the store subscriber, cleared on completion or sign-out. Concentrating
// these writes here is the direct fix for the trampling race the long comments
// used to narrate.

export function beginDrawerWarming(state, progress) {
  state.warmUpInProgress = true;
  if (progress !== undefined) {
    state.warmUpProgress = progress;
  } else {
    state.warmUpProgress = { percent: 0, indeterminate: true };
  }
}

export function updateDrawerWarming(state, progress) {
  state.warmUpInProgress = true;
  if (progress !== undefined) {
    state.warmUpProgress = progress;
  }
}

export function clearDrawerWarming(state) {
  // Clear the flag and the clamp bookkeeping, but leave warmUpProgress at its
  // last value. Both call sites (the completion timer and the drawer-closed
  // drop) want the bar to hold its final reading — the completion path shows
  // 100% briefly before the dispatcher switches to cards, and a full reset
  // (including progress) only happens on sign-out via resetDrawerState.
  state.warmUpInProgress = false;
  state.warmUpLastPercent = 0;
  state.warmUpDeterminate = false;
}

// --- Totals ----------------------------------------------------------------
// Normally derived inside applyDrawerFilters/syncDrawerStateFromStore, but the
// savedPagesView proxy exposes totalPages/allItemsTotal setters (used by some
// project-manager paths) so they need a home here too to keep the invariant.

export function setDrawerTotal(state, value) {
  state.total = value;
}

export function setDrawerAllItemsTotal(state, value) {
  state.allItemsTotal = value;
}

// --- Editor + filter -------------------------------------------------------
// These had no proxy setter previously, so nested writes
// (state.currentFilter.projectId = x) bypassed normalization. Exposing them as
// first-class mutations keeps the "one write surface" invariant honest.

function getDefaultProjectEditorState() {
  return { pageId: null, query: '' };
}

export function setDrawerProjectEditorState(state, value) {
  state.projectEditorState = value || getDefaultProjectEditorState();
}

export function setDrawerCurrentFilter(state, { search, projectId, cursor } = {}) {
  if (!state.currentFilter || typeof state.currentFilter !== 'object') {
    state.currentFilter = { search: '', projectId: null, cursor: null };
  }
  if (search !== undefined) state.currentFilter.search = search;
  if (projectId !== undefined) state.currentFilter.projectId = projectId || null;
  if (cursor !== undefined) state.currentFilter.cursor = cursor || null;
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

// Note: computeWarmingProgress persists its clamp side-effects directly on the
// warming fields. Those reads/writes are intrinsic to the clamp math (the
// computed value depends on the prior value), so they stay inline rather than
// threading through updateDrawerWarming — which would require the prior value
// before computing the next, defeating the single-assignment intent.

// Returns true when the store snapshot reflects a terminal idle state — i.e.
// the store has finished whatever work the warm-up was waiting on.
//
// Originally this only recognized prefetchAllPages' terminal emit
// ({prefetch, idle, complete}). But hydrate() has two fast paths that bypass
// prefetchAllPages entirely: a warm-cache hit, and an API response marked
// fromCache. Both delegate to refreshInitial(), whose terminal states are
// {idle, 'up-to-date', 'no-updates'} or {idle, 'incremental-refresh', 'applied'}.
// Recognizing only the prefetch terminal left the warming bar pinned at 100%
// on the common "log out, log back in, nothing changed" path, because the
// completion timer that clears warmUpInProgress was never armed.
//
// Completion requires `status === 'idle'` AND a non-null `phase` naming the
// operation that finished (prefetch, up-to-date, incremental-refresh, etc.).
// Two idle emits must NOT count as completion:
//   1. phase 'load-more' — loadMore() emits {idle, 'load-more', 'appended-pages'}
//      after EACH batch resolves while the prefetch loop is still running.
//      Treating that inter-batch idle as terminal forced the bar to 100% on the
//      first batch (e.g. 50/90) instead of letting it climb per-batch.
//   2. phase null — that is the store's pre-fetch resting state during hydrate's
//      synchronous setup window (before prefetchAllPages has emitted anything).
//      The total may already be seeded from the warm cache, so a total>0 check
//      can't distinguish it from a real completion; only the absent phase does.
// Non-idle states (loading/checking/error) leave the bar in progress; error is
// handled separately by the dispatcher's error branch.
export function isWarmUpComplete(snapshot) {
  const refreshState = snapshot?.refreshState;
  if (refreshState?.status !== 'idle') {
    return false;
  }
  const phase = refreshState?.phase;
  return phase != null && phase !== 'load-more';
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
  setDrawerCurrentFilter(state, { search: trimmedQuery });

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
    setDrawerRenderedPages(state, [...scopedPages]);
    return;
  }

  const loweredQuery = trimmedQuery.toLowerCase();
  setDrawerRenderedPages(state, scopedPages.filter(page => getDrawerSearchableText(page).includes(loweredQuery)));
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
  setDrawerAllPages(state, snapshot.allPages || []);
  setDrawerLoadedScopePages(state, null);
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
  setDrawerProjects(state, snapshot.projects || snapshot.allPages || []);
  setDrawerProjectsAvailability(state, { available: true, message: '' });
  projectManager.refreshProjectCounts(savedPagesView);

  if (render) {
    renderDrawerChrome();
  }
}
