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
});
