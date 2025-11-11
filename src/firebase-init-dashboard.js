// Firebase initialization wrapper for dashboard (newtab.html)
// Makes Firebase available globally to non-module scripts
import * as firebaseExports from './bundles/firebase-dashboard.js';

// Initialize Firebase with config (if in extension mode)
if (typeof browser !== 'undefined' && CONFIG?.firebase) {
  const app = firebaseExports.initializeApp(CONFIG.firebase);
  const auth = firebaseExports.getAuth(app);

  // Make Firebase available globally
  window.firebaseApp = app;
  window.firebaseAuth = auth;
  window.firebaseSignOut = firebaseExports.signOut;
  window.firebaseOnAuthStateChanged = firebaseExports.onAuthStateChanged;

  console.log('Firebase initialized for dashboard');
}
