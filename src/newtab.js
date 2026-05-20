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
  escapeHtml,
  updateStatsDisplay,
  updateVersionIndicator
} from './newtab-shared.js';

const searchForm = document.getElementById('search-form');
const searchInput = document.getElementById('search-input');
const signInBtn = document.getElementById('hero-sign-in-btn');
const favoritesSection = document.getElementById('favorites-section');
const favoritesViewport = document.getElementById('favorites-viewport');
const favoritesRow = document.getElementById('favorites-row');
const favoritesPrevBtn = document.getElementById('favorites-prev-btn');
const favoritesNextBtn = document.getElementById('favorites-next-btn');
const favoritesDots = document.getElementById('favorites-dots');
const favoriteHoverConnector = document.getElementById('favorite-hover-connector');
const favoriteHoverCard = document.getElementById('favorite-hover-card');
const userMenu = document.getElementById('hero-user-menu');
const userAvatarBtn = document.getElementById('hero-user-avatar-btn');
const userAvatar = document.getElementById('hero-user-avatar');
const userDropdown = document.getElementById('hero-user-dropdown');
const userEmailEl = document.getElementById('hero-user-email');
const signOutBtn = document.getElementById('hero-sign-out-btn');
const savedPagesToggleBtn = document.getElementById('saved-pages-toggle-btn');
const savedPagesDrawer = document.getElementById('saved-pages-drawer');
const savedPagesDrawerBackdrop = document.getElementById('saved-pages-drawer-backdrop');
const savedPagesDrawerCloseBtn = document.getElementById('saved-pages-drawer-close-btn');
const savedPagesDrawerSearchForm = document.getElementById('saved-pages-drawer-search-form');
const savedPagesDrawerSearchInput = document.getElementById('saved-pages-drawer-search-input');
const savedPagesDrawerClearBtn = document.getElementById('saved-pages-drawer-clear-btn');
const savedPagesDrawerResults = document.getElementById('saved-pages-drawer-results');
const projectSidebar = document.getElementById('project-sidebar');
const projectEditorBackdrop = document.getElementById('project-editor-backdrop');
const projectEditorDialog = document.getElementById('project-editor-dialog');
const versionIndicator = document.getElementById('hero-version-indicator');
const versionNumberEl = document.getElementById('hero-version-number');
const api = globalThis.API;

function initTheme() {
  ThemeManager.init('hero-theme-toggle-container');
}

function updateSavedPagesFooter(total) {
  updateStatsDisplay(
    versionIndicator,
    typeof total === 'number' ? { total } : null
  );
}

function handleSearch(event) {
  event.preventDefault();
  drawerController.open({
    searchQuery: searchInput?.value?.trim() || ''
  });
}

const projectManager = new ProjectManager(api, { escapeHtml });
const favoritesStore = createFavoritesStore(api);
const savedPagesStore = createSavedPagesStore(api);
const projectsStore = createProjectsStore(api);

const favoritesController = createFavoritesController({
  store: favoritesStore,
  elements: {
    favoritesSection,
    favoritesViewport,
    favoritesRow,
    favoritesPrevBtn,
    favoritesNextBtn,
    favoritesDots,
    favoriteHoverConnector,
    favoriteHoverCard
  }
});

const drawerController = createSavedPagesDrawerController({
  api,
  savedPagesStore,
  projectsStore,
  projectManager,
  elements: {
    savedPagesToggleBtn,
    savedPagesDrawer,
    savedPagesDrawerBackdrop,
    savedPagesDrawerCloseBtn,
    savedPagesDrawerSearchForm,
    savedPagesDrawerSearchInput,
    savedPagesDrawerClearBtn,
    savedPagesDrawerResults,
    projectSidebar,
    projectEditorBackdrop,
    projectEditorDialog
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
    signInBtn,
    userMenu,
    userAvatar,
    userDropdown,
    userEmailEl
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

searchForm?.addEventListener('submit', handleSearch);
signInBtn?.addEventListener('click', () => void authController.handleSignIn());
userAvatarBtn?.addEventListener('click', () => authController.toggleUserDropdown());
signOutBtn?.addEventListener('click', () => void authController.handleSignOut());

document.addEventListener('click', (event) => {
  authController.hideDropdownForOutsideClick(event.target);
});

initTheme();
updateVersionIndicator(versionNumberEl);
favoritesController.init();
drawerController.init();
void favoritesController.load();
void drawerController.loadSummary();

await authController.init();
