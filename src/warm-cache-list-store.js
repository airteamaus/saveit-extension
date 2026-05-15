export function mergeListPages(existingPages, incomingPages, maxItems) {
  const mergedPages = Array.isArray(existingPages) ? [...existingPages] : [];
  const seenIds = new Set(mergedPages.map(page => page.id));

  for (const page of Array.isArray(incomingPages) ? incomingPages : []) {
    if (!page?.id || seenIds.has(page.id)) continue;
    seenIds.add(page.id);
    mergedPages.push(page);
  }

  return mergedPages.slice(0, maxItems);
}

export function upsertListPages(existingPages, incomingPages, maxItems) {
  const mergedPages = Array.isArray(existingPages) ? [...existingPages] : [];
  const pageIndex = new Map(
    mergedPages
      .filter(page => page?.id)
      .map((page, index) => [page.id, index])
  );

  for (const page of Array.isArray(incomingPages) ? incomingPages : []) {
    if (!page?.id) continue;

    const existingIndex = pageIndex.get(page.id);
    if (typeof existingIndex === 'number') {
      mergedPages[existingIndex] = page;
      continue;
    }

    pageIndex.set(page.id, mergedPages.length);
    mergedPages.push(page);
  }

  return mergedPages.slice(0, maxItems);
}

export function hasFullCoverage(pages, pagination, maxItems) {
  if (!Array.isArray(pages) || pages.length === 0) {
    return false;
  }

  if (typeof pagination?.total === 'number') {
    return pages.length >= Math.min(pagination.total, maxItems);
  }

  return pagination?.hasNextPage !== true;
}

export function buildListCachePayload(pages, pagination, fromCache = false) {
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

export class WarmCacheListStore {
  constructor(api, options = {}) {
    this.api = api;
    this.options = {
      maxItems: options.maxItems || Number.POSITIVE_INFINITY,
      initialFetchLimit: options.initialFetchLimit || 50,
      prefetchBatchLimit: options.prefetchBatchLimit || 100,
      warmCacheScope: options.warmCacheScope || null,
      getList: options.getList || null,
      getIncrementalList: options.getIncrementalList || null,
      checkForUpdates: options.checkForUpdates || null,
      buildInitialFetchOptions: options.buildInitialFetchOptions || (overrides => ({
        limit: this.options.initialFetchLimit,
        ...overrides
      })),
      buildIncrementalFetchOptions: options.buildIncrementalFetchOptions || (newerThanId => ({
        ...this.options.buildInitialFetchOptions({
          skipCache: true
        }),
        newerThanId
      })),
      buildUpdateCheckOptions: options.buildUpdateCheckOptions || (latestKnownId => ({
        latestKnownId
      })),
      buildLoadMoreFetchOptions: options.buildLoadMoreFetchOptions || ((cursor) => ({
        limit: this.options.prefetchBatchLimit,
        cursor,
        skipCache: true
      }))
    };
    this.state = createInitialState();
    this.events = new EventTarget();
    this.loadingPromise = null;
    this.refreshBuffer = null;
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
    this.refreshBuffer = null;
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
    if (!this.options.getList) {
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

    const response = await this.options.getList(this.buildInitialFetchOptions());
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
    if (!this.options.getList) {
      return false;
    }

    try {
      const updateStatus = await this.checkForUpdates(requestId);
      if (this.state.requestId !== requestId) {
        return false;
      }

      if (updateStatus?.hasUpdates === false) {
        return false;
      }

      if (
        updateStatus?.hasUpdates === true &&
        updateStatus?.anchorFound !== false &&
        updateStatus?.canIncrementalSync !== false &&
        this.options.getIncrementalList
      ) {
        const incrementalResponse = await this.options.getIncrementalList(
          this.buildIncrementalFetchOptions(updateStatus.latestKnownId)
        );

        if (this.state.requestId !== requestId) {
          return false;
        }

        if (incrementalResponse?.pages?.length && incrementalResponse?.pagination?.hasNextPage !== true) {
          this.applyIncrementalResponse(incrementalResponse, { requestId });
          await this.persistWarmCache(requestId);
          return true;
        }
      }

      const response = await this.options.getList(this.buildInitialFetchOptions({ skipCache: true }));
      if (this.state.requestId !== requestId || !response?.pages) {
        return false;
      }

      this.applyFreshResponse(response, { requestId, preserveExistingCoverage: true });
      await this.persistWarmCache(requestId);
      void this.prefetchAllPages(requestId);
      return true;
    } catch (error) {
      console.debug('[warm-cache-list-store] Initial refresh failed:', error);
      return false;
    }
  }

  async loadMore(requestId = this.state.requestId) {
    if (this.loadingPromise) {
      return this.loadingPromise;
    }

    if (
      !this.options.getList ||
      !this.getActiveHasNextPage(requestId) ||
      !this.getActiveNextCursor(requestId)
    ) {
      return false;
    }

    this.state.isLoadingMore = true;
    this.emitChange();

    this.loadingPromise = (async () => {
      try {
        const previousCount = this.state.allPages.length;
        const previousCursor = this.getActiveNextCursor(requestId);
        const response = await this.options.getList(
          this.buildLoadMoreFetchOptions(previousCursor)
        );

        if (this.state.requestId !== requestId) {
          return false;
        }

        if (this.hasActiveRefreshBuffer(requestId)) {
          const didUpdate = this.extendRefreshBuffer(response, { requestId });
          await this.persistWarmCache(requestId);
          return didUpdate;
        }

        const mergedPages = mergeListPages(
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
        console.error('[warm-cache-list-store] Failed to load more pages:', error);
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
      this.getActiveHasNextPage(requestId) &&
      this.getAuthoritativeCount(requestId) < this.options.maxItems
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

  applyFreshResponse(response, { requestId = this.state.requestId, preserveExistingCoverage = false } = {}) {
    const authoritativeTotal = typeof response?.pagination?.total === 'number'
      ? response.pagination.total
      : response?.pages?.length || 0;
    const cappedAuthoritativeTotal = Math.min(authoritativeTotal, this.options.maxItems);

    if (
      !preserveExistingCoverage ||
      !Array.isArray(response?.pages) ||
      this.state.allPages.length === cappedAuthoritativeTotal ||
      (
        this.state.allPages.length <= response.pages.length &&
        this.state.allPages.length <= authoritativeTotal
      )
    ) {
      this.refreshBuffer = null;
      return this.applyResponse(response, { requestId, preserveExistingCoverage });
    }

    this.refreshBuffer = {
      requestId,
      fallbackPages: [...this.state.allPages],
      pages: response.pages.slice(0, this.options.maxItems),
      total: authoritativeTotal,
      hasNextPage: response?.pagination?.hasNextPage === true,
      nextCursor: response?.pagination?.hasNextPage === true
        ? response?.pagination?.nextCursor || null
        : null
    };

    this.applyRefreshBuffer(requestId);
    return true;
  }

  applyIncrementalResponse(response, { requestId = this.state.requestId } = {}) {
    if (this.state.requestId !== requestId || !Array.isArray(response?.pages) || response.pages.length === 0) {
      return false;
    }

    const nextPages = mergeListPages(
      response.pages.slice(0, this.options.maxItems),
      this.state.allPages,
      this.options.maxItems
    );
    const total = typeof response?.pagination?.total === 'number'
      ? response.pagination.total
      : (
        typeof this.state.total === 'number'
          ? this.state.total + response.pages.length
          : nextPages.length
      );

    this.refreshBuffer = null;
    this.replaceData(nextPages, {
      total,
      hasNextPage: this.state.hasNextPage,
      nextCursor: this.state.nextCursor
    }, { requestId });
    return true;
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

  async setPages(pages, pagination = {}, { requestId = this.state.requestId } = {}) {
    this.refreshBuffer = null;
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
    return this.options.buildInitialFetchOptions(overrides);
  }

  buildIncrementalFetchOptions(newerThanId) {
    return this.options.buildIncrementalFetchOptions(newerThanId);
  }

  buildUpdateCheckOptions(latestKnownId) {
    return this.options.buildUpdateCheckOptions(latestKnownId);
  }

  buildLoadMoreFetchOptions(cursor) {
    return this.options.buildLoadMoreFetchOptions(cursor);
  }

  getMostRecentItemId() {
    const mostRecentPage = this.state.allPages.reduce((latestPage, page) => {
      if (!page?.id) {
        return latestPage;
      }

      if (!latestPage?.id) {
        return page;
      }

      const latestTime = Date.parse(latestPage.saved_at || '') || 0;
      const pageTime = Date.parse(page.saved_at || '') || 0;
      if (pageTime !== latestTime) {
        return pageTime > latestTime ? page : latestPage;
      }

      return page.id > latestPage.id ? page : latestPage;
    }, null);

    return mostRecentPage?.id || null;
  }

  async checkForUpdates(requestId = this.state.requestId) {
    if (!this.options.checkForUpdates) {
      return {
        hasUpdates: true,
        anchorFound: false,
        canIncrementalSync: false
      };
    }

    const latestKnownId = this.getMostRecentItemId();
    if (!latestKnownId) {
      return {
        hasUpdates: true,
        anchorFound: false,
        canIncrementalSync: false
      };
    }

    return {
      latestKnownId,
      ...(await this.options.checkForUpdates(this.buildUpdateCheckOptions(latestKnownId), {
        requestId
      }))
    };
  }

  hasActiveRefreshBuffer(requestId = this.state.requestId) {
    return this.refreshBuffer?.requestId === requestId;
  }

  getAuthoritativeCount(requestId = this.state.requestId) {
    if (this.hasActiveRefreshBuffer(requestId)) {
      return this.refreshBuffer.pages.length;
    }

    return this.state.allPages.length;
  }

  getActiveHasNextPage(requestId = this.state.requestId) {
    if (this.hasActiveRefreshBuffer(requestId)) {
      return this.refreshBuffer.hasNextPage;
    }

    return this.state.hasNextPage;
  }

  getActiveNextCursor(requestId = this.state.requestId) {
    if (this.hasActiveRefreshBuffer(requestId)) {
      return this.refreshBuffer.nextCursor;
    }

    return this.state.nextCursor;
  }

  applyRefreshBuffer(requestId = this.state.requestId) {
    if (!this.hasActiveRefreshBuffer(requestId)) {
      return false;
    }

    const cappedTotal = typeof this.refreshBuffer.total === 'number'
      ? Math.min(this.refreshBuffer.total, this.options.maxItems)
      : null;
    const hasAuthoritativeCoverage = cappedTotal !== null
      ? this.refreshBuffer.pages.length >= cappedTotal
      : this.refreshBuffer.hasNextPage !== true;

    const nextPages = hasAuthoritativeCoverage
      ? this.refreshBuffer.pages.slice(0, this.options.maxItems)
      : mergeListPages(
        this.refreshBuffer.pages,
        this.refreshBuffer.fallbackPages,
        this.options.maxItems
      );

    const authoritativeTotal = typeof this.refreshBuffer.total === 'number'
      ? this.refreshBuffer.total
      : nextPages.length;
    const total = hasAuthoritativeCoverage
      ? authoritativeTotal
      : Math.max(authoritativeTotal, nextPages.length);

    this.replaceData(nextPages, {
      total,
      hasNextPage: this.refreshBuffer.hasNextPage === true,
      nextCursor: this.refreshBuffer.hasNextPage === true ? this.refreshBuffer.nextCursor : null
    }, { requestId });

    if (hasAuthoritativeCoverage) {
      this.refreshBuffer = null;
    }

    return true;
  }

  extendRefreshBuffer(response, { requestId = this.state.requestId } = {}) {
    if (!this.hasActiveRefreshBuffer(requestId) || !response?.pages) {
      return false;
    }

    const previousDisplayCount = this.state.allPages.length;
    const previousCursor = this.refreshBuffer.nextCursor;

    this.refreshBuffer.pages = upsertListPages(
      this.refreshBuffer.pages,
      response.pages,
      this.options.maxItems
    );
    this.refreshBuffer.total = typeof response?.pagination?.total === 'number'
      ? response.pagination.total
      : this.refreshBuffer.total;
    this.refreshBuffer.hasNextPage = response?.pagination?.hasNextPage === true;
    this.refreshBuffer.nextCursor = this.refreshBuffer.hasNextPage
      ? response?.pagination?.nextCursor || null
      : null;

    this.applyRefreshBuffer(requestId);

    return (
      this.state.allPages.length !== previousDisplayCount ||
      this.getActiveNextCursor(requestId) !== previousCursor
    );
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
      buildListCachePayload(
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
