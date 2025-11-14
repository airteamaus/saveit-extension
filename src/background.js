// background.js - Service worker for SaveIt extension (manifest v3)
import { CONFIG } from './config.js';
import {
  initializeApp,
  initializeAuth,
  indexedDBLocalPersistence,
  signInWithCredential,
  GoogleAuthProvider,
  onAuthStateChanged,
  getIdToken,
  signOut
} from './bundles/firebase-background.js';

console.log('SaveIt extension loaded!');
console.log('Config:', CONFIG);

// Initialize Firebase with IndexedDB persistence for service worker
const app = initializeApp(CONFIG.firebase);
const auth = initializeAuth(app, {
  persistence: indexedDBLocalPersistence
});

// Track when auth state is ready (loaded from IndexedDB)
let authReady = false;
const authReadyPromise = new Promise((resolve) => {
  onAuthStateChanged(auth, (user) => {
    if (!authReady) {
      authReady = true;
      console.log('Firebase auth state loaded from IndexedDB:', user ? user.email : 'not signed in');
      resolve();
    }
    if (user) {
      console.log('Firebase user signed in:', user.email);
    } else {
      console.log('Firebase user signed out');
    }
  });
});

/**
 * Sign in with Firebase using browser.identity OAuth flow
 * Returns Firebase user and ID token
 */
async function signInWithFirebase() {
  // Wait for auth to load from IndexedDB before checking currentUser
  await authReadyPromise;

  if (auth.currentUser) {
    console.log('User already signed in, reusing auth');
    const idToken = await getIdToken(auth.currentUser);
    return {
      user: auth.currentUser,
      idToken
    };
  }

  console.log('Launching OAuth flow...');
  const redirectURL = browser.identity.getRedirectURL();

  const authURL = new URL('https://accounts.google.com/o/oauth2/auth');
  authURL.searchParams.set('client_id', CONFIG.oauthClientId);
  authURL.searchParams.set('response_type', 'token id_token');
  authURL.searchParams.set('redirect_uri', redirectURL);
  authURL.searchParams.set('scope', 'openid email profile');
  authURL.searchParams.set('prompt', 'select_account');

  const responseURL = await browser.identity.launchWebAuthFlow({
    interactive: true,
    url: authURL.href
  });

  // Extract tokens from redirect URL
  const urlParams = new URL(responseURL).hash.substring(1);
  const params = new URLSearchParams(urlParams);
  const accessToken = params.get('access_token');
  const idToken = params.get('id_token');

  if (!accessToken) {
    throw new Error('No access token received from OAuth');
  }

  // Create Firebase credential from Google OAuth token
  const credential = GoogleAuthProvider.credential(idToken, accessToken);

  // Sign in to Firebase
  const userCredential = await signInWithCredential(auth, credential);
  const firebaseIdToken = await getIdToken(userCredential.user);

  console.log('Firebase sign-in successful:', userCredential.user.email);

  return {
    user: userCredential.user,
    idToken: firebaseIdToken
  };
}

// Export logout function for debugging
globalThis.logout = async function() {
  await signOut(auth);
  console.log('Logged out from Firebase');
};

// Handle messages from dashboard (e.g., sign-in button)
browser.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === 'signIn') {
    signInWithFirebase()
      .then(() => {
        sendResponse({ success: true });
      })
      .catch((error) => {
        console.error('Sign-in failed:', error);
        sendResponse({ success: false, error: error.message });
      });
    return true; // Keep channel open for async response
  }
});

// Handle extension icon clicks
browser.action.onClicked.addListener(async (tab) => {
  console.log('Extension icon clicked!');

  try {
    // Sign in with Firebase (prompts OAuth if not signed in)
    const { user, idToken } = await signInWithFirebase();
    console.log('Got Firebase user:', user.email);

    const pageData = {
      url: tab.url,
      title: tab.title,
      saved_at: new Date().toISOString()
    };

    console.log('Sending to Cloud Function:', pageData);

    const response = await fetch(CONFIG.cloudFunctionUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${idToken}`
      },
      body: JSON.stringify(pageData)
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => null);
      const errorMessage = errorData?.error || errorData?.message || response.statusText || `HTTP ${response.status}`;
      throw new Error(errorMessage);
    }

    console.log('Page saved successfully!');

    // Invalidate cache so dashboard shows fresh data
    try {
      await browser.storage.local.remove('savedPages_cache');
      console.log('Cache invalidated after save');
    } catch (cacheError) {
      console.error('Failed to invalidate cache:', cacheError);
    }

    browser.notifications.create({
      type: 'basic',
      iconUrl: 'icon.png',
      title: 'SaveIt',
      message: 'Page saved!'
    });

  } catch (error) {
    console.error('Error saving page:', error);

    // Show user-friendly error message
    let userMessage = error.message;

    // Make common errors more user-friendly
    if (userMessage.includes('Invalid URL')) {
      userMessage = "Sorry, can't save this page. " +
        (userMessage.includes('example.com') ? 'Example domains are not supported.' :
         userMessage.includes('localhost') ? 'Local URLs cannot be saved.' :
         userMessage.includes('protocol') ? 'Only http/https URLs can be saved.' :
         userMessage);
    } else if (userMessage.includes('Sign-in failed') || userMessage.includes('Unauthorized')) {
      userMessage = 'Authentication failed. Please try again or check your Google account.';
    }

    browser.notifications.create({
      type: 'basic',
      iconUrl: 'icon.png',
      title: 'SaveIt - Error',
      message: userMessage
    });
  }
});
