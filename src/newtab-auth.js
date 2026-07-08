import { resolveInitialAuthState } from './firebase-auth-state.js';

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
      await AuthMenu.signOut();
    } catch (error) {
      console.error('[newtab] Sign out failed:', error);
    }
  }

  async function handleSignIn() {
    try {
      // Signal the interactive sign-in *before* the OAuth flow resolves, so any
      // one-time warm-up is armed before the resulting onAuthStateChanged ->
      // onSignedIn -> handleSignedIn runs (which triggers hydrate/prefetch).
      onInteractiveSignIn?.();
      await AuthMenu.signIn(() => getBrowserRuntime());
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

  async function init() {
    if (!windowObj.firebaseReady) {
      updateAuthUi(null);
      return { handledInitialState: false, user: null };
    }

    try {
      await windowObj.firebaseReady;

      if (!windowObj.firebaseAuth || !windowObj.firebaseOnAuthStateChanged) {
        updateAuthUi(null);
        return { handledInitialState: false, user: null };
      }

      // The first auth-state callback resolves the race; subsequent ones
      // (later sign-in/sign-out transitions) keep driving handleResolvedAuthState.
      // handleResolvedAuthState is awaited for the first callback so init()
      // does not resolve until onSignedIn/onSignedOut has run — startNewtabPage
      // relies on that to avoid loading the drawer ahead of session restoration.
      const { user, timedOut } = await resolveInitialAuthState({
        subscribe: cb => windowObj.firebaseOnAuthStateChanged(windowObj.firebaseAuth, cb),
        onChange: handleResolvedAuthState,
        timeoutMs: 10000
      });

      if (timedOut) {
        // Matches the prior behaviour: a timeout is treated as "no initial
        // state" rather than a hard failure, so the UI falls through to the
        // signed-out state without throwing.
        throw new Error('Firebase auth timeout');
      }

      return { handledInitialState: true, user };
    } catch (error) {
      console.error('[newtab] Firebase init failed:', error);
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
