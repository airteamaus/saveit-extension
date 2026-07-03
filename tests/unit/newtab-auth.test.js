import { describe, expect, it, vi } from 'vitest';

import { createNewtabAuthController } from '../../src/newtab-auth.js';

function makeElements() {
  return {
    signInBtn: document.createElement('button'),
    userMenu: document.createElement('div'),
    userAvatar: document.createElement('span'),
    userDropdown: document.createElement('div'),
    userEmailEl: document.createElement('span')
  };
}

function createController({
  onInteractiveSignIn = vi.fn(),
  onSignedIn = vi.fn(),
  onSignedOut = vi.fn(),
  AuthMenu = {
    signIn: vi.fn().mockResolvedValue(undefined),
    updateCompactMenu: vi.fn()
  },
  API = { setLastKnownUser: vi.fn().mockResolvedValue(undefined) },
  windowObj = window
} = {}) {
  const controller = createNewtabAuthController({
    API,
    AuthMenu,
    elements: makeElements(),
    onSignedIn,
    onSignedOut,
    onInteractiveSignIn,
    windowObj
  });
  return { controller, onInteractiveSignIn, onSignedIn };
}

describe('newtab auth controller interactive sign-in', () => {
  it('fires onInteractiveSignIn before the OAuth flow on explicit sign-in', async () => {
    const callOrder = [];
    const AuthMenu = {
      signIn: vi.fn(async () => {
        callOrder.push('oauth');
      })
    };
    const onInteractiveSignIn = vi.fn(() => callOrder.push('interactive'));
    const { controller } = createController({ onInteractiveSignIn, AuthMenu });

    await controller.handleSignIn();

    expect(onInteractiveSignIn).toHaveBeenCalledTimes(1);
    // Must run before the OAuth flow so the warm-up is armed before the
    // resulting onAuthStateChanged -> onSignedIn -> handleSignedIn runs.
    expect(callOrder).toEqual(['interactive', 'oauth']);
  });

  it('does NOT fire onInteractiveSignIn when a session is restored on init', async () => {
    // Regression guard for the bug where the warming UI flashed over the
    // user's existing cards on every newtab open with a persisted session.
    // onAuthStateChanged fires for BOTH interactive sign-in and session
    // restore; only the interactive path (handleSignIn) may arm the warm-up.
    const fakeAuth = {};
    const restoredUser = { uid: 'u1', email: 'a@b.com' };
    const fakeWindow = {
      firebaseReady: Promise.resolve(true),
      firebaseAuth: fakeAuth,
      // Firebase invokes the listener once with the restored session. Firing
      // it on a microtask lets init()'s Promise.race resolve naturally.
      firebaseOnAuthStateChanged: vi.fn((auth, cb) => {
        Promise.resolve().then(() => cb(restoredUser));
      })
    };
    const onInteractiveSignIn = vi.fn();
    const onSignedIn = vi.fn();
    const { controller } = createController({
      onInteractiveSignIn,
      onSignedIn,
      windowObj: fakeWindow
    });

    // init() resolves once onAuthStateChanged has fired the first time.
    await controller.init();
    // Let the handleResolvedAuthState chain (setLastKnownUser -> onSignedIn) settle.
    await new Promise(resolve => setTimeout(resolve, 0));

    // Session restore fires onSignedIn, but must NOT arm the warm-up.
    expect(onSignedIn).toHaveBeenCalledTimes(1);
    expect(onInteractiveSignIn).not.toHaveBeenCalled();
  });
});
