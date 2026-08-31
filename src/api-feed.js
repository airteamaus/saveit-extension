// api-feed.js - Org feed list + voting API methods for the shared facade.
//
// getFeed follows the same cached-read contract as the other list surfaces
// (saved pages, projects, domains): first page reads the feed cache, and
// load-more offsets pass skipCache so pagination never replays page one.

import { getMockFeed, voteStandaloneFeedPage } from './api-feed-standalone.js';
import { assertRealPageId } from './pending-saves.js';

function buildFeedCacheScope() {
  return { surface: 'feed' };
}

export function applyApiFeed(API) {
  Object.assign(API, {
    /**
     * Fetch the caller's org feed (one window of pages + scope metadata).
     * @param {object} [options]
     * @param {number} [options.limit] - Page size for the window.
     * @param {number} [options.offset] - Load-more cursor; callers must pair
     *   this with skipCache so offsets bypass the first-page cache.
     * @param {boolean} [options.skipCache] - Bypass the cache read.
     * @returns {Promise<object>} Feed response ({ scope, pages, pagination }).
     */
    async getFeed(options = {}) {
      if (this.isExtension) {
        return this._getCachedOrFreshList({
          cacheScope: buildFeedCacheScope(),
          readCache: (scope) => this.getFeedCachedPages(scope),
          writeCache: (value, scope) => this.setFeedCachedPages(value, scope),
          fetcher: () =>
            this._fetchWithAuth('/feed', {
              limit: options.limit,
              offset: options.offset
            }),
          // The pre-feed backend does NOT 404 unknown paths: GET /feed falls
          // through its method switch to the pages-list handler and answers
          // 200 with { pages, pagination } — no scope, no feed row fields.
          // Rendering that shows the user's own saves as anonymous,
          // button-less rows. Reject anything without the feed contract's
          // scope so the controller's unavailable path falls back to the
          // personal list. The throw also precedes the cache write, so the
          // bad shape never lands in the feed cache.
          normalize: (response) => {
            const scopeType = response?.scope?.type;
            if ((scopeType !== 'org' && scopeType !== 'personal') || !Array.isArray(response?.pages)) {
              const error = new Error('Feed response missing scope/pages — old backend?');
              error.status = 404;
              throw error;
            }
            return response;
          },
          mockFetcher: getMockFeed,
          context: 'getFeed',
          options
        });
      }
      return this._withCacheMetadata(getMockFeed(options), false);
    },

    /**
     * Toggle the caller's vote on a feed page.
     * @param {string} id - Thing id; optimistic ids are rejected before any
     *   network call (same guard as pinPage/deletePage).
     * @returns {Promise<{id: string, votes: number, voted: boolean}>}
     */
    async votePage(id) {
      assertRealPageId(id);
      if (this.isExtension) {
        return this._executeWithErrorHandling(
          async () => this._fetchWithAuth('/vote', null, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ id })
          }),
          'votePage',
          { id }
        );
      }
      return voteStandaloneFeedPage(id);
    }
  });
  return API;
}
