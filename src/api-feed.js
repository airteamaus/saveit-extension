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
          fetcher: () => this._fetchWithAuth('/feed', {
            limit: options.limit,
            offset: options.offset
          }),
          normalize: (response) => response,
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
