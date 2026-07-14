import { describe, expect, it, vi } from 'vitest';

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
      handleSignedOut: vi.fn()
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
      API: { id: 'api' },
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
      authController,
      realtimeClient: expect.objectContaining({ bus: expect.any(Object) })
    });
  });
});
