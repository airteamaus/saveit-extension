import { createNewtabAuthController } from './newtab-auth.js';
import {
  createFavoritesController,
  createFavoritesStore
} from './newtab-favorites.js';
import {
  createProjectsStore,
  createSavedPagesDrawerController,
  createSavedPagesStore
} from './newtab-drawer.js';
import {
  bindNewtabEventHandlers,
  getNewtabElements,
  startNewtabPage
} from './newtab-page.js';
import {
  createFavoritesRefreshHandler,
  createNewtabAuthLifecycle,
  createSavedPagesFooterUpdater
} from './newtab-app-coordination.js';
import {
  escapeHtml,
  updateVersionIndicator
} from './newtab-shared.js';

export function getFavoritesControllerElements(elements) {
  return {
    favoriteHoverCard: elements.favoriteHoverCard,
    favoriteHoverConnector: elements.favoriteHoverConnector,
    favoritesDots: elements.favoritesDots,
    favoritesNextBtn: elements.favoritesNextBtn,
    favoritesPrevBtn: elements.favoritesPrevBtn,
    favoritesRow: elements.favoritesRow,
    favoritesSection: elements.favoritesSection,
    favoritesViewport: elements.favoritesViewport
  };
}

export function getDrawerControllerElements(elements) {
  return {
    projectEditorBackdrop: elements.projectEditorBackdrop,
    projectEditorDialog: elements.projectEditorDialog,
    projectSidebar: elements.projectSidebar,
    savedPagesDrawer: elements.savedPagesDrawer,
    savedPagesDrawerBackdrop: elements.savedPagesDrawerBackdrop,
    savedPagesDrawerClearBtn: elements.savedPagesDrawerClearBtn,
    savedPagesDrawerCloseBtn: elements.savedPagesDrawerCloseBtn,
    savedPagesDrawerResults: elements.savedPagesDrawerResults,
    savedPagesDrawerSearchForm: elements.savedPagesDrawerSearchForm,
    savedPagesDrawerSearchInput: elements.savedPagesDrawerSearchInput,
    savedPagesToggleBtn: elements.savedPagesToggleBtn
  };
}

export function getAuthControllerElements(elements) {
  return {
    signInBtn: elements.signInBtn,
    userAvatar: elements.userAvatar,
    userDropdown: elements.userDropdown,
    userEmailEl: elements.userEmailEl,
    userMenu: elements.userMenu
  };
}

export function createNewtabApp({
  API,
  AuthMenu,
  ProjectManager,
  ThemeManager,
  documentObj = document,
  dependencies = {}
}) {
  const {
    bindNewtabEventHandlersFn = bindNewtabEventHandlers,
    createFavoritesControllerFn = createFavoritesController,
    createFavoritesStoreFn = createFavoritesStore,
    createNewtabAuthControllerFn = createNewtabAuthController,
    createProjectsStoreFn = createProjectsStore,
    createSavedPagesDrawerControllerFn = createSavedPagesDrawerController,
    createSavedPagesStoreFn = createSavedPagesStore,
    createFavoritesRefreshHandlerFn = createFavoritesRefreshHandler,
    createNewtabAuthLifecycleFn = createNewtabAuthLifecycle,
    createSavedPagesFooterUpdaterFn = createSavedPagesFooterUpdater,
    escapeHtmlFn = escapeHtml,
    getNewtabElementsFn = getNewtabElements,
    startNewtabPageFn = startNewtabPage,
    updateVersionIndicatorFn = updateVersionIndicator
  } = dependencies;

  const elements = getNewtabElementsFn(documentObj);
  const projectManager = new ProjectManager(API, { escapeHtml: escapeHtmlFn });
  const favoritesStore = createFavoritesStoreFn(API);
  const savedPagesStore = createSavedPagesStoreFn(API);
  const projectsStore = createProjectsStoreFn(API);

  const favoritesController = createFavoritesControllerFn({
    store: favoritesStore,
    elements: getFavoritesControllerElements(elements)
  });
  const updateSavedPagesFooter = createSavedPagesFooterUpdaterFn({
    versionIndicator: elements.versionIndicator
  });
  const refreshFavorites = createFavoritesRefreshHandlerFn(favoritesController);
  const drawerController = createSavedPagesDrawerControllerFn({
    api: API,
    savedPagesStore,
    projectsStore,
    projectManager,
    elements: getDrawerControllerElements(elements),
    onSavedPagesTotalChange: updateSavedPagesFooter,
    refreshFavorites
  });
  const authLifecycle = createNewtabAuthLifecycleFn({
    favoritesController,
    drawerController
  });
  const authController = createNewtabAuthControllerFn({
    API,
    AuthMenu,
    elements: getAuthControllerElements(elements),
    onSignedIn: authLifecycle.onSignedIn,
    onSignedOut: authLifecycle.onSignedOut
  });

  return {
    authController,
    drawerController,
    elements,
    favoritesController,
    favoritesStore,
    projectManager,
    projectsStore,
    savedPagesStore,
    bind() {
      bindNewtabEventHandlersFn({
        elements,
        authController,
        drawerController,
        documentObj
      });
    },
    async start() {
      await startNewtabPageFn({
        ThemeManager,
        versionNumberEl: elements.versionNumberEl,
        updateVersionIndicator: updateVersionIndicatorFn,
        favoritesController,
        drawerController,
        authController
      });
    }
  };
}
