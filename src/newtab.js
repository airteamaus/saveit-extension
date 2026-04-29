// newtab-minimal.js - Minimal new tab with search navigation
// Handles search form submission, Firebase auth, and Unsplash background

/* global ThemeManager, AuthMenu */

import { unsplashAccessKey, getStorageAPI } from './config.js';

const CACHE_KEY = 'newtab_background';
const CACHE_DURATION_MS = 3 * 60 * 60 * 1000; // 3 hours

const searchForm = document.getElementById('search-form');
const searchInput = document.getElementById('search-input');
const signInBtn = document.getElementById('hero-sign-in-btn');
const backgroundEl = document.getElementById('background');
const photoCreditEl = document.getElementById('photo-credit');
const photographerLinkEl = document.getElementById('photographer-link');
const favoritesSection = document.getElementById('favorites-section');
const favoritesViewport = document.getElementById('favorites-viewport');
const favoritesRow = document.getElementById('favorites-row');
const favoritesPrevBtn = document.getElementById('favorites-prev-btn');
const favoritesNextBtn = document.getElementById('favorites-next-btn');
const favoritesDots = document.getElementById('favorites-dots');
const userMenu = document.getElementById('hero-user-menu');
const userAvatarBtn = document.getElementById('hero-user-avatar-btn');
const userAvatar = document.getElementById('hero-user-avatar');
const userDropdown = document.getElementById('hero-user-dropdown');
const userEmailEl = document.getElementById('hero-user-email');
const signOutBtn = document.getElementById('hero-sign-out-btn');
const refreshBackgroundBtn = document.getElementById('hero-refresh-background-btn');
const dashboardToggleBtn = document.getElementById('dashboard-toggle-btn');
const dashboardToggleIcon = document.getElementById('dashboard-toggle-icon');
const dashboardDrawer = document.getElementById('dashboard-drawer');
const dashboardDrawerBackdrop = document.getElementById('dashboard-drawer-backdrop');

const DASHBOARD_DRAWER_PARAM = 'drawer';
const DASHBOARD_DRAWER_VALUE = 'dashboard';
const FAVORITES_MAX_ITEMS = 60;
const FAVORITES_DRAG_THRESHOLD = 40;
const FAVORITES_MAX_COLUMNS = 10;
const FAVORITES_MIN_COLUMNS = 6;
const FAVORITES_MOBILE_COLUMNS = 4;
const FAVORITES_MOBILE_ROWS = 2;
const FAVORITES_DEFAULT_ROWS = 2;
const FAVORITES_TALL_SCREEN_ROWS = 3;
const FAVORITES_TALL_SCREEN_HEIGHT = 860;
const FAVORITES_WIDE_SCREEN_THREE_ROW_WIDTH = 1280;
const FAVORITES_DESKTOP_TILE_WIDTH = 88;
const FAVORITES_MOBILE_TILE_WIDTH = 80;
const FAVORITES_TILE_GAP = 12;
const FAVORITES_WIDTH_PADDING = 220;
const FAVORITES_MAX_GRID_WIDTH = 1008;

const favoritesState = {
  allPages: [],
  pagedPages: [],
  currentPage: 0,
  pageSize: 12,
  columns: 6,
  rows: 2,
  tileWidth: FAVORITES_DESKTOP_TILE_WIDTH,
  pointerActive: false,
  pointerStartX: 0,
  pointerStartY: 0,
  pointerDeltaX: 0,
  pointerDeltaY: 0,
  dragging: false,
  suppressClick: false
};

/**
 * Initialize theme from saved preference and inject toggle
 */
function initTheme() {
  ThemeManager.init('hero-theme-toggle-container');
}

/**
 * Update user avatar display
 * @param {Object} user - Firebase user object
 */
function updateUserAvatar(user) {
  AuthMenu.updateCompactMenu({ menuRoot: userMenu, avatarEl: userAvatar, userEmailEl }, user);
}

/**
 * Toggle user dropdown
 */
function toggleUserDropdown() {
  AuthMenu.toggleDropdown(userDropdown);
}

/**
 * Handle sign out
 */
async function handleSignOut() {
  try {
    await AuthMenu.signOut();
    // Auth state listener will update UI
  } catch (error) {
    console.error('[newtab-minimal] Sign out failed:', error);
  }
}

/**
 * Update UI based on authentication state
 * @param {Object|null} user - User object with email and displayName, or null
 */
function updateAuthUI(user) {
  updateUserAvatar(user);
  if (user) {
    signInBtn.classList.add('hidden');
  } else {
    signInBtn.classList.remove('hidden');
  }
}

/**
 * Get favicon URL for a page
 * @param {string} url - Page URL
 * @returns {string} Favicon URL via Google's service
 */
function getFaviconUrl(url) {
  try {
    const domain = new URL(url).hostname;
    return `https://icons.duckduckgo.com/ip3/${domain}.ico`;
  } catch {
    return null;
  }
}

/**
 * Create a favorite item element
 * @param {Object} page - Page object with url, title
 * @returns {HTMLElement} Favorite item anchor element
 */
function createFavoriteItem(page) {
  const item = document.createElement('a');
  item.className = 'favorite-item';
  item.href = page.url;

  const iconContainer = document.createElement('div');
  iconContainer.className = 'favorite-icon';

  const faviconUrl = getFaviconUrl(page.url);
  if (faviconUrl) {
    const img = document.createElement('img');
    img.src = faviconUrl;
    img.alt = '';
    img.onerror = () => {
      // Fallback to bookmark icon on error
      iconContainer.innerHTML = `
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"></path>
        </svg>
      `;
    };
    iconContainer.appendChild(img);
  } else {
    iconContainer.innerHTML = `
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"></path>
      </svg>
    `;
  }

  const title = document.createElement('span');
  title.className = 'favorite-title';
  title.textContent = page.title || new URL(page.url).hostname;
  title.title = page.title || page.url;

  item.appendChild(iconContainer);
  item.appendChild(title);

  return item;
}

/**
 * Get responsive favorites layout for current viewport
 * @param {number} viewportWidth - Viewport width
 * @param {number} viewportHeight - Viewport height
 * @returns {{pageSize:number, columns:number, rows:number, tileWidth:number, gridWidth:number}} Layout data
 */
function getFavoritesLayout(viewportWidth = window.innerWidth, viewportHeight = window.innerHeight) {
  if (viewportWidth <= 640) {
    const columns = FAVORITES_MOBILE_COLUMNS;
    const rows = FAVORITES_MOBILE_ROWS;
    const tileWidth = FAVORITES_MOBILE_TILE_WIDTH;
    return {
      columns,
      rows,
      tileWidth,
      pageSize: columns * rows,
      gridWidth: (columns * tileWidth) + ((columns - 1) * FAVORITES_TILE_GAP)
    };
  }

  const availableWidth = Math.min(
    Math.max(viewportWidth - FAVORITES_WIDTH_PADDING, FAVORITES_MIN_COLUMNS * (FAVORITES_DESKTOP_TILE_WIDTH + FAVORITES_TILE_GAP)),
    FAVORITES_MAX_GRID_WIDTH
  );
  const calculatedColumns = Math.floor(
    (availableWidth + FAVORITES_TILE_GAP) / (FAVORITES_DESKTOP_TILE_WIDTH + FAVORITES_TILE_GAP)
  );
  const columns = Math.max(FAVORITES_MIN_COLUMNS, Math.min(FAVORITES_MAX_COLUMNS, calculatedColumns));
  const rows = viewportWidth >= FAVORITES_WIDE_SCREEN_THREE_ROW_WIDTH || viewportHeight >= FAVORITES_TALL_SCREEN_HEIGHT
    ? FAVORITES_TALL_SCREEN_ROWS
    : FAVORITES_DEFAULT_ROWS;
  const tileWidth = FAVORITES_DESKTOP_TILE_WIDTH;

  return {
    columns,
    rows,
    tileWidth,
    pageSize: columns * rows,
    gridWidth: (columns * tileWidth) + ((columns - 1) * FAVORITES_TILE_GAP)
  };
}

/**
 * Paginate favorites into pages
 * @param {Array} pages - Array of page objects
 * @param {number} pageSize - Number of favorites per page
 * @returns {Array<Array>} Chunked favorites
 */
function paginateFavorites(pages, pageSize) {
  const favorites = Array.isArray(pages) ? pages.slice(0, FAVORITES_MAX_ITEMS) : [];
  if (favorites.length === 0 || pageSize <= 0) return [];

  const pagedFavorites = [];
  for (let i = 0; i < favorites.length; i += pageSize) {
    pagedFavorites.push(favorites.slice(i, i + pageSize));
  }
  return pagedFavorites;
}

function updateFavoritesNav() {
  const totalPages = favoritesState.pagedPages.length;
  const hasMultiplePages = totalPages > 1;

  favoritesPrevBtn?.classList.toggle('favorites-nav-hidden', !hasMultiplePages);
  favoritesNextBtn?.classList.toggle('favorites-nav-hidden', !hasMultiplePages);

  if (favoritesPrevBtn) {
    favoritesPrevBtn.disabled = !hasMultiplePages || favoritesState.currentPage === 0;
  }

  if (favoritesNextBtn) {
    favoritesNextBtn.disabled = !hasMultiplePages || favoritesState.currentPage === totalPages - 1;
  }

  if (!favoritesDots) return;

  favoritesDots.innerHTML = '';
  favoritesDots.classList.toggle('hidden', !hasMultiplePages);

  if (!hasMultiplePages) return;

  favoritesState.pagedPages.forEach((_, index) => {
    const dot = document.createElement('button');
    dot.type = 'button';
    dot.className = 'favorite-dot';
    dot.setAttribute('aria-label', `Show favorites page ${index + 1}`);
    dot.setAttribute('aria-pressed', String(index === favoritesState.currentPage));
    if (index === favoritesState.currentPage) {
      dot.classList.add('active');
    }
    dot.addEventListener('click', () => goToFavoritesPage(index));
    favoritesDots.appendChild(dot);
  });
}

function applyFavoritesLayout(layout) {
  favoritesState.pageSize = layout.pageSize;
  favoritesState.columns = layout.columns;
  favoritesState.rows = layout.rows;
  favoritesState.tileWidth = layout.tileWidth;

  favoritesSection?.style.setProperty('--favorites-grid-width', `${layout.gridWidth}px`);
  favoritesRow?.style.setProperty('--favorites-columns', String(layout.columns));
  favoritesRow?.style.setProperty('--favorites-tile-width', `${layout.tileWidth}px`);
}

function renderFavoritesPage() {
  if (!favoritesRow || !favoritesSection) return;

  const favorites = favoritesState.pagedPages[favoritesState.currentPage] || [];
  favoritesRow.innerHTML = '';

  favorites.forEach(page => {
    favoritesRow.appendChild(createFavoriteItem(page));
  });

  favoritesSection.classList.toggle('hidden', favorites.length === 0);
  updateFavoritesNav();
}

function goToFavoritesPage(pageIndex) {
  if (!favoritesState.pagedPages.length) return;

  favoritesState.currentPage = Math.max(
    0,
    Math.min(pageIndex, favoritesState.pagedPages.length - 1)
  );
  renderFavoritesPage();
}

function resetFavorites() {
  favoritesState.allPages = [];
  favoritesState.pagedPages = [];
  favoritesState.currentPage = 0;
  applyFavoritesLayout(getFavoritesLayout());

  if (favoritesRow) favoritesRow.innerHTML = '';
  if (favoritesDots) favoritesDots.innerHTML = '';
  favoritesSection?.classList.add('hidden');
}

/**
 * Render favorites pager with recent saves
 * @param {Array} pages - Array of page objects
 */
function renderFavorites(pages) {
  if (!pages || pages.length === 0) {
    resetFavorites();
    return;
  }

  favoritesState.allPages = pages.slice(0, FAVORITES_MAX_ITEMS);
  const layout = getFavoritesLayout();
  applyFavoritesLayout(layout);
  favoritesState.pagedPages = paginateFavorites(favoritesState.allPages, layout.pageSize);
  favoritesState.currentPage = Math.min(
    favoritesState.currentPage,
    favoritesState.pagedPages.length - 1
  );
  renderFavoritesPage();
}

function handleFavoritesResize() {
  if (!favoritesState.allPages.length) return;

  const layout = getFavoritesLayout();
  if (
    layout.pageSize === favoritesState.pageSize &&
    layout.columns === favoritesState.columns &&
    layout.tileWidth === favoritesState.tileWidth
  ) return;

  const firstVisibleIndex = favoritesState.currentPage * favoritesState.pageSize;
  applyFavoritesLayout(layout);
  favoritesState.pagedPages = paginateFavorites(favoritesState.allPages, layout.pageSize);
  goToFavoritesPage(Math.floor(firstVisibleIndex / layout.pageSize));
}

function clearFavoritesPointerState() {
  favoritesState.pointerActive = false;
  favoritesState.pointerDeltaX = 0;
  favoritesState.pointerDeltaY = 0;
  favoritesState.dragging = false;
  favoritesViewport?.classList.remove('is-dragging');
}

function handleFavoritesPointerDown(event) {
  if (!favoritesState.pagedPages.length) return;
  if (event.pointerType === 'mouse' && event.button !== 0) return;

  favoritesState.pointerActive = true;
  favoritesState.pointerStartX = event.clientX;
  favoritesState.pointerStartY = event.clientY;
  favoritesState.pointerDeltaX = 0;
  favoritesState.pointerDeltaY = 0;
  favoritesState.dragging = false;
}

function handleFavoritesPointerMove(event) {
  if (!favoritesState.pointerActive) return;

  favoritesState.pointerDeltaX = event.clientX - favoritesState.pointerStartX;
  favoritesState.pointerDeltaY = event.clientY - favoritesState.pointerStartY;

  if (
    Math.abs(favoritesState.pointerDeltaX) > 10 &&
    Math.abs(favoritesState.pointerDeltaX) > Math.abs(favoritesState.pointerDeltaY)
  ) {
    favoritesState.dragging = true;
    favoritesViewport?.classList.add('is-dragging');
  }
}

function handleFavoritesPointerUp() {
  if (!favoritesState.pointerActive) return;

  const shouldPage =
    favoritesState.dragging &&
    Math.abs(favoritesState.pointerDeltaX) >= FAVORITES_DRAG_THRESHOLD &&
    Math.abs(favoritesState.pointerDeltaX) > Math.abs(favoritesState.pointerDeltaY);

  if (shouldPage) {
    const targetPage = favoritesState.pointerDeltaX < 0
      ? favoritesState.currentPage + 1
      : favoritesState.currentPage - 1;
    goToFavoritesPage(targetPage);

    favoritesState.suppressClick = true;
    window.setTimeout(() => {
      favoritesState.suppressClick = false;
    }, 150);
  }

  clearFavoritesPointerState();
}

function initFavoritesPager() {
  favoritesPrevBtn?.addEventListener('click', () => goToFavoritesPage(favoritesState.currentPage - 1));
  favoritesNextBtn?.addEventListener('click', () => goToFavoritesPage(favoritesState.currentPage + 1));

  favoritesViewport?.addEventListener('pointerdown', handleFavoritesPointerDown);
  favoritesViewport?.addEventListener('pointermove', handleFavoritesPointerMove);
  favoritesViewport?.addEventListener('pointerup', handleFavoritesPointerUp);
  favoritesViewport?.addEventListener('pointercancel', clearFavoritesPointerState);
  favoritesViewport?.addEventListener('pointerleave', (event) => {
    if (favoritesState.pointerActive && event.pointerType === 'mouse') {
      handleFavoritesPointerUp();
    }
  });
  favoritesViewport?.addEventListener('click', (event) => {
    if (!favoritesState.suppressClick) return;
    event.preventDefault();
    event.stopPropagation();
    favoritesState.suppressClick = false;
  }, true);

  window.addEventListener('resize', handleFavoritesResize);
}

/**
 * Handle search form submission - navigate to search results page
 * @param {Event} e - Form submit event
 */
function handleSearch(e) {
  e.preventDefault();
  const query = searchInput.value.trim();
  if (query) {
    // Navigate to minimal search results page
    window.location.href = `search-results.html?q=${encodeURIComponent(query)}`;
  } else {
    openDashboardDrawer();
  }
}

/**
 * Handle sign-in button click
 */
async function handleSignIn() {
  try {
    await AuthMenu.signIn(() => {
      if (typeof browser !== 'undefined' && browser.runtime) {
        return browser.runtime;
      }
      if (typeof chrome !== 'undefined' && chrome.runtime) {
        return chrome.runtime;
      }
      return null;
    });
  } catch (error) {
    console.error('Sign-in failed:', error);
    const message = error.message === 'Browser runtime not available'
      ? 'Sign in is only available when running as a browser extension.'
      : 'Failed to sign in. Please try again.';
    alert(message);
  }
}

function updateDrawerUrl(isOpen) {
  const url = new URL(window.location.href);
  if (isOpen) {
    url.searchParams.set(DASHBOARD_DRAWER_PARAM, DASHBOARD_DRAWER_VALUE);
  } else {
    url.searchParams.delete(DASHBOARD_DRAWER_PARAM);
  }
  window.history.replaceState({}, '', url);
}

function setDrawerToggleState(isOpen) {
  if (!dashboardToggleBtn || !dashboardToggleIcon) return;

  dashboardToggleBtn.setAttribute('aria-expanded', String(isOpen));
  dashboardToggleBtn.setAttribute('aria-label', isOpen ? 'Close saved pages' : 'Open saved pages');
  dashboardToggleBtn.title = isOpen ? 'Close saved pages' : 'Open saved pages';
  dashboardToggleIcon.textContent = isOpen ? 'x' : '+';
}

function openDashboardDrawer({ syncUrl = true } = {}) {
  if (!dashboardDrawer) return;

  dashboardDrawer.classList.remove('hidden');
  dashboardDrawer.setAttribute('aria-hidden', 'false');
  document.body.classList.add('dashboard-drawer-open');
  setDrawerToggleState(true);
  dashboardToggleBtn?.focus();

  if (syncUrl) {
    updateDrawerUrl(true);
  }
}

function closeDashboardDrawer({ syncUrl = true } = {}) {
  if (!dashboardDrawer) return;

  dashboardDrawer.classList.add('hidden');
  dashboardDrawer.setAttribute('aria-hidden', 'true');
  document.body.classList.remove('dashboard-drawer-open');
  setDrawerToggleState(false);

  if (syncUrl) {
    updateDrawerUrl(false);
  }
}

function initDashboardDrawer() {
  dashboardToggleBtn?.addEventListener('click', () => {
    if (dashboardDrawer?.classList.contains('hidden')) {
      openDashboardDrawer();
    } else {
      closeDashboardDrawer();
    }
  });

  dashboardDrawerBackdrop?.addEventListener('click', () => closeDashboardDrawer());

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && dashboardDrawer && !dashboardDrawer.classList.contains('hidden')) {
      closeDashboardDrawer();
    }
  });

  const urlParams = new URLSearchParams(window.location.search);
  if (urlParams.get(DASHBOARD_DRAWER_PARAM) === DASHBOARD_DRAWER_VALUE) {
    openDashboardDrawer({ syncUrl: false });
  } else {
    setDrawerToggleState(false);
  }
}

/**
 * Get background config for ThemeManager
 * @returns {Object} Configuration object for background management
 */
function getBackgroundConfig() {
  return {
    cacheKey: CACHE_KEY,
    cacheDurationMs: CACHE_DURATION_MS,
    storage: getStorageAPI(),
    unsplashAccessKey: unsplashAccessKey,
    backgroundEl: backgroundEl,
    photographerLinkEl: photographerLinkEl,
    photoCreditEl: photoCreditEl
  };
}

/**
 * Initialize background image from cache or Unsplash
 */
async function initBackground() {
  const themeManager = new ThemeManager();
  await themeManager.initBackground(getBackgroundConfig());
}

/**
 * Refresh background image (fetch new photo)
 */
async function refreshBackground() {
  const themeManager = new ThemeManager();
  await themeManager.refreshBackground(getBackgroundConfig());
}

/**
 * Fetch and display favorites (recent saves)
 * Returns pagination data for stats display
 * @returns {Promise<Object|null>} Pagination object or null
 */
async function initFavorites() {
  try {
    // Check if API is available (extension mode)
    if (typeof API === 'undefined' || !API.getSavedPages) {
      return null;
    }

    const options = { limit: FAVORITES_MAX_ITEMS, sort: 'newest', pinnedFirst: true };

    // 1. Try cache (or fresh if no cache)
    const response = await API.getSavedPages(options);
    if (response && response.pages) {
      renderFavorites(response.pages);
      updateStats(response.pagination);
    }

    // 2. Background refresh if in extension mode (to avoid cold start delay for user)
    if (API.isExtension) {
      API.getSavedPages({ ...options, skipCache: true })
        .then(freshResponse => {
          if (freshResponse && freshResponse.pages) {
            renderFavorites(freshResponse.pages);
            updateStats(freshResponse.pagination);
          }
        })
        .catch(err => console.debug('[newtab-minimal] Background refresh failed:', err));
    }

    return response ? response.pagination : null;
  } catch (error) {
    console.error('[newtab-minimal] Failed to load favorites:', error);
  }
  return null;
}

/**
 * Update stats counter display
 * @param {Object|null} pagination - Pagination object with total count
 */
function updateStats(pagination) {
  const versionIndicator = document.getElementById('hero-version-indicator');
  if (!versionIndicator) return;

  let statsSpan = versionIndicator.querySelector('.footer-stats');

  if (!pagination || typeof pagination.total !== 'number') {
    if (statsSpan) statsSpan.remove();
    return;
  }

  const total = pagination.total;
  const statsText = `(${total} ${total === 1 ? 'thing' : 'things'} saved)`;

  if (!statsSpan) {
    statsSpan = document.createElement('span');
    statsSpan.className = 'footer-stats';
    statsSpan.style.marginLeft = '4px';
    statsSpan.style.opacity = '0.7';
    versionIndicator.appendChild(statsSpan);
  }
  statsSpan.textContent = statsText;
}

/**
 * Initialize Firebase auth listener
 */
async function initAuth() {
  // Wait for Firebase to be ready in extension mode
  if (window.firebaseReady) {
    try {
      await window.firebaseReady;

      if (window.firebaseAuth && window.firebaseOnAuthStateChanged) {
        // Listen for auth state changes
        window.firebaseOnAuthStateChanged(window.firebaseAuth, async (user) => {
          updateAuthUI(user);
          if (user) {
            // User is signed in, load favorites and stats
            const pagination = await initFavorites();
            updateStats(pagination);
          } else {
            // User signed out, hide favorites and stats
            favoritesSection?.classList.add('hidden');
            updateStats(null);
          }
        });
      } else {
        // Firebase not available (standalone mode)
        updateAuthUI(null);
      }
    } catch (error) {
      console.error('[newtab-minimal] Firebase init failed:', error);
      updateAuthUI(null);
    }
  } else {
    // Standalone mode - show sign-in button
    updateAuthUI(null);
  }
}

/**
 * Update version indicator in footer
 */
function updateVersionIndicator() {
  const versionNumberEl = document.getElementById('hero-version-number');
  if (!versionNumberEl) return;

  try {
    // Try to get version from browser extension API
    if (typeof browser !== 'undefined' && browser.runtime) {
      const version = browser.runtime.getManifest().version;
      versionNumberEl.textContent = version;
    } else if (typeof chrome !== 'undefined' && chrome.runtime) {
      const version = chrome.runtime.getManifest().version;
      versionNumberEl.textContent = version;
    } else {
      // Standalone mode
      versionNumberEl.textContent = 'standalone';
    }
  } catch (error) {
    console.error('[newtab-minimal] Failed to get version:', error);
    versionNumberEl.textContent = 'unknown';
  }
}

// Event listeners
searchForm.addEventListener('submit', handleSearch);
signInBtn.addEventListener('click', handleSignIn);
userAvatarBtn.addEventListener('click', toggleUserDropdown);
signOutBtn.addEventListener('click', handleSignOut);
refreshBackgroundBtn.addEventListener('click', refreshBackground);
initFavoritesPager();

// Close dropdown when clicking outside
document.addEventListener('click', (e) => {
  if (userMenu && !userMenu.contains(e.target)) {
    AuthMenu.hideDropdown(userDropdown);
  }
});

// Initialize theme first (synchronous)
initTheme();

// Update version indicator
updateVersionIndicator();

// Drawer controls
initDashboardDrawer();

// Initialize (background and auth can run in parallel)
await Promise.all([
  initBackground(),
  initAuth()
]);
