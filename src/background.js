// background.js - Service worker for SaveIt extension (manifest v3)
import { CONFIG } from './config.js';
import { createBackgroundAuth } from './background-auth.js';
import './cache-manager.js';
import { ProjectsStore } from './projects-store.js';
import { invalidateSavedPagesCacheStorage } from './saved-pages-cache.js';
import { createLogger, getSafePageContext } from './telemetry.js';

const logger = createLogger('background');
const authLogger = createLogger('background-auth');

logger.log('Extension loaded', {
  environment: CONFIG.environment,
  errorReportingEnabled: CONFIG.enableErrorReporting
});

const browserApi = globalThis.browser ?? globalThis.chrome;
const LAST_KNOWN_USER_KEY = 'saveit_lastKnownUser';

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

async function getAuthenticatedSession() {
  const session = await backgroundAuth.signIn();
  await setSentryUser(session.user);
  logger.log('Got Firebase user', {
    hasUser: Boolean(session.user?.uid)
  });
  return session;
}

function getBackgroundStorage() {
  return browserApi.storage?.local || null;
}

async function getBackgroundCurrentUserId() {
  const { auth, authReadyPromise } = await backgroundAuth.getAuthContext();
  await authReadyPromise;
  return auth.currentUser?.uid || null;
}

async function getBackgroundLastKnownUserId() {
  const storage = getBackgroundStorage();
  if (!storage) {
    return null;
  }

  try {
    const result = await storage.get(LAST_KNOWN_USER_KEY);
    return result?.[LAST_KNOWN_USER_KEY]?.userId || null;
  } catch (error) {
    logger.error('Failed to read cached auth bootstrap', error);
    return null;
  }
}

const toolbarProjectsCacheManager = new globalThis.CacheManager_Export(
  getBackgroundCurrentUserId,
  getBackgroundStorage,
  {
    getBootstrapUserId: getBackgroundLastKnownUserId
  }
);

const toolbarProjectsStore = new ProjectsStore({
  isExtension: true,
  async getProjects() {
    const projects = await fetchBackgroundApi('/projects');
    return Array.isArray(projects) ? projects : [];
  },
  getCachedPages(scope, options) {
    return toolbarProjectsCacheManager.getCachedPages(scope, options);
  },
  setCachedPages(projects, scope) {
    return toolbarProjectsCacheManager.setCachedPages(projects, scope);
  }
});

async function parseApiError(response) {
  const errorData = await response.json().catch(() => null);
  return errorData?.error || errorData?.message || response.statusText || `HTTP ${response.status}`;
}

async function fetchBackgroundApi(path = '', { method = 'GET', body } = {}) {
  const { idToken } = await getAuthenticatedSession();
  const headers = {
    'Authorization': `Bearer ${idToken}`
  };

  if (body !== undefined) {
    headers['Content-Type'] = 'application/json';
  }

  const response = await fetch(`${CONFIG.cloudFunctionUrl}${path}`, {
    method,
    headers,
    ...(body !== undefined ? { body: JSON.stringify(body) } : {})
  });

  if (!response.ok) {
    throw new Error(await parseApiError(response));
  }

  if (response.status === 204) {
    return null;
  }

  return await response.json().catch(() => null);
}

function getUserSaveErrorMessage(error) {
  let userMessage = error.message;

  if (userMessage.includes('Invalid URL')) {
    userMessage = "Sorry, can't save this page. " +
      (userMessage.includes('example.com') ? 'Example domains are not supported.' :
       userMessage.includes('localhost') ? 'Local URLs cannot be saved.' :
       userMessage.includes('protocol') ? 'Only http/https URLs can be saved.' :
       userMessage);
  } else if (userMessage.includes('Sign-in failed') || userMessage.includes('Unauthorized')) {
    userMessage = 'Authentication failed. Please try again or check your Google account.';
  }

  return userMessage;
}

async function handleSaveError(error, tab) {
  logger.error('Error saving page', error, getSafePageContext(tab?.url, tab?.title));

  await captureBackgroundError(error, {
    context: 'save-page',
    surface: 'toolbar',
    ...getSafePageContext(tab?.url, tab?.title)
  });

  await showBadgeFeedback('error', 3000);

  const userMessage = getUserSaveErrorMessage(error);
  browserApi.notifications.create({
    type: 'basic',
    iconUrl: 'icon.png',
    title: 'SaveIt - Error',
    message: userMessage
  });

  return userMessage;
}

async function getActiveTab() {
  if (!browserApi.tabs?.query) {
    throw new Error('Tabs API not available');
  }

  const tabs = await browserApi.tabs.query({
    active: true,
    currentWindow: true
  });
  const [tab] = tabs || [];

  if (!tab?.url) {
    throw new Error('No active tab available to save');
  }

  return tab;
}

async function getToolbarProjects() {
  const snapshot = await toolbarProjectsStore.hydrate();
  const projects = snapshot.projects || snapshot.allPages || [];
  return Array.isArray(projects)
    ? projects.filter(project => project?.archived !== true)
    : [];
}

async function savePageFromTab(tab, { projectId = null } = {}) {
  const pageData = {
    url: tab.url,
    title: tab.title,
    saved_at: new Date().toISOString(),
    ...(projectId ? { projectId } : {})
  };

  logger.log('Sending page save request', {
    ...getSafePageContext(tab.url, tab.title),
    hasProjectId: Boolean(projectId)
  });

  const data = await fetchBackgroundApi('', {
    method: 'POST',
    body: pageData
  });

  logger.log('Page saved successfully');

  if (data?.request_id) {
    await setSentryRequestId(data.request_id);
  }

  try {
    const cacheKeysRemoved = await invalidateSavedPagesCacheStorage(browserApi.storage.local);
    logger.log('Cache invalidated after save', {
      cacheKeysRemoved
    });
  } catch (cacheError) {
    logger.error('Failed to invalidate cache', cacheError);
  }

  await showBadgeFeedback('success', 2000);

  browserApi.notifications.create({
    type: 'basic',
    iconUrl: 'icon.png',
    title: 'SaveIt',
    message: 'Page saved!'
  });

  return data;
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

  if (message.action === 'getToolbarProjects') {
    getToolbarProjects()
      .then((projects) => {
        sendResponse({ success: true, projects });
      })
      .catch(async (error) => {
        logger.error('Failed to load toolbar projects', error);
        await captureBackgroundError(error, {
          context: 'get-projects',
          surface: 'toolbar-popup'
        });
        sendResponse({ success: false, error: error.message });
      });
    return true;
  }

  if (message.action === 'saveCurrentPage') {
    (async () => {
      await browserApi.action.setBadgeText({ text: '...' });
      await browserApi.action.setBadgeBackgroundColor({ color: '#64748b' });

      const tab = await getActiveTab();
      await savePageFromTab(tab, {
        projectId: typeof message.projectId === 'string' ? message.projectId : null
      });
    })()
      .then(() => {
        sendResponse({ success: true });
      })
      .catch(async (error) => {
        const userMessage = await handleSaveError(error, null);
        sendResponse({ success: false, error: userMessage });
      });
    return true;
  }
});

// Handle extension icon clicks
browserApi.action.onClicked.addListener(async (tab) => {
  logger.log('Extension icon clicked');

  // Show immediate feedback that click was registered
  await browserApi.action.setBadgeText({ text: '...' });
  await browserApi.action.setBadgeBackgroundColor({ color: '#64748b' });

  try {
    await savePageFromTab(tab);
  } catch (error) {
    await handleSaveError(error, tab);
  }
});
