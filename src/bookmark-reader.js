// Reads bookmarks from the browser's native bookmarks API and flattens them
// into a deduplicated list of { url, title } pairs ready to send to the bulk
// import endpoint. Pure and testable — the only browser dependency is the
// tree accessor passed in (defaults to the live API), so tests can supply a
// fake tree.

const DEFAULT_BOOKMARKS_API = globalThis.browser?.bookmarks || globalThis.chrome?.bookmarks;

// Normalize a URL for dedup comparison: lowercase, strip trailing slash.
// Query strings and fragments are kept because two URLs differing only by
// ?ref=... can still point at genuinely different content.
function normalizeUrl(url) {
  return url.toLowerCase().replace(/\/+$/, '');
}

// Determine whether a URL string is an importable http(s) page. Mirrors the
// spirit of the backend isValidUrl filter (non-http schemes are meaningless
// for saved pages) without duplicating the full private-IP checks — the
// backend re-validates, so the client filter just trims obvious noise early.
function isImportableUrl(url) {
  if (typeof url !== 'string' || url === '') {
    return false;
  }
  try {
    const parsed = new URL(url);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch {
    return false;
  }
}

// Recursively flatten the bookmark tree into a list of bookmark nodes with a
// url. Folders (no url) are traversed; separator/empty nodes are skipped.
function flattenBookmarks(nodes, acc = []) {
  if (!Array.isArray(nodes)) {
    return acc;
  }

  for (const node of nodes) {
    if (typeof node.url === 'string' && node.url !== '') {
      acc.push({ url: node.url, title: node.title || '' });
    }
    if (node.children) {
      flattenBookmarks(node.children, acc);
    }
  }

  return acc;
}

/**
 * Read all bookmarks from the browser and return a deduplicated, filtered set.
 *
 * @param {object} [options]
 * @param {object} [options.bookmarksApi] - Inject the bookmarks API for testing.
 *   Defaults to the live browser/chrome API. Must expose getTree().
 * @returns {Promise<{ bookmarks: Array<{url: string, title: string}>, total: number, skipped: number }>}
 *   - bookmarks: deduplicated, http(s)-only, import-ready
 *   - total: raw count of url-bearing bookmarks found
 *   - skipped: count dropped (non-http or duplicate)
 */
export async function readAllBookmarks({ bookmarksApi = DEFAULT_BOOKMARKS_API } = {}) {
  if (!bookmarksApi?.getTree) {
    throw new Error('Bookmarks API not available');
  }

  const tree = await bookmarksApi.getTree();
  const raw = flattenBookmarks(tree);

  const seen = new Set();
  const bookmarks = [];
  let skipped = 0;

  for (const entry of raw) {
    if (!isImportableUrl(entry.url)) {
      skipped += 1;
      continue;
    }
    const normalized = normalizeUrl(entry.url);
    if (seen.has(normalized)) {
      skipped += 1;
      continue;
    }
    seen.add(normalized);
    bookmarks.push(entry);
  }

  return { bookmarks, total: raw.length, skipped };
}

// Exported for unit testing.
export { flattenBookmarks, isImportableUrl, normalizeUrl };
