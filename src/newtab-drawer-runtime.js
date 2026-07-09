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
import { createInitialDrawerState } from './newtab-drawer-state.js';
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
    createDrawerFiltersApplierFn = createDrawerFiltersApplier,
    createDrawerShellControllerFn = createDrawerShellController,
    createDrawerStateSyncHelpersFn = createDrawerStateSyncHelpers,
    createDrawerSyncCoordinatorFn = createDrawerSyncCoordinator,
    createDrawerUiControllerFn = createDrawerUiController,
    createInitialDrawerStateFn = createInitialDrawerState,
    createSavedPagesTotalNotifierFn = createSavedPagesTotalNotifier,
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
  const notifySavedPagesTotalChange = createSavedPagesTotalNotifierFn({
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
  const applyDrawerFilters = createDrawerFiltersApplierFn({
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
  const { syncDrawerStateFromStore, syncProjectsStateFromStore } = createDrawerStateSyncHelpersFn({
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
      Object.assign(state, createInitialDrawerStateFn());
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

  return {
    close: shellController.closeSavedPagesDrawer,
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
