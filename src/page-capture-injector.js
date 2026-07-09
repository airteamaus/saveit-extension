// page-capture-injector.js — the only module that touches chrome.scripting.
// Injects real Readability (via buildClientObject from page-capture.js) into
// the active tab and returns the client object. On any failure (chrome://
// pages, crashed tabs, CSP), returns a failure-shape object — never throws, so
// the save still proceeds in basic mode.
//
// INJECTION DESIGN — Option C (files-based bundle):
// Readability is an ESM module and cannot be carried into the page via
// executeScript's `func` (the function source is stringified; ESM imports do
// not run in the page's ISOLATED world) nor via `args` (structured-clone
// cannot serialize functions/closures). So we ship a pre-built bundle,
// `src/bundles/capture-bundle.js` (produced by scripts/bundle.js from
// src/capture-bundle-entry.js), which inlines Readability and exposes
// `globalThis.__saveitCapture = (doc) => buildClientObject(doc)` in the page's
// ISOLATED world.
//
// Two executeScript calls (both world:'ISOLATED') are used:
//   1. files:['src/bundles/capture-bundle.js'] — evaluates the bundle, which
//      defines globalThis.__saveitCapture. Resolves AFTER the file's
//      top-level code runs, so the global exists by the time call 2 runs.
//   2. func: () => globalThis.__saveitCapture(document) — invokes it on the
//      live document and returns the client object. This second func is
//      serialization-safe: it closes only over a global and the `document`
//      global — no imports, no function args, no module-scope variables.
// The ISOLATED world persists across these two calls for a given tab +
// extension + frame, so the global set in call 1 is readable in call 2.

// Resolve the browser API lazily on each call (rather than capturing it at
// module load) so unit tests can swap globalThis.browser between cases. This
// differs from background.js (which captures once at top level) because this
// module is exercised directly by unit tests with a fresh mock per test.
function getBrowserApi() {
  return globalThis.browser ?? globalThis.chrome;
}

// Build the failure-shape object. Same field set as page-capture.js's client
// object, so callers (savePageFromTab) can merge it without shape checks.
// capture_error records the reason for telemetry/debugging.
function failureShape(reason) {
  return {
    title: '',
    description: '',
    content: null,
    excerpt: null,
    byline: null,
    site_name: null,
    image: null,
    published_time: null,
    lang: null,
    captured_at: new Date().toISOString(),
    capture_method: 'none',
    capture_error: reason
  };
}

// Capture page content for the given tab via the capture bundle. Returns the
// client object (built by real Readability via buildClientObject) on success,
// or a failure-shape object on any error. Never throws.
export async function capturePageContent(tabId) {
  const browserApi = getBrowserApi();
  if (!browserApi || !browserApi.scripting || !browserApi.scripting.executeScript) {
    return failureShape('scripting API unavailable');
  }

  const scripting = browserApi.scripting;

  // 1. Inject the bundle file. This evaluates the bundle in the page's
  // ISOLATED world, defining globalThis.__saveitCapture. If this fails
  // (chrome://, about:, crashed tab, CSP), bail with the failure shape.
  try {
    await scripting.executeScript({
      target: { tabId },
      world: 'ISOLATED',
      files: ['src/bundles/capture-bundle.js']
    });
  } catch (error) {
    return failureShape((error && error.message) || 'bundle injection failed');
  }

  // 2. Invoke the global to build the client object on the live document.
  // This func is serialization-safe: it references only globalThis (a global)
  // and document (a global) — no imports, no function args, no closures over
  // module-scope variables, so chrome.scripting's source stringification is
  // fine.
  try {
    const results = await scripting.executeScript({
      target: { tabId },
      world: 'ISOLATED',
      func: () => globalThis.__saveitCapture(document)
    });

    // executeScript returns [{ result, frameId }, ...]
    const result = results && results[0] && results[0].result;
    if (result && typeof result === 'object') {
      return result;
    }
    return failureShape('no result from injection');
  } catch (error) {
    // CSP, missing global (bundle failed silently), or tab vanished between
    // calls. Surface as failure shape so the save still proceeds.
    return failureShape((error && error.message) || 'capture invocation failed');
  }
}
