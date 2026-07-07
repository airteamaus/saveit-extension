import { createNewtabAuthController } from './newtab-auth.js';
import { createImportPanel } from './import-panel.js';
import { createSharingCentre } from './sharing-centre.js';
import { createToastRegion } from './toast.js';
import {
  createProjectsStore,
  createSavedPagesDrawerController,
  createSavedPagesStore
} from './newtab-drawer.js';
import {
  bindNewtabEventHandlers,
  getNewtabElements,
  initMirrorToggle,
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

  // Toast host for transient confirmations/failures. Created early so the
  // drawer controller, project manager, and mirror toggle can share it.
  const toast = createToastRegion({ container: elements.toastRegion, documentObj });

  const projectManager = new ProjectManager(API, { escapeHtml: escapeHtmlFn }, { notify: toast.show });
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
    refreshFavorites: undefined,
    notify: toast.show
  });
  const authLifecycle = createNewtabAuthLifecycleFn({
    drawerController
  });
  const authController = createNewtabAuthControllerFn({
    API,
    AuthMenu,
    elements: getAuthControllerElements(elements),
    onSignedIn: authLifecycle.onSignedIn,
    onSignedOut: authLifecycle.onSignedOut,
    // Arm a one-time full warm-up *only* on explicit sign-in — not on session
    // restoration when newtab opens already logged in (which would flash the
    // warming UI over the user's existing cards on every page load).
    onInteractiveSignIn: () => savedPagesStore.setLazy(false)
  });

  const importPanel = createImportPanel({
    api: API,
    documentObj,
    // After a successful import, force the drawer to reload from the server so
    // the new pages appear without relying on the storage-change observer
    // (which can miss the event if the drawer's local snapshot shadows it).
    onImportComplete: () => {
      try {
        drawerController.load();
      } catch {
        /* drawer not initialised yet — a manual reload will pick it up */
      }
    }
  });

  const sharingCentre = createSharingCentre({
    api: API,
    documentObj,
    // Read the live dashboard (savedPagesView) and project manager off the
    // drawer controller lazily, so the centre works whether it's opened before
    // or after the drawer has initialised.
    getDashboard: () => {
      try {
        return drawerController.getSavedPagesView?.() || null;
      } catch {
        return null;
      }
    },
    getProjectManager: () => projectManager,
    onProjectsChanged: () => {
      // After a toggle, the sidebar needs to repaint so a freshly-un-shared
      // project moves out of the "Shared" group immediately.
      try {
        drawerController.load();
      } catch {
        /* drawer not initialised yet */
      }
    }
  });

  return {
    authController,
    drawerController,
    elements,
    importPanel,
    projectManager,
    projectsStore,
    savedPagesStore,
    sharingCentre,
    toast,
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
      // Sharing centre lives in the avatar dropdown; close the dropdown first.
      elements.sharingBtn?.addEventListener('click', () => {
        elements.userDropdown?.classList.add('hidden');
        sharingCentre.open();
      });
      // Reload from server: bust all caches for the current user and re-run the
      // post-login warm-up path so saved pages AND projects come back fresh.
      // Previously this only re-painted in-memory state, which let stale
      // project lists linger (the root cause of "my colleague can't see a
      // project I shared"). See AGENTS.md caching redux: server is authoritative.
      elements.refreshBtn?.addEventListener('click', async () => {
        elements.userDropdown?.classList.add('hidden');
        try {
          await API.invalidateCache();
          savedPagesStore.setLazy(false);
          void projectsStore.hydrate();
          void drawerController.handleSignedIn();
        } catch {
          /* not signed in / not initialised */
        }
      });
      // Mirror toggle lives in the avatar dropdown. Reading/writing state via
      // runtime messages so the background context owns the persisted state
      // and triggers the seed reconcile on enable. Toast confirms each change.
      initMirrorToggle({
        elements,
        runtime: documentObj.defaultView?.browser?.runtime || documentObj.defaultView?.chrome?.runtime,
        notify: toast.show
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
