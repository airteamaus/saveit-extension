import { createNewtabAuthController } from './newtab-auth.js';
import { createImportPanel } from './import-panel.js';
import { createSharingCentre } from './sharing-centre.js';
import { createDataSyncCentre } from './data-sync-centre.js';
import { createToastRegion } from './toast.js';
import { clearPendingSave } from './pending-saves.js';
import { CONFIG } from './config.js';
import { getSessionToken } from './session-store.js';
import { RealtimeClient } from './realtime-client.js';
import { RealtimeEventBus } from './realtime-event-bus.js';
import { sendRuntimeMessage } from './send-runtime-message.js';
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

// Wire the responsive sidebar overlay (the hamburger, shown ≤700px). Extracted
// from bind() so the toggle contract is unit-testable against real DOM without
// constructing the whole app. Toggling adds .is-overlay-open to the sidebar
// (NOT .hidden, which is owned by the auth flow) and reveals the backdrop.
// Closes on Escape, on backdrop click, and after a sidebar nav selection so
// tapping a project dismisses the overlay. No-ops when the sidebar is
// auth-hidden (signed out) so it never fights the auth class.
export function initSidebarOverlay({ sidebar, toggleBtn, backdrop, documentObj = document } = {}) {
  if (!sidebar || !toggleBtn) {
    return;
  }

  const isOpen = () => sidebar.classList.contains('is-overlay-open') === true;

  const close = () => {
    if (!isOpen()) {
      return;
    }
    sidebar.classList.remove('is-overlay-open');
    backdrop?.classList.add('hidden');
    toggleBtn.setAttribute('aria-expanded', 'false');
  };

  const open = () => {
    // Don't open if the auth flow has hidden the sidebar (signed out).
    if (sidebar.classList.contains('hidden')) {
      return;
    }
    sidebar.classList.add('is-overlay-open');
    backdrop?.classList.remove('hidden');
    toggleBtn.setAttribute('aria-expanded', 'true');
  };

  toggleBtn.addEventListener('click', () => {
    if (isOpen()) {
      close();
    } else {
      open();
    }
  });

  backdrop?.addEventListener('click', close);

  // A sidebar nav click (project / "All pages") dismisses the overlay so the
  // chosen list is visible full-width.
  sidebar.addEventListener('click', (event) => {
    if (!isOpen()) {
      return;
    }
    if (event.target.closest('button, a')) {
      close();
    }
  });

  documentObj?.addEventListener?.('keydown', (event) => {
    if (event.key === 'Escape') {
      close();
    }
  });
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

  // When the store reconciles an optimistic tile (the real doc arrived),
  // clear the corresponding pending-save record so the stale tile doesn't
  // reappear on the next newtab load. This is the single reliable cleanup
  // point because it fires inside the store's data-replacement path.
  const onOptimisticReconciled = (urls) => {
    const browserApi = globalThis.browser ?? globalThis.chrome;
    if (!browserApi?.storage?.local) {
      return;
    }
    for (const url of urls) {
      void clearPendingSave(browserApi.storage.local, url);
    }
  };

  const savedPagesStore = createSavedPagesStoreFn(API, { onOptimisticReconciled });
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

  // --- realtime push -------------------------------------------------------
  // One event bus per open newtab page. Subscribers refresh the relevant store
  // when the SSE stream signals a change; the RealtimeClient owns the transport
  // (connect() is called from newtab-page.js after auth resolves).
  const realtimeBus = new RealtimeEventBus();

  // The dashboard saved-pages store refreshes on user-scoped page events. The
  // server already filtered by scope; if we received it, it's relevant.
  realtimeBus.subscribe('page_updated', (event) => {
    // The bus dispatches synchronously and can't await async subscribers, so each
    // subscriber wraps its body in an async IIFE with its own try/catch.
    void (async () => {
      try {
        await savedPagesStore.refreshInitial();
        if (event.change === 'enriched' || event.change === 'added') {
          // Clear the optimistic pending-save tile — replaces the enrichment poll.
          // The background SW owns pending-saves; relay via a runtime message.
          const browserApi = globalThis.browser ?? globalThis.chrome;
          try {
            await sendRuntimeMessage(browserApi.runtime, {
              action: 'realtimePageEnriched',
              url: null,
              pageId: event.pageId
            });
          } catch (err) {
            // Fire-and-forget relay: a failure here must never break the
            // newtab page. The next refresh / realtime event recovers.
            console.warn('[realtime] failed to relay enrichment event:', err?.message || err);
          }
        }
      } catch (err) {
        console.error('[realtime] page_updated subscriber failed:', err);
      }
    })();
  });

  // Project page changes refresh the open project store (if it matches).
  realtimeBus.subscribe('project_page_changed', (event) => {
    drawerController.handleRealtimeProjectEvent(event);
  });

  // Project metadata changes refresh the projects list.
  realtimeBus.subscribe('project_metadata_changed', () => {
    void (async () => {
      try {
        await projectsStore.refreshInitial();
      } catch (err) {
        console.error('[realtime] project_metadata_changed subscriber failed:', err);
      }
    })();
  });

  const realtimeClient = new RealtimeClient({
    bus: realtimeBus,
    notify: toast.show,
    getToken: getSessionToken,
    url: `${CONFIG.realtimeFunctionUrl}/events/stream`
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

  const dataSyncCentre = createDataSyncCentre({
    api: API,
    documentObj,
    runtime: documentObj.defaultView?.browser?.runtime || documentObj.defaultView?.chrome?.runtime,
    notify: toast.show,
    onImportComplete: () => {
      // After an import, refresh the drawer so the new pages appear.
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
    realtimeClient,
    savedPagesStore,
    sharingCentre,
    dataSyncCentre,
    toast,
    bind() {
      bindNewtabEventHandlersFn({
        elements,
        authController,
        documentObj
      });
      // Data & sync lives in the avatar dropdown; close the dropdown before
      // opening the modal so it doesn't linger behind the panel.
      elements.dataSyncBtn?.addEventListener('click', () => {
        elements.userDropdown?.classList.add('hidden');
        dataSyncCentre.open();
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
          // forceReload resets hasInitialized + the relevant store and fetches
          // from the server, bypassing the handleSignedIn early-return that
          // only re-filters in-memory pages (leaving cross-user saves hidden).
          void drawerController.forceReload();
        } catch {
          /* not signed in / not initialised */
        }
      });

      // Sidebar overlay (hamburger, ≤700px). See initSidebarOverlay for the
      // toggle/close contract; extracted so it is unit-testable.
      initSidebarOverlay({
        sidebar: elements.projectSidebar,
        toggleBtn: elements.sidebarToggleBtn,
        backdrop: elements.sidebarBackdrop,
        documentObj
      });
    },
    async start() {
      await startNewtabPageFn({
        ThemeManager,
        versionNumberEl: elements.versionNumberEl,
        updateVersionIndicator: updateVersionIndicatorFn,
        drawerController,
        authController,
        realtimeClient
      });
    }
  };
}
