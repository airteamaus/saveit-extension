import { PINNED_PAGES_SCOPE_ID } from './project-manager-state.js';

export function createInitialDrawerState() {
  return {
    hasInitialized: false,
    isLoading: false,
    query: '',
    currentFilter: {
      search: '',
      projectId: PINNED_PAGES_SCOPE_ID,
      cursor: null
    },
    pages: [],
    allPages: [],
    loadedProjectPages: null,
    projects: [],
    projectsLoading: false,
    projectsAvailable: true,
    projectsUnavailableMessage: '',
    selectedProjectId: PINNED_PAGES_SCOPE_ID,
    projectEditorState: {
      pageId: null,
      query: ''
    },
    editingPageId: null,
    savingEditPageId: null,
    total: null,
    allItemsTotal: null,
    requestId: 0
  };
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

  const scopeSourcePages = Array.isArray(state.loadedProjectPages) && state.selectedProjectId && state.selectedProjectId !== PINNED_PAGES_SCOPE_ID
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
