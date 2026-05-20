export function createInitialDrawerState() {
  return {
    hasInitialized: false,
    isLoading: false,
    query: '',
    currentFilter: {
      search: '',
      projectId: null,
      cursor: null
    },
    pages: [],
    allPages: [],
    projects: [],
    projectsLoading: false,
    projectsAvailable: true,
    projectsUnavailableMessage: '',
    selectedProjectId: null,
    projectEditorState: {
      pageId: null,
      query: ''
    },
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

  const scopedPages = projectManager.getScopedPages(savedPagesView, state.allPages);
  state.total = state.selectedProjectId
    ? scopedPages.length
    : (typeof state.allItemsTotal === 'number' ? state.allItemsTotal : null);

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
  state.total = typeof snapshot.total === 'number' ? snapshot.total : state.allPages.length;
  if (!state.selectedProjectId) {
    state.allItemsTotal = state.total;
  }
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
