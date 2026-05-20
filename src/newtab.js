/* global ThemeManager, AuthMenu, ProjectManager */

import './config.js';
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
  escapeHtml,
  updateStatsDisplay,
  updateVersionIndicator
} from './newtab-shared.js';

const api = globalThis.API;
const elements = getNewtabElements(document);

function updateSavedPagesFooter(total) {
  updateStatsDisplay(
    elements.versionIndicator,
    typeof total === 'number' ? { total } : null
  );
}

const projectManager = new ProjectManager(api, { escapeHtml });
const favoritesStore = createFavoritesStore(api);
const savedPagesStore = createSavedPagesStore(api);
const projectsStore = createProjectsStore(api);

const favoritesController = createFavoritesController({
  store: favoritesStore,
  elements: {
    favoriteHoverCard: elements.favoriteHoverCard,
    favoriteHoverConnector: elements.favoriteHoverConnector,
    favoritesDots: elements.favoritesDots,
    favoritesNextBtn: elements.favoritesNextBtn,
    favoritesPrevBtn: elements.favoritesPrevBtn,
    favoritesRow: elements.favoritesRow,
    favoritesSection: elements.favoritesSection,
    favoritesViewport: elements.favoritesViewport
  }
});

const drawerController = createSavedPagesDrawerController({
  api,
  savedPagesStore,
  projectsStore,
  projectManager,
  elements: {
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
  },
  onSavedPagesTotalChange: updateSavedPagesFooter,
  refreshFavorites: () => {
    void favoritesController.load();
  }
});

const authController = createNewtabAuthController({
  API: api,
  AuthMenu,
  elements: {
    signInBtn: elements.signInBtn,
    userAvatar: elements.userAvatar,
    userDropdown: elements.userDropdown,
    userEmailEl: elements.userEmailEl,
    userMenu: elements.userMenu
  },
  onSignedIn: async () => {
    await Promise.all([
      favoritesController.load(),
      drawerController.handleSignedIn()
    ]);
  },
  onSignedOut: async () => {
    favoritesController.reset();
    drawerController.handleSignedOut();
  }
});

bindNewtabEventHandlers({
  elements,
  authController,
  drawerController,
  documentObj: document
});

await startNewtabPage({
  ThemeManager,
  versionNumberEl: elements.versionNumberEl,
  updateVersionIndicator,
  favoritesController,
  drawerController,
  authController
});
