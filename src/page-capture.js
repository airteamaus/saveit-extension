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

// Build the client object from a document. Returns capture_method 'readability'
// when Readability finds an article, or 'none' when it returns null (dashboards,
// app shells). No heuristic fallback — 'none' is the honest signal.
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
    // No article found. capture_method 'none' is the visible signal — no
    // heuristic masking. Meta fields are still returned where available.
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
