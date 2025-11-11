// background.js - Service worker for SaveIt extension (manifest v3)
import { CONFIG } from './config.js';
import { getFirebaseToken, signOut as firebaseSignOut } from './firebase-auth.js';

console.log('SaveIt extension loaded!');
console.log('Config:', CONFIG);

// Export logout function for debugging
globalThis.logout = async function() {
  await firebaseSignOut();
  console.log('Logged out - user signed out of Firebase');
};

// Handle extension icon clicks
browser.action.onClicked.addListener(async (tab) => {
  console.log('Extension icon clicked!');

  try {
    // Get Firebase ID token (prompts OAuth if not signed in)
    const token = await getFirebaseToken();
    console.log('Got Firebase token');

    const pageData = {
      url: tab.url,
      title: tab.title,
      timestamp: new Date().toISOString()
      // Note: user_id is NOT sent - backend extracts from Firebase token
    };

    console.log('Sending to Cloud Function:', pageData);

    const response = await fetch(CONFIG.cloudFunctionUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify(pageData)
    });

    if (!response.ok) {
      let errorMessage = `HTTP ${response.status}`;

      try {
        const errorData = await response.json();
        // Backend returns {error: "message"} for validation errors
        errorMessage = errorData.error || errorData.message || errorMessage;
      } catch (jsonError) {
        // If response isn't JSON, use status text
        errorMessage = response.statusText || errorMessage;
      }

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
