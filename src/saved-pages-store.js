import { WarmCacheListStore } from './warm-cache-list-store.js';

export class SavedPagesStore extends WarmCacheListStore {
  constructor(api, options = {}) {
    const pinnedFirst = options.pinnedFirst === true;
    const fetchOptions = options.fetchOptions && typeof options.fetchOptions === 'object'
      ? { ...options.fetchOptions }
      : {};

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
        pinnedFirst,
        ...fetchOptions,
        ...overrides
      }),
      buildIncrementalFetchOptions: newerThanId => ({
        limit: options.initialFetchLimit || 50,
        sort: 'newest',
        pinnedFirst,
        ...fetchOptions,
        newerThanId,
        skipCache: true
      }),
      buildUpdateCheckOptions: latestKnownId => ({
        sort: 'newest',
        pinnedFirst,
        ...fetchOptions,
        latestKnownId
      }),
      buildLoadMoreFetchOptions: cursor => ({
        limit: options.prefetchBatchLimit || 100,
        sort: 'newest',
        pinnedFirst,
        ...fetchOptions,
        cursor,
        skipCache: true
      })
    });
  }
}
