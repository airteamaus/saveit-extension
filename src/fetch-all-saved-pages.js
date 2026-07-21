// fetch-all-saved-pages.js — page through the entire saved-pages collection.
//
// Two callers need the full set (not the UI-windowed slice the drawer store
// holds): the bookmark mirror (background reconcile) and the data-sync centre
// (newtab export). Both previously inlined the same cursor loop with the same
// shape-validation; extracting it here keeps the "throw on bad shape, don't
// coerce to [] silently" contract in one place. Both callers bypass the API
// facade (background for bundle size, newtab because export wants the raw
// set) and pass an object exposing getSavedPages directly.

const DEFAULT_PAGE_SIZE = 100;

/**
 * Fetch every saved page by paging through cursors until the server reports
 * no next page. Requires the `{ pages, pagination }` response shape — throws
 * on any other shape rather than silently returning a partial set, so a
 * miswired call fails loudly.
 *
 * @param {object} api - Object exposing getSavedPages (facade or mirrorApi).
 * @param {object} [options]
 * @param {number} [options.pageSize=100]
 * @param {string} [options.projectId] - Scope to a single project (used by the
 *   mirror to pull shared company-project pages cross-user).
 * @returns {Promise<Array>} Flattened pages across all batches.
 */
export async function fetchAllSavedPages(api, { pageSize = DEFAULT_PAGE_SIZE, projectId } = {}) {
  const all = [];
  let cursor = null;
  do {
    const res = await api.getSavedPages({
      limit: pageSize,
      sort: 'newest',
      cursor,
      skipCache: true,
      ...(projectId ? { projectId } : {})
    });
    // Require the expected { pages, pagination } shape. Previously a non-
    // conforming response was silently coerced to [], which made the mirror
    // create zero bookmarks with no error — the bug that hid a
    // GET-body-vs-query-string mismatch for a whole release cycle. Throw so
    // miswired calls fail loudly instead.
    if (!res || !Array.isArray(res.pages)) {
      throw new Error('Saved pages response was missing the expected { pages } shape');
    }
    all.push(...res.pages);
    cursor = res?.pagination?.hasNextPage ? res.pagination.nextCursor : null;
  } while (cursor);
  return all;
}
