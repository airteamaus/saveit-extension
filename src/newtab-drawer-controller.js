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
import {
  createInitialDrawerState,
} from './newtab-drawer-state.js';
import { createDrawerUiController } from './newtab-drawer-ui.js';
import { createSavedPagesView } from './newtab-drawer-view.js';

const SAVED_PAGES_DRAWER_PARAM = 'drawer';
const SAVED_PAGES_DRAWER_VALUE = 'saved-pages';

export function createSavedPagesDrawerController({
  api,
  savedPagesStore,
  projectsStore,
  projectManager,
  elements,
  onSavedPagesTotalChange,
  refreshFavorites,
  windowObj = window,
  documentObj = document
}) {
  const {
    savedPagesToggleBtn,
    savedPagesDrawer,
    savedPagesDrawerBackdrop,
    savedPagesDrawerCloseBtn,
    savedPagesDrawerSearchForm,
    savedPagesDrawerSearchInput,
    savedPagesDrawerClearBtn,
    savedPagesDrawerResults,
    projectSidebar,
    projectEditorBackdrop,
    projectEditorDialog
  } = elements;

  const state = createInitialDrawerState();
  let suppressSavedPagesStoreSync = false;
  let dataController;
  let savedPagesView;
  let uiController;
  const notifySavedPagesTotalChange = createSavedPagesTotalNotifier({
    savedPagesStore,
    onSavedPagesTotalChange
  });
  const getCurrentUser = () => getDrawerCurrentUser(windowObj);
  const applyDrawerFilters = createDrawerFiltersApplier({
    state,
    projectManager,
    getSavedPagesView: () => savedPagesView
  });

  const shellController = createDrawerShellController({
    state,
    savedPagesToggleBtn,
    savedPagesDrawer,
    savedPagesDrawerSearchInput,
    savedPagesDrawerClearBtn,
    getDataController: () => dataController,
    renderDrawerResults: () => uiController.renderResults(),
    drawerParam: SAVED_PAGES_DRAWER_PARAM,
    drawerValue: SAVED_PAGES_DRAWER_VALUE,
    windowObj,
    documentObj
  });

  uiController = createDrawerUiController({
    state,
    projectManager,
    resultsContainer: savedPagesDrawerResults,
    getSavedPagesView: () => savedPagesView,
    documentObj
  });

  const renderDrawerLoadingState = (...args) => uiController.renderLoadingState(...args);
  const renderDrawerErrorState = (...args) => uiController.renderErrorState(...args);
  const renderDrawerSignInState = (...args) => uiController.renderSignInState(...args);
  const renderDrawerResults = (...args) => uiController.renderResults(...args);
  const {
    syncDrawerStateFromStore,
    syncProjectsStateFromStore
  } = createDrawerStateSyncHelpers({
    state,
    projectManager,
    getSavedPagesView: () => savedPagesView,
    applyDrawerFilters,
    renderDrawerResults,
    renderDrawerChrome: (...args) => uiController.renderDrawerChrome(...args)
  });

  savedPagesView = createSavedPagesView({
    state,
    savedPagesStore,
    projectsStore,
    getCurrentUser,
    getDataController: () => dataController,
    setSuppressSavedPagesStoreSync: value => {
      suppressSavedPagesStoreSync = value === true;
    },
    renderDrawerLoadingState,
    syncDrawerStateFromStore,
    applyDrawerFilters,
    renderDrawerResults: uiController.renderResults,
    renderProjectSidebar: uiController.renderProjectSidebar,
    refreshDrawerCard: uiController.refreshDrawerCard
  });

  dataController = createDrawerDataController({
    api,
    state,
    savedPagesStore,
    projectsStore,
    projectManager,
    savedPagesView,
    getCurrentUser,
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
    projectFetchLimit: 100
  });

  function initDrawerEventHandlers() {
    initSavedPagesDrawerEvents({
      savedPagesToggleBtn,
      savedPagesDrawer,
      savedPagesDrawerBackdrop,
      savedPagesDrawerCloseBtn,
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
      navigateDrawerCard: shellController.navigateDrawerCard,
      handleDrawerPin: dataController.handleDrawerPin,
      handleDrawerDelete: dataController.handleDrawerDelete,
      setDrawerSearchValue: shellController.setDrawerSearchValue,
      setDrawerToggleState: shellController.setDrawerToggleState,
      isDrawerOpen: shellController.isDrawerOpen,
      drawerParam: SAVED_PAGES_DRAWER_PARAM,
      drawerValue: SAVED_PAGES_DRAWER_VALUE,
      windowObj,
      documentObj
    });
  }

  const syncCoordinator = createDrawerSyncCoordinator({
    api,
    state,
    savedPagesStore,
    projectsStore,
    getCurrentUser,
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
    resetDrawerState: () => {
      Object.assign(state, createInitialDrawerState());
    },
    setSuppressSavedPagesStoreSync: value => {
      suppressSavedPagesStoreSync = value === true;
    },
    getSuppressSavedPagesStoreSync: () => suppressSavedPagesStoreSync,
    windowObj
  });

  function init() {
    syncCoordinator.init();
    initDrawerEventHandlers();
  }

  return {
    close: shellController.closeSavedPagesDrawer,
    handleSignedIn: syncCoordinator.handleSignedIn,
    handleSignedOut: syncCoordinator.handleSignedOut,
    init,
    loadSummary: syncCoordinator.loadSummary,
    open: shellController.openSavedPagesDrawer
  };
}
