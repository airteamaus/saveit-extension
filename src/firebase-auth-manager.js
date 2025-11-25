// firebase-auth-manager.js - Firebase authentication management
// Handles Firebase initialization, auth state changes, and user session management

class FirebaseAuthManager {
  constructor() {
    // FirebaseAuthManager handles auth state only
  }

  /**
   * Initialize Firebase auth and setup listeners
   * @param {Object} dashboard - Dashboard instance with callbacks
   * @returns {Promise<void>}
   */
  async initAuth(dashboard) {
    // Wait for Firebase to be ready in extension mode
    if (API.isExtension && window.firebaseReady) {
      await window.firebaseReady;

      if (window.firebaseAuth && window.firebaseOnAuthStateChanged) {
        // Wait for initial auth state (one-time check with timeout)
        const initialUser = await Promise.race([
          new Promise((resolve) => {
            const unsubscribe = window.firebaseOnAuthStateChanged(window.firebaseAuth, (user) => {
              unsubscribe(); // Unregister after first callback
              resolve(user);
            });
          }),
          new Promise((_, reject) =>
            setTimeout(() => reject(new Error('Firebase auth timeout')), 10000)
          )
        ]).catch(error => {
          console.error('[FirebaseAuthManager] Firebase auth failed:', error);
          return null; // Continue without auth
        });

        // Update UI based on initial auth state
        dashboard.authUIManager.updateSignInButton(initialUser ? {
          email: initialUser.email,
          name: initialUser.displayName,
          photoURL: initialUser.photoURL
        } : null);

        // Set Sentry user context
        if (initialUser) {
          window.SentryHelpers?.setUser(initialUser);
        }

        // Register persistent listener for auth changes (after init)
        window.firebaseOnAuthStateChanged(window.firebaseAuth, async (user) => {
          if (!dashboard.isInitialized) return; // Skip during initialization

          // Auth changed after init - clear cache and reload
          debug('[FirebaseAuthManager] Auth state changed, clearing cache for user switch');
          await API.invalidateCache();

          dashboard.authUIManager.updateSignInButton(user ? {
            email: user.email,
            name: user.displayName,
            photoURL: user.photoURL
          } : null);

          if (user) {
            // Set Sentry user context
            window.SentryHelpers?.setUser(user);
            dashboard.showLoading();
            await dashboard.loadPages();
            dashboard.render();
            dashboard.refreshInBackground();
          } else {
            // Clear Sentry user context on sign out
            window.SentryHelpers?.clearUser();
            dashboard.showSignInPrompt();
          }
        });
      }
    }
  }

  /**
   * Get current Firebase user
   * @returns {Object|null} User object with email and name, or null
   */
  getCurrentUser() {
    if (!API.isExtension || !window.firebaseAuth) return null;

    const user = window.firebaseAuth.currentUser;
    if (!user) return null;

    return {
      email: user.email,
      name: user.displayName,
      photoURL: user.photoURL
    };
  }
}

// Export for use in newtab.js
window.FirebaseAuthManager = FirebaseAuthManager;
