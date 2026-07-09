// sentry.js - Centralized Sentry error tracking for browser extension
// Used by both background.js (service worker) and dashboard pages

import * as Sentry from '@sentry/browser';
import { CONFIG } from './config.js';
import { sanitizeTelemetryContext } from './telemetry.js';

const SENTRY_DSN = 'https://e8cd12c46bbc58b4792f8d00cb861506@o1546.ingest.us.sentry.io/4510395640053760';
let isInitialized = false;

function isSentryEnabled() {
  return CONFIG.enableErrorReporting && isInitialized;
}

/**
 * Initialize Sentry SDK
 * Call at module load time in both background.js and newtab.js
 */
export function initSentry() {
  if (isInitialized || !CONFIG.enableErrorReporting) {
    return;
  }

  Sentry.init({
    dsn: SENTRY_DSN,
    environment: CONFIG.environment,
    sampleRate: 1.0,
    tracesSampleRate: 0.1
  });

  isInitialized = true;
}

/**
 * Set user context for error tracking
 * Call after a session is established
 * @param {Object} user - User object with uid and email
 */
export function setUser(user) {
  if (!isSentryEnabled()) {
    return;
  }

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
  if (!isSentryEnabled()) {
    return;
  }

  Sentry.setTag('request_id', requestId);
}

/**
 * Capture an error with additional context
 * @param {Error} error - Error object to capture
 * @param {Object} context - Additional context (url, operation, etc.)
 */
export function captureError(error, context = {}) {
  if (!isSentryEnabled()) {
    return;
  }

  Sentry.captureException(error, { extra: sanitizeTelemetryContext(context) });
}

/**
 * Capture a message with additional context
 * @param {string} message - Message to capture
 * @param {Object} context - Additional metadata for the message
 * @param {'fatal' | 'error' | 'warning' | 'log' | 'info' | 'debug'} level - Sentry level
 */
export function captureMessage(message, context = {}, level = 'info') {
  if (!isSentryEnabled()) {
    return;
  }

  Sentry.captureMessage(message, {
    level,
    extra: sanitizeTelemetryContext(context)
  });
}

/**
 * Flush queued events before a control-flow handoff
 * @param {number} timeout - Flush timeout in milliseconds
 * @returns {Promise<boolean>}
 */
export function flush(timeout = 2000) {
  if (!isSentryEnabled()) {
    return Promise.resolve(true);
  }

  return Sentry.flush(timeout);
}

/**
 * Clear user context (on sign out)
 */
export function clearUser() {
  if (!isSentryEnabled()) {
    return;
  }

  Sentry.setUser(null);
}

/**
 * Wrap an async operation in a Sentry performance span so its duration appears
 * on traces. When Sentry/tracing is disabled (dev/standalone, or sampling
 * drops the trace), this just runs and returns the callback's result — so
 * callers don't need their own feature check.
 * @param {Object} options - Span config: { name, op, attributes? }
 * @param {Function} callback - The async work to measure; its return value is
 *   passed through.
 * @returns The callback's resolved value.
 */
export async function startSpan(options, callback) {
  if (!isSentryEnabled() || typeof Sentry.startSpan !== 'function') {
    return callback();
  }

  return Sentry.startSpan(options, callback);
}
