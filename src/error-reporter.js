// Error reporting infrastructure for production monitoring

/**
 * Detect environment from extension context
 */
function getEnvironment() {
  if (typeof browser === 'undefined' || !browser.runtime) {
    return 'development';
  }

  const version = browser.runtime.getManifest().version;

  if (version.includes('beta')) {
    return 'staging';
  }

  return 'production';
}

/**
 * Report error to monitoring service (e.g., Sentry, LogRocket, or custom backend)
 *
 * @param {Error} error - The error object
 * @param {Object} context - Additional context about the error
 */
export async function reportError(error, context = {}) {
  const environment = getEnvironment();

  // Enrich error with metadata
  const errorReport = {
    message: error.message,
    stack: error.stack,
    name: error.name,
    timestamp: new Date().toISOString(),
    environment,
    context,
    userAgent: navigator.userAgent,
    url: window.location.href
  };

  // Add extension version if available
  if (typeof browser !== 'undefined' && browser.runtime) {
    try {
      errorReport.extensionVersion = browser.runtime.getManifest().version;
      errorReport.extensionId = browser.runtime.id;
    } catch {
      // Ignore if can't get manifest
    }
  }

  // Always log to console
  console.error('[ErrorReporter]', errorReport);

  // In production, send to error tracking service
  if (environment === 'production') {
    try {
      // Option 1: Send to custom backend endpoint
      await fetch('https://your-error-tracker.com/api/errors', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(errorReport)
      }).catch(() => {}); // Silently fail

      // Option 2: Use Sentry (uncomment if using Sentry)
      // if (window.Sentry) {
      //   window.Sentry.captureException(error, { contexts: { extra: context } });
      // }
    } catch (reportingError) {
      // Never let error reporting break the app
      console.error('[ErrorReporter] Failed to report error:', reportingError);
    }
  }

  // In staging, could send to different endpoint or Slack
  if (environment === 'staging') {
    try {
      // Send to staging error endpoint or notification service
      await fetch('https://hooks.slack.com/your-webhook-url', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text: `[SaveIt Staging Error] ${error.message}`,
          attachments: [{
            fields: [
              { title: 'Environment', value: environment, short: true },
              { title: 'Version', value: errorReport.extensionVersion, short: true },
              { title: 'Context', value: JSON.stringify(context), short: false }
            ]
          }]
        })
      }).catch(() => {});
    } catch (reportingError) {
      console.error('[ErrorReporter] Failed to send staging alert:', reportingError);
    }
  }

  return errorReport;
}

/**
 * Report warning (non-fatal issue)
 */
export function reportWarning(message, context = {}) {
  console.warn('[Warning]', message, context);

  // Only report warnings in production for important issues
  if (getEnvironment() === 'production' && context.severity === 'high') {
    reportError(new Error(message), { ...context, level: 'warning' });
  }
}

/**
 * Set up global error handlers
 */
export function setupErrorHandlers() {
  // Catch unhandled promise rejections
  window.addEventListener('unhandledrejection', event => {
    reportError(event.reason || new Error('Unhandled Promise Rejection'), {
      type: 'unhandledrejection',
      promise: event.promise
    });
  });

  // Catch global errors
  window.addEventListener('error', event => {
    reportError(event.error || new Error(event.message), {
      type: 'global-error',
      filename: event.filename,
      lineno: event.lineno,
      colno: event.colno
    });
  });
}

/**
 * Create error boundary for async functions
 */
export function withErrorReporting(fn, context = {}) {
  return async function(...args) {
    try {
      return await fn(...args);
    } catch (error) {
      await reportError(error, {
        ...context,
        function: fn.name,
        args: args.map(arg => typeof arg)
      });
      throw error; // Re-throw so caller can handle
    }
  };
}
