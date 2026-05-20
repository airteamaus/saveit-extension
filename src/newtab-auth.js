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
      await AuthMenu.signIn(() => getBrowserRuntime());
    } catch (error) {
      console.error('Sign-in failed:', error);
      windowObj.alert(getUserFacingSignInErrorMessage(error));
    }
  }

  async function init() {
    if (!windowObj.firebaseReady) {
      updateAuthUi(null);
      return;
    }

    try {
      await windowObj.firebaseReady;

      if (windowObj.firebaseAuth && windowObj.firebaseOnAuthStateChanged) {
        windowObj.firebaseOnAuthStateChanged(windowObj.firebaseAuth, async (user) => {
          updateAuthUi(user);

          if (user) {
            await API.setLastKnownUser?.(user);
            await onSignedIn?.(user);
          } else {
            await API.clearLastKnownUser?.();
            await onSignedOut?.();
          }
        });
      } else {
        updateAuthUi(null);
      }
    } catch (error) {
      console.error('[newtab] Firebase init failed:', error);
      updateAuthUi(null);
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
