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
          logger.log('Firebase auth state loaded from IndexedDB:', user ? user.email : 'not signed in');
          resolve();
        }

        logger.log('Firebase user', user ? `signed in: ${user.email}` : 'signed out');
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

    logger.log('Launching OAuth flow...');
    const redirectURL = browserApi.identity.getRedirectURL();

    const authURL = new URL('https://accounts.google.com/o/oauth2/auth');
    authURL.searchParams.set('client_id', config.oauthClientId);
    authURL.searchParams.set('response_type', 'token id_token');
    authURL.searchParams.set('redirect_uri', redirectURL);
    authURL.searchParams.set('scope', 'openid email profile');
    authURL.searchParams.set('prompt', 'select_account');

    const responseURL = await browserApi.identity.launchWebAuthFlow({
      interactive: true,
      url: authURL.href
    });

    const params = new URLSearchParams(new URL(responseURL).hash.substring(1));
    const accessToken = params.get('access_token');
    const idToken = params.get('id_token');

    if (!accessToken) {
      throw new Error('No access token received from OAuth');
    }

    const credential = firebase.GoogleAuthProvider.credential(idToken, accessToken);
    const userCredential = await firebase.signInWithCredential(auth, credential);
    const firebaseIdToken = await firebase.getIdToken(userCredential.user);

    logger.log('Firebase sign-in successful:', userCredential.user.email);

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
