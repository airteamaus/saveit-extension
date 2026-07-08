// firebase-auth-state.js - Shared helper for the first-auth-state race
//
// Both the background service worker (background-auth.js) and the new-tab page
// (newtab-auth.js) need the same thing from Firebase: a promise that resolves
// the first time onAuthStateChanged fires, so they can sequence startup work
// after the indexedDB-persisted session has been restored. They previously
// each re-implemented the same race (with subtly different timeout behaviour),
// which is where the cold-start "No user signed in" error originated.
//
// This helper centralises that race. The listener stays registered after the
// first callback so callers can observe subsequent sign-in/sign-out changes.

/**
 * Resolve once Firebase reports its initial auth state.
 *
 * @param {object} options
 * @param {Function} options.subscribe - Registers a Firebase auth listener.
 *   Called as `subscribe(callback)` so the caller controls which `auth` object
 *   and which `onAuthStateChanged` (modular export vs page-global) are used.
 * @param {Function} [options.onChange] - Invoked with the user on EVERY auth
 *   change. On the FIRST callback it is awaited, and the promise does not
 *   resolve until it settles — so callers that sequence startup work behind
 *   the initial auth state (e.g. loading the drawer after sign-in) can do it
 *   here without racing the resolution. Subsequent calls are fire-and-forget.
 *   Optional.
 * @param {number} [options.timeoutMs] - If set, resolves with `timedOut: true`
 *   when no callback fires in time. The long-lived background context omits
 *   this (it must wait indefinitely for persistence); the page sets it so a
 *   stuck init doesn't hang the UI.
 * @returns {Promise<{user: *, timedOut: boolean}>} - `user` is the Firebase
 *   user from the first callback (or null on timeout). `timedOut` is true only
 *   when the timeout fired before any auth callback.
 */
export function resolveInitialAuthState({ subscribe, onChange, timeoutMs } = {}) {
  return new Promise(resolve => {
    let settled = false;
    let isFirst = true;
    const timer = typeof timeoutMs === 'number' ? setTimeout(onTimeout, timeoutMs) : null;

    function finish(result) {
      if (settled) return;
      settled = true;
      if (timer) clearTimeout(timer);
      resolve(result);
    }

    function onTimeout() {
      finish({ user: null, timedOut: true });
    }

    // The listener stays registered after the first callback so `onChange`
    // keeps firing for later sign-in/sign-out transitions; only the promise
    // resolution is one-shot. The first change is awaited so callers can gate
    // startup on it; later changes are observed without blocking. If the
    // timeout fires first, a late first callback is still surfaced via
    // onChange (as a normal subsequent change) so a slow session restore can
    // recover the UI rather than being silently dropped.
    subscribe(user => {
      if (isFirst) {
        isFirst = false;
        if (settled) {
          // Timeout already resolved the promise; treat this late first
          // callback as an ordinary auth change instead of dropping it.
          onChange?.(user);
          return;
        }
        Promise.resolve(onChange ? onChange(user) : undefined)
          .catch(error => console.error('[resolveInitialAuthState] Initial onChange failed:', error))
          .finally(() => finish({ user: user || null, timedOut: false }));
        return;
      }
      onChange?.(user);
    });
  });
}
