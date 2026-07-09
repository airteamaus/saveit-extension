import { getCurrentUser } from './session-store.js';

function getBrowserRuntime() {
  if (typeof browser !== 'undefined' && browser.runtime) {
    return browser.runtime;
  }

  if (typeof chrome !== 'undefined' && chrome.runtime) {
    return chrome.runtime;
  }

  return null;
}

export function applyAuthUI(user, {
  AuthMenu,
  menuRoot,
  avatarEl,
  userEmailEl,
  signInBtn
}) {
  AuthMenu.updateCompactMenu({ menuRoot, avatarEl, userEmailEl }, user);

  if (user) {
    // Signed in: hide the sign-in button; the avatar menu (with Import) shows.
    signInBtn?.classList.add('hidden');
  } else {
    signInBtn?.classList.remove('hidden');
  }
}

export function getUserFacingSignInErrorMessage(error) {
  return error?.message === 'Browser runtime not available'
    ? 'Sign in is only available when running as a browser extension.'
    : 'Failed to sign in. Please try again.';
}

export function createNewtabAuthController({
  API,
  AuthMenu,
  elements,
  onSignedIn,
  onSignedOut,
  // Fires when the user *interactively* clicks Sign in (before the OAuth flow
  // runs), as distinct from `onSignedIn`, which also fires on session
  // restoration when newtab opens with an existing login. Used to opt into a
  // one-time full cache warm-up only after an explicit sign-in.
  onInteractiveSignIn,
  windowObj = window
}) {
  const { signInBtn, userMenu, userAvatar, userDropdown, userEmailEl } = elements;

  function updateAuthUi(user) {
    applyAuthUI(user, {
      AuthMenu,
      menuRoot: userMenu,
      avatarEl: userAvatar,
      userEmailEl,
      signInBtn
    });
  }

  function toggleUserDropdown() {
    AuthMenu.toggleDropdown(userDropdown);
  }

  function hideDropdownForOutsideClick(target) {
    if (userMenu && !userMenu.contains(target)) {
      AuthMenu.hideDropdown(userDropdown);
    }
  }

  async function handleSignOut() {
    try {
      await AuthMenu.signOut(() => getBrowserRuntime());
    } catch (error) {
      console.error('[newtab] Sign out failed:', error);
    }
  }

  async function handleSignIn() {
    try {
      // Signal the interactive sign-in *before* the OAuth flow resolves, so any
      // one-time warm-up is armed before onSignedIn runs.
      onInteractiveSignIn?.();
      await AuthMenu.signIn(() => getBrowserRuntime());
      // The background stores the session; re-read so the page reflects it.
      await refreshFromSession();
    } catch (error) {
      console.error('Sign-in failed:', error);
      windowObj.alert(getUserFacingSignInErrorMessage(error));
    }
  }

  async function handleResolvedAuthState(user) {
    updateAuthUi(user);

    try {
      if (user) {
        await API.setLastKnownUser?.(user);
        await onSignedIn?.(user);
      } else {
        await API.clearLastKnownUser?.();
        await onSignedOut?.();
      }
    } catch (error) {
      console.error('[newtab] Failed to handle auth state change:', error);
    }
  }

  // Re-read the session from storage and drive the signed-in/out callbacks.
  // Called on init and whenever storage changes (sign-in/sign-out elsewhere).
  async function refreshFromSession() {
    const user = await getCurrentUser();
    await handleResolvedAuthState(user);
    return user;
  }

  async function init() {
    const runtime = getBrowserRuntime();
    if (!runtime) {
      // Standalone mode (file://): no session possible.
      updateAuthUi(null);
      return { handledInitialState: false, user: null };
    }

    try {
      const user = await refreshFromSession();

      // Subscribe to storage changes so sign-in/sign-out from the background
      // (or another tab) updates this page live. Replaces the Firebase
      // onAuthStateChanged subscription.
      const storageArea = windowObj.browser?.storage?.local || windowObj.chrome?.storage?.local;
      if (storageArea && typeof windowObj.browser?.storage?.onChanged?.addListener === 'function') {
        windowObj.browser.storage.onChanged.addListener((changes, areaName) => {
          if (areaName !== 'local') return;
          if (!('saveit_session' in changes)) return;
          refreshFromSession().catch(error => {
            console.error('[newtab] Session change handler failed:', error);
          });
        });
      } else if (windowObj.chrome?.storage?.onChanged) {
        windowObj.chrome.storage.onChanged.addListener((changes, areaName) => {
          if (areaName !== 'local') return;
          if (!('saveit_session' in changes)) return;
          refreshFromSession().catch(error => {
            console.error('[newtab] Session change handler failed:', error);
          });
        });
      }

      return { handledInitialState: true, user };
    } catch (error) {
      console.error('[newtab] Session init failed:', error);
      updateAuthUi(null);
      return { handledInitialState: false, user: null };
    }
  }

  return {
    handleSignIn,
    handleSignOut,
    hideDropdownForOutsideClick,
    init,
    toggleUserDropdown
  };
}
