// Selectors for the saved-pages drawer. Pure functions over the loaded page
// list — no fetching, no side effects.

import { isOptimisticPage } from './pending-saves.js';

// Sort key for a pinned shelf card. Matches the card renderer's heading
// fallback (title || domain || 'Untitled') so the shelf order matches what the
// user reads. Case-insensitive so "apple" and "Banana" interleave naturally.
function pinnedShelfSortKey(page) {
  const domain = page?.domain || '';
  const key = (page?.title || domain || 'Untitled').trim().toLowerCase();
  return key || 'untitled';
}

/**
 * The pinned saved pages, for the Pinned shelf shown above the browse list when
 * idle. No cap — every pinned page renders on the shelf, however many there are.
 *
 * Sorted alphabetically by title (case-insensitive, with the same
 * title/domain/'Untitled' fallback the card heading uses) so the shelf reads as
 * a stable, scannable index rather than shifting around as new pages are pinned
 * or as the store's newest-first order changes.
 *
 * Optimistic (not-yet-enriched) tiles are excluded: their synthetic id is not a
 * real doc, so showing one on the shelf would let the user click into a card
 * whose actions can't reach the backend. They land here only via a race that
 * flips `pinned` on a tile before the real doc arrives; this filter is the
 * last line of defense behind the renderer's disabled pin button.
 */
export function getPinnedPages(allPages) {
  if (!Array.isArray(allPages)) {
    return [];
  }
  return allPages
    .filter(page => page?.pinned && !isOptimisticPage(page))
    .sort((a, b) => {
      const ka = pinnedShelfSortKey(a);
      const kb = pinnedShelfSortKey(b);
      if (ka < kb) return -1;
      if (ka > kb) return 1;
      return 0;
    });
}
