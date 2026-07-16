// send-runtime-message.js — single runtime.sendMessage wrapper for every surface.
//
// Works in all three load contexts the extension has:
//   - toolbar popup (no polyfill → chrome.runtime is callback-based),
//   - newtab (polyfill injected async → may be callback OR promise depending
//     on load timing),
//   - anywhere the polyfill has settled, or Firefox native (promise-based).
//
// The strategy is the only one that survives all three: always pass a callback
// (Chrome shape), and ALSO consume the return value if it's a promise
// (Firefox/polyfill shape). Exactly one of those paths fires depending on the
// runtime; registering a callback that will be ignored is harmless.
//
// The caller owns the error policy: this helper rejects on lastError/throw,
// and the caller decides whether to surface or swallow (e.g. the realtime
// relay intentionally swallows to console.warn).

export function sendRuntimeMessage(runtime, message) {
  if (!runtime?.sendMessage) {
    return Promise.reject(new Error('Browser runtime API not available'));
  }

  return new Promise((resolve, reject) => {
    try {
      // Chrome (callback) shape: pass a callback that resolves/rejects.
      const response = runtime.sendMessage(message, (res) => {
        const lastError = runtime.lastError;
        if (lastError) {
          reject(new Error(lastError.message));
          return;
        }
        resolve(res);
      });

      // Firefox / polyfill (promise) shape: if sendMessage returned a thenable,
      // it ignores the callback and resolves via this promise instead. Wire it
      // up so we resolve once either way. (On Chrome, response is undefined and
      // this branch is skipped.)
      if (response && typeof response.then === 'function') {
        response.then(resolve, reject);
      }
    } catch (error) {
      reject(error);
    }
  });
}
