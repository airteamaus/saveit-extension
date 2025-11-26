// newtab-minimal.js - Minimal new tab with search navigation
// Handles search form submission, Firebase auth, and Unsplash background

import { unsplashAccessKey, getStorageAPI } from './config.js';

const CACHE_KEY = 'newtab_background';
const CACHE_DURATION_MS = 24 * 60 * 60 * 1000; // 24 hours

const searchForm = document.getElementById('search-form');
const searchInput = document.getElementById('search-input');
const signInBtn = document.getElementById('sign-in-btn');
const backgroundEl = document.getElementById('background');
const photoCreditEl = document.getElementById('photo-credit');
const photographerLinkEl = document.getElementById('photographer-link');
const favoritesRow = document.getElementById('favorites-row');
const statsCount = document.getElementById('stats-count');
const userMenu = document.getElementById('user-menu');
const userAvatarBtn = document.getElementById('user-avatar-btn');
const userAvatar = document.getElementById('user-avatar');
const userDropdown = document.getElementById('user-dropdown');
const userEmailEl = document.getElementById('user-email');
const signOutBtn = document.getElementById('sign-out-btn');

/**
 * Get user initials from name or email
 * @param {Object} user - Firebase user object
 * @returns {string} Initials (1-2 characters)
 */
function getUserInitials(user) {
  if (user.displayName) {
    const parts = user.displayName.trim().split(/\s+/);
    if (parts.length >= 2) {
      return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
    }
    return parts[0][0].toUpperCase();
  }
  if (user.email) {
    return user.email[0].toUpperCase();
  }
  return '?';
}

/**
 * Update user avatar display
 * @param {Object} user - Firebase user object
 */
function updateUserAvatar(user) {
  if (!userAvatar || !userMenu) return;

  if (user) {
    userMenu.classList.remove('hidden');
    if (user.photoURL) {
      userAvatar.innerHTML = `<img src="${user.photoURL}" alt="Profile">`;
    } else {
      userAvatar.textContent = getUserInitials(user);
    }
    if (userEmailEl) {
      userEmailEl.textContent = user.email || '';
    }
  } else {
    userMenu.classList.add('hidden');
  }
}

/**
 * Toggle user dropdown
 */
function toggleUserDropdown() {
  if (!userDropdown) return;
  userDropdown.classList.toggle('hidden');
}

/**
 * Handle sign out
 */
async function handleSignOut() {
  try {
    if (window.firebaseAuth && window.firebaseSignOut) {
      await window.firebaseSignOut(window.firebaseAuth);
      // Auth state listener will update UI
    }
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
    return `https://www.google.com/s2/favicons?domain=${domain}&sz=64`;
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
 * Render favorites row with recent saves
 * @param {Array} pages - Array of page objects
 */
function renderFavorites(pages) {
  if (!pages || pages.length === 0) {
    favoritesRow.classList.add('hidden');
    return;
  }

  // Take up to 6 most recent
  const favorites = pages.slice(0, 6);

  favoritesRow.innerHTML = '';
  favorites.forEach(page => {
    favoritesRow.appendChild(createFavoriteItem(page));
  });

  favoritesRow.classList.remove('hidden');
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
    // Empty search navigates to full dashboard to browse all
    window.location.href = 'newtab.html';
  }
}

/**
 * Handle sign-in button click
 */
async function handleSignIn() {
  try {
    // In extension mode, send message to background script
    if (typeof browser !== 'undefined' && browser.runtime) {
      await browser.runtime.sendMessage({ action: 'signIn' });
    } else if (typeof chrome !== 'undefined' && chrome.runtime) {
      await chrome.runtime.sendMessage({ action: 'signIn' });
    } else {
      // Standalone mode - show message
      alert('Sign in is only available when running as a browser extension.');
    }
  } catch (error) {
    console.error('Sign-in failed:', error);
    alert('Failed to sign in. Please try again.');
  }
}

/**
 * Get cached background data from browser storage
 * @returns {Promise<Object|null>} Cached background data or null
 */
async function getCachedBackground() {
  const storage = getStorageAPI();
  if (!storage) return null;

  try {
    const result = await storage.get(CACHE_KEY);
    const cached = result[CACHE_KEY];

    if (!cached) return null;

    // Check if cache is expired
    const age = Date.now() - cached.cachedAt;
    if (age > CACHE_DURATION_MS) {
      await storage.remove(CACHE_KEY);
      return null;
    }

    return cached;
  } catch {
    return null;
  }
}

/**
 * Save background data to browser storage
 * @param {Object} data - Background data to cache
 */
async function cacheBackground(data) {
  const storage = getStorageAPI();
  if (!storage) return;

  try {
    await storage.set({
      [CACHE_KEY]: {
        ...data,
        cachedAt: Date.now()
      }
    });
  } catch (error) {
    console.error('[newtab-minimal] Failed to cache background:', error);
  }
}

/**
 * Fetch random photo from Unsplash API
 * @returns {Promise<Object|null>} Photo data or null on failure
 */
async function fetchUnsplashPhoto() {
  if (!unsplashAccessKey) return null;

  try {
    const response = await fetch(
      'https://api.unsplash.com/photos/random?orientation=landscape&topics=architecture,textures,wallpapers',
      {
        headers: {
          'Authorization': `Client-ID ${unsplashAccessKey}`
        }
      }
    );

    if (!response.ok) {
      console.error('[newtab-minimal] Unsplash API error:', response.status);
      return null;
    }

    const photo = await response.json();

    return {
      imageUrl: photo.urls.full,
      photographerName: photo.user.name,
      photographerUrl: `${photo.user.links.html}?utm_source=saveit&utm_medium=referral`
    };
  } catch (error) {
    console.error('[newtab-minimal] Failed to fetch Unsplash photo:', error);
    return null;
  }
}

/**
 * Apply background image and show photo credit
 * @param {Object} data - Background data with imageUrl, photographerName, photographerUrl
 */
function applyBackground(data) {
  if (!data || !data.imageUrl) return;

  // Preload image before displaying
  const img = new Image();
  img.onload = () => {
    backgroundEl.style.backgroundImage = `url(${data.imageUrl})`;
    backgroundEl.classList.add('loaded');
    document.body.classList.add('has-background');

    // Update photo credit
    photographerLinkEl.textContent = data.photographerName;
    photographerLinkEl.href = data.photographerUrl;
    photoCreditEl.classList.remove('hidden');
  };
  img.src = data.imageUrl;
}

/**
 * Initialize background image from cache or Unsplash
 */
async function initBackground() {
  // Try cache first
  let backgroundData = await getCachedBackground();

  if (backgroundData) {
    applyBackground(backgroundData);
    return;
  }

  // Fetch new photo
  backgroundData = await fetchUnsplashPhoto();
  if (backgroundData) {
    await cacheBackground(backgroundData);
    applyBackground(backgroundData);
  }
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

    const response = await API.getSavedPages({ limit: 6, sort: 'newest' });
    if (response && response.pages) {
      renderFavorites(response.pages);
      return response.pagination;
    }
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
  if (!pagination || typeof pagination.total !== 'number') {
    statsCount.classList.add('hidden');
    return;
  }

  const total = pagination.total;
  statsCount.textContent = `${total} ${total === 1 ? 'thing' : 'things'} saved`;
  statsCount.classList.remove('hidden');
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
            favoritesRow.classList.add('hidden');
            statsCount.classList.add('hidden');
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

// Event listeners
searchForm.addEventListener('submit', handleSearch);
signInBtn.addEventListener('click', handleSignIn);
userAvatarBtn.addEventListener('click', toggleUserDropdown);
signOutBtn.addEventListener('click', handleSignOut);

// Close dropdown when clicking outside
document.addEventListener('click', (e) => {
  if (userMenu && !userMenu.contains(e.target)) {
    userDropdown.classList.add('hidden');
  }
});

// Initialize (background and auth can run in parallel)
await Promise.all([
  initBackground(),
  initAuth()
]);
