import { describe, expect, it, vi, afterEach } from 'vitest';

import {
  createNewtabApp,
  getAuthControllerElements,
  getDrawerControllerElements
} from '../../src/newtab-app.js';

describe('newtab app factory', () => {
  it('maps drawer and auth element groups', () => {
    const elements = {
      projectEditorBackdrop: 'backdrop',
      projectEditorDialog: 'dialog',
      projectSidebar: 'sidebar',
      savedPagesDrawer: 'drawer',
      savedPagesDrawerClearBtn: 'clear',
      savedPagesDrawerResults: 'results',
      savedPagesDrawerSearchForm: 'search-form',
      savedPagesDrawerSearchInput: 'search-input',
      savedPagesToggleBtn: 'toggle',
      signInBtn: 'sign-in',
      userAvatar: 'avatar',
      userDropdown: 'dropdown',
      userEmailEl: 'email',
      userMenu: 'menu'
    };

    expect(getDrawerControllerElements(elements)).toEqual({
      projectEditorBackdrop: 'backdrop',
      projectEditorDialog: 'dialog',
      projectSidebar: 'sidebar',
      savedPagesDrawer: 'drawer',
      savedPagesDrawerClearBtn: 'clear',
      savedPagesDrawerResults: 'results',
      savedPagesDrawerSearchForm: 'search-form',
      savedPagesDrawerSearchInput: 'search-input',
      savedPagesToggleBtn: 'toggle'
    });
    expect(getAuthControllerElements(elements)).toEqual({
      signInBtn: 'sign-in',
      userAvatar: 'avatar',
      userDropdown: 'dropdown',
      userEmailEl: 'email',
      userMenu: 'menu'
    });
  });

  it('wires controller creation, event binding, footer updates, and startup', async () => {
    const elements = {
      versionIndicator: { id: 'version-indicator' },
      versionNumberEl: { id: 'version-number' }
    };
    const savedPagesStore = { id: 'saved-pages-store' };
    const projectsStore = { id: 'projects-store' };
    const drawerController = {
      load: vi.fn(),
      handleSignedIn: vi.fn().mockResolvedValue(undefined),
      handleSignedOut: vi.fn(),
      refreshOpenScopes: vi.fn().mockResolvedValue(undefined)
    };
    const authController = { id: 'auth-controller' };
    const bindNewtabEventHandlersFn = vi.fn();
    const createNewtabAuthLifecycleFn = vi.fn(({ drawerController: dc }) => ({
      onSignedIn: () => dc.handleSignedIn(),
      onSignedOut: () => dc.handleSignedOut()
    }));
    const createSavedPagesFooterUpdaterFn = vi.fn(({ versionIndicator }) => total => {
      updateStatsDisplayFn(
        versionIndicator,
        typeof total === 'number' ? { total } : null
      );
    });
    const startNewtabPageFn = vi.fn().mockResolvedValue(undefined);
    const updateStatsDisplayFn = vi.fn();
    const updateVersionIndicatorFn = vi.fn();
    const createSavedPagesDrawerControllerFn = vi.fn(() => drawerController);
    const createNewtabAuthControllerFn = vi.fn(() => authController);
    class FakeProjectManager {
      constructor(api, htmlUtils) {
        this.api = api;
        this.htmlUtils = htmlUtils;
      }
    }

    const app = createNewtabApp({
      // getFeed resolves empty so the onConnect feed refresh (real
      // createFeedController — not dependency-injected) stays silent.
      API: { id: 'api', getFeed: vi.fn().mockResolvedValue({ pages: [] }) },
      AuthMenu: { id: 'auth-menu' },
      ProjectManager: FakeProjectManager,
      ThemeManager: { id: 'theme-manager' },
      documentObj: { id: 'document' },
      dependencies: {
        bindNewtabEventHandlersFn,
        createNewtabAuthControllerFn,
        createNewtabAuthLifecycleFn,
        createProjectsStoreFn: vi.fn(() => projectsStore),
        createSavedPagesFooterUpdaterFn,
        createSavedPagesDrawerControllerFn,
        createSavedPagesStoreFn: vi.fn(() => savedPagesStore),
        escapeHtmlFn: vi.fn(value => value),
        getNewtabElementsFn: vi.fn(() => elements),
        startNewtabPageFn,
        updateStatsDisplayFn,
        updateVersionIndicatorFn
      }
    });

    expect(createSavedPagesFooterUpdaterFn).toHaveBeenCalledWith({
      versionIndicator: elements.versionIndicator,
      updateStatsDisplay: updateStatsDisplayFn
    });
    expect(createSavedPagesDrawerControllerFn).toHaveBeenCalledTimes(1);
    expect(createNewtabAuthLifecycleFn).toHaveBeenCalledWith({
      drawerController
    });
    expect(createNewtabAuthControllerFn).toHaveBeenCalledTimes(1);

    const drawerOptions = createSavedPagesDrawerControllerFn.mock.calls[0][0];
    drawerOptions.onSavedPagesTotalChange(42);
    expect(updateStatsDisplayFn).toHaveBeenCalledWith(elements.versionIndicator, { total: 42 });
    expect(drawerOptions.refreshFavorites).toBeUndefined();

    const authOptions = createNewtabAuthControllerFn.mock.calls[0][0];
    await authOptions.onSignedIn();
    expect(drawerController.handleSignedIn).toHaveBeenCalled();
    await authOptions.onSignedOut();
    expect(drawerController.handleSignedOut).toHaveBeenCalled();

    app.bind();
    expect(bindNewtabEventHandlersFn).toHaveBeenCalledWith({
      elements,
      authController,
      documentObj: { id: 'document' }
    });

    await app.start();
    expect(startNewtabPageFn).toHaveBeenCalledWith({
      ThemeManager: { id: 'theme-manager' },
      versionNumberEl: elements.versionNumberEl,
      updateVersionIndicator: updateVersionIndicatorFn,
      drawerController,
      feedController: expect.any(Object),
      authController,
      realtimeClient: expect.objectContaining({ bus: expect.any(Object) })
    });

    // Regression: the realtime client's onConnect catch-up must refresh every
    // open surface (saved pages + the open project scope + projects list) so
    // events missed during a stream disconnect are reconciled on reconnect.
    const realtimeClient = startNewtabPageFn.mock.calls[0][0].realtimeClient;
    expect(typeof realtimeClient.onConnect).toBe('function');
    await realtimeClient.onConnect();
    expect(drawerController.refreshOpenScopes).toHaveBeenCalledTimes(1);
  });
});

// Drives the app's page_updated bus subscription end-to-end: the bus is the
// real RealtimeEventBus created inside createNewtabApp (reachable via the
// realtime client handed to startNewtabPage), the feed controller is the real
// one (its api.getFeed calls are observable), and only the stores and page
// bootstrap are stubbed.
describe('realtime page_updated gating and feed refresh debounce', () => {
  afterEach(() => {
    // The feed debounce timer is module-scope by design; drop any timer left
    // armed by a test so it can't fire into the next one.
    vi.clearAllTimers();
    vi.useRealTimers();
  });

  async function buildRealtimeHarness() {
    const elements = {
      versionIndicator: { id: 'version-indicator' },
      versionNumberEl: { id: 'version-number' }
    };
    const savedPagesStore = {
      id: 'saved-pages-store',
      refreshInitial: vi.fn(async () => ({}))
    };
    const api = {
      id: 'api',
      getFeed: vi.fn(async () => ({ pages: [] })),
      setFeedCachedPages: vi.fn()
    };
    const drawerController = {
      load: vi.fn(),
      handleSignedIn: vi.fn().mockResolvedValue(undefined),
      handleSignedOut: vi.fn(),
      refreshOpenScopes: vi.fn().mockResolvedValue(undefined)
    };
    const startNewtabPageFn = vi.fn().mockResolvedValue(undefined);
    const noop = () => {};
    const app = createNewtabApp({
      API: api,
      AuthMenu: { id: 'auth-menu' },
      ProjectManager: class FakeProjectManager {},
      ThemeManager: { id: 'theme-manager' },
      documentObj: { id: 'document' },
      dependencies: {
        bindNewtabEventHandlersFn: noop,
        createNewtabAuthControllerFn: vi.fn(() => ({ id: 'auth-controller' })),
        createNewtabAuthLifecycleFn: vi.fn(() => ({
          onSignedIn: noop,
          onSignedOut: noop
        })),
        createProjectsStoreFn: vi.fn(() => ({ id: 'projects-store' })),
        createSavedPagesFooterUpdaterFn: vi.fn(() => noop),
        createSavedPagesDrawerControllerFn: vi.fn(() => drawerController),
        createSavedPagesStoreFn: vi.fn(() => savedPagesStore),
        escapeHtmlFn: vi.fn((value) => value),
        getNewtabElementsFn: vi.fn(() => elements),
        startNewtabPageFn,
        updateStatsDisplayFn: noop,
        updateVersionIndicatorFn: noop
      }
    });

    await app.start();
    const bus = startNewtabPageFn.mock.calls[0][0].realtimeClient.bus;
    return { bus, api, savedPagesStore };
  }

  it('refreshes the personal list only for user-scoped events', async () => {
    vi.useFakeTimers();
    const { bus, savedPagesStore } = await buildRealtimeHarness();

    bus.dispatch({ type: 'page_updated', scopeKeys: ['user:u1'], pageId: 'p1' });
    await vi.advanceTimersByTimeAsync(0);
    expect(savedPagesStore.refreshInitial).toHaveBeenCalledTimes(1);

    // An org-mate's event is irrelevant to the personal list: the personal
    // store must NOT re-pull (only the feed refresh is scheduled).
    bus.dispatch({ type: 'page_updated', scopeKeys: ['org:gmail.com'], pageId: 'p2' });
    await vi.advanceTimersByTimeAsync(0);
    expect(savedPagesStore.refreshInitial).toHaveBeenCalledTimes(1);
  });

  it('coalesces a burst of org events into one cache-bypassing feed refresh', async () => {
    vi.useFakeTimers();
    const { bus, api } = await buildRealtimeHarness();

    for (let i = 0; i < 5; i += 1) {
      bus.dispatch({ type: 'page_updated', scopeKeys: ['org:gmail.com'], pageId: `p${i}` });
    }
    // Trailing debounce: nothing fetches until the burst settles.
    await vi.advanceTimersByTimeAsync(749);
    expect(api.getFeed).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    expect(api.getFeed).toHaveBeenCalledTimes(1);
    expect(api.getFeed).toHaveBeenCalledWith({ limit: 50, skipCache: true });
  });
});
