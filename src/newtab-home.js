// Selectors for the saved-pages drawer. Pure functions over the loaded page
// list — no fetching, no side effects.

/**
 * The newest pinned saved pages, for the Pinned shelf shown above the browse
 * list when idle. The full list stays available via the sidebar Pinned scope;
 * this is the sparse presentation slice. The store already sorts newest-first
 * (saved-pages-store, sort: 'newest'), so this is a presentation slice.
 */
export function getPinnedPages(allPages, limit = 8) {
  if (!Array.isArray(allPages)) {
    return [];
  }
  return allPages.filter(page => page?.pinned).slice(0, limit);
}
