// auth-menu.js - Shared auth menu helpers for extension entry points

const AuthMenu = {
  getDisplayName(user) {
    return user?.displayName || user?.name || '';
  },

  getUserInitials(user) {
    const displayName = this.getDisplayName(user).trim();
    if (displayName) {
      const parts = displayName.split(/\s+/);
      if (parts.length >= 2) {
        return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
      }
      return parts[0][0].toUpperCase();
    }

    if (user?.email) {
      return user.email[0].toUpperCase();
    }

    return '?';
  },

  setAvatarContent(avatarEl, user, alt = 'Profile') {
    if (!avatarEl) return;

    avatarEl.textContent = '';
    avatarEl.replaceChildren();

    if (user?.photoURL) {
      const img = document.createElement('img');
      img.src = user.photoURL;
      img.alt = alt;
      avatarEl.appendChild(img);
      return;
    }

    avatarEl.textContent = this.getUserInitials(user);
  },

  updateCompactMenu({ menuRoot, avatarEl, userEmailEl }, user) {
    if (!menuRoot || !avatarEl) return;

    if (user) {
      menuRoot.classList.remove('hidden');
      this.setAvatarContent(avatarEl, user);
      if (userEmailEl) {
        userEmailEl.textContent = user.email || '';
      }
    } else {
      menuRoot.classList.add('hidden');
      if (userEmailEl) {
        userEmailEl.textContent = '';
      }
    }
  },

  updateProfileMenu({ signInBtn, userProfile, userNameEl, userEmailEl, avatarEl }, user) {
    if (!signInBtn || !userProfile || !avatarEl) return;

    if (user) {
      signInBtn.classList.add('hidden');
      userProfile.classList.remove('hidden');
      if (userNameEl) {
        const displayName = this.getDisplayName(user);
        userNameEl.textContent = displayName ? displayName.split(' ')[0] : 'User';
      }
      if (userEmailEl) {
        userEmailEl.textContent = user.email || '';
      }
      this.setAvatarContent(avatarEl, user);
    } else {
      signInBtn.classList.remove('hidden');
      userProfile.classList.add('hidden');
      if (userEmailEl) {
        userEmailEl.textContent = '';
      }
    }
  },

  toggleDropdown(dropdown) {
    if (!dropdown) return;
    if (dropdown.dataset.dropdownMode === 'class') {
      dropdown.classList.toggle('hidden');
      return;
    }

    dropdown.style.display = dropdown.style.display === 'block' ? 'none' : 'block';
  },

  hideDropdown(dropdown) {
    if (!dropdown) return;
    if (dropdown.dataset.dropdownMode === 'class') {
      dropdown.classList.add('hidden');
      return;
    }

    dropdown.style.display = 'none';
  },

  async signIn(getBrowserRuntime) {
    const runtime = getBrowserRuntime?.();
    if (!runtime) {
      throw new Error('Browser runtime not available');
    }

    // Route through the shared sendRuntimeMessage helper (exposed as a global
    // by config-loader.js) so the callback-vs-promise runtime shape is handled
    // uniformly. Awaiting runtime.sendMessage directly only works once the
    // polyfill has loaded; this resolves correctly even before that.
    const response = await window.sendRuntimeMessage(runtime, { action: 'signIn' });
    if (response?.success === false) {
      throw new Error(response.error || 'Sign-in failed');
    }

    return response;
  },

  // Sign-out routes through the background so the backend session is revoked
  // and the Sentry user cleared — both live in the background context.
  async signOut(getBrowserRuntime) {
    const runtime = getBrowserRuntime?.();
    if (!runtime) {
      throw new Error('Browser runtime not available');
    }

    const response = await window.sendRuntimeMessage(runtime, { action: 'signOut' });
    if (response?.success === false) {
      throw new Error(response.error || 'Sign-out failed');
    }

    return response;
  }
};

window.AuthMenu = AuthMenu;
