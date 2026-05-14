import {
  WarmCacheListStore,
  buildListCachePayload,
  hasFullCoverage,
  mergeListPages
} from './warm-cache-list-store.js';

function buildCachePayload(pages, pagination, fromCache = false) {
  return buildListCachePayload(pages, pagination, fromCache);
}

export class SavedPagesStore extends WarmCacheListStore {
  constructor(api, options = {}) {
    super(api, {
      maxItems: options.maxItems || Number.POSITIVE_INFINITY,
      initialFetchLimit: options.initialFetchLimit || 50,
      prefetchBatchLimit: options.prefetchBatchLimit || 100,
      warmCacheScope: options.warmCacheScope || null,
      getList: fetchOptions => api?.getSavedPages?.(fetchOptions),
      buildInitialFetchOptions: (overrides = {}) => ({
        limit: options.initialFetchLimit || 50,
        sort: 'newest',
        pinnedFirst: false,
        ...overrides
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

  reconcilePages(incomingPages, { preserveExistingCoverage = false } = {}) {
    const normalizedIncomingPages = Array.isArray(incomingPages)
      ? incomingPages.slice(0, this.options.maxItems)
      : [];

    if (!preserveExistingCoverage || this.state.allPages.length <= normalizedIncomingPages.length) {
      return normalizedIncomingPages;
    }

    return mergeListPages(normalizedIncomingPages, this.state.allPages, this.options.maxItems);
  }

  reconcilePagination(pagination, pages, { preserveExistingCoverage = false } = {}) {
    const total = typeof pagination?.total === 'number'
      ? Math.max(pagination.total, pages.length)
      : pages.length;

    if (
      preserveExistingCoverage &&
      hasFullCoverage(pages, { ...pagination, total }, this.options.maxItems)
    ) {
      return {
        total,
        hasNextPage: false,
        nextCursor: null
      };
    }

    return {
      total,
      hasNextPage: pagination?.hasNextPage === true,
      nextCursor: pagination?.hasNextPage === true ? pagination?.nextCursor || null : null
    };
  }

  async persistWarmCache(requestId = this.state.requestId) {
    if (
      !this.api?.isExtension ||
      !this.options.warmCacheScope ||
      this.state.requestId !== requestId
    ) {
      return;
    }

    await this.api.setCachedPages(
      buildCachePayload(
        this.state.allPages,
        {
          total: this.state.total,
          hasNextPage: this.state.hasNextPage,
          nextCursor: this.state.nextCursor
        }
      ),
      this.options.warmCacheScope
    );
  }
}
