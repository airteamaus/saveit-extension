// sentry.js - Centralized Sentry error tracking for browser extension
// Used by both background.js (service worker) and newtab.js (dashboard)

import * as Sentry from '@sentry/browser';

const SENTRY_DSN = 'https://e8cd12c46bbc58b4792f8d00cb861506@o1546.ingest.us.sentry.io/4510395640053760';

/**
 * Initialize Sentry SDK
 * Call at module load time in both background.js and newtab.js
 */
export function initSentry() {
  Sentry.init({
    dsn: SENTRY_DSN,
    environment: 'production',
    sampleRate: 1.0,
    tracesSampleRate: 0.1
  });
}

/**
 * Set user context for error tracking
 * Call after Firebase auth succeeds
 * @param {Object} user - Firebase user object with uid and email
 */
export function setUser(user) {
  Sentry.setUser({
    id: user.uid,
    email: user.email
  });
}

/**
 * Set request ID tag for correlation with backend errors
 * Call after receiving response from backend with request_id
 * @param {string} requestId - UUID from backend response
 */
export function setRequestId(requestId) {
  Sentry.setTag('request_id', requestId);
}

/**
 * Capture an error with additional context
 * @param {Error} error - Error object to capture
 * @param {Object} context - Additional context (url, operation, etc.)
 */
export function captureError(error, context = {}) {
  Sentry.captureException(error, { extra: context });
}

/**
 * Clear user context (on sign out)
 */
export function clearUser() {
  Sentry.setUser(null);
}
