// firebase-auth.js - Firebase Authentication for SaveIt extension
// Replaces browser.identity OAuth flow with Firebase Auth

import { initializeApp } from 'firebase/app';
import { getAuth, signInWithPopup, GoogleAuthProvider, onAuthStateChanged } from 'firebase/auth';
import { CONFIG } from './config.js';

// Initialize Firebase
const app = initializeApp(CONFIG.firebase);
const auth = getAuth(app);

/**
 * Get the current user's Firebase ID token.
 * If user is not signed in, prompts for sign-in via Google OAuth popup.
 * Firebase SDK handles token refresh automatically.
 *
 * @returns {Promise<string>} Firebase ID token for Authorization header
 * @throws {Error} If sign-in fails or user cancels
 */
export async function getFirebaseToken() {
  const user = auth.currentUser;

  if (!user) {
    // Not signed in - trigger Google OAuth popup
    console.log('User not signed in, launching Google OAuth...');
    const provider = new GoogleAuthProvider();
    provider.addScope('openid');
    provider.addScope('email');
    provider.addScope('profile');

    try {
      const result = await signInWithPopup(auth, provider);
      console.log('User signed in:', result.user.email);

      // Cache user info in browser storage (for compatibility with existing code)
      await browser.storage.local.set({
        userId: result.user.uid,
        userEmail: result.user.email,
        userName: result.user.displayName
      });
    } catch (error) {
      console.error('Firebase sign-in failed:', error);
      throw new Error(`Sign-in failed: ${error.message}`);
    }
  }

  // Get fresh ID token (Firebase handles caching and auto-refresh)
  try {
    const token = await auth.currentUser.getIdToken();
    return token;
  } catch (error) {
    console.error('Failed to get Firebase ID token:', error);
    throw new Error(`Failed to get auth token: ${error.message}`);
  }
}

/**
 * Get current user information from Firebase Auth.
 * Returns null if user is not signed in.
 *
 * @returns {Object|null} User info {id, email, name} or null
 */
export function getCurrentUser() {
  const user = auth.currentUser;
  if (!user) {
    return null;
  }

  return {
    id: user.uid,
    email: user.email,
    name: user.displayName
  };
}

/**
 * Sign out the current user.
 */
export async function signOut() {
  try {
    await auth.signOut();
    await browser.storage.local.remove(['userId', 'userEmail', 'userName']);
    console.log('User signed out');
  } catch (error) {
    console.error('Sign-out failed:', error);
    throw error;
  }
}

/**
 * Listen for auth state changes.
 * Firebase automatically handles token refresh and persistence.
 *
 * @param {Function} callback - Called when auth state changes
 * @returns {Function} Unsubscribe function
 */
export function onAuthChange(callback) {
  return onAuthStateChanged(auth, (user) => {
    if (user) {
      console.log('Auth state changed - user signed in:', user.email);
      // Update cached user info
      browser.storage.local.set({
        userId: user.uid,
        userEmail: user.email,
        userName: user.displayName
      });
      callback({ id: user.uid, email: user.email, name: user.displayName });
    } else {
      console.log('Auth state changed - user signed out');
      browser.storage.local.remove(['userId', 'userEmail', 'userName']);
      callback(null);
    }
  });
}
