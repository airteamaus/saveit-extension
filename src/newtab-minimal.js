// newtab-minimal.js - Minimal new tab with search navigation
// Handles search form submission, Firebase auth, and Unsplash background

import { unsplashAccessKey, getStorageAPI } from './config.js';

const CACHE_KEY = 'newtab_background';
const CACHE_DURATION_MS = 24 * 60 * 60 * 1000; // 24 hours

const searchForm = document.getElementById('search-form');
const searchInput = document.getElementById('search-input');
const signInBtn = document.getElementById('sign-in-btn');
const userGreeting = document.getElementById('user-greeting');
const userNameSpan = document.getElementById('user-name');
const backgroundEl = document.getElementById('background');
const photoCreditEl = document.getElementById('photo-credit');
const photographerLinkEl = document.getElementById('photographer-link');

/**
 * Update UI based on authentication state
 * @param {Object|null} user - User object with email and displayName, or null
 */
function updateAuthUI(user) {
  if (user) {
    signInBtn.classList.add('hidden');
    userGreeting.classList.remove('hidden');
    const firstName = user.displayName ? user.displayName.split(' ')[0] : 'User';
    userNameSpan.textContent = firstName;
  } else {
    signInBtn.classList.remove('hidden');
    userGreeting.classList.add('hidden');
  }
}

/**
 * Handle search form submission - navigate to full dashboard with query
 * @param {Event} e - Form submit event
 */
function handleSearch(e) {
  e.preventDefault();
  const query = searchInput.value.trim();
  if (query) {
    // Navigate to full dashboard with search query
    window.location.href = `newtab.html?search=${encodeURIComponent(query)}`;
  } else {
    // Empty search navigates to browse all
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
      'https://api.unsplash.com/photos/random?orientation=landscape&topics=nature',
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
      imageUrl: photo.urls.regular,
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
 * Initialize Firebase auth listener
 */
async function initAuth() {
  // Wait for Firebase to be ready in extension mode
  if (window.firebaseReady) {
    try {
      await window.firebaseReady;

      if (window.firebaseAuth && window.firebaseOnAuthStateChanged) {
        // Listen for auth state changes
        window.firebaseOnAuthStateChanged(window.firebaseAuth, (user) => {
          updateAuthUI(user);
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

// Initialize (background and auth can run in parallel)
await Promise.all([
  initBackground(),
  initAuth()
]);
