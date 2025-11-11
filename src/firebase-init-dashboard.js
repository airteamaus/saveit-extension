// Firebase initialization wrapper for dashboard (newtab.html)
// Makes Firebase available globally to non-module scripts
import * as firebaseExports from './bundles/firebase-dashboard.js';

// Promise that resolves when Firebase is ready
window.firebaseReady = new Promise((resolve) => {
  // Initialize Firebase with config (if in extension mode)
  if (typeof browser !== 'undefined' && window.CONFIG?.firebase) {
    const app = firebaseExports.initializeApp(window.CONFIG.firebase);
    const auth = firebaseExports.getAuth(app);

    // Make Firebase available globally
    window.firebaseApp = app;
    window.firebaseAuth = auth;
    window.firebaseGetIdToken = firebaseExports.getIdToken;
    window.firebaseSignOut = firebaseExports.signOut;
    window.firebaseOnAuthStateChanged = firebaseExports.onAuthStateChanged;

    console.log('Firebase initialized for dashboard');
    resolve(true);
  } else {
    // Not in extension mode or no config
    resolve(false);
  }
});
