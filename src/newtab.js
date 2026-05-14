// newtab.js - Minimal new tab with search navigation
// Handles search form submission, Firebase auth, and Unsplash background

/* global ThemeManager, AuthMenu, ProjectManager */

import { unsplashAccessKey, getStorageAPI } from './config.js';
import { FavoritesStore } from './favorites-store.js';
import { isSavedPagesCacheInvalidation } from './saved-pages-cache.js';

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
const favoriteHoverConnector = document.getElementById('favorite-hover-connector');
const favoriteHoverCard = document.getElementById('favorite-hover-card');
const userMenu = document.getElementById('hero-user-menu');
const userAvatarBtn = document.getElementById('hero-user-avatar-btn');
const userAvatar = document.getElementById('hero-user-avatar');
const userDropdown = document.getElementById('hero-user-dropdown');
const userEmailEl = document.getElementById('hero-user-email');
const signOutBtn = document.getElementById('hero-sign-out-btn');
const refreshBackgroundBtn = document.getElementById('hero-refresh-background-btn');
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

const SAVED_PAGES_DRAWER_PARAM = 'drawer';
const SAVED_PAGES_DRAWER_VALUE = 'saved-pages';
const FAVORITES_MAX_ITEMS = 300;
const FAVORITES_INITIAL_FETCH_LIMIT = 36;
const FAVORITES_PREFETCH_BATCH_LIMIT = 72;
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
const DRAWER_SEARCH_DEBOUNCE_MS = 250;
const DRAWER_INITIAL_FETCH_LIMIT = 50;
const FAVORITE_PREVIEW_WIDTH_MULTIPLIER = 4;
const FAVORITE_PREVIEW_MARGIN = 8;
const FAVORITE_PREVIEW_GAP = 14;
const FAVORITES_WARM_CACHE_SCOPE = {
  surface: 'favorites-prefetch',
  sort: 'newest',
  pinnedFirst: true,
  limit: FAVORITES_MAX_ITEMS
};

let drawerSearchDebounceTimer = null;
let savedPagesCacheRefreshTimer = null;
let drawerProjectsPromise = null;

const favoritesState = {
  activePreviewId: null,
  pointerActive: false,
  pointerStartX: 0,
  pointerStartY: 0,
  pointerDeltaX: 0,
  pointerDeltaY: 0,
  dragging: false,
  suppressClick: false
};

const drawerState = {
  hasInitialized: false,
  isLoading: false,
  query: '',
  currentFilter: {
    search: '',
    projectId: null,
    cursor: null
  },
  pages: [],
  allPages: [],
  projects: [],
  projectsLoading: false,
  projectsAvailable: true,
  projectsUnavailableMessage: '',
  selectedProjectId: null,
  projectEditorState: {
    pageId: null,
    query: ''
  },
  total: null,
  allItemsTotal: null,
  requestId: 0
};

const projectManager = new ProjectManager(API, { escapeHtml });
const favoritesStore = new FavoritesStore(API, {
  maxItems: FAVORITES_MAX_ITEMS,
  initialFetchLimit: FAVORITES_INITIAL_FETCH_LIMIT,
  prefetchBatchLimit: FAVORITES_PREFETCH_BATCH_LIMIT,
  warmCacheScope: FAVORITES_WARM_CACHE_SCOPE,
  initialLayout: {
    pageSize: 12,
    columns: FAVORITES_MIN_COLUMNS,
    rows: FAVORITES_DEFAULT_ROWS,
    tileWidth: FAVORITES_DESKTOP_TILE_WIDTH,
    gridWidth: FAVORITES_MAX_GRID_WIDTH
  }
});

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
    console.error('[newtab] Sign out failed:', error);
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

function getPageDomain(page) {
  if (page.domain) {
    return page.domain;
  }

  try {
    return page.url ? new URL(page.url).hostname : '';
  } catch {
    return '';
  }
}

function formatSavedDate(savedAt) {
  if (!savedAt) return '';

  try {
    return new Date(savedAt).toLocaleDateString(undefined, {
      month: 'short',
      day: 'numeric',
      year: 'numeric'
    });
  } catch {
    return '';
  }
}

function getFavoritesSnapshot() {
  return favoritesStore.getSnapshot();
}

function getFavoritePreviewWidth(sectionWidth, tileWidth) {
  const maxWidth = Math.max(160, sectionWidth - (FAVORITE_PREVIEW_MARGIN * 2));
  return Math.min(
    maxWidth,
    (tileWidth * FAVORITE_PREVIEW_WIDTH_MULTIPLIER) + (FAVORITES_TILE_GAP * 3) + 28
  );
}

function clampFavoritePreviewLeft(sectionWidth, preferredLeft, previewWidth) {
  return Math.max(
    FAVORITE_PREVIEW_MARGIN,
    Math.min(preferredLeft, sectionWidth - previewWidth - FAVORITE_PREVIEW_MARGIN)
  );
}

function clampFavoritePreviewTop(sectionHeight, preferredTop, previewHeight) {
  return Math.max(
    FAVORITE_PREVIEW_MARGIN,
    Math.min(preferredTop, sectionHeight - previewHeight - FAVORITE_PREVIEW_MARGIN)
  );
}

function getFavoritePreviewPlacement(sectionRect, itemRect, previewRect) {
  const sectionWidth = sectionRect.width;
  const sectionHeight = sectionRect.height;
  const itemLeft = itemRect.left - sectionRect.left;
  const itemRight = itemRect.right - sectionRect.left;
  const itemTop = itemRect.top - sectionRect.top;
  const itemBottom = itemRect.bottom - sectionRect.top;
  const availableRight = sectionRect.right - itemRect.right - FAVORITE_PREVIEW_MARGIN;
  const availableLeft = itemRect.left - sectionRect.left - FAVORITE_PREVIEW_MARGIN;

  let placement = 'right';
  let left = itemRight + FAVORITE_PREVIEW_GAP;
  let top = clampFavoritePreviewTop(
    sectionHeight,
    (itemTop + (itemRect.height / 2)) - (previewRect.height / 2),
    previewRect.height
  );

  if (availableRight < previewRect.width + FAVORITE_PREVIEW_GAP) {
    if (availableLeft >= previewRect.width + FAVORITE_PREVIEW_GAP) {
      placement = 'left';
      left = itemLeft - previewRect.width - FAVORITE_PREVIEW_GAP;
    } else {
      const availableBelow = sectionRect.bottom - itemRect.bottom - FAVORITE_PREVIEW_MARGIN;
      const availableAbove = itemRect.top - sectionRect.top - FAVORITE_PREVIEW_MARGIN;
      left = clampFavoritePreviewLeft(
        sectionWidth,
        itemLeft + (itemRect.width / 2) - (previewRect.width / 2),
        previewRect.width
      );

      if (availableBelow >= previewRect.height + FAVORITE_PREVIEW_GAP || availableBelow >= availableAbove) {
        placement = 'below';
        top = itemBottom + FAVORITE_PREVIEW_GAP;
      } else {
        placement = 'above';
        top = itemTop - previewRect.height - FAVORITE_PREVIEW_GAP;
      }
    }
  }

  left = clampFavoritePreviewLeft(sectionWidth, left, previewRect.width);
  top = clampFavoritePreviewTop(sectionHeight, top, previewRect.height);

  return { placement, left, top };
}

function renderFavoritePreviewTags(page) {
  return renderDrawerTags(page);
}

function clearFavoritePreviewHighlight() {
  document.querySelectorAll('.favorite-item.is-preview-active').forEach(item => {
    item.classList.remove('is-preview-active');
  });
}

function hideFavoriteConnector() {
  if (!favoriteHoverConnector) return;

  favoriteHoverConnector.classList.add('hidden');
  favoriteHoverConnector.setAttribute('aria-hidden', 'true');
}

function showFavoriteConnector(itemRect, previewRect, sectionRect, placement) {
  if (!favoriteHoverConnector) return;

  const itemCenterX = (itemRect.left - sectionRect.left) + (itemRect.width / 2);
  const itemCenterY = (itemRect.top - sectionRect.top) + (itemRect.height / 2);
  let startX = itemCenterX;
  let startY = itemCenterY;
  let endX = previewRect.left - sectionRect.left;
  let endY = (previewRect.top - sectionRect.top) + (previewRect.height / 2);

  if (placement === 'right') {
    startX = itemRect.right - sectionRect.left;
  } else if (placement === 'left') {
    startX = itemRect.left - sectionRect.left;
    endX = (previewRect.right - sectionRect.left);
  } else if (placement === 'below') {
    startY = itemRect.bottom - sectionRect.top;
    endX = (previewRect.left - sectionRect.left) + (previewRect.width / 2);
    endY = previewRect.top - sectionRect.top;
  } else if (placement === 'above') {
    startY = itemRect.top - sectionRect.top;
    endX = (previewRect.left - sectionRect.left) + (previewRect.width / 2);
    endY = previewRect.bottom - sectionRect.top;
  }

  const deltaX = endX - startX;
  const deltaY = endY - startY;
  const length = Math.sqrt((deltaX ** 2) + (deltaY ** 2));
  const angle = Math.atan2(deltaY, deltaX);

  favoriteHoverConnector.style.left = `${startX}px`;
  favoriteHoverConnector.style.top = `${startY}px`;
  favoriteHoverConnector.style.width = `${length}px`;
  favoriteHoverConnector.style.transform = `rotate(${angle}rad)`;
  favoriteHoverConnector.classList.remove('hidden');
  favoriteHoverConnector.setAttribute('aria-hidden', 'false');
}

function hideFavoritePreview() {
  favoritesState.activePreviewId = null;
  clearFavoritePreviewHighlight();
  hideFavoriteConnector();
  if (!favoriteHoverCard) return;

  favoriteHoverCard.classList.add('hidden');
  favoriteHoverCard.setAttribute('aria-hidden', 'true');
}

function showFavoritePreview(page, item) {
  if (!favoriteHoverCard || !favoritesSection || !page || !item) {
    return;
  }

  const title = truncateText(page.title || '', 256);
  const domain = getPageDomain(page);
  const summary = page.ai_summary_brief || page.description || '';
  const savedDate = formatSavedDate(page.saved_at);
  const tagsHtml = renderFavoritePreviewTags(page);
  const meta = [];

  if (domain) meta.push(`<span>${escapeHtml(domain)}</span>`);
  if (savedDate) meta.push(`<span>Saved ${escapeHtml(savedDate)}</span>`);
  if (page.reading_time_minutes) meta.push(`<span>${page.reading_time_minutes} min read</span>`);
  if (page.pinned) meta.push('<span>Pinned</span>');

  favoriteHoverCard.innerHTML = `
    <div class="favorite-hover-card-header">
      <div class="favorite-hover-card-icon">
        ${domain ? `<img src="https://icons.duckduckgo.com/ip3/${escapeHtml(domain)}.ico" alt="" width="22" height="22">` : ''}
      </div>
      <h3 class="favorite-hover-card-title">${escapeHtml(title)}</h3>
    </div>
    ${summary ? `<p class="favorite-hover-card-summary">${escapeHtml(truncateText(summary, 220))}</p>` : ''}
    ${tagsHtml ? `<div class="favorite-hover-card-tags">${tagsHtml}</div>` : ''}
    ${meta.length ? `<div class="favorite-hover-card-meta">${meta.join('<span class="favorite-hover-card-separator">•</span>')}</div>` : ''}
  `;

  const sectionRect = favoritesSection.getBoundingClientRect();
  const itemRect = item.getBoundingClientRect();
  const previewWidth = getFavoritePreviewWidth(sectionRect.width, getFavoritesSnapshot().tileWidth);

  favoriteHoverCard.style.width = `${previewWidth}px`;
  favoriteHoverCard.classList.remove('hidden');
  favoriteHoverCard.setAttribute('aria-hidden', 'false');

  const previewRect = favoriteHoverCard.getBoundingClientRect();
  const { placement, left, top } = getFavoritePreviewPlacement(sectionRect, itemRect, previewRect);

  favoriteHoverCard.style.left = `${left}px`;
  favoriteHoverCard.style.top = `${top}px`;
  favoriteHoverCard.dataset.placement = placement;
  clearFavoritePreviewHighlight();
  item.classList.add('is-preview-active');

  const updatedPreviewRect = favoriteHoverCard.getBoundingClientRect();
  showFavoriteConnector(itemRect, updatedPreviewRect, sectionRect, placement);
  favoritesState.activePreviewId = page.id;
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
  item.dataset.pageId = page.id;

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

  item.addEventListener('mouseenter', () => showFavoritePreview(page, item));
  item.addEventListener('focus', () => showFavoritePreview(page, item));
  item.addEventListener('mouseleave', hideFavoritePreview);
  item.addEventListener('blur', hideFavoritePreview);

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

function updateFavoritesNav(snapshot = getFavoritesSnapshot()) {
  const totalPages = snapshot.pagedPages.length;
  const hasMultiplePages = totalPages > 1;

  favoritesPrevBtn?.classList.toggle('favorites-nav-hidden', !hasMultiplePages);
  favoritesNextBtn?.classList.toggle('favorites-nav-hidden', !hasMultiplePages);

  if (favoritesPrevBtn) {
    favoritesPrevBtn.disabled = !hasMultiplePages || snapshot.currentPage === 0;
  }

  if (favoritesNextBtn) {
    favoritesNextBtn.disabled = !hasMultiplePages || snapshot.currentPage >= totalPages - 1;
  }

  if (!favoritesDots) return;

  favoritesDots.innerHTML = '';
  favoritesDots.classList.toggle('hidden', !hasMultiplePages);

  if (!hasMultiplePages) return;

  snapshot.pagedPages.forEach((_, index) => {
    const dot = document.createElement('button');
    dot.type = 'button';
    dot.className = 'favorite-dot';
    dot.setAttribute('aria-label', `Show favorites page ${index + 1}`);
    dot.setAttribute('aria-pressed', String(index === snapshot.currentPage));
    if (index === snapshot.currentPage) {
      dot.classList.add('active');
    }
    dot.addEventListener('click', () => void favoritesStore.goToPage(index));
    favoritesDots.appendChild(dot);
  });
}

function applyFavoritesLayout(snapshot = getFavoritesSnapshot()) {
  favoritesSection?.style.setProperty('--favorites-grid-width', `${snapshot.gridWidth}px`);
  favoritesRow?.style.setProperty('--favorites-columns', String(snapshot.columns));
  favoritesRow?.style.setProperty('--favorites-tile-width', `${snapshot.tileWidth}px`);
}

function renderFavoritesPage(snapshot = getFavoritesSnapshot()) {
  if (!favoritesRow || !favoritesSection) return;
  hideFavoritePreview();
  applyFavoritesLayout(snapshot);

  const favorites = snapshot.pagedPages[snapshot.currentPage] || [];
  favoritesRow.innerHTML = '';

  favorites.forEach(page => {
    favoritesRow.appendChild(createFavoriteItem(page));
  });

  favoritesSection.classList.toggle('hidden', favorites.length === 0);
  updateStats(snapshot.total === null ? null : { total: snapshot.total });
  updateFavoritesNav(snapshot);
}

favoritesStore.subscribe(() => {
  renderFavoritesPage();
});

function handleFavoritesResize() {
  const snapshot = getFavoritesSnapshot();
  const layout = getFavoritesLayout();
  if (
    layout.pageSize === snapshot.pageSize &&
    layout.columns === snapshot.columns &&
    layout.tileWidth === snapshot.tileWidth
  ) return;

  hideFavoritePreview();
  favoritesStore.applyLayout(layout);
}

function clearFavoritesPointerState() {
  favoritesState.pointerActive = false;
  favoritesState.pointerDeltaX = 0;
  favoritesState.pointerDeltaY = 0;
  favoritesState.dragging = false;
  favoritesViewport?.classList.remove('is-dragging');
}

function handleFavoritesPointerDown(event) {
  if (!getFavoritesSnapshot().pagedPages.length) return;
  if (event.pointerType === 'mouse' && event.button !== 0) return;
  hideFavoritePreview();

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
    const snapshot = getFavoritesSnapshot();
    const targetPage = favoritesState.pointerDeltaX < 0
      ? snapshot.currentPage + 1
      : snapshot.currentPage - 1;
    void favoritesStore.goToPage(targetPage);

    favoritesState.suppressClick = true;
    window.setTimeout(() => {
      favoritesState.suppressClick = false;
    }, 150);
  }

  clearFavoritesPointerState();
}

function initFavoritesPager() {
  favoritesStore.applyLayout(getFavoritesLayout(), { emit: false });
  renderFavoritesPage();

  favoritesPrevBtn?.addEventListener('click', () => void favoritesStore.goToPage(getFavoritesSnapshot().currentPage - 1));
  favoritesNextBtn?.addEventListener('click', () => void favoritesStore.goToPage(getFavoritesSnapshot().currentPage + 1));

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
  openSavedPagesDrawer({ searchQuery: query });
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

function updateDrawerUrl(isOpen, searchQuery = '') {
  const url = new URL(window.location.href);
  if (isOpen) {
    url.searchParams.set(SAVED_PAGES_DRAWER_PARAM, SAVED_PAGES_DRAWER_VALUE);
    if (searchQuery.trim()) {
      url.searchParams.set('search', searchQuery.trim());
    } else {
      url.searchParams.delete('search');
    }
  } else {
    url.searchParams.delete(SAVED_PAGES_DRAWER_PARAM);
    url.searchParams.delete('search');
  }
  window.history.replaceState({}, '', url);
}

function setDrawerToggleState(isOpen) {
  if (!savedPagesToggleBtn) return;

  savedPagesToggleBtn.setAttribute('aria-expanded', String(isOpen));
  savedPagesToggleBtn.setAttribute('aria-label', isOpen ? 'Close saved pages' : 'Open saved pages');
  savedPagesToggleBtn.title = isOpen ? 'Close saved pages' : 'Open saved pages';
  savedPagesToggleBtn.classList.toggle('is-active', isOpen);
}

function setDrawerSearchValue(query = '') {
  if (!savedPagesDrawerSearchInput || !savedPagesDrawerClearBtn) return;
  savedPagesDrawerSearchInput.value = query;
  savedPagesDrawerClearBtn.classList.toggle('hidden', !query.trim());
}

function getDrawerCurrentUser() {
  return window.firebaseAuth?.currentUser || null;
}

function escapeHtml(text = '') {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

function truncateText(text = '', maxLength = 180) {
  if (!text || text.length <= maxLength) return text;
  return `${text.slice(0, maxLength).trim()}...`;
}

const savedPagesView = {
  get allPages() {
    return drawerState.allPages;
  },
  set allPages(value) {
    drawerState.allPages = Array.isArray(value) ? value : [];
  },
  get pages() {
    return drawerState.pages;
  },
  set pages(value) {
    drawerState.pages = Array.isArray(value) ? value : [];
  },
  get projects() {
    return drawerState.projects;
  },
  set projects(value) {
    drawerState.projects = Array.isArray(value) ? value : [];
  },
  get projectsLoading() {
    return drawerState.projectsLoading;
  },
  set projectsLoading(value) {
    drawerState.projectsLoading = value === true;
  },
  get selectedProjectId() {
    return drawerState.selectedProjectId;
  },
  set selectedProjectId(value) {
    drawerState.selectedProjectId = value || null;
  },
  get projectsAvailable() {
    return drawerState.projectsAvailable;
  },
  set projectsAvailable(value) {
    drawerState.projectsAvailable = value !== false;
  },
  get projectsUnavailableMessage() {
    return drawerState.projectsUnavailableMessage;
  },
  set projectsUnavailableMessage(value) {
    drawerState.projectsUnavailableMessage = value || '';
  },
  get projectEditorState() {
    return drawerState.projectEditorState;
  },
  set projectEditorState(value) {
    drawerState.projectEditorState = value || { pageId: null, query: '' };
  },
  get currentFilter() {
    return drawerState.currentFilter;
  },
  get totalPages() {
    return drawerState.total;
  },
  set totalPages(value) {
    drawerState.total = value;
  },
  get allItemsTotal() {
    return drawerState.allItemsTotal;
  },
  set allItemsTotal(value) {
    drawerState.allItemsTotal = value;
  },
  getCurrentUser: getDrawerCurrentUser,
  showLoading: renderDrawerLoadingState,
  async loadPages() {
    await loadDrawerBasePages({ query: drawerState.query, syncUrl: false });
  },
  async handleFilterChange() {
    applyDrawerFilters(drawerState.currentFilter.search || '');
    renderDrawerResults();
  },
  render() {
    renderDrawerResults();
  },
  onProjectsUpdated() {
    renderDrawerResults();
  },
  tagInteractionManager: {
    clearSelection() {}
  },
  discoveryManager: {
    exit() {}
  }
};

function renderDrawerTags(page) {
  const tags = [];

  if (page.classifications?.length) {
    page.classifications.slice(0, 2).forEach(classification => {
      tags.push(
        `<span class="tag ai-tag tag-${escapeHtml(classification.type)}">${escapeHtml(classification.label)}</span>`
      );
    });
  } else if (page.primary_classification_label) {
    tags.push(`<span class="tag ai-tag">${escapeHtml(page.primary_classification_label)}</span>`);
  }

  if (page.manual_tags?.length) {
    page.manual_tags.slice(0, 1).forEach(tag => {
      tags.push(`<span class="tag">${escapeHtml(tag)}</span>`);
    });
  }

  return tags.join('');
}

function getDrawerProjectPills(page) {
  return projectManager.getProjectPills(page, savedPagesView);
}

function getProjectScopeLabel() {
  const selectedProject = projectManager.getSelectedProject(savedPagesView);
  return selectedProject ? selectedProject.name : 'All saved items';
}

function getDrawerSearchableText(page) {
  const fields = [
    page.title,
    page.url,
    page.domain,
    page.description,
    page.ai_summary_brief,
    page.primary_classification_label,
    ...(page.manual_tags || []),
    ...(page.classifications || []).map(classification => classification.label)
  ];

  return fields
    .filter(Boolean)
    .join(' ')
    .toLowerCase();
}

function applyDrawerFilters(query = drawerState.query) {
  const trimmedQuery = query.trim();
  drawerState.query = trimmedQuery;
  drawerState.currentFilter.search = trimmedQuery;

  const scopedPages = projectManager.getScopedPages(savedPagesView, drawerState.allPages);
  drawerState.total = drawerState.selectedProjectId
    ? scopedPages.length
    : (typeof drawerState.allItemsTotal === 'number' ? drawerState.allItemsTotal : null);

  if (!trimmedQuery) {
    drawerState.pages = [...scopedPages];
    return;
  }

  const loweredQuery = trimmedQuery.toLowerCase();
  drawerState.pages = scopedPages.filter(page => getDrawerSearchableText(page).includes(loweredQuery));
}

function renderProjectSidebar() {
  projectManager.renderSidebar(savedPagesView);
}

function renderProjectEditor() {
  projectManager.renderEditor(savedPagesView);
}

function renderDrawerChrome() {
  renderProjectSidebar();
  renderProjectEditor();
}

function renderDrawerCard(page) {
  let derivedDomain = '';
  if (page.url) {
    try {
      derivedDomain = new URL(page.url).hostname;
    } catch {
      derivedDomain = '';
    }
  }

  const domain = page.domain || derivedDomain;
  const summary = page.ai_summary_brief || page.description || '';
  const meta = [];

  if (domain) {
    meta.push(`<span>${escapeHtml(domain)}</span>`);
  }

  if (page.reading_time_minutes) {
    meta.push(`<span>${page.reading_time_minutes} min read</span>`);
  }

  const tagsHtml = renderDrawerTags(page);
  const projectPills = getDrawerProjectPills(page);
  const projectsUnavailable = savedPagesView.projectsAvailable === false;
  const projectPillsHtml = projectPills.length
    ? `
      <div class="saved-pages-drawer-card-projects">
        ${projectPills.map(project => `
          <span class="project-pill" title="${escapeHtml(project.name)}">
            <span class="project-pill-label">${escapeHtml(project.name)}</span>
            <button
              class="project-pill-remove"
              type="button"
              data-action="remove-project"
              data-id="${escapeHtml(page.id)}"
              data-project-id="${escapeHtml(project.id)}"
              title="Remove from ${escapeHtml(project.name)}"
              aria-label="Remove from ${escapeHtml(project.name)}"
            >×</button>
          </span>
        `).join('')}
      </div>
    `
    : '';

  return `
    <a class="saved-pages-drawer-card" href="${escapeHtml(page.url || '#')}">
      <div class="saved-pages-drawer-card-header">
        <div class="saved-pages-drawer-card-heading">
          ${domain ? `<img class="saved-pages-drawer-card-favicon" src="https://icons.duckduckgo.com/ip3/${escapeHtml(domain)}.ico" alt="" width="18" height="18">` : ''}
          <h3 class="saved-pages-drawer-card-title">${escapeHtml(page.title || domain || 'Untitled')}</h3>
        </div>
        <div class="saved-pages-drawer-card-actions">
          <button
            class="saved-pages-drawer-action-btn saved-pages-drawer-pin-btn ${page.pinned ? 'is-active' : ''}"
            type="button"
            data-action="pin"
            data-id="${escapeHtml(page.id)}"
            title="${page.pinned ? 'Unpin page' : 'Pin page'}"
            aria-label="${page.pinned ? 'Unpin page' : 'Pin page'}"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true">
              <path d="M12 17v5"></path>
              <path d="M8 3h8l-1 5 3 3v2H6v-2l3-3-1-5z"></path>
            </svg>
          </button>
          <button
            class="btn-projects"
            type="button"
            data-action="projects"
            data-id="${escapeHtml(page.id)}"
            ${projectsUnavailable ? 'disabled' : ''}
            title="Manage projects"
            aria-label="Manage projects"
          >${projectsUnavailable ? 'Projects unavailable' : 'Projects'}</button>
          <button
            class="saved-pages-drawer-action-btn saved-pages-drawer-delete-btn"
            type="button"
            data-action="delete"
            data-id="${escapeHtml(page.id)}"
            title="Delete page"
            aria-label="Delete page"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true">
              <path d="M3 6h18"></path>
              <path d="M8 6V4h8v2"></path>
              <path d="M19 6l-1 14H6L5 6"></path>
              <path d="M10 11v6"></path>
              <path d="M14 11v6"></path>
            </svg>
          </button>
        </div>
      </div>
      ${summary ? `<p class="saved-pages-drawer-card-summary">${escapeHtml(truncateText(summary))}</p>` : ''}
      ${projectPillsHtml}
      <div class="saved-pages-drawer-card-footer">
        ${meta.length ? `<div class="saved-pages-drawer-card-meta">${meta.join('<span class="saved-pages-drawer-meta-separator">•</span>')}</div>` : '<span></span>'}
        ${tagsHtml ? `<div class="saved-pages-drawer-card-tags">${tagsHtml}</div>` : ''}
      </div>
    </a>
  `;
}

function renderDrawerState(html) {
  if (savedPagesDrawerResults) {
    savedPagesDrawerResults.innerHTML = html;
  }
  renderDrawerChrome();
}

function renderDrawerLoadingState(message = 'Loading saved pages...') {
  renderDrawerState(`
    <div class="loading-state saved-pages-drawer-state">
      <div class="loading-spinner"></div>
      <p>${escapeHtml(message)}</p>
    </div>
  `);
}

function renderDrawerErrorState(message) {
  renderDrawerState(`
    <div class="error-state saved-pages-drawer-state">
      <h2>Something went wrong</h2>
      <p>${escapeHtml(message)}</p>
    </div>
  `);
}

function renderDrawerEmptyState(query = '') {
  const scopeLabel = escapeHtml(getProjectScopeLabel());
  const title = query ? `No results for "${escapeHtml(query)}"` : `No pages in ${scopeLabel}`;
  const description = query
    ? `Try different words or clear the search in ${scopeLabel}.`
    : drawerState.selectedProjectId
      ? 'Add pages to this project to see them here.'
      : 'Save a page to see it here.';

  renderDrawerState(`
    <div class="empty-state saved-pages-drawer-state">
      <h2>${title}</h2>
      <p>${description}</p>
    </div>
  `);
}

function renderDrawerSignInState() {
  renderDrawerState(`
    <div class="empty-state saved-pages-drawer-state">
      <h2>Sign in to browse saved pages</h2>
      <p>Your drawer is available once you are signed in.</p>
    </div>
  `);
}

function renderDrawerResults() {
  if (!drawerState.pages.length) {
    renderDrawerEmptyState(drawerState.query);
    return;
  }

  renderDrawerState(drawerState.pages.map(renderDrawerCard).join(''));
}

function findDrawerPage(id) {
  return drawerState.allPages.find(page => page.id === id) || null;
}

function updateDrawerPageCollections(id, updater) {
  drawerState.allPages = drawerState.allPages.map(page => (page.id === id ? updater(page) : page));
  drawerState.pages = drawerState.pages.map(page => (page.id === id ? updater(page) : page));
}

async function ensureDrawerProjectsLoaded() {
  if (drawerState.projects.length || drawerState.projectsAvailable === false) {
    return null;
  }

  if (!drawerProjectsPromise) {
    drawerState.projectsLoading = true;
    drawerProjectsPromise = projectManager
      .loadProjects(savedPagesView)
      .finally(() => {
        drawerState.projectsLoading = false;
        drawerProjectsPromise = null;
      });
  }

  return drawerProjectsPromise;
}

async function loadDrawerBasePages({ query = drawerState.query, syncUrl = true } = {}) {
  const requestId = ++drawerState.requestId;
  const trimmedQuery = query.trim();

  drawerState.isLoading = true;
  setDrawerSearchValue(trimmedQuery);

  if (syncUrl && savedPagesDrawer && !savedPagesDrawer.classList.contains('hidden')) {
    updateDrawerUrl(true, trimmedQuery);
  }

  if (API.isExtension && !getDrawerCurrentUser()) {
    drawerState.isLoading = false;
    drawerState.hasInitialized = true;
    drawerState.allPages = [];
    drawerState.pages = [];
    renderDrawerSignInState();
    return;
  }

  renderDrawerLoadingState(trimmedQuery ? 'Searching your saved pages...' : 'Loading saved pages...');

  try {
    const projectsPromise = ensureDrawerProjectsLoaded();
    const requestOptions = {
      limit: DRAWER_INITIAL_FETCH_LIMIT,
      sort: 'newest',
      pinnedFirst: false,
      projectId: drawerState.selectedProjectId || undefined
    };

    const response = await API.getSavedPages(requestOptions);

    if (requestId !== drawerState.requestId) {
      return;
    }

    drawerState.allPages = response.pages || [];
    drawerState.total = typeof response.pagination?.total === 'number'
      ? response.pagination.total
      : null;
    if (!drawerState.selectedProjectId) {
      drawerState.allItemsTotal = drawerState.total;
    }
    projectManager.refreshProjectCounts(savedPagesView);
    applyDrawerFilters(trimmedQuery);
    drawerState.hasInitialized = true;
    renderDrawerResults();

    if (response?.meta?.fromCache) {
      void API.getSavedPages({ ...requestOptions, skipCache: true })
        .then(freshResponse => {
          if (requestId !== drawerState.requestId) {
            return;
          }

          drawerState.allPages = freshResponse.pages || [];
          drawerState.total = typeof freshResponse.pagination?.total === 'number'
            ? freshResponse.pagination.total
            : null;
          if (!drawerState.selectedProjectId) {
            drawerState.allItemsTotal = drawerState.total;
          }
          projectManager.refreshProjectCounts(savedPagesView);
          applyDrawerFilters(trimmedQuery);
          renderDrawerResults();
        })
        .catch(error => {
          console.debug('[newtab] Background saved pages refresh failed:', error);
        });
    }

    if (projectsPromise) {
      void projectsPromise.then(() => {
        if (requestId !== drawerState.requestId) {
          return;
        }

        projectManager.refreshProjectCounts(savedPagesView);
        renderDrawerResults();
      });
    }
  } catch (error) {
    if (requestId !== drawerState.requestId) {
      return;
    }

    console.error('[newtab] Drawer load failed:', error);
    renderDrawerErrorState(error.message || 'Failed to load saved pages.');
  } finally {
    if (requestId === drawerState.requestId) {
      drawerState.isLoading = false;
    }
  }
}

async function handleDrawerDelete(id) {
  if (!id || !confirm('Delete this saved page? This cannot be undone.')) {
    return;
  }

  try {
    await API.deletePage(id);
    const deletedPage = findDrawerPage(id);
    drawerState.allPages = drawerState.allPages.filter(page => page.id !== id);
    drawerState.pages = drawerState.pages.filter(page => page.id !== id);
    if (typeof drawerState.total === 'number') {
      drawerState.total = Math.max(0, drawerState.total - 1);
    }
    if (!drawerState.selectedProjectId && typeof drawerState.allItemsTotal === 'number') {
      drawerState.allItemsTotal = Math.max(0, drawerState.allItemsTotal - 1);
    }
    (deletedPage?.project_ids || []).forEach(projectId => {
      projectManager.adjustProjectCount(savedPagesView, projectId, -1);
    });
    renderDrawerResults();
  } catch (error) {
    console.error('[newtab] Failed to delete page:', error);
    alert('Failed to delete page. Please try again.');
  }
}

async function handleDrawerPin(id) {
  const page = findDrawerPage(id);
  if (!page) {
    return;
  }

  const nextPinnedState = !page.pinned;
  updateDrawerPageCollections(id, entry => ({ ...entry, pinned: nextPinnedState }));
  renderDrawerResults();

  try {
    await API.pinPage(id, nextPinnedState);
  } catch (error) {
    updateDrawerPageCollections(id, entry => ({ ...entry, pinned: !nextPinnedState }));
    renderDrawerResults();
    console.error('[newtab] Failed to update pin:', error);
    alert('Failed to update pin status. Please try again.');
  }
}

async function loadDrawerResults(query = '', { syncUrl = true } = {}) {
  const trimmedQuery = query.trim();

  if (!drawerState.hasInitialized) {
    await loadDrawerBasePages({ query: trimmedQuery, syncUrl });
    return;
  }

  setDrawerSearchValue(trimmedQuery);
  if (syncUrl && savedPagesDrawer && !savedPagesDrawer.classList.contains('hidden')) {
    updateDrawerUrl(true, trimmedQuery);
  }

  applyDrawerFilters(trimmedQuery);
  renderDrawerResults();
}

function openSavedPagesDrawer({ syncUrl = true, searchQuery = '' } = {}) {
  if (!savedPagesDrawer) return;

  setDrawerSearchValue(searchQuery);
  savedPagesDrawer.classList.remove('hidden');
  savedPagesDrawer.setAttribute('aria-hidden', 'false');
  document.body.classList.add('saved-pages-drawer-open');
  setDrawerToggleState(true);

  if (syncUrl) {
    updateDrawerUrl(true, searchQuery);
  }

  if (!drawerState.hasInitialized || drawerState.query !== searchQuery.trim()) {
    void loadDrawerBasePages({ query: searchQuery, syncUrl: false });
  } else {
    renderDrawerResults();
  }
}

function closeSavedPagesDrawer({ syncUrl = true } = {}) {
  if (!savedPagesDrawer) return;

  savedPagesDrawer.classList.add('hidden');
  savedPagesDrawer.setAttribute('aria-hidden', 'true');
  document.body.classList.remove('saved-pages-drawer-open');
  setDrawerToggleState(false);

  if (syncUrl) {
    updateDrawerUrl(false);
  }
}

function syncSavedPagesAfterCacheInvalidation() {
  window.clearTimeout(savedPagesCacheRefreshTimer);
  savedPagesCacheRefreshTimer = window.setTimeout(() => {
    drawerState.hasInitialized = false;

    if (!getDrawerCurrentUser()) {
      return;
    }

    void initFavorites();

    if (savedPagesDrawer && !savedPagesDrawer.classList.contains('hidden')) {
      void loadDrawerBasePages({
        query: savedPagesDrawerSearchInput?.value || drawerState.query,
        syncUrl: false
      });
    }
  }, 50);
}

function initSavedPagesCacheSync() {
  const browserApi = globalThis.browser ?? globalThis.chrome;
  if (!browserApi?.storage?.onChanged?.addListener) {
    return;
  }

  browserApi.storage.onChanged.addListener((changes, areaName) => {
    if (!isSavedPagesCacheInvalidation(changes, areaName)) {
      return;
    }

    syncSavedPagesAfterCacheInvalidation();
  });
}

function initSavedPagesDrawer() {
  savedPagesToggleBtn?.addEventListener('click', () => {
    if (savedPagesDrawer?.classList.contains('hidden')) {
      openSavedPagesDrawer();
    } else {
      closeSavedPagesDrawer();
    }
  });

  savedPagesDrawerBackdrop?.addEventListener('click', () => closeSavedPagesDrawer());
  savedPagesDrawerCloseBtn?.addEventListener('click', () => closeSavedPagesDrawer());

  savedPagesDrawerSearchForm?.addEventListener('submit', (event) => {
    event.preventDefault();
    void loadDrawerResults(savedPagesDrawerSearchInput?.value || '');
  });

  savedPagesDrawerSearchInput?.addEventListener('input', (event) => {
    const query = event.target.value;
    setDrawerSearchValue(query);
    window.clearTimeout(drawerSearchDebounceTimer);
    drawerSearchDebounceTimer = window.setTimeout(() => {
      void loadDrawerResults(query);
    }, DRAWER_SEARCH_DEBOUNCE_MS);
  });

  savedPagesDrawerClearBtn?.addEventListener('click', () => {
    window.clearTimeout(drawerSearchDebounceTimer);
    void loadDrawerResults('');
    savedPagesDrawerSearchInput?.focus();
  });

  savedPagesDrawerResults?.addEventListener('click', (event) => {
    const actionButton = event.target.closest('[data-action]');
    if (!actionButton) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();

    const { action, id } = actionButton.dataset;
    if (action === 'pin') {
      void handleDrawerPin(id);
      return;
    }

    if (action === 'projects') {
      projectManager.openEditor(savedPagesView, id);
      return;
    }

    if (action === 'remove-project') {
      void projectManager.togglePageProject(savedPagesView, id, actionButton.dataset.projectId, false);
      return;
    }

    if (action === 'delete') {
      void handleDrawerDelete(id);
    }
  });

  projectSidebar?.addEventListener('click', (event) => {
    const createButton = event.target.closest('.project-sidebar-create');
    if (createButton) {
      void projectManager.promptCreateProject(savedPagesView);
      return;
    }

    const projectButton = event.target.closest('.project-nav-item');
    if (projectButton) {
      void projectManager.selectProject(savedPagesView, projectButton.dataset.projectId || null);
      return;
    }

    const renameButton = event.target.closest('.project-action-rename');
    if (renameButton) {
      void projectManager.renameProject(savedPagesView, renameButton.dataset.projectId);
      return;
    }

    const visibilityButton = event.target.closest('.project-action-visibility');
    if (visibilityButton) {
      void projectManager.toggleProjectVisibility(savedPagesView, visibilityButton.dataset.projectId);
      return;
    }

    const archiveButton = event.target.closest('.project-action-archive');
    if (archiveButton) {
      void projectManager.archiveProject(savedPagesView, archiveButton.dataset.projectId);
    }
  });

  projectEditorBackdrop?.addEventListener('click', () => {
    projectManager.closeEditor(savedPagesView);
  });

  projectEditorDialog?.addEventListener('click', (event) => {
    const closeButton = event.target.closest('.project-editor-close');
    if (closeButton) {
      projectManager.closeEditor(savedPagesView);
      return;
    }

    const createButton = event.target.closest('.project-editor-create');
    if (createButton) {
      void projectManager.createProject(
        savedPagesView,
        createButton.dataset.projectName || '',
        createButton.dataset.pageId || null
      );
    }
  });

  projectEditorDialog?.addEventListener('change', (event) => {
    const checkbox = event.target.closest('.project-editor-checkbox');
    if (!checkbox) {
      return;
    }

    void projectManager.togglePageProject(
      savedPagesView,
      checkbox.dataset.pageId,
      checkbox.dataset.projectId,
      checkbox.checked
    );
  });

  projectEditorDialog?.addEventListener('input', (event) => {
    const input = event.target.closest('#project-editor-search-input');
    if (!input) {
      return;
    }

    projectManager.updateEditorQuery(savedPagesView, input.value);
  });

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !projectEditorDialog?.classList.contains('hidden')) {
      projectManager.closeEditor(savedPagesView);
      return;
    }

    if (e.key === 'Escape' && savedPagesDrawer && !savedPagesDrawer.classList.contains('hidden')) {
      closeSavedPagesDrawer();
    }
  });

  const urlParams = new URLSearchParams(window.location.search);
  if (urlParams.get(SAVED_PAGES_DRAWER_PARAM) === SAVED_PAGES_DRAWER_VALUE) {
    openSavedPagesDrawer({
      syncUrl: false,
      searchQuery: urlParams.get('search') || ''
    });
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
 * Uses a local-first store that renders cached data immediately and refreshes in place
 * @returns {Promise<void>}
 */
async function initFavorites() {
  try {
    if (typeof API === 'undefined' || !API.getFavorites) {
      favoritesStore.reset();
      return;
    }

    await favoritesStore.hydrate();
  } catch (error) {
    console.error('[newtab] Failed to load favorites:', error);
  }
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
            await initFavorites();
            if (savedPagesDrawer && !savedPagesDrawer.classList.contains('hidden')) {
              void loadDrawerResults(savedPagesDrawerSearchInput?.value || '', { syncUrl: false });
            }
          } else {
            // User signed out, hide favorites and stats
            favoritesStore.reset();
            updateStats(null);
            Object.assign(drawerState, {
              hasInitialized: false,
              isLoading: false,
              query: '',
              currentFilter: {
                search: '',
                projectId: null,
                cursor: null
              },
              pages: [],
              allPages: [],
              projects: [],
              projectsLoading: false,
              projectsAvailable: true,
              projectsUnavailableMessage: '',
              selectedProjectId: null,
              projectEditorState: {
                pageId: null,
                query: ''
              },
              total: null,
              allItemsTotal: null
            });
            if (savedPagesDrawer && !savedPagesDrawer.classList.contains('hidden')) {
              renderDrawerSignInState();
            }
          }
        });
      } else {
        // Firebase not available (standalone mode)
        updateAuthUI(null);
      }
    } catch (error) {
      console.error('[newtab] Firebase init failed:', error);
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
    console.error('[newtab] Failed to get version:', error);
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
initSavedPagesDrawer();
initSavedPagesCacheSync();

// Initialize (background and auth can run in parallel)
await Promise.all([
  initBackground(),
  initAuth()
]);
