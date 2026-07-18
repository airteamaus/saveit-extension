/**
 * Toggle a saved page's org-search visibility.
 *
 * `private` governs ONLY whether the page appears in Slack /links bucket 2
 * (org-mates' results). It never affects the owner's own bucket 1 or any
 * other surface — the owner always sees their own private pages.
 *
 * Extracted from the newtab drawer wiring so the handler is unit-testable
 * without DOM setup. The card's delegated click handler calls this and
 * applies the returned page to the card + stores.
 *
 * @param {{ updatePage: (id: string, updates: { private: boolean }) => Promise<object> }} api
 * @param {{ id: string, private?: boolean }} page
 * @returns {Promise<object>} the API's updated page
 */
export async function togglePagePrivacy(api, page) {
  const next = !page.private;
  return api.updatePage(page.id, { private: next });
}
