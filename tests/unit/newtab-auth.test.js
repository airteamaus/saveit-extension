import { describe, expect, it, vi } from 'vitest';

import { createNewtabAuthController } from '../../src/newtab-auth.js';
import { getCurrentUser } from '../../src/session-store.js';

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
      }),
      updateCompactMenu: vi.fn()
    };
    const onInteractiveSignIn = vi.fn(() => callOrder.push('interactive'));
    getCurrentUser.mockResolvedValue({ uid: 'u1', email: 'a@b.com' });
    const { controller } = createController({ onInteractiveSignIn, AuthMenu });

    await controller.handleSignIn();

    expect(onInteractiveSignIn).toHaveBeenCalledTimes(1);
    // Must run before the OAuth flow so the warm-up is armed before the
    // resulting onSignedIn runs.
    expect(callOrder).toEqual(['interactive', 'oauth']);
  });

  it('does NOT fire onInteractiveSignIn when a session is restored on init', async () => {
    // Regression guard for the bug where the warming UI flashed over the
    // user's existing cards on every newtab open with a persisted session.
    // init() reads the session from storage; only handleSignIn (interactive)
    // may arm the warm-up.
    getCurrentUser.mockResolvedValue({ uid: 'u1', email: 'a@b.com' });
    const onInteractiveSignIn = vi.fn();
    const onSignedIn = vi.fn();
    const fakeWindow = { browser: { runtime: { id: 'x' } } };
    const { controller } = createController({
      onInteractiveSignIn,
      onSignedIn,
      windowObj: fakeWindow
    });

    await controller.init();

    // Session restore fires onSignedIn, but must NOT arm the warm-up.
    expect(onSignedIn).toHaveBeenCalledTimes(1);
    expect(onInteractiveSignIn).not.toHaveBeenCalled();
  });

  it('fires onSignedOut when no session exists on init', async () => {
    getCurrentUser.mockResolvedValue(null);
    const onSignedOut = vi.fn();
    const fakeWindow = { browser: { runtime: { id: 'x' } } };
    const { controller } = createController({ onSignedOut, windowObj: fakeWindow });

    await controller.init();

    expect(onSignedOut).toHaveBeenCalledTimes(1);
  });
});
