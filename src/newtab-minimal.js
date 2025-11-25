// newtab-minimal.js - Minimal new tab with search navigation
// Handles search form submission and Firebase auth state

const searchForm = document.getElementById('search-form');
const searchInput = document.getElementById('search-input');
const signInBtn = document.getElementById('sign-in-btn');
const userGreeting = document.getElementById('user-greeting');
const userNameSpan = document.getElementById('user-name');

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

// Initialize
await initAuth();
