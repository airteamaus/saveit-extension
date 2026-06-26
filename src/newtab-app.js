import { createNewtabAuthController } from './newtab-auth.js';
import { createImportPanel } from './import-panel.js';
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
  createNewtabAuthLifecycle,
  createSavedPagesFooterUpdater
} from './newtab-app-coordination.js';
import {
  escapeHtml,
  updateStatsDisplay,
  updateVersionIndicator
} from './newtab-shared.js';

export function getDrawerControllerElements(elements) {
  return {
    projectEditorBackdrop: elements.projectEditorBackdrop,
    projectEditorDialog: elements.projectEditorDialog,
    projectSidebar: elements.projectSidebar,
    savedPagesDrawer: elements.savedPagesDrawer,
    savedPagesDrawerClearBtn: elements.savedPagesDrawerClearBtn,
    savedPagesDrawerResults: elements.savedPagesDrawerResults,
    savedPagesDrawerSearchForm: elements.savedPagesDrawerSearchForm || elements.searchForm,
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
    createNewtabAuthControllerFn = createNewtabAuthController,
    createProjectsStoreFn = createProjectsStore,
    createSavedPagesDrawerControllerFn = createSavedPagesDrawerController,
    createSavedPagesStoreFn = createSavedPagesStore,
    createNewtabAuthLifecycleFn = createNewtabAuthLifecycle,
    createSavedPagesFooterUpdaterFn = createSavedPagesFooterUpdater,
    escapeHtmlFn = escapeHtml,
    getNewtabElementsFn = getNewtabElements,
    startNewtabPageFn = startNewtabPage,
    updateStatsDisplayFn = updateStatsDisplay,
    updateVersionIndicatorFn = updateVersionIndicator
  } = dependencies;

  const elements = getNewtabElementsFn(documentObj);
  const projectManager = new ProjectManager(API, { escapeHtml: escapeHtmlFn });
  const savedPagesStore = createSavedPagesStoreFn(API);
  const projectsStore = createProjectsStoreFn(API);

  const updateSavedPagesFooter = createSavedPagesFooterUpdaterFn({
    versionIndicator: elements.versionIndicator,
    updateStatsDisplay: updateStatsDisplayFn
  });
  const drawerController = createSavedPagesDrawerControllerFn({
    api: API,
    savedPagesStore,
    projectsStore,
    projectManager,
    elements: getDrawerControllerElements(elements),
    onSavedPagesTotalChange: updateSavedPagesFooter,
    refreshFavorites: undefined
  });
  const authLifecycle = createNewtabAuthLifecycleFn({
    drawerController
  });
  const authController = createNewtabAuthControllerFn({
    API,
    AuthMenu,
    elements: getAuthControllerElements(elements),
    onSignedIn: authLifecycle.onSignedIn,
    onSignedOut: authLifecycle.onSignedOut
  });

  const importPanel = createImportPanel({ api: API, documentObj });

  return {
    authController,
    drawerController,
    elements,
    importPanel,
    projectManager,
    projectsStore,
    savedPagesStore,
    bind() {
      bindNewtabEventHandlersFn({
        elements,
        authController,
        documentObj
      });
      // Import lives in the avatar dropdown; close the dropdown before opening
      // the modal so it doesn't linger behind the panel.
      elements.importBtn?.addEventListener('click', () => {
        elements.userDropdown?.classList.add('hidden');
        importPanel.open();
      });
    },
    async start() {
      await startNewtabPageFn({
        ThemeManager,
        versionNumberEl: elements.versionNumberEl,
        updateVersionIndicator: updateVersionIndicatorFn,
        drawerController,
        authController
      });
    }
  };
}
