import { beforeEach, describe, expect, it, vi } from 'vitest';

// Mock session-store so tests control token state without touching real storage.
vi.mock('../../src/session-store.js', () => ({
  getSessionToken: vi.fn(),
  getCurrentUser: vi.fn(),
  setSession: vi.fn(),
  clearSession: vi.fn()
}));

import { createBackgroundAuth } from '../../src/background-auth.js';
import { getSessionToken, getCurrentUser, setSession, clearSession } from '../../src/session-store.js';

describe('createBackgroundAuth', () => {
  let browserApi;
  let backgroundAuth;
  let logger;
  let telemetry;

  beforeEach(() => {
    vi.clearAllMocks();

    browserApi = {
      identity: {
        getRedirectURL: vi.fn(() => 'https://extension-id.extensions.allizom.org/'),
        launchWebAuthFlow: vi.fn()
      }
    };

    // Default: no existing session, so signIn() proceeds through OAuth.
    getSessionToken.mockResolvedValue(null);
    getCurrentUser.mockResolvedValue(null);

    logger = {
      log: vi.fn(),
      warn: vi.fn(),
      error: vi.fn()
    };
    telemetry = {
      captureMessage: vi.fn(async () => {})
    };

    backgroundAuth = createBackgroundAuth({
      config: {
        cloudFunctionUrl: 'https://test-function.run.app',
        oauthClientId: 'test-client-id'
      },
      browserApi,
      logger,
      telemetry
    });
  });

  it('makes no OAuth or network calls until sign-in is requested', () => {
    expect(browserApi.identity.launchWebAuthFlow).not.toHaveBeenCalled();
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('exchanges the Google ID token for an opaque session token via POST /auth/session', async () => {
    browserApi.identity.launchWebAuthFlow.mockResolvedValue(
      'https://extension-id.extensions.allizom.org/#access_token=test-access&id_token=test-id'
    );
    global.fetch.mockResolvedValue({
      ok: true,
      json: async () => ({
        session_token: 'opaque-session-tok',
        expires_at: '2099-01-01T00:00:00.000Z',
        user: { uid: 'user-1', email: 'test@example.com' }
      })
    });

    const firstResult = await backgroundAuth.signIn();

    // OAuth launched exactly once
    expect(browserApi.identity.launchWebAuthFlow).toHaveBeenCalledTimes(1);

    // The Google ID token is POSTed to /auth/session
    expect(global.fetch).toHaveBeenCalledWith(
      'https://test-function.run.app/auth/session',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ google_id_token: 'test-id' })
      })
    );

    // Session persisted
    expect(setSession).toHaveBeenCalledWith({
      sessionToken: 'opaque-session-tok',
      uid: 'user-1',
      email: 'test@example.com',
      expiresAt: '2099-01-01T00:00:00.000Z'
    });

    expect(firstResult).toEqual({
      user: { uid: 'user-1', email: 'test@example.com' },
      idToken: 'opaque-session-tok'
    });

    // Second call reuses the now-stored session, no second OAuth
    getSessionToken.mockResolvedValue('opaque-session-tok');
    getCurrentUser.mockResolvedValue({ uid: 'user-1', email: 'test@example.com' });
    const secondResult = await backgroundAuth.signIn();

    expect(browserApi.identity.launchWebAuthFlow).toHaveBeenCalledTimes(1);
    expect(secondResult.idToken).toBe('opaque-session-tok');

    expect(telemetry.captureMessage).toHaveBeenCalledWith(
      'OAuth flow launched',
      expect.objectContaining({
        context: 'sign-in-start',
        redirectUri: 'https://extension-id.extensions.allizom.org/'
      }),
      'warning'
    );
  });

  it('annotates OAuth launch failures with safe redirect context', async () => {
    browserApi.runtime = { id: 'extension-runtime-id' };
    browserApi.identity.launchWebAuthFlow.mockRejectedValue(new Error('400 redirect_uri_mismatch'));

    await expect(backgroundAuth.signIn()).rejects.toMatchObject({
      message: '400 redirect_uri_mismatch',
      telemetryContext: {
        authFlow: 'google-oauth',
        interaction: 'interactive',
        runtimeId: 'extension-runtime-id',
        redirectUri: 'https://extension-id.extensions.allizom.org/',
        redirectOrigin: 'https://extension-id.extensions.allizom.org',
        redirectPath: '/',
        redirectScheme: 'https',
        hasRedirectUri: true
      }
    });

    expect(logger.error).toHaveBeenCalledWith(
      'OAuth flow failed',
      expect.objectContaining({ message: '400 redirect_uri_mismatch' }),
      expect.objectContaining({
        redirectUri: 'https://extension-id.extensions.allizom.org/'
      })
    );
  });

  it('maps a rejected session exchange to an error with telemetry context', async () => {
    browserApi.identity.launchWebAuthFlow.mockResolvedValue(
      'https://extension-id.extensions.allizom.org/#access_token=test-access&id_token=test-id'
    );
    global.fetch.mockResolvedValue({
      ok: false,
      status: 401,
      json: async () => ({ message: 'Invalid Google ID token' })
    });

    await expect(backgroundAuth.signIn()).rejects.toMatchObject({
      message: 'Invalid Google ID token',
      telemetryContext: expect.objectContaining({ httpStatus: 401 })
    });
    expect(setSession).not.toHaveBeenCalled();
  });

  it('revokes the session server-side and clears local state on signOut', async () => {
    getSessionToken.mockResolvedValue('opaque-session-tok');
    global.fetch.mockResolvedValue({ ok: true, status: 204 });

    await backgroundAuth.signOut();

    expect(global.fetch).toHaveBeenCalledWith(
      'https://test-function.run.app/auth/session',
      expect.objectContaining({
        method: 'DELETE',
        headers: { Authorization: 'Bearer opaque-session-tok' }
      })
    );
    expect(clearSession).toHaveBeenCalled();
  });

  it('clears local state on signOut even if the revoke request fails', async () => {
    getSessionToken.mockResolvedValue('opaque-session-tok');
    global.fetch.mockRejectedValue(new Error('network down'));

    await backgroundAuth.signOut();

    expect(clearSession).toHaveBeenCalled();
    expect(logger.warn).toHaveBeenCalledWith(
      'Session revoke request failed',
      expect.objectContaining({ error: 'network down' })
    );
  });

  // Regression: signOut must also clear the lastKnownUser bootstrap key. The
  // cache-manager's read path falls back to this key when no session is
  // present, and the mismatch check compares against the (same) bootstrap id —
  // so leaving it set after sign-out lets a later signed-out or different-user
  // read paint the previous user's cached pages. The facade's
  // clearLastKnownUser only runs when a newtab page observes the session
  // change; this guard closes the window for the no-newtab-open case.
  it('clears the lastKnownUser bootstrap key atomically with the session on signOut', async () => {
    getSessionToken.mockResolvedValue('opaque-session-tok');
    global.fetch.mockResolvedValue({ ok: true, status: 204 });
    const removeSpy = vi.fn(async () => {});
    browserApi.storage = { local: { remove: removeSpy } };

    await backgroundAuth.signOut();

    // Both cleared before signOut resolves — no window where session is gone
    // but the bootstrap key lingers.
    expect(clearSession).toHaveBeenCalled();
    expect(removeSpy).toHaveBeenCalledWith('saveit_lastKnownUser');
    // Order matters: the bootstrap clear must come AFTER clearSession so a
    // concurrent reader that just lost the session can't fall back to a
    // now-stale bootstrap id.
    const clearSessionOrder = clearSession.mock.invocationCallOrder[0];
    const removeOrder = removeSpy.mock.invocationCallOrder[0];
    expect(removeOrder).toBeGreaterThan(clearSessionOrder);
  });

  it('still signs out when storage.local is unavailable (non-fatal bootstrap clear)', async () => {
    getSessionToken.mockResolvedValue('opaque-session-tok');
    global.fetch.mockResolvedValue({ ok: true, status: 204 });
    // No browserApi.storage — production may run before storage is wired.

    await backgroundAuth.signOut();

    expect(clearSession).toHaveBeenCalled();
    // Non-fatal: no throw, signOut resolves.
  });
});
