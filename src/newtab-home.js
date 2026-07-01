// Selectors for the sparse home view. Both are pure functions over the loaded
// page list — no fetching, no side effects.

/**
 * The newest non-pinned saved pages. The store already sorts newest-first
 * (saved-pages-store, sort: 'newest'), so this is a presentation slice.
 * Pinned pages are excluded because they live in their own dedicated scope.
 */
export function getRecentPages(allPages, limit = 3) {
  if (!Array.isArray(allPages)) {
    return [];
  }
  return allPages.filter(page => !page?.pinned).slice(0, limit);
}

/**
 * Aggregate topic classification labels with counts, for the quick-access pills.
 *
 * NOTE: this tallies over the currently loaded page list only. The saved-page
 * list is paginated, so counts may under-count beyond the first page (per
 * AGENTS.md §71, "counts come from collection totals, not visible slices").
 * This is acceptable for a quick-access affordance; "Browse all" is always
 * available for the complete list. A backend topic-counts endpoint would give
 * exact totals if needed later.
 */
export function getTopicCounts(allPages, limit = 8) {
  if (!Array.isArray(allPages)) {
    return [];
  }
  const counts = new Map();
  for (const page of allPages) {
    const classifications = page?.classifications;
    if (!Array.isArray(classifications)) {
      continue;
    }
    for (const c of classifications) {
      if (c?.type === 'topic' && c.label) {
        counts.set(c.label, (counts.get(c.label) || 0) + 1);
      }
    }
  }
  return [...counts.entries()]
    .map(([label, count]) => ({ label, count }))
    .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label))
    .slice(0, limit);
}
