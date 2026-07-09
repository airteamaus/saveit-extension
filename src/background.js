// background.js - Service worker for the Buckley's extension (manifest v3)
import { CONFIG } from './config.js';
import { createBackgroundAuth } from './background-auth.js';
import { getCurrentUserId as getSessionUserId, setSession } from './session-store.js';
import { CacheManager } from './cache-manager.js';
import { ProjectsStore } from './projects-store.js';
import { invalidateSavedPagesCacheStorage } from './saved-pages-cache.js';
import { reconcile, mirrorSavedPage } from './bookmark-mirror.js';
import { getMirrorState, setMirrorEnabled } from './bookmark-mirror-settings.js';
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
  logger: authLogger,
  telemetry: {
    captureMessage: captureBackgroundMessage
  }
});

// Export logout function for debugging
globalThis.logout = async function() {
  await backgroundAuth.signOut();
  logger.log('Session cleared');
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
  logger.log('Got authenticated session', {
    hasUser: Boolean(session.user?.uid)
  });
  return session;
}

function getBackgroundStorage() {
  return browserApi.storage?.local || null;
}

async function getBackgroundCurrentUserId() {
  return await getSessionUserId();
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

const toolbarProjectsCacheManager = new CacheManager(
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

async function fetchBackgroundApi(path = '', { method = 'GET', body, params } = {}) {
  const { idToken } = await getAuthenticatedSession();
  const headers = {
    'Authorization': `Bearer ${idToken}`
  };

  if (body !== undefined) {
    headers['Content-Type'] = 'application/json';
  }

  // Query params are the only way to pass options on a GET — a request body
  // is ignored by the server and silently dropped. Build a query string like
  // the newtab path does (api-core _requestWithAuth) so GET requests actually
  // carry their parameters.
  let url = `${CONFIG.cloudFunctionUrl}${path}`;
  if (params) {
    const searchParams = new URLSearchParams();
    for (const [key, value] of Object.entries(params)) {
      if (value !== undefined && value !== null) {
        searchParams.set(key, String(value));
      }
    }
    const qs = searchParams.toString();
    if (qs) {
      url = `${url}?${qs}`;
    }
  }

  const response = await fetch(url, {
    method,
    headers,
    ...(body !== undefined ? { body: JSON.stringify(body) } : {})
  });

  if (!response.ok) {
    throw new Error(await parseApiError(response));
  }

  // Sliding session refresh: the backend rotates the token inline once it
  // crosses the refresh threshold and returns the replacement here. Store it
  // so subsequent calls use the new token.
  await applySessionRotation(response);

  if (response.status === 204) {
    return null;
  }

  return await response.json().catch(() => null);
}

// Update the stored session when the backend hands back a rotated token.
// Best-effort: a failure here doesn't invalidate the current request.
async function applySessionRotation(response) {
  const headers = response.headers;
  if (!headers || typeof headers.get !== 'function') {
    return;
  }
  const newToken = headers.get('X-Session-Token');
  const newExpiry = headers.get('X-Session-Expires-At');
  if (!newToken || !newExpiry) {
    return;
  }
  try {
    const user = await getSessionUserId().then(async (uid) => {
      if (uid) {
        return { uid };
      }
      return null;
    });
    if (user?.uid) {
      await setSession({ sessionToken: newToken, uid: user.uid, expiresAt: newExpiry });
      logger.log('Session token rotated by backend');
    }
  } catch (error) {
    logger.warn('Failed to apply session rotation', { error: error.message });
  }
}

// Minimal API surface for the bookmark mirror. The full newtab facade isn't
// loaded in the background; we expose just the three methods reconcile() needs,
// backed by the same authenticated fetch. Cursor pagination mirrors the
// newtab path (limit + cursor until hasNextPage is false).
const mirrorApi = {
  async getSavedPages({ limit = 100, sort = 'newest', cursor } = {}) {
    const params = { limit, sort };
    if (cursor) {
      params.cursor = cursor;
    }
    return fetchBackgroundApi('', { params });
  },
  async getProjects() {
    const projects = await fetchBackgroundApi('/projects');
    return Array.isArray(projects) ? projects : [];
  }
};

// --- bookmark mirror scheduling ------------------------------------------
// Two triggers: a 4-hour periodic alarm for full reconciles, plus a one-shot
// 30s debounce after each save so an on-save-created bookmark gets claimed
// into the ownership map (and any cross-device drift gets picked up) promptly
// without hammering the server on a burst of saves.

const MIRROR_ALARM = 'bookmarkMirror';
const MIRROR_ALARM_PERIOD_MIN = 240; // 4h
const POST_SAVE_RECONCILE_ALARM = 'bookmarkMirror-postSave';
const POST_SAVE_RECONCILE_DELAY_MIN = 0.5; // 30s

let postSaveReconcileArmed = false;

function schedulePostSaveReconcile() {
  if (postSaveReconcileArmed) {
    return; // already armed this burst — collapse into one reconcile
  }
  if (!browserApi.alarms?.create) {
    return; // alarms API unavailable — next periodic tick will catch up
  }
  postSaveReconcileArmed = true;
  browserApi.alarms.create(POST_SAVE_RECONCILE_ALARM, {
    delayInMinutes: POST_SAVE_RECONCILE_DELAY_MIN
  });
}

async function runMirrorReconcile({ forceFull = false } = {}) {
  try {
    const result = await reconcile({
      bookmarksApi: browserApi.bookmarks,
      api: mirrorApi,
      storage: browserApi.storage.local,
      forceFull,
      onWarn: (msg) => logger.warn('mirror reconcile warning', { msg })
    });
    logger.log('mirror reconcile done', result);
  } catch (error) {
    logger.error('mirror reconcile failed', error);
  }
}

function registerMirrorAlarms() {
  if (!browserApi.alarms?.create || !browserApi.alarms?.onAlarm) {
    return;
  }
  // Periodic full reconcile. Using alarms (not setInterval) because MV3
  // service workers are torn down when idle — only alarms reliably wake them.
  browserApi.alarms.create(MIRROR_ALARM, {
    periodInMinutes: MIRROR_ALARM_PERIOD_MIN
  });
  browserApi.alarms.onAlarm.addListener((alarm) => {
    if (alarm?.name === MIRROR_ALARM) {
      void runMirrorReconcile({ forceFull: false });
    } else if (alarm?.name === POST_SAVE_RECONCILE_ALARM) {
      postSaveReconcileArmed = false;
      void runMirrorReconcile({ forceFull: false });
    }
  });
}

// Seed the mirror on install/update: if the user already had it enabled (e.g.
// after an extension reload), kick a one-time full reconcile so it doesn't
// wait up to 4h for the first alarm.
browserApi.runtime.onInstalled?.addListener(() => {
  registerMirrorAlarms();
  (async () => {
    const state = await getMirrorState(browserApi.storage.local);
    if (state.enabled) {
      await runMirrorReconcile({ forceFull: true });
    }
  })();
});

// Also register on every background startup so the alarm survives SW restarts
// even without an install event.
browserApi.runtime.onStartup?.addListener(registerMirrorAlarms);
registerMirrorAlarms();

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
    title: "Buckley's - Error",
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

  // Best-effort bookmark mirror. On-save creates the bookmark immediately so
  // it appears without waiting for the next alarm-driven reconcile; a
  // follow-up reconcile (debounced) then claims it into the ownership map.
  // Wrapped so a bookmarks failure can never break a successful save.
  try {
    const result = await mirrorSavedPage({
      bookmarksApi: browserApi.bookmarks,
      storage: browserApi.storage.local,
      api: mirrorApi,
      url: tab.url,
      title: tab.title,
      projectId
    });
    if (result.created) {
      schedulePostSaveReconcile();
    }
  } catch (mirrorError) {
    logger.error('Bookmark mirror create failed', mirrorError);
  }

  await showBadgeFeedback('success', 2000);

  browserApi.notifications.create({
    type: 'basic',
    iconUrl: 'icon.png',
    title: "Buckley's",
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

  if (message.action === 'signOut') {
    backgroundAuth.signOut()
      .then(async () => {
        try {
          const sentry = await getSentry();
          await sentry.clearUser?.();
        } catch (error) {
          logger.warn('Failed to clear Sentry user', error);
        }
        sendResponse({ success: true });
      })
      .catch(async (error) => {
        logger.error('Sign-out failed', error);
        await captureBackgroundError(error, {
          context: 'sign-out',
          surface: 'dashboard'
        });
        sendResponse({ success: false, error: error.message });
      });
    return true;
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

  if (message.action === 'getBookmarkMirrorState') {
    getMirrorState(browserApi.storage.local)
      .then((state) => {
        // Only the toggle surfaces to the UI; folder/ownership internals stay
        // in the background.
        sendResponse({ success: true, enabled: Boolean(state.enabled) });
      })
      .catch((error) => {
        logger.error('Failed to read mirror state', error);
        sendResponse({ success: false, error: error.message });
      });
    return true;
  }

  if (message.action === 'setBookmarkMirrorEnabled') {
    (async () => {
      await setMirrorEnabled(browserApi.storage.local, Boolean(message.enabled));
      // On enable, seed immediately so the folder tree appears without waiting
      // up to 4h for the alarm. On disable, do nothing — existing bookmarks
      // are left in place (the user can delete the Buckley's/ folder manually).
      if (message.enabled) {
        await runMirrorReconcile({ forceFull: true });
      }
    })()
      .then(() => sendResponse({ success: true }))
      .catch((error) => {
        logger.error('Failed to set mirror enabled', error);
        sendResponse({ success: false, error: error.message });
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
