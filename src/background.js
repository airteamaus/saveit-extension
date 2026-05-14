// background.js - Service worker for SaveIt extension (manifest v3)
import { CONFIG } from './config.js';
import { createBackgroundAuth } from './background-auth.js';
import { invalidateSavedPagesCacheStorage } from './saved-pages-cache.js';
import { createLogger, getSafePageContext } from './telemetry.js';

const logger = createLogger('background');
const authLogger = createLogger('background-auth');

logger.log('Extension loaded', {
  environment: CONFIG.environment,
  errorReportingEnabled: CONFIG.enableErrorReporting
});

const browserApi = globalThis.browser ?? globalThis.chrome;

if (!browserApi?.runtime) {
  throw new Error('Browser runtime API not available in background context');
}

let sentryPromise = null;

async function getSentry() {
  if (!sentryPromise) {
    sentryPromise = import('./sentry.js')
      .then((sentry) => {
        sentry.initSentry();
        return sentry;
      })
      .catch((error) => {
        sentryPromise = null;
        throw error;
      });
  }

  return sentryPromise;
}

async function setSentryUser(user) {
  try {
    const sentry = await getSentry();
    sentry.setUser(user);
  } catch (error) {
    logger.error('Failed to set Sentry user', error);
  }
}

async function setSentryRequestId(requestId) {
  try {
    const sentry = await getSentry();
    sentry.setRequestId(requestId);
  } catch (error) {
    logger.error('Failed to set Sentry request ID', error);
  }
}

async function captureBackgroundError(error, context) {
  try {
    const sentry = await getSentry();
    sentry.captureError(error, {
      ...(error?.telemetryContext || {}),
      ...context
    });
  } catch (sentryError) {
    logger.error('Failed to capture error in Sentry', sentryError);
  }
}

async function captureBackgroundMessage(message, context, level = 'info', flushTimeout = 2000) {
  try {
    const sentry = await getSentry();
    sentry.captureMessage(message, context, level);
    await sentry.flush(flushTimeout);
  } catch (sentryError) {
    logger.error('Failed to capture message in Sentry', sentryError);
  }
}

const backgroundAuth = createBackgroundAuth({
  config: CONFIG,
  browserApi,
  loadFirebase: () => import('./bundles/firebase-background.js'),
  logger: authLogger,
  telemetry: {
    captureMessage: captureBackgroundMessage
  }
});

// Export logout function for debugging
globalThis.logout = async function() {
  await backgroundAuth.signOut();
  logger.log('Logged out from Firebase');
};

/**
 * Show visual feedback on the extension icon
 * @param {string} type - 'success' or 'error'
 * @param {number} duration - How long to show the badge (ms)
 */
async function showBadgeFeedback(type, duration = 2000) {
  if (type === 'success') {
    await browserApi.action.setBadgeText({ text: '✓' });
    await browserApi.action.setBadgeBackgroundColor({ color: '#4CAF50' });
  } else if (type === 'error') {
    await browserApi.action.setBadgeText({ text: '✗' });
    await browserApi.action.setBadgeBackgroundColor({ color: '#F44336' });
  }

  // Clear badge after duration
  setTimeout(async () => {
    await browserApi.action.setBadgeText({ text: '' });
  }, duration);
}

// Handle messages from dashboard (e.g., sign-in button)
browserApi.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === 'signIn') {
    backgroundAuth.signIn()
      .then(async ({ user }) => {
        await setSentryUser(user);
        sendResponse({ success: true });
      })
      .catch(async (error) => {
        logger.error('Sign-in failed', error, error?.telemetryContext);
        await captureBackgroundError(error, {
          context: 'sign-in',
          surface: 'dashboard'
        });
        sendResponse({ success: false, error: error.message });
      });
    return true; // Keep channel open for async response
  }
});

// Handle extension icon clicks
browserApi.action.onClicked.addListener(async (tab) => {
  logger.log('Extension icon clicked');

  // Show immediate feedback that click was registered
  await browserApi.action.setBadgeText({ text: '...' });
  await browserApi.action.setBadgeBackgroundColor({ color: '#64748b' });

  try {
    // Sign in with Firebase (prompts OAuth if not signed in)
    const { user, idToken } = await backgroundAuth.signIn();
    await setSentryUser(user);
    logger.log('Got Firebase user', {
      hasUser: Boolean(user?.uid)
    });

    const pageData = {
      url: tab.url,
      title: tab.title,
      saved_at: new Date().toISOString()
    };

    logger.log('Sending page save request', getSafePageContext(tab.url, tab.title));

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

    const data = await response.json();
    logger.log('Page saved successfully');

    // Set request_id for error correlation
    if (data.request_id) {
      await setSentryRequestId(data.request_id);
    }

    // Invalidate cache so dashboard shows fresh data
    try {
      const cacheKeysRemoved = await invalidateSavedPagesCacheStorage(browserApi.storage.local);
      logger.log('Cache invalidated after save', {
        cacheKeysRemoved
      });
    } catch (cacheError) {
      logger.error('Failed to invalidate cache', cacheError);
    }

    // Show success feedback on icon (always visible)
    await showBadgeFeedback('success', 2000);

    browserApi.notifications.create({
      type: 'basic',
      iconUrl: 'icon.png',
      title: 'SaveIt',
      message: 'Page saved!'
    });

  } catch (error) {
    logger.error('Error saving page', error, getSafePageContext(tab?.url, tab?.title));

    // Capture error in Sentry with context
    await captureBackgroundError(error, {
      context: 'save-page',
      surface: 'toolbar',
      ...getSafePageContext(tab?.url, tab?.title)
    });

    // Show error feedback on icon (always visible)
    await showBadgeFeedback('error', 3000);

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

    browserApi.notifications.create({
      type: 'basic',
      iconUrl: 'icon.png',
      title: 'SaveIt - Error',
      message: userMessage
    });
  }
});
