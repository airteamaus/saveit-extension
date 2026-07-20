// Selectors for the saved-pages drawer. Pure functions over the loaded page
// list — no fetching, no side effects.

import { isOptimisticPage } from './pending-saves.js';

/**
 * The newest pinned saved pages, for the Pinned shelf shown above the browse
 * list when idle. The full list stays available via the sidebar Pinned scope;
 * this is the sparse presentation slice. The store already sorts newest-first
 * (saved-pages-store, sort: 'newest'), so this is a presentation slice.
 *
 * Optimistic (not-yet-enriched) tiles are excluded: their synthetic id is not a
 * real doc, so showing one on the shelf would let the user click into a card
 * whose actions can't reach the backend. They land here only via a race that
 * flips `pinned` on a tile before the real doc arrives; this filter is the
 * last line of defense behind the renderer's disabled pin button.
 */
export function getPinnedPages(allPages, limit = 8) {
  if (!Array.isArray(allPages)) {
    return [];
  }
  return allPages.filter(page => page?.pinned && !isOptimisticPage(page)).slice(0, limit);
}
