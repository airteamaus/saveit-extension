// page-capture.js — pure DOM extraction for save-time capture.
// Receives a `document`, returns a structured `client` object. No browser APIs,
// so it is fully unit-testable with happy-dom. The injector (page-capture-injector.js)
// is responsible for running this inside chrome.scripting.executeScript.

import { Readability } from '@mozilla/readability';

const MAX_CONTENT_CHARS = 12000;

// Read a meta tag by name or property, returning its content attribute.
function readMeta(document, selector) {
  const el = document.querySelector(selector);
  return el?.getAttribute('content')?.trim() || null;
}

// Truncate content head-weighted. Intros carry the most summary signal, so we
// keep the beginning. (Research: head ~70-80% beats head-only for long pages,
// but for a 12k cap most articles fit entirely.)
export function truncateContent(content) {
  if (!content) {
    return null;
  }
  const trimmed = content.trim();
  if (trimmed.length <= MAX_CONTENT_CHARS) {
    return trimmed;
  }
  return trimmed.slice(0, MAX_CONTENT_CHARS);
}

// Readability found no article (app shells, dashboards, Drive). Fall back to
// the rendered text the user actually sees, after stripping nav/footer chrome
// so UI strings don't dominate the signal. Returns null if the page has no
// meaningful body text. Operates on a clone so the live document is untouched.
export function extractFallbackText(document) {
  const clone = document.cloneNode(true);
  clone.querySelectorAll(
    'script, style, nav, footer, header, aside, [role="navigation"], [role="banner"], [role="contentinfo"]'
  ).forEach((el) => el.remove());
  const text = clone.body?.innerText?.trim();
  return text || null;
}

// Build the client object from a document. Returns capture_method 'readability'
// when Readability finds an article, 'fallback' when no article is found but
// the page has meaningful rendered text (app shells, dashboards), or 'none'
// when there is no usable text at all.
export function buildClientObject(document) {
  // Meta extraction (independent of Readability — works even on non-articles)
  const metaTitle = readMeta(document, 'meta[property="og:title"]')
    || readMeta(document, 'meta[name="twitter:title"]');
  const metaDescription = readMeta(document, 'meta[property="og:description"]')
    || readMeta(document, 'meta[name="twitter:description"]')
    || readMeta(document, 'meta[name="description"]');
  const image = readMeta(document, 'meta[property="og:image"]')
    || readMeta(document, 'meta[name="twitter:image"]')
    || readMeta(document, 'meta[name="twitter:image:src"]');
  const byline = readMeta(document, 'meta[name="author"]')
    || readMeta(document, 'meta[property="article:author"]');
  const siteName = readMeta(document, 'meta[property="og:site_name"]');
  const publishedTime = readMeta(document, 'meta[property="article:published_time"]')
    || readMeta(document, 'meta[name="date"]');
  const lang = readMeta(document, 'meta[http-equiv="content-language"]')
    || document.documentElement?.getAttribute('lang');

  // Readability mutates the document it's passed — always operate on a clone.
  const clone = document.cloneNode(true);
  let article = null;
  try {
    article = new Readability(clone).parse();
  } catch {
    article = null;
  }

  if (!article || !article.textContent || !article.textContent.trim()) {
    // Readability found no article. Try the innerText fallback before giving
    // up — app-like pages (Drive, Plex, dashboards) often have rich rendered
    // text that is worth summarizing even though it isn't an article.
    const fallbackText = extractFallbackText(document);
    if (fallbackText) {
      return {
        title: metaTitle || document.title || '',
        description: metaDescription || '',
        content: truncateContent(fallbackText),
        excerpt: null,
        byline,
        site_name: siteName,
        image,
        published_time: publishedTime,
        lang,
        captured_at: new Date().toISOString(),
        capture_method: 'fallback'
      };
    }

    // No article and no meaningful body text — honest 'none' signal.
    return {
      title: metaTitle || document.title || '',
      description: metaDescription || '',
      content: null,
      excerpt: null,
      byline,
      site_name: siteName,
      image,
      published_time: publishedTime,
      lang,
      captured_at: new Date().toISOString(),
      capture_method: 'none'
    };
  }

  return {
    title: metaTitle || article.title || document.title || '',
    description: metaDescription || article.excerpt || '',
    content: truncateContent(article.textContent),
    excerpt: article.excerpt || null,
    byline: byline || article.byline || null,
    site_name: siteName || article.siteName || null,
    image,
    published_time: publishedTime,
    lang: lang || article.lang || null,
    captured_at: new Date().toISOString(),
    capture_method: 'readability'
  };
}
