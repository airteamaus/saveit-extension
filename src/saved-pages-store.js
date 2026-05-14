function mergePages(existingPages, incomingPages, maxItems) {
  const mergedPages = Array.isArray(existingPages) ? [...existingPages] : [];
  const seenIds = new Set(mergedPages.map(page => page.id));

  for (const page of Array.isArray(incomingPages) ? incomingPages : []) {
    if (!page?.id || seenIds.has(page.id)) continue;
    seenIds.add(page.id);
    mergedPages.push(page);
  }

  return mergedPages.slice(0, maxItems);
}

function hasFullCoverage(pages, pagination, maxItems) {
  if (!Array.isArray(pages) || pages.length === 0) {
    return false;
  }

  if (typeof pagination?.total === 'number') {
    return pages.length >= Math.min(pagination.total, maxItems);
  }

  return pagination?.hasNextPage !== true;
}

function buildCachePayload(pages, pagination, fromCache = false) {
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

function createInitialState() {
  return {
    allPages: [],
    total: null,
    hasNextPage: false,
    nextCursor: null,
    isLoadingMore: false,
    requestId: 0
  };
}

export class SavedPagesStore {
  constructor(api, options = {}) {
    this.api = api;
    this.options = {
      maxItems: options.maxItems || Number.POSITIVE_INFINITY,
      initialFetchLimit: options.initialFetchLimit || 50,
      prefetchBatchLimit: options.prefetchBatchLimit || 100,
      warmCacheScope: options.warmCacheScope || null
    };
    this.state = createInitialState();
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
      allPages: [...this.state.allPages]
    };
  }

  reset({ emit = true } = {}) {
    const requestId = this.state.requestId + 1;
    this.state = {
      ...createInitialState(),
      requestId
    };
    this.loadingPromise = null;

    if (emit) {
      this.emitChange();
    }

    return requestId;
  }

  async hydrate() {
    if (!this.api?.getSavedPages) {
      return this.getSnapshot();
    }

    const requestId = this.reset({ emit: false });
    const warmCache = await this.getWarmCache();

    if (this.state.requestId !== requestId) {
      return this.getSnapshot();
    }

    if (warmCache?.pages?.length) {
      this.replaceData(warmCache.pages, warmCache.pagination, { requestId });
      void this.refreshInitial(requestId);
      return this.getSnapshot();
    }

    this.emitChange();

    const response = await this.api.getSavedPages(this.buildInitialFetchOptions());
    if (this.state.requestId !== requestId) {
      return this.getSnapshot();
    }

    if (response?.pages) {
      this.applyResponse(response, { requestId });
      await this.persistWarmCache(requestId);

      if (response?.meta?.fromCache) {
        void this.refreshInitial(requestId);
      } else {
        void this.prefetchAllPages(requestId);
      }
    }

    return this.getSnapshot();
  }

  async refreshInitial(requestId = this.state.requestId) {
    if (!this.api?.getSavedPages) {
      return false;
    }

    try {
      const response = await this.api.getSavedPages(this.buildInitialFetchOptions({ skipCache: true }));
      if (this.state.requestId !== requestId || !response?.pages) {
        return false;
      }

      this.applyResponse(response, { requestId, preserveExistingCoverage: true });
      await this.persistWarmCache(requestId);
      void this.prefetchAllPages(requestId);
      return true;
    } catch (error) {
      console.debug('[saved-pages-store] Initial refresh failed:', error);
      return false;
    }
  }

  async loadMore(requestId = this.state.requestId) {
    if (this.loadingPromise) {
      return this.loadingPromise;
    }

    if (
      !this.api?.getSavedPages ||
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
        const response = await this.api.getSavedPages({
          limit: this.options.prefetchBatchLimit,
          sort: 'newest',
          pinnedFirst: false,
          cursor: this.state.nextCursor,
          skipCache: true
        });

        if (this.state.requestId !== requestId) {
          return false;
        }

        const mergedPages = mergePages(
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
        console.error('[saved-pages-store] Failed to load more saved pages:', error);
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
    const hasReachedCap = this.state.allPages.length >= this.options.maxItems;
    this.state.total = typeof pagination?.total === 'number' ? pagination.total : this.state.allPages.length;
    this.state.hasNextPage = !hasReachedCap && pagination?.hasNextPage === true;
    this.state.nextCursor = this.state.hasNextPage ? pagination?.nextCursor || null : null;
    this.emitChange();
  }

  applyResponse(response, { requestId = this.state.requestId, preserveExistingCoverage = false } = {}) {
    if (this.state.requestId !== requestId || !response?.pages) {
      return false;
    }

    const nextPages = this.reconcilePages(response.pages, { preserveExistingCoverage });
    const nextPagination = this.reconcilePagination(response.pagination, nextPages, {
      preserveExistingCoverage
    });

    this.replaceData(nextPages, nextPagination, { requestId });
    return true;
  }

  reconcilePages(incomingPages, { preserveExistingCoverage = false } = {}) {
    const normalizedIncomingPages = Array.isArray(incomingPages)
      ? incomingPages.slice(0, this.options.maxItems)
      : [];

    if (!preserveExistingCoverage || this.state.allPages.length <= normalizedIncomingPages.length) {
      return normalizedIncomingPages;
    }

    return mergePages(normalizedIncomingPages, this.state.allPages, this.options.maxItems);
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

  async setPages(pages, pagination = {}, { requestId = this.state.requestId } = {}) {
    this.replaceData(pages, {
      total: typeof pagination?.total === 'number' ? pagination.total : pages.length,
      hasNextPage: pagination?.hasNextPage === true,
      nextCursor: pagination?.nextCursor || null
    }, { requestId });
    await this.persistWarmCache(requestId);
    return this.getSnapshot();
  }

  async updatePage(id, updater, { requestId = this.state.requestId } = {}) {
    if (!id || typeof updater !== 'function') {
      return this.getSnapshot();
    }

    const nextPages = this.state.allPages.map(page => (page.id === id ? updater(page) : page));
    await this.setPages(nextPages, {
      total: this.state.total,
      hasNextPage: this.state.hasNextPage,
      nextCursor: this.state.nextCursor
    }, { requestId });
    return this.getSnapshot();
  }

  async removePage(id, { requestId = this.state.requestId } = {}) {
    if (!id) {
      return this.getSnapshot();
    }

    const nextPages = this.state.allPages.filter(page => page.id !== id);
    const nextTotal = typeof this.state.total === 'number'
      ? Math.max(0, this.state.total - 1)
      : nextPages.length;
    await this.setPages(nextPages, {
      total: nextTotal,
      hasNextPage: this.state.hasNextPage,
      nextCursor: this.state.nextCursor
    }, { requestId });
    return this.getSnapshot();
  }

  buildInitialFetchOptions(overrides = {}) {
    return {
      limit: this.options.initialFetchLimit,
      sort: 'newest',
      pinnedFirst: false,
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
