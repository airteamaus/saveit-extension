// Firebase initialization wrapper for page surfaces (newtab.html)
// Makes Firebase available globally to non-module scripts

import { getBrowserRuntime } from './config.js';

/**
 * Check if running in extension mode (works with both Firefox and Chrome APIs)
 */
function isExtension() {
  return getBrowserRuntime() !== null;
}

// Promise that resolves when Firebase is ready
window.firebaseReady = (async () => {
  try {
    // Only load Firebase in extension mode
    if (isExtension() && window.CONFIG?.firebase) {
      const firebaseExports = await import('./bundles/firebase-pages.js');
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

      debug('Firebase initialized for page surfaces');
      return true;
    } else {
      // Not in extension mode or no config
      debug('[Firebase] Skipped initialization (standalone mode)');
      return false;
    }
  } catch (error) {
    console.error('[Firebase] Initialization failed:', error);
    window.SentryHelpers?.captureError(error, {
      context: 'firebase-init-pages'
    });
    return false;
  }
})();
