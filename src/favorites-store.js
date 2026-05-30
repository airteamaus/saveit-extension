import {
  WarmCacheListStore,
  buildListCachePayload,
  mergeListPages
} from './warm-cache-list-store.js';

export function paginateFavorites(pages, pageSize, maxItems) {
  const favorites = Array.isArray(pages) ? pages.slice(0, maxItems) : [];
  if (favorites.length === 0 || pageSize <= 0) return [];

  const pagedFavorites = [];
  for (let i = 0; i < favorites.length; i += pageSize) {
    pagedFavorites.push(favorites.slice(i, i + pageSize));
  }

  return pagedFavorites;
}

export const mergeFavoritePages = mergeListPages;

export function buildFavoritesCachePayload(pages, pagination, fromCache = false) {
  return buildListCachePayload(pages, pagination, fromCache);
}

function createInitialState(initialLayout = {}) {
  return {
    allPages: [],
    pagedPages: [],
    currentPage: 0,
    pageSize: initialLayout.pageSize || 12,
    columns: initialLayout.columns || 6,
    rows: initialLayout.rows || 2,
    tileWidth: initialLayout.tileWidth || 88,
    gridWidth: initialLayout.gridWidth || 0,
    total: null,
    hasNextPage: false,
    nextCursor: null,
    isLoadingMore: false,
    requestId: 0,
    warmCacheState: {
      status: 'empty',
      ageMs: null,
      timestamp: null,
      error: null,
      reason: null
    },
    refreshState: {
      status: 'idle',
      phase: null,
      error: null,
      reason: null
    },
    dataState: {
      status: 'empty',
      source: 'none',
      error: null
    }
  };
}

export class FavoritesStore extends WarmCacheListStore {
  constructor(api, options = {}) {
    super(api, {
      maxItems: options.maxItems || 300,
      initialFetchLimit: options.initialFetchLimit || 36,
      prefetchBatchLimit: options.prefetchBatchLimit || 72,
      warmCacheScope: options.warmCacheScope || null,
      getList: fetchOptions => api?.getFavorites?.(fetchOptions),
      getIncrementalList: fetchOptions => api?.getFavorites?.(fetchOptions),
      checkForUpdates: fetchOptions => api?.checkFavoritesUpdates?.(fetchOptions),
      buildInitialFetchOptions: (overrides = {}) => ({
        limit: options.initialFetchLimit || 36,
        sort: 'newest',
        pinnedFirst: true,
        ...overrides
      }),
      buildIncrementalFetchOptions: newerThanId => ({
        limit: options.initialFetchLimit || 36,
        sort: 'newest',
        pinnedFirst: true,
        newerThanId,
        skipCache: true
      }),
      buildUpdateCheckOptions: latestKnownId => ({
        sort: 'newest',
        pinnedFirst: true,
        latestKnownId
      }),
      buildLoadMoreFetchOptions: cursor => ({
        limit: options.prefetchBatchLimit || 72,
        sort: 'newest',
        pinnedFirst: true,
        cursor,
        skipCache: true
      })
    });
    this.options.initialLayout = options.initialLayout || {};
    this.state = createInitialState(this.options.initialLayout);
  }

  getSnapshot() {
    return {
      ...this.state,
      allPages: [...this.state.allPages],
      pagedPages: this.state.pagedPages.map(page => [...page])
    };
  }

  reset({ emit = true } = {}) {
    const requestId = this.state.requestId + 1;
    const layoutState = {
      pageSize: this.state.pageSize,
      columns: this.state.columns,
      rows: this.state.rows,
      tileWidth: this.state.tileWidth,
      gridWidth: this.state.gridWidth
    };

    this.state = {
      ...createInitialState(layoutState),
      requestId
    };
    this.loadingPromise = null;

    if (emit) {
      this.emitChange();
    }

    return requestId;
  }

  applyLayout(layout, { emit = true } = {}) {
    const firstVisibleIndex = this.state.currentPage * this.state.pageSize;

    this.state.pageSize = layout.pageSize;
    this.state.columns = layout.columns;
    this.state.rows = layout.rows;
    this.state.tileWidth = layout.tileWidth;
    this.state.gridWidth = layout.gridWidth;
    this.state.pagedPages = paginateFavorites(
      this.state.allPages,
      layout.pageSize,
      this.options.maxItems
    );
    this.state.currentPage = this.state.pagedPages.length
      ? Math.min(Math.floor(firstVisibleIndex / layout.pageSize), this.state.pagedPages.length - 1)
      : 0;

    if (emit) {
      this.emitChange();
    }
  }

  async goToPage(pageIndex) {
    if (!this.state.pagedPages.length) {
      return this.getSnapshot();
    }

    this.state.currentPage = Math.max(
      0,
      Math.min(pageIndex, this.state.pagedPages.length - 1)
    );
    this.emitChange();

    return this.getSnapshot();
  }

  replaceData(pages, pagination, { requestId = this.state.requestId } = {}) {
    if (this.state.requestId !== requestId) {
      return;
    }

    this.state.allPages = Array.isArray(pages) ? pages.slice(0, this.options.maxItems) : [];
    this.state.pagedPages = paginateFavorites(
      this.state.allPages,
      this.state.pageSize,
      this.options.maxItems
    );
    this.state.currentPage = this.state.pagedPages.length
      ? Math.min(this.state.currentPage, this.state.pagedPages.length - 1)
      : 0;

    const hasReachedFavoritesCap = this.state.allPages.length >= this.options.maxItems;
    this.state.total = typeof pagination?.total === 'number' ? pagination.total : null;
    this.state.hasNextPage = !hasReachedFavoritesCap && pagination?.hasNextPage === true;
    this.state.nextCursor = this.state.hasNextPage ? pagination?.nextCursor || null : null;
    this.emitChange();
  }

}
