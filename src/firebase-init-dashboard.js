// Firebase initialization wrapper for dashboard (newtab.html)
// Makes Firebase available globally to non-module scripts

// Promise that resolves when Firebase is ready
window.firebaseReady = (async () => {
  try {
    // Only load Firebase in extension mode
    if (typeof browser !== 'undefined' && window.CONFIG?.firebase) {
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
