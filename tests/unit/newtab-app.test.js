import { describe, expect, it, vi } from 'vitest';

import {
  createNewtabApp,
  getAuthControllerElements,
  getDrawerControllerElements,
  getFavoritesControllerElements
} from '../../src/newtab-app.js';

describe('newtab app factory', () => {
  it('maps favorites, drawer, and auth element groups', () => {
    const elements = {
      favoriteHoverCard: 'hover-card',
      favoriteHoverConnector: 'hover-connector',
      favoritesDots: 'dots',
      favoritesNextBtn: 'next',
      favoritesPrevBtn: 'prev',
      favoritesRow: 'row',
      favoritesSection: 'section',
      favoritesViewport: 'viewport',
      projectEditorBackdrop: 'backdrop',
      projectEditorDialog: 'dialog',
      projectSidebar: 'sidebar',
      savedPagesDrawer: 'drawer',
      savedPagesDrawerBackdrop: 'drawer-backdrop',
      savedPagesDrawerClearBtn: 'clear',
      savedPagesDrawerCloseBtn: 'close',
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

    expect(getFavoritesControllerElements(elements)).toEqual({
      favoriteHoverCard: 'hover-card',
      favoriteHoverConnector: 'hover-connector',
      favoritesDots: 'dots',
      favoritesNextBtn: 'next',
      favoritesPrevBtn: 'prev',
      favoritesRow: 'row',
      favoritesSection: 'section',
      favoritesViewport: 'viewport'
    });
    expect(getDrawerControllerElements(elements)).toEqual({
      projectEditorBackdrop: 'backdrop',
      projectEditorDialog: 'dialog',
      projectSidebar: 'sidebar',
      savedPagesDrawer: 'drawer',
      savedPagesDrawerBackdrop: 'drawer-backdrop',
      savedPagesDrawerClearBtn: 'clear',
      savedPagesDrawerCloseBtn: 'close',
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
    const favoritesStore = { id: 'favorites-store' };
    const savedPagesStore = { id: 'saved-pages-store' };
    const projectsStore = { id: 'projects-store' };
    const favoritesController = {
      load: vi.fn().mockResolvedValue(undefined),
      reset: vi.fn()
    };
    const drawerController = {
      handleSignedIn: vi.fn().mockResolvedValue(undefined),
      handleSignedOut: vi.fn()
    };
    const authController = { id: 'auth-controller' };
    const bindNewtabEventHandlersFn = vi.fn();
    const startNewtabPageFn = vi.fn().mockResolvedValue(undefined);
    const updateStatsDisplayFn = vi.fn();
    const updateVersionIndicatorFn = vi.fn();
    const createFavoritesControllerFn = vi.fn(() => favoritesController);
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
        createFavoritesControllerFn,
        createFavoritesStoreFn: vi.fn(() => favoritesStore),
        createNewtabAuthControllerFn,
        createProjectsStoreFn: vi.fn(() => projectsStore),
        createSavedPagesDrawerControllerFn,
        createSavedPagesStoreFn: vi.fn(() => savedPagesStore),
        escapeHtmlFn: vi.fn(value => value),
        getNewtabElementsFn: vi.fn(() => elements),
        startNewtabPageFn,
        updateStatsDisplayFn,
        updateVersionIndicatorFn
      }
    });

    expect(createFavoritesControllerFn).toHaveBeenCalledWith({
      store: favoritesStore,
      elements: {}
    });
    expect(createSavedPagesDrawerControllerFn).toHaveBeenCalledTimes(1);
    expect(createNewtabAuthControllerFn).toHaveBeenCalledTimes(1);

    const drawerOptions = createSavedPagesDrawerControllerFn.mock.calls[0][0];
    drawerOptions.onSavedPagesTotalChange(42);
    expect(updateStatsDisplayFn).toHaveBeenCalledWith(elements.versionIndicator, { total: 42 });
    await drawerOptions.refreshFavorites();
    expect(favoritesController.load).toHaveBeenCalled();

    const authOptions = createNewtabAuthControllerFn.mock.calls[0][0];
    await authOptions.onSignedIn();
    expect(favoritesController.load).toHaveBeenCalledTimes(2);
    expect(drawerController.handleSignedIn).toHaveBeenCalled();
    await authOptions.onSignedOut();
    expect(favoritesController.reset).toHaveBeenCalled();
    expect(drawerController.handleSignedOut).toHaveBeenCalled();

    app.bind();
    expect(bindNewtabEventHandlersFn).toHaveBeenCalledWith({
      elements,
      authController,
      drawerController,
      documentObj: { id: 'document' }
    });

    await app.start();
    expect(startNewtabPageFn).toHaveBeenCalledWith({
      ThemeManager: { id: 'theme-manager' },
      versionNumberEl: elements.versionNumberEl,
      updateVersionIndicator: updateVersionIndicatorFn,
      favoritesController,
      drawerController,
      authController
    });
  });
});
