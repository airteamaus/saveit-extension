// Firebase initialization wrapper for dashboard (newtab.html)
// Makes Firebase available globally to non-module scripts

/**
 * Check if running in extension mode (works with both Firefox and Chrome APIs)
 */
function isExtension() {
  // Firefox native or polyfilled browser API
  if (typeof browser !== 'undefined' && browser.runtime) {
    return true;
  }
  // Chrome/Brave/Edge native API (before polyfill loads)
  if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.id) {
    return true;
  }
  return false;
}

// Promise that resolves when Firebase is ready
window.firebaseReady = (async () => {
  try {
    // Only load Firebase in extension mode
    if (isExtension() && window.CONFIG?.firebase) {
      const firebaseExports = await import('./bundles/firebase-dashboard.js');
      const app = firebaseExports.initializeApp(window.CONFIG.firebase);
      const auth = firebaseExports.initializeAuth(app, {
        persistence: firebaseExports.indexedDBLocalPersistence
      });

      // Make Firebase available globally
      window.firebaseApp = app;
      window.firebaseAuth = auth;
      window.firebaseGetIdToken = firebaseExports.getIdToken;
      window.firebaseSignOut = firebaseExports.signOut;
      window.firebaseOnAuthStateChanged = firebaseExports.onAuthStateChanged;

      console.log('Firebase initialized for dashboard');
      return true;
    } else {
      // Not in extension mode or no config
      console.log('[Firebase] Skipped initialization (standalone mode)');
      return false;
    }
  } catch (error) {
    console.error('[Firebase] Initialization failed:', error);
    return false;
  }
})();
