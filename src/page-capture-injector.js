// page-capture-injector.js — the only module that touches chrome.scripting.
// Injects a capture function into the active tab via executeScript (world:
// 'ISOLATED') and returns the client object. On any failure (chrome:// pages,
// crashed tabs, CSP), returns a failure-shape object — never throws, so the
// save still proceeds in basic mode.
//
// SERIALIZATION DESIGN (see task-12-report.md for full analysis):
// chrome.scripting.executeScript with `func` stringifies the function source
// and sends it to the page. The `args` array, however, is serialized via the
// structured-clone algorithm — which CANNOT carry functions. So we must NOT
// pass buildClientObject (which closes over @mozilla/readability) as an arg.
// The injected function must be fully self-contained: no imports, no closures,
// no function args. It runs in the page's ISOLATED world where ESM imports
// and Readability are not available.
//
// The injected function below performs meta extraction + a DOM-based content
// fallback (no Readability). It surfaces capture_method 'readability' when an
// <article> or substantial <main> exists, otherwise 'none' — matching
// page-capture.js's "no heuristic masking" contract. Task 13's manual
// verification can swap this to a files-based injection that bundles
// Readability (buildClientObject is still exported from page-capture.js for
// that future path).

// Resolve the browser API lazily on each call (rather than capturing it at
// module load) so unit tests can swap globalThis.browser between cases. This
// differs from background.js (which captures once at top level) because this
// module is exercised directly by unit tests with a fresh mock per test.
function getBrowserApi() {
  return globalThis.browser ?? globalThis.chrome;
}

// Self-contained capture function. Runs in the page's ISOLATED world. Has NO
// access to module scope, NO imports, NO external closures — everything it
// needs is in its own body. chrome.scripting stringifies this source and
// evaluates it in the page, so it must remain pure-JS.
function injectedCapture() {
  const MAX_CONTENT_CHARS = 12000;

  const doc = globalThis.document;

  function readMeta(selector) {
    const el = doc.querySelector(selector);
    return (el && el.getAttribute('content') && el.getAttribute('content').trim()) || null;
  }

  function truncate(text) {
    if (!text) return null;
    const t = String(text).trim();
    if (!t) return null;
    return t.length <= MAX_CONTENT_CHARS ? t : t.slice(0, MAX_CONTENT_CHARS);
  }

  const metaTitle = readMeta('meta[property="og:title"]') || readMeta('meta[name="twitter:title"]');
  const metaDescription = readMeta('meta[property="og:description"]')
    || readMeta('meta[name="twitter:description"]')
    || readMeta('meta[name="description"]');
  const image = readMeta('meta[property="og:image"]')
    || readMeta('meta[name="twitter:image"]')
    || readMeta('meta[name="twitter:image:src"]');
  const byline = readMeta('meta[name="author"]') || readMeta('meta[property="article:author"]');
  const siteName = readMeta('meta[property="og:site_name"]');
  const publishedTime = readMeta('meta[property="article:published_time"]') || readMeta('meta[name="date"]');
  const lang = readMeta('meta[http-equiv="content-language"]')
    || (doc.documentElement && doc.documentElement.getAttribute('lang'));

  // DOM-based article detection: prefer <article>, then <main>, then the body.
  // This is intentionally simpler than Readability — it surfaces article-like
  // pages honestly without trying to extract clean article text from app
  // shells. Task 13 can upgrade to Readability via files-based injection.
  let articleEl = doc.querySelector('article');
  if (!articleEl) {
    articleEl = doc.querySelector('main');
  }
  const text = articleEl ? (articleEl.innerText || articleEl.textContent || '') : '';
  const trimmed = text ? text.trim() : '';
  // Modest signal threshold: <article>/<main> with real prose. Dashboards and
  // app shells have <main> but almost no direct text → fall through to 'none'.
  const hasArticle = trimmed.length >= 200;

  if (!hasArticle) {
    return {
      title: metaTitle || (doc.title || ''),
      description: metaDescription || '',
      content: null,
      excerpt: null,
      byline: byline,
      site_name: siteName,
      image: image,
      published_time: publishedTime,
      lang: lang,
      captured_at: new Date().toISOString(),
      capture_method: 'none'
    };
  }

  return {
    title: metaTitle || (doc.title || ''),
    description: metaDescription || '',
    content: truncate(trimmed),
    excerpt: truncate(trimmed),
    byline: byline,
    site_name: siteName,
    image: image,
    published_time: publishedTime,
    lang: lang,
    captured_at: new Date().toISOString(),
    capture_method: 'readability'
  };
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

// Capture page content for the given tab. Returns the client object on success,
// or a failure-shape object on any error. Never throws.
export async function capturePageContent(tabId) {
  const browserApi = getBrowserApi();
  if (!browserApi || !browserApi.scripting || !browserApi.scripting.executeScript) {
    return failureShape('scripting API unavailable');
  }

  try {
    const results = await browserApi.scripting.executeScript({
      target: { tabId },
      world: 'ISOLATED',
      func: injectedCapture
    });

    // executeScript returns [{ result, frameId }, ...]
    const result = results && results[0] && results[0].result;
    if (result && typeof result === 'object') {
      return result;
    }
    return failureShape('no result from injection');
  } catch (error) {
    // chrome://, about:, PDF viewer, crashed tab, or CSP blocking injection.
    // These are expected — return the failure shape so the save proceeds.
    return failureShape((error && error.message) || 'injection failed');
  }
}
