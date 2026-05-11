import { beforeEach, describe, expect, it, vi } from 'vitest';

import { createBackgroundAuth } from '../../src/background-auth.js';

describe('createBackgroundAuth', () => {
  let browserApi;
  let auth;
  let firebase;
  let loadFirebase;
  let backgroundAuth;
  let logger;

  beforeEach(() => {
    auth = { currentUser: null };
    browserApi = {
      identity: {
        getRedirectURL: vi.fn(() => 'https://extension-id.extensions.allizom.org/'),
        launchWebAuthFlow: vi.fn()
      }
    };

    firebase = {
      initializeApp: vi.fn(() => ({ name: 'app' })),
      initializeAuth: vi.fn(() => auth),
      indexedDBLocalPersistence: { name: 'indexeddb' },
      signInWithCredential: vi.fn(async (_auth, _credential) => {
        auth.currentUser = { email: 'test@example.com', uid: 'user-1' };
        return { user: auth.currentUser };
      }),
      GoogleAuthProvider: {
        credential: vi.fn(() => ({ token: 'credential' }))
      },
      onAuthStateChanged: vi.fn((_auth, callback) => {
        callback(auth.currentUser);
      }),
      getIdToken: vi.fn(async (user) => `token-for-${user.email}`),
      signOut: vi.fn(async () => {
        auth.currentUser = null;
      })
    };

    loadFirebase = vi.fn(async () => firebase);
    logger = {
      log: vi.fn(),
      warn: vi.fn(),
      error: vi.fn()
    };

    backgroundAuth = createBackgroundAuth({
      config: {
        oauthClientId: 'test-client-id',
        firebase: { projectId: 'test-project' }
      },
      browserApi,
      loadFirebase,
      logger
    });
  });

  it('defers Firebase initialization until sign-in is requested', () => {
    expect(loadFirebase).not.toHaveBeenCalled();
  });

  it('initializes Firebase once and signs in through the background flow', async () => {
    browserApi.identity.launchWebAuthFlow.mockResolvedValue(
      'https://extension-id.extensions.allizom.org/#access_token=test-access&id_token=test-id'
    );

    const firstResult = await backgroundAuth.signIn();
    const secondResult = await backgroundAuth.signIn();

    expect(loadFirebase).toHaveBeenCalledTimes(1);
    expect(browserApi.identity.launchWebAuthFlow).toHaveBeenCalledTimes(1);
    expect(firebase.GoogleAuthProvider.credential).toHaveBeenCalledWith('test-id', 'test-access');
    expect(firebase.signInWithCredential).toHaveBeenCalledTimes(1);
    expect(firstResult.idToken).toBe('token-for-test@example.com');
    expect(secondResult.idToken).toBe('token-for-test@example.com');
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
});
