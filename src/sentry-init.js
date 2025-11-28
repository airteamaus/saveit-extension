// sentry-init.js - Initialize Sentry and expose functions as globals
// Loaded as a regular script in database.html before api.js

import { initSentry, setUser, setRequestId, captureError, clearUser } from './sentry.js';

// Initialize Sentry immediately
initSentry();

// Expose functions as globals for use by non-module scripts (api.js, newtab.js)
window.SentryHelpers = {
  setUser,
  setRequestId,
  captureError,
  clearUser
};
