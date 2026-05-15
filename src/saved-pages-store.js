import { WarmCacheListStore } from './warm-cache-list-store.js';

export class SavedPagesStore extends WarmCacheListStore {
  constructor(api, options = {}) {
    super(api, {
      maxItems: options.maxItems || Number.POSITIVE_INFINITY,
      initialFetchLimit: options.initialFetchLimit || 50,
      prefetchBatchLimit: options.prefetchBatchLimit || 100,
      warmCacheScope: options.warmCacheScope || null,
      getList: fetchOptions => api?.getSavedPages?.(fetchOptions),
      getIncrementalList: fetchOptions => api?.getSavedPages?.(fetchOptions),
      checkForUpdates: fetchOptions => api?.checkSavedPagesUpdates?.(fetchOptions),
      buildInitialFetchOptions: (overrides = {}) => ({
        limit: options.initialFetchLimit || 50,
        sort: 'newest',
        pinnedFirst: false,
        ...overrides
      }),
      buildIncrementalFetchOptions: newerThanId => ({
        limit: options.initialFetchLimit || 50,
        sort: 'newest',
        pinnedFirst: false,
        newerThanId,
        skipCache: true
      }),
      buildUpdateCheckOptions: latestKnownId => ({
        sort: 'newest',
        pinnedFirst: false,
        latestKnownId
      }),
      buildLoadMoreFetchOptions: cursor => ({
        limit: options.prefetchBatchLimit || 100,
        sort: 'newest',
        pinnedFirst: false,
        cursor,
        skipCache: true
      })
    });
  }
}
