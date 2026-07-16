import { createDrawerDataController } from './newtab-drawer-data.js';
import {
  createDrawerFiltersApplier,
  createDrawerStateSyncHelpers,
  createSavedPagesTotalNotifier,
  getDrawerCurrentUser
} from './newtab-drawer-coordination.js';
import { initSavedPagesDrawerEvents } from './newtab-drawer-events.js';
import { createDrawerShellController } from './newtab-drawer-shell.js';
import { createDrawerSyncCoordinator } from './newtab-drawer-sync.js';
import { createInitialDrawerState, resetDrawerState, setDrawerInitialized } from './newtab-drawer-state.js';
import { PINNED_PAGES_SCOPE_ID } from './project-manager-state.js';
import { createDrawerUiController } from './newtab-drawer-ui.js';
import { createSavedPagesView } from './newtab-drawer-view.js';

export function createSavedPagesDrawerController({
  api,
  savedPagesStore,
  projectsStore,
  projectManager,
  elements,
  onSavedPagesTotalChange,
  refreshFavorites,
  // Optional toast callback for transient failure feedback within the drawer.
  notify,
  windowObj = window,
  documentObj = document,
  dependencies = {}
}) {
  const {
    createDrawerDataControllerFn = createDrawerDataController,
    createDrawerShellControllerFn = createDrawerShellController,
    createDrawerSyncCoordinatorFn = createDrawerSyncCoordinator,
    createDrawerUiControllerFn = createDrawerUiController,
    createInitialDrawerStateFn = createInitialDrawerState,
    createSavedPagesViewFn = createSavedPagesView,
    getDrawerCurrentUserFn = getDrawerCurrentUser,
    initSavedPagesDrawerEventsFn = initSavedPagesDrawerEvents
  } = dependencies;
  const {
    savedPagesDrawer,
    savedPagesDrawerSearchForm,
    savedPagesDrawerSearchInput,
    savedPagesDrawerClearBtn,
    savedPagesDrawerResults,
    projectSidebar,
    projectEditorBackdrop,
    projectEditorDialog
  } = elements;

  const state = createInitialDrawerStateFn();
  let suppressSavedPagesStoreSync = false;
  let dataController;
  let savedPagesView;
  let uiController;
  const notifySavedPagesTotalChange = createSavedPagesTotalNotifier({
    savedPagesStore,
    onSavedPagesTotalChange
  });
  // Asynchronous user lookup backed by browser.storage.local. Used by the data
  // and cache paths, which can await it.
  const getCurrentUserAsync = () => getDrawerCurrentUserFn(windowObj);
  // Synchronous cache of the signed-in user. Rendering is synchronous
  // (isOwnedProject / getCompanyDomain read .uid / .email off
  // dashboard.getCurrentUser() without awaiting), so the view must be bound to
  // a function that returns a user object — not a Promise. Seeded eagerly on
  // init, refreshed on sign-in, and cleared on sign-out.
  let cachedUser = null;
  const getCurrentUser = () => cachedUser;
  const applyDrawerFilters = createDrawerFiltersApplier({
    state,
    projectManager,
    getSavedPagesView: () => savedPagesView
  });

  const shellController = createDrawerShellControllerFn({
    state,
    savedPagesDrawer,
    savedPagesDrawerSearchInput,
    savedPagesDrawerClearBtn,
    getDataController: () => dataController,
    renderDrawerResults: () => uiController.renderResults(),
    windowObj,
    documentObj
  });

  uiController = createDrawerUiControllerFn({
    state,
    projectManager,
    resultsContainer: savedPagesDrawerResults,
    getSavedPagesView: () => savedPagesView,
    documentObj
  });

  const renderDrawerLoadingState = (...args) => uiController.renderLoadingState(...args);
  const renderDrawerErrorState = (...args) => uiController.renderErrorState(...args);
  // The project sidebar is a signed-in surface — it lists the user's projects.
  // Hide it whenever the sign-in state is shown (cold start with no session,
  // and explicit sign-out) and restore it once real results render. Tied to
  // these two render entry points because they are the authoritative signals
  // of the auth-state transition for the drawer.
  const renderDrawerSignInState = (...args) => {
    projectSidebar?.classList?.add('hidden');
    return uiController.renderSignInState(...args);
  };
  const renderDrawerResults = (...args) => {
    projectSidebar?.classList?.remove('hidden');
    return uiController.renderResults(...args);
  };
  const { syncDrawerStateFromStore, syncProjectsStateFromStore } = createDrawerStateSyncHelpers({
    state,
    projectManager,
    getSavedPagesView: () => savedPagesView,
    applyDrawerFilters,
    renderDrawerResults,
    renderDrawerChrome: (...args) => uiController.renderDrawerChrome(...args)
  });

  savedPagesView = createSavedPagesViewFn({
    state,
    savedPagesStore,
    projectsStore,
    getCurrentUser,
    getDataController: () => dataController,
    setSuppressSavedPagesStoreSync: (value) => {
      suppressSavedPagesStoreSync = value === true;
    },
    renderDrawerLoadingState,
    syncDrawerStateFromStore,
    applyDrawerFilters,
    renderDrawerResults: uiController.renderResults,
    renderProjectSidebar: uiController.renderProjectSidebar,
    refreshDrawerCard: uiController.refreshDrawerCard
  });

  dataController = createDrawerDataControllerFn({
    api,
    state,
    savedPagesStore,
    projectsStore,
    projectManager,
    savedPagesView,
    getCurrentUser: getCurrentUserAsync,
    isDrawerOpen: shellController.isDrawerOpen,
    setDrawerSearchValue: shellController.setDrawerSearchValue,
    updateDrawerUrl: shellController.updateDrawerUrl,
    renderDrawerLoadingState,
    renderDrawerErrorState,
    renderDrawerSignInState,
    renderDrawerResults,
    syncDrawerStateFromStore,
    syncProjectsStateFromStore,
    applyDrawerFilters,
    windowObj,
    notify,
    projectFetchLimit: 100
  });

  function initDrawerEventHandlers() {
    initSavedPagesDrawerEventsFn({
      savedPagesDrawerSearchForm,
      savedPagesDrawerSearchInput,
      savedPagesDrawerClearBtn,
      savedPagesDrawerResults,
      projectSidebar,
      projectEditorBackdrop,
      projectEditorDialog,
      projectManager,
      savedPagesView,
      openSavedPagesDrawer: shellController.openSavedPagesDrawer,
      closeSavedPagesDrawer: shellController.closeSavedPagesDrawer,
      loadDrawerResults: dataController.loadDrawerResults,
      loadDrawerDomainPages: dataController.loadDrawerDomainPages,
      navigateDrawerCard: shellController.navigateDrawerCard,
      handleDrawerEditCancel: dataController.handleDrawerEditCancel,
      handleDrawerEditStart: dataController.handleDrawerEditStart,
      handleDrawerPin: dataController.handleDrawerPin,
      handleDrawerUpdate: dataController.handleDrawerUpdate,
      handleDrawerDelete: dataController.handleDrawerDelete,
      handleDrawerScrollNearEnd: dataController.handleDrawerScrollNearEnd,
      setDrawerSearchValue: shellController.setDrawerSearchValue,
      setDrawerToggleState: shellController.setDrawerToggleState,
      isDrawerOpen: shellController.isDrawerOpen,
      windowObj,
      documentObj
    });
  }

  const syncCoordinator = createDrawerSyncCoordinatorFn({
    api,
    state,
    savedPagesStore,
    projectsStore,
    getCurrentUser: getCurrentUserAsync,
    isDrawerOpen: shellController.isDrawerOpen,
    getSearchQuery: shellController.getSearchQuery,
    notifySavedPagesTotalChange,
    refreshFavorites,
    syncDrawerStateFromStore,
    syncProjectsStateFromStore,
    loadDrawerBasePages: dataController.loadDrawerBasePages,
    loadDrawerProjectPages: dataController.loadDrawerProjectPages,
    loadDrawerResults: dataController.loadDrawerResults,
    renderDrawerSignInState,
    renderDrawerResults,
    resetDrawerState: () => {
      resetDrawerState(state);
    },
    setSuppressSavedPagesStoreSync: (value) => {
      suppressSavedPagesStoreSync = value === true;
    },
    getSuppressSavedPagesStoreSync: () => suppressSavedPagesStoreSync,
    windowObj
  });

  // Seed the sync user cache from the session store. Awaited where the caller
  // can afford it (init, sign-in) so the synchronous view binding has the user
  // before the first sidebar render.
  async function refreshCachedUser() {
    try {
      cachedUser = await getCurrentUserAsync();
    } catch (error) {
      console.debug('[newtab] Failed to read current user for sidebar cache:', error);
      cachedUser = null;
    }
  }

  async function handleSignedIn() {
    await refreshCachedUser();
    await syncCoordinator.handleSignedIn();
  }

  // Force a full reload of the current drawer view from the server, bypassing
  // the handleSignedIn early-return that only re-filters in-memory pages. Used
  // by the "Refresh cache" button so that pages saved by other project members
  // (which were never in the local in-memory store) actually appear.
  async function forceReload() {
    await refreshCachedUser();
    setDrawerInitialized(state, false);
    savedPagesStore.reset({ emit: false });
    // Reset the currently-selected scope's store so hydrate() does a full
    // network fetch, not a warm-cache paint of the stale in-memory list. This
    // mirrors the sign-in gate inside loadDrawerScope, but forceReload runs
    // already-authenticated so it must reset up-front.
    if (state.selectedProjectId && state.selectedProjectId !== PINNED_PAGES_SCOPE_ID) {
      const projectStore = dataController.getProjectSavedPagesStore?.(state.selectedProjectId);
      projectStore?.reset({ emit: false });
    }
    // loadDrawerScopeForCurrentSelection picks all/project/domain from the
    // live selection — previously this branched on project-vs-base only and
    // silently routed a domain selection to all-pages (a latent bug).
    await dataController.loadDrawerScopeForCurrentSelection({
      query: shellController.getSearchQuery(),
      syncUrl: false
    });
  }

  function handleSignedOut() {
    cachedUser = null;
    syncCoordinator.handleSignedOut();
  }

  async function init() {
    // Seed before the first render so ownership (isOwnedProject) resolves on the
    // warm-cache paint that init triggers via the sync coordinator.
    await refreshCachedUser();
    syncCoordinator.init();
    initDrawerEventHandlers();
  }

  // Realtime push handler: a project's page set changed on the server. If that
  // project is currently open in the drawer, refresh its pages; always refresh
  // the projects list since a project's page count may have changed. Driven by
  // the 'project_page_changed' SSE event via the realtime bus. Fire-and-forget
  // at the call site (the bus subscriber does not await) — all errors are
  // caught here so a rejected refresh never surfaces as an unhandled rejection.
  async function handleRealtimeProjectEvent(event) {
    try {
      if (!event?.projectId) {
        console.warn('[realtime] project_page_changed event missing projectId', event);
      }
      if (event?.projectId && event.projectId === state.selectedProjectId) {
        await savedPagesStore.refreshInitial();
      }
      await projectsStore.refreshInitial();
    } catch (err) {
      console.error('[realtime] handleRealtimeProjectEvent failed:', err);
    }
  }

  return {
    close: shellController.closeSavedPagesDrawer,
    forceReload,
    handleRealtimeProjectEvent,
    handleSignedIn,
    handleSignedOut,
    init,
    load: shellController.openSavedPagesDrawer,
    loadSummary: syncCoordinator.loadSummary,
    open: shellController.openSavedPagesDrawer,
    preloadProjects: dataController.ensureDrawerProjectsLoaded,
    // Exposed so sibling surfaces (Sharing centre, Refresh) can read the live
    // view state — projects list and current user — without duplicating it.
    getSavedPagesView: () => savedPagesView,
    showLoadingState: renderDrawerLoadingState
  };
}
