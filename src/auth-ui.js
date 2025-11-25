// auth-ui.js - Authentication UI management
// Handles sign-in/out UI, user profile display, and dropdown interactions

/**
 * AuthUIManager - Manages authentication UI components
 * Handles user profile display, sign-in/out buttons, and dropdown menu
 */
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
    if (user.name) {
      const parts = user.name.trim().split(/\s+/);
      if (parts.length >= 2) {
        return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
      }
      return parts[0][0].toUpperCase();
    }
    if (user.email) {
      return user.email[0].toUpperCase();
    }
    return '?';
  }

  /**
   * Update sign-in button visibility based on auth state
   * @param {Object|null} user - User object with email, name, and photoURL, or null if signed out
   */
  updateSignInButton(user) {
    const signInBtn = document.getElementById('sign-in-btn');
    const userProfile = document.getElementById('user-profile');

    if (!signInBtn || !userProfile) return;

    if (user) {
      // User is signed in - hide sign-in button, show profile
      signInBtn.style.display = 'none';
      userProfile.style.display = 'block';

      // Update user info
      const userName = document.getElementById('user-name');
      const userEmail = document.getElementById('user-email');
      const userAvatar = document.getElementById('user-avatar');

      if (userName && user.name) {
        userName.textContent = user.name.split(' ')[0]; // First name only
      }
      if (userEmail && user.email) {
        userEmail.textContent = user.email;
      }
      // Update avatar (photo or initials)
      if (userAvatar) {
        if (user.photoURL) {
          userAvatar.innerHTML = `<img src="${user.photoURL}" alt="Profile">`;
        } else {
          userAvatar.textContent = this.getUserInitials(user);
        }
      }
    } else {
      // User is signed out - show sign-in button, hide profile
      signInBtn.style.display = 'flex';
      userProfile.style.display = 'none';
    }
  }

  /**
   * Handle sign-in button click
   * Triggers Firebase OAuth without requiring a page save
   * @param {Function} getBrowserRuntime - Function to get browser runtime
   */
  async handleSignIn(getBrowserRuntime) {
    try {
      // Send message to background script to trigger sign-in
      const runtime = getBrowserRuntime();
      if (!runtime) {
        throw new Error('Browser runtime not available');
      }
      await runtime.sendMessage({ action: 'signIn' });
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
      if (window.firebaseAuth && window.firebaseSignOut) {
        await window.firebaseSignOut(window.firebaseAuth);
        this.updateSignInButton(null);

        // Call back to dashboard to show sign-in prompt
        if (onSignOutComplete) {
          onSignOutComplete();
        }
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
    if (!dropdown) return;

    const isVisible = dropdown.style.display === 'block';
    dropdown.style.display = isVisible ? 'none' : 'block';
  }
}
