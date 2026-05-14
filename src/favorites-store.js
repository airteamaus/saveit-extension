export function paginateFavorites(pages, pageSize, maxItems) {
  const favorites = Array.isArray(pages) ? pages.slice(0, maxItems) : [];
  if (favorites.length === 0 || pageSize <= 0) return [];

  const pagedFavorites = [];
  for (let i = 0; i < favorites.length; i += pageSize) {
    pagedFavorites.push(favorites.slice(i, i + pageSize));
  }

  return pagedFavorites;
}

export function mergeFavoritePages(existingPages, incomingPages, maxItems) {
  const mergedPages = Array.isArray(existingPages) ? [...existingPages] : [];
  const seenIds = new Set(mergedPages.map(page => page.id));

  for (const page of Array.isArray(incomingPages) ? incomingPages : []) {
    if (!page?.id || seenIds.has(page.id)) continue;
    seenIds.add(page.id);
    mergedPages.push(page);
  }

  return mergedPages.slice(0, maxItems);
}

export function buildFavoritesCachePayload(pages, pagination, fromCache = false) {
  return {
    pages,
    pagination: {
      total: pagination?.total ?? pages.length,
      hasNextPage: pagination?.hasNextPage === true,
      nextCursor: pagination?.nextCursor || null
    },
    meta: {
      fromCache
    }
  };
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
    requestId: 0
  };
}

export class FavoritesStore {
  constructor(api, options = {}) {
    this.api = api;
    this.options = {
      maxItems: options.maxItems || 300,
      initialFetchLimit: options.initialFetchLimit || 36,
      prefetchBatchLimit: options.prefetchBatchLimit || 72,
      warmCacheScope: options.warmCacheScope || null,
      initialLayout: options.initialLayout || {}
    };
    this.state = createInitialState(this.options.initialLayout);
    this.events = new EventTarget();
    this.loadingPromise = null;
  }

  subscribe(listener) {
    this.events.addEventListener('change', listener);
    return () => this.events.removeEventListener('change', listener);
  }

  emitChange() {
    this.events.dispatchEvent(new Event('change'));
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

  async hydrate() {
    if (!this.api?.getFavorites) {
      return this.getSnapshot();
    }

    const requestId = this.reset({ emit: false });
    const warmCache = await this.getWarmCache();

    if (this.state.requestId !== requestId) {
      return this.getSnapshot();
    }

    if (warmCache?.pages?.length) {
      this.replaceData(warmCache.pages, warmCache.pagination, { requestId });
    } else {
      this.emitChange();
    }

    const response = await this.api.getFavorites(
      warmCache?.pages?.length
        ? this.buildInitialFetchOptions({ skipCache: true })
        : this.buildInitialFetchOptions()
    );

    if (this.state.requestId !== requestId) {
      return this.getSnapshot();
    }

    if (response?.pages) {
      const shouldReuseWarmHistory = warmCache?.pages?.length && response.pagination?.hasNextPage !== false;
      const combinedPages = shouldReuseWarmHistory
        ? mergeFavoritePages(response.pages, warmCache.pages, this.options.maxItems)
        : response.pages;
      const combinedPagination = shouldReuseWarmHistory
        ? {
            total: response.pagination?.total ?? warmCache.pagination?.total,
            hasNextPage: response.pagination?.hasNextPage ?? warmCache.pagination?.hasNextPage ?? false,
            nextCursor: response.pagination?.nextCursor || warmCache.pagination?.nextCursor || null
          }
        : response.pagination;

      this.replaceData(combinedPages, combinedPagination, { requestId });
      await this.persistWarmCache(requestId);
      void this.prefetchAllPages(requestId);
    }

    if (response?.meta?.fromCache && !warmCache?.pages?.length) {
      void this.refreshInitial(requestId);
    }

    return this.getSnapshot();
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

  async refreshInitial(requestId = this.state.requestId) {
    if (!this.api?.getFavorites) {
      return false;
    }

    try {
      const response = await this.api.getFavorites(this.buildInitialFetchOptions({ skipCache: true }));
      if (this.state.requestId !== requestId || !response?.pages) {
        return false;
      }

      this.replaceData(response.pages, response.pagination, { requestId });
      await this.persistWarmCache(requestId);
      void this.prefetchAllPages(requestId);
      return true;
    } catch (error) {
      console.debug('[favorites-store] Initial refresh failed:', error);
      return false;
    }
  }

  async loadMore(requestId = this.state.requestId) {
    if (this.loadingPromise) {
      return this.loadingPromise;
    }

    if (
      !this.api?.getFavorites ||
      !this.state.hasNextPage ||
      !this.state.nextCursor
    ) {
      return false;
    }

    this.state.isLoadingMore = true;
    this.emitChange();

    this.loadingPromise = (async () => {
      try {
        const previousCount = this.state.allPages.length;
        const previousCursor = this.state.nextCursor;
        const response = await this.api.getFavorites({
          limit: this.options.prefetchBatchLimit,
          sort: 'newest',
          pinnedFirst: true,
          cursor: this.state.nextCursor,
          skipCache: true
        });

        if (this.state.requestId !== requestId) {
          return false;
        }

        const mergedPages = mergeFavoritePages(
          this.state.allPages,
          response?.pages || [],
          this.options.maxItems
        );

        this.replaceData(mergedPages, {
          total: response?.pagination?.total,
          hasNextPage: response?.pagination?.hasNextPage,
          nextCursor: response?.pagination?.nextCursor
        }, { requestId });

        const didAppendPages = mergedPages.length > previousCount;
        const didAdvanceCursor = Boolean(
          response?.pagination?.nextCursor &&
          response.pagination.nextCursor !== previousCursor
        );

        if (!didAppendPages && !didAdvanceCursor && this.state.requestId === requestId) {
          this.state.hasNextPage = false;
          this.state.nextCursor = null;
          this.emitChange();
        }

        await this.persistWarmCache(requestId);

        return didAppendPages || didAdvanceCursor;
      } catch (error) {
        console.error('[favorites-store] Failed to load more favorites:', error);
        return false;
      } finally {
        if (this.state.requestId === requestId) {
          this.state.isLoadingMore = false;
          this.emitChange();
        }
        this.loadingPromise = null;
      }
    })();

    return this.loadingPromise;
  }

  async prefetchAllPages(requestId = this.state.requestId) {
    while (
      this.state.requestId === requestId &&
      this.state.hasNextPage &&
      this.state.allPages.length < this.options.maxItems
    ) {
      const loaded = await this.loadMore(requestId);
      if (!loaded) break;
    }

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

  buildInitialFetchOptions(overrides = {}) {
    return {
      limit: this.options.initialFetchLimit,
      sort: 'newest',
      pinnedFirst: true,
      ...overrides
    };
  }

  async getWarmCache() {
    if (!this.api?.isExtension || !this.options.warmCacheScope) {
      return null;
    }

    return this.api.getCachedPages(this.options.warmCacheScope);
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
      buildFavoritesCachePayload(
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
