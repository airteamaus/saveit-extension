import { describe, expect, it, vi } from 'vitest';

import { createSavedPagesDrawerController } from '../../src/newtab-drawer-runtime.js';

describe('newtab drawer runtime', () => {
  it('assembles drawer factories and exposes the public controller API', async () => {
    const state = { hasInitialized: false };
    const shellController = {
      closeSavedPagesDrawer: vi.fn(),
      getSearchQuery: vi.fn(() => 'alpha'),
      isDrawerOpen: vi.fn(() => true),
      navigateDrawerCard: vi.fn(),
      openSavedPagesDrawer: vi.fn(),
      setDrawerSearchValue: vi.fn(),
      setDrawerToggleState: vi.fn(),
      updateDrawerUrl: vi.fn()
    };
    const uiController = {
      renderDrawerChrome: vi.fn(),
      renderErrorState: vi.fn(),
      renderLoadingState: vi.fn(),
      renderProjectSidebar: vi.fn(),
      refreshDrawerCard: vi.fn(),
      renderResults: vi.fn(),
      renderSignInState: vi.fn()
    };
    const savedPagesView = { id: 'saved-pages-view' };
    const dataController = {
      ensureDrawerProjectsLoaded: vi.fn(),
      handleDrawerDelete: vi.fn(),
      handleDrawerPin: vi.fn(),
      loadDrawerBasePages: vi.fn(),
      loadDrawerProjectPages: vi.fn(),
      loadDrawerResults: vi.fn()
    };
    const syncCoordinator = {
      handleSignedIn: vi.fn(),
      handleSignedOut: vi.fn(),
      init: vi.fn(),
      loadSummary: vi.fn()
    };
    const initSavedPagesDrawerEventsFn = vi.fn();

    const controller = createSavedPagesDrawerController({
      api: { id: 'api' },
      savedPagesStore: { id: 'saved-pages-store' },
      projectsStore: { id: 'projects-store' },
      projectManager: { id: 'project-manager' },
      elements: {
        savedPagesToggleBtn: { id: 'toggle' },
        savedPagesDrawer: { id: 'drawer' },
        savedPagesDrawerBackdrop: { id: 'backdrop' },
        savedPagesDrawerCloseBtn: { id: 'close' },
        savedPagesDrawerSearchForm: { id: 'search-form' },
        savedPagesDrawerSearchInput: { id: 'search-input' },
        savedPagesDrawerClearBtn: { id: 'clear' },
        savedPagesDrawerResults: { id: 'results' },
        projectSidebar: { id: 'sidebar' },
        projectEditorBackdrop: { id: 'editor-backdrop' },
        projectEditorDialog: { id: 'editor-dialog' }
      },
      onSavedPagesTotalChange: vi.fn(),
      refreshFavorites: vi.fn(),
      windowObj: { id: 'window' },
      documentObj: { id: 'document' },
      dependencies: {
        createDrawerDataControllerFn: vi.fn(() => dataController),
        createDrawerFiltersApplierFn: vi.fn(() => vi.fn()),
        createDrawerShellControllerFn: vi.fn(() => shellController),
        createDrawerStateSyncHelpersFn: vi.fn(() => ({
          syncDrawerStateFromStore: vi.fn(),
          syncProjectsStateFromStore: vi.fn()
        })),
        createDrawerSyncCoordinatorFn: vi.fn(() => syncCoordinator),
        createDrawerUiControllerFn: vi.fn(() => uiController),
        createInitialDrawerStateFn: vi.fn(() => state),
        createSavedPagesTotalNotifierFn: vi.fn(() => vi.fn()),
        createSavedPagesViewFn: vi.fn(() => savedPagesView),
        getDrawerCurrentUserFn: vi.fn(() => ({ uid: 'user-1' })),
        initSavedPagesDrawerEventsFn
      }
    });

    controller.init();

    expect(syncCoordinator.init).toHaveBeenCalled();
    expect(initSavedPagesDrawerEventsFn).toHaveBeenCalledTimes(1);
    expect(initSavedPagesDrawerEventsFn.mock.calls[0][0]).toMatchObject({
      projectManager: { id: 'project-manager' },
      savedPagesView,
      openSavedPagesDrawer: shellController.openSavedPagesDrawer,
      closeSavedPagesDrawer: shellController.closeSavedPagesDrawer,
      loadDrawerResults: dataController.loadDrawerResults
    });

    expect(controller.open).toBe(shellController.openSavedPagesDrawer);
    expect(controller.close).toBe(shellController.closeSavedPagesDrawer);
    expect(controller.loadSummary).toBe(syncCoordinator.loadSummary);
    expect(controller.handleSignedIn).toBe(syncCoordinator.handleSignedIn);
    expect(controller.handleSignedOut).toBe(syncCoordinator.handleSignedOut);
    expect(controller.preloadProjects).toBe(dataController.ensureDrawerProjectsLoaded);
    // showLoadingState forwards to the UI controller's loading renderer.
    // The argument is opaque passthrough; the renderer decides what to paint.
    controller.showLoadingState();
    expect(uiController.renderLoadingState).toHaveBeenCalled();
  });

  it('hides the project sidebar when the sign-in state renders and restores it on results', async () => {
    // The sidebar is a signed-in surface. It must not render at all while
    // signed out (cold start with no session, or after explicit sign-out).
    // Uses the REAL sync coordinator so handleSignedOut flows through to the
    // runtime's renderDrawerSignInState forwarder, which toggles the element.
    const projectSidebar = document.createElement('aside');
    const savedPagesDrawer = document.createElement('main');
    // The store subscription drives renderDrawerResults (the restore path),
    // so capture the saved-pages subscriber to emit a signed-in change.
    let savedPagesSubscriber = null;
    const savedPagesStore = {
      subscribe: vi.fn(cb => { savedPagesSubscriber = cb; }),
      reset: vi.fn(),
      getSnapshot: () => ({ allPages: [{ id: 'p1' }], refreshState: 'idle' })
    };
    const state = {
      hasInitialized: true,
      warmUpInProgress: false,
      query: '',
      currentFilter: { search: '', projectId: null, cursor: null },
      selectedProjectId: null,
      allPages: [{ id: 'p1' }],
      pages: [],
      total: 1,
      allItemsTotal: 1
    };
    const uiController = {
      renderDrawerChrome: vi.fn(),
      renderErrorState: vi.fn(),
      renderLoadingState: vi.fn(),
      renderProjectSidebar: vi.fn(),
      refreshDrawerCard: vi.fn(),
      renderResults: vi.fn(),
      renderSignInState: vi.fn()
    };

    const controller = createSavedPagesDrawerController({
      api: { isExtension: true },
      savedPagesStore,
      projectsStore: { subscribe: vi.fn(), reset: vi.fn(), getSnapshot: () => ({}) },
      projectManager: {
        renderSidebar: vi.fn(),
        renderEditor: vi.fn(),
        getScopedPages: vi.fn(() => []),
        getSelectedProject: vi.fn(() => null),
        getProjectPills: vi.fn(() => []),
        refreshProjectCounts: vi.fn()
      },
      elements: {
        savedPagesToggleBtn: document.createElement('button'),
        savedPagesDrawer,
        savedPagesDrawerBackdrop: document.createElement('div'),
        savedPagesDrawerCloseBtn: document.createElement('button'),
        savedPagesDrawerSearchForm: document.createElement('form'),
        savedPagesDrawerSearchInput: document.createElement('input'),
        savedPagesDrawerClearBtn: document.createElement('button'),
        savedPagesDrawerResults: document.createElement('div'),
        projectSidebar,
        projectEditorBackdrop: document.createElement('div'),
        projectEditorDialog: document.createElement('div')
      },
      onSavedPagesTotalChange: vi.fn(),
      refreshFavorites: vi.fn(),
      notify: vi.fn(),
      windowObj: { setTimeout, clearTimeout },
      documentObj: document,
      dependencies: {
        createDrawerDataControllerFn: vi.fn(() => ({
          ensureDrawerProjectsLoaded: vi.fn(),
          handleDrawerDelete: vi.fn(),
          handleDrawerPin: vi.fn(),
          handleDrawerUpdate: vi.fn(),
          loadDrawerBasePages: vi.fn(),
          loadDrawerDomainPages: vi.fn(),
          loadDrawerProjectPages: vi.fn(),
          loadDrawerResults: vi.fn(),
          handleDrawerEditStart: vi.fn(),
          handleDrawerEditCancel: vi.fn(),
          handleDrawerScrollNearEnd: vi.fn()
        })),
        createDrawerShellControllerFn: vi.fn(() => ({
          closeSavedPagesDrawer: vi.fn(),
          getSearchQuery: vi.fn(() => ''),
          isDrawerOpen: vi.fn(() => true),
          navigateDrawerCard: vi.fn(),
          openSavedPagesDrawer: vi.fn(),
          setDrawerSearchValue: vi.fn(),
          setDrawerToggleState: vi.fn(),
          updateDrawerUrl: vi.fn()
        })),
        createDrawerStateSyncHelpersFn: vi.fn(() => ({
          syncDrawerStateFromStore: vi.fn(),
          syncProjectsStateFromStore: vi.fn()
        })),
        createDrawerUiControllerFn: vi.fn(() => uiController),
        createInitialDrawerStateFn: vi.fn(() => state),
        createSavedPagesTotalNotifierFn: vi.fn(() => vi.fn()),
        createSavedPagesViewFn: vi.fn(() => ({})),
        // Signed in for the restore path so shouldSyncDrawerStoreUpdate passes.
        getDrawerCurrentUserFn: vi.fn(() => ({ uid: 'user-1' })),
        initSavedPagesDrawerEventsFn: vi.fn()
      }
    });

    controller.init();

    // Sign-out renders the sign-in state and must hide the sidebar.
    await controller.handleSignedOut();
    expect(projectSidebar.classList.contains('hidden')).toBe(true);
    expect(uiController.renderSignInState).toHaveBeenCalled();

    // A signed-in store emit routes through renderDrawerResults (the warming
    // branch calls it directly while warmUpInProgress is set), which restores
    // the sidebar.
    uiController.renderResults.mockClear();
    state.warmUpInProgress = true;
    savedPagesSubscriber();
    expect(uiController.renderResults).toHaveBeenCalled();
    expect(projectSidebar.classList.contains('hidden')).toBe(false);
  });
});
