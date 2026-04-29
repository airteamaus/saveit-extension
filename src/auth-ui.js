// auth-ui.js - Authentication UI management
// Handles sign-in/out UI, user profile display, and dropdown interactions

/**
 * AuthUIManager - Manages authentication UI components
 * Handles user profile display, sign-in/out buttons, and dropdown menu
 */
/* global AuthMenu */
/* eslint-disable-next-line no-unused-vars */
class AuthUIManager {
  constructor() {
    // AuthUIManager handles UI state only
  }

  /**
   * Get user initials from name or email
   * @param {Object} user - User object with name and email
   * @returns {string} Initials (1-2 characters)
   */
  getUserInitials(user) {
    return AuthMenu.getUserInitials(user);
  }

  /**
   * Update sign-in button visibility based on auth state
   * @param {Object|null} user - User object with email, name, and photoURL, or null if signed out
   */
  updateSignInButton(user) {
    const signInBtn = document.getElementById('sign-in-btn');
    const userProfile = document.getElementById('user-profile');

    if (!signInBtn || !userProfile) return;
    AuthMenu.updateProfileMenu({
      signInBtn,
      userProfile,
      userNameEl: document.getElementById('user-name'),
      userEmailEl: document.getElementById('user-email'),
      avatarEl: document.getElementById('user-avatar')
    }, user);
  }

  /**
   * Handle sign-in button click
   * Triggers Firebase OAuth without requiring a page save
   * @param {Function} getBrowserRuntime - Function to get browser runtime
   */
  async handleSignIn(getBrowserRuntime) {
    try {
      await AuthMenu.signIn(getBrowserRuntime);
      // Auth state listener will handle UI updates
    } catch (error) {
      console.error('Sign-in failed:', error);
      alert('Failed to sign in. Please try again.');
    }
  }

  /**
   * Handle sign-out button click
   * @param {Function} onSignOutComplete - Callback after successful sign-out
   */
  async handleSignOut(onSignOutComplete) {
    try {
      await AuthMenu.signOut();
      this.updateSignInButton(null);

      // Call back to dashboard to show sign-in prompt
      if (onSignOutComplete) {
        onSignOutComplete();
      }
    } catch (error) {
      console.error('Sign-out failed:', error);
      alert('Failed to sign out. Please try again.');
    }
  }

  /**
   * Toggle user profile dropdown
   */
  toggleUserDropdown() {
    const dropdown = document.getElementById('user-dropdown');
    AuthMenu.toggleDropdown(dropdown);
  }
}
