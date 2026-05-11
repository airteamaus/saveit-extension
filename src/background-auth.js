import { attachTelemetryContext, getSafeRedirectContext, getSafeResponseContext } from './telemetry.js';

export function createBackgroundAuth({ config, browserApi, loadFirebase, logger = console }) {
  let authContextPromise = null;

  async function createAuthContext() {
    const firebase = await loadFirebase();
    const app = firebase.initializeApp(config.firebase);
    const auth = firebase.initializeAuth(app, {
      persistence: firebase.indexedDBLocalPersistence
    });

    let authReady = false;
    const authReadyPromise = new Promise((resolve) => {
      firebase.onAuthStateChanged(auth, (user) => {
        if (!authReady) {
          authReady = true;
          logger.log('Firebase auth state loaded from IndexedDB', {
            hasCachedUser: Boolean(user)
          });
          resolve();
        }

        logger.log('Firebase user state changed', {
          isSignedIn: Boolean(user)
        });
      });
    });

    return {
      firebase,
      auth,
      authReadyPromise
    };
  }

  async function getAuthContext() {
    if (!authContextPromise) {
      authContextPromise = createAuthContext().catch((error) => {
        authContextPromise = null;
        throw error;
      });
    }

    return authContextPromise;
  }

  async function signIn() {
    const { firebase, auth, authReadyPromise } = await getAuthContext();

    await authReadyPromise;

    if (auth.currentUser) {
      logger.log('User already signed in, reusing auth');
      const idToken = await firebase.getIdToken(auth.currentUser);
      return {
        user: auth.currentUser,
        idToken
      };
    }

    const redirectURL = browserApi.identity.getRedirectURL();
    const authContext = {
      authFlow: 'google-oauth',
      interaction: 'interactive',
      runtimeId: browserApi.runtime?.id || null,
      ...getSafeRedirectContext(redirectURL)
    };

    logger.log('Launching OAuth flow', authContext);

    const authURL = new URL('https://accounts.google.com/o/oauth2/auth');
    authURL.searchParams.set('client_id', config.oauthClientId);
    authURL.searchParams.set('response_type', 'token id_token');
    authURL.searchParams.set('redirect_uri', redirectURL);
    authURL.searchParams.set('scope', 'openid email profile');
    authURL.searchParams.set('prompt', 'select_account');

    let responseURL;
    try {
      responseURL = await browserApi.identity.launchWebAuthFlow({
        interactive: true,
        url: authURL.href
      });
    } catch (error) {
      const authError = attachTelemetryContext(error, authContext);
      logger.error('OAuth flow failed', authError, authError.telemetryContext);
      throw authError;
    }

    const responseContext = {
      ...authContext,
      ...getSafeResponseContext(responseURL)
    };

    let params;
    try {
      params = new URLSearchParams(new URL(responseURL).hash.substring(1));
    } catch (error) {
      const authError = attachTelemetryContext(error, responseContext);
      logger.error('Failed to parse OAuth response', authError, authError.telemetryContext);
      throw authError;
    }

    const accessToken = params.get('access_token');
    const idToken = params.get('id_token');

    if (!accessToken) {
      const authError = attachTelemetryContext(
        new Error('No access token received from OAuth'),
        {
          ...responseContext,
          hasAccessToken: false,
          hasIdToken: Boolean(idToken)
        }
      );
      logger.warn('OAuth response missing access token', authError.telemetryContext);
      throw authError;
    }

    const credential = firebase.GoogleAuthProvider.credential(idToken, accessToken);
    const userCredential = await firebase.signInWithCredential(auth, credential);
    const firebaseIdToken = await firebase.getIdToken(userCredential.user);

    logger.log('Firebase sign-in successful', {
      hasUser: Boolean(userCredential.user?.uid)
    });

    return {
      user: userCredential.user,
      idToken: firebaseIdToken
    };
  }

  async function signOut() {
    const { firebase, auth } = await getAuthContext();
    await firebase.signOut(auth);
  }

  return {
    getAuthContext,
    signIn,
    signOut
  };
}
