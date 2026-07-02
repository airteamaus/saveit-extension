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

function createWarmCacheState(status = 'empty', {
  ageMs = null,
  timestamp = null,
  error = null,
  reason = null
} = {}) {
  return {
    status,
    ageMs,
    timestamp,
    error,
    reason
  };
}

function createRefreshState(status = 'idle', {
  phase = null,
  error = null,
  reason = null
} = {}) {
  return {
    status,
    phase,
    error,
    reason
  };
}

function createDataState(status = 'empty', {
  source = 'none',
  error = null
} = {}) {
  return {
    status,
    source,
    error
  };
}

function createRefreshResult(status, {
  phase = null,
  error = null,
  reason = null
} = {}) {
  return {
    status,
    phase,
    error,
    reason
  };
}

function hasWarmCachePayload(cacheState) {
  return cacheState?.status === 'fresh' || cacheState?.status === 'stale';
}

export function hasRenderableWarmCache(snapshot = {}) {
  return hasWarmCachePayload(snapshot?.warmCacheState);
}

function createInitialState() {
  return {
    allPages: [],
    total: null,
    hasNextPage: false,
    nextCursor: null,
    isLoadingMore: false,
    requestId: 0,
    warmCacheState: createWarmCacheState(),
    refreshState: createRefreshState(),
    dataState: createDataState()
  };
}

export class WarmCacheListStore {
  constructor(api, options = {}) {
    this.api = api;
    this.options = {
      maxItems: options.maxItems || Number.POSITIVE_INFINITY,
      initialFetchLimit: options.initialFetchLimit || 50,
      prefetchBatchLimit: options.prefetchBatchLimit || 100,
      // When true, the store fetches only the initial batch and stops. Callers
      // drive further fetching via loadMore() (e.g. on scroll). The warm-cache
      // and freshness-check paths still run; only the eager full prefetch is
      // suppressed.
      lazy: options.lazy === true,
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
      allPages: [...this.state.allPages],
      warmCacheState: { ...this.state.warmCacheState },
      refreshState: { ...this.state.refreshState },
      dataState: { ...this.state.dataState }
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

    if (this.state.requestId !== requestId) {
      return this.getSnapshot();
    }

    this.state.warmCacheState = createWarmCacheState(warmCache.status, {
      ageMs: warmCache.ageMs,
      timestamp: warmCache.timestamp,
      error: warmCache.error,
      reason: warmCache.reason
    });

    if (hasWarmCachePayload(warmCache)) {
      this.replaceData(warmCache.pages, warmCache.pagination, {
        requestId,
        dataState: createDataState(warmCache.status, {
          source: 'warm-cache'
        })
      });
      void this.refreshInitial(requestId);
      return this.getSnapshot();
    }

    this.emitChange();

    let response;
    try {
      response = await this.options.getList(this.buildInitialFetchOptions());
    } catch (error) {
      if (this.state.requestId === requestId) {
        this.state.refreshState = createRefreshState('error', {
          phase: 'initial-load',
          error,
          reason: 'network-failed'
        });
        this.state.dataState = createDataState('error', {
          source: 'network',
          error
        });
        this.emitChange();
      }

      throw error;
    }

    if (this.state.requestId !== requestId) {
      return this.getSnapshot();
    }

    if (response?.pages) {
      this.applyResponse(response, {
        requestId,
        dataState: createDataState(
          response.pages.length ? 'fresh' : 'empty',
          {
            source: response?.meta?.fromCache ? 'api-cache' : 'network'
          }
        )
      });
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
      return createRefreshResult('skipped', {
        reason: 'missing-get-list'
      });
    }

    try {
      this.state.refreshState = createRefreshState('checking', {
        phase: 'update-check'
      });
      const updateStatus = await this.checkForUpdates(requestId);
      if (this.state.requestId !== requestId) {
        return createRefreshResult('skipped', {
          phase: 'update-check',
          reason: 'stale-request'
        });
      }

      if (updateStatus?.hasUpdates === false) {
        if (
          this.getActiveHasNextPage(requestId) &&
          this.getActiveNextCursor(requestId) &&
          this.getAuthoritativeCount(requestId) < this.options.maxItems
        ) {
          this.state.refreshState = createRefreshState('loading', {
            phase: 'prefetch'
          });
          void this.prefetchAllPages(requestId);
          return createRefreshResult('updated', {
            phase: 'prefetch',
            reason: 'coverage-gap'
          });
        }

        this.state.refreshState = createRefreshState('idle', {
          phase: 'up-to-date',
          reason: 'no-updates'
        });
        this.emitChange();
        return createRefreshResult('unchanged', {
          phase: 'update-check',
          reason: 'no-updates'
        });
      }

      if (
        updateStatus?.hasUpdates === true &&
        updateStatus?.anchorFound !== false &&
        updateStatus?.canIncrementalSync !== false &&
        this.options.getIncrementalList
      ) {
        this.state.refreshState = createRefreshState('loading', {
          phase: 'incremental-refresh'
        });
        const incrementalResponse = await this.options.getIncrementalList(
          this.buildIncrementalFetchOptions(updateStatus.latestKnownId)
        );

        if (this.state.requestId !== requestId) {
          return createRefreshResult('skipped', {
            phase: 'incremental-refresh',
            reason: 'stale-request'
          });
        }

        if (incrementalResponse?.pages?.length && incrementalResponse?.pagination?.hasNextPage !== true) {
          this.applyIncrementalResponse(incrementalResponse, {
            requestId,
            dataState: createDataState('fresh', {
              source: 'network'
            })
          });
          await this.persistWarmCache(requestId);
          this.state.refreshState = createRefreshState('idle', {
            phase: 'incremental-refresh',
            reason: 'applied'
          });
          this.emitChange();
          return createRefreshResult('updated', {
            phase: 'incremental-refresh',
            reason: 'applied'
          });
        }
      }

      this.state.refreshState = createRefreshState('loading', {
        phase: 'full-refresh'
      });
      const response = await this.options.getList(this.buildInitialFetchOptions({ skipCache: true }));
      if (this.state.requestId !== requestId || !response?.pages) {
        return createRefreshResult('skipped', {
          phase: 'full-refresh',
          reason: 'stale-request'
        });
      }

      this.applyFreshResponse(response, {
        requestId,
        preserveExistingCoverage: true,
        dataState: createDataState(
          response.pages.length ? 'fresh' : 'empty',
          {
            source: 'network'
          }
        )
      });
      await this.persistWarmCache(requestId);
      this.state.refreshState = createRefreshState('loading', {
        phase: 'prefetch'
      });
      void this.prefetchAllPages(requestId);
      return createRefreshResult('updated', {
        phase: 'full-refresh',
        reason: 'applied'
      });
    } catch (error) {
      console.debug('[warm-cache-list-store] Initial refresh failed:', error);
      this.state.refreshState = createRefreshState('error', {
        phase: 'refresh',
        error,
        reason: 'refresh-failed'
      });
      this.emitChange();
      return createRefreshResult('error', {
        phase: 'refresh',
        error,
        reason: 'refresh-failed'
      });
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
      return createRefreshResult('unchanged', {
        phase: 'load-more',
        reason: 'no-next-page'
      });
    }

    this.state.isLoadingMore = true;
    this.state.refreshState = createRefreshState('loading', {
      phase: 'load-more'
    });
    this.emitChange();

    this.loadingPromise = (async () => {
      try {
        const previousCount = this.state.allPages.length;
        const previousCursor = this.getActiveNextCursor(requestId);
        const response = await this.options.getList(
          this.buildLoadMoreFetchOptions(previousCursor)
        );

        if (this.state.requestId !== requestId) {
          return createRefreshResult('skipped', {
            phase: 'load-more',
            reason: 'stale-request'
          });
        }

        if (this.hasActiveRefreshBuffer(requestId)) {
          const didUpdate = this.extendRefreshBuffer(response, { requestId });
          await this.persistWarmCache(requestId);
          if (didUpdate) {
            this.state.refreshState = createRefreshState('idle', {
              phase: 'load-more',
              reason: 'extended-refresh-buffer'
            });
          }
          return createRefreshResult(didUpdate ? 'updated' : 'unchanged', {
            phase: 'load-more',
            reason: didUpdate ? 'extended-refresh-buffer' : 'no-change'
          });
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
        }, {
          requestId,
          dataState: createDataState(
            mergedPages.length ? 'fresh' : 'empty',
            {
              source: this.state.dataState?.source === 'warm-cache' ? 'warm-cache' : 'network'
            }
          )
        });

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

        const didUpdate = didAppendPages || didAdvanceCursor;
        this.state.refreshState = createRefreshState('idle', {
          phase: 'load-more',
          reason: didUpdate ? 'appended-pages' : 'no-change'
        });
        return createRefreshResult(didUpdate ? 'updated' : 'unchanged', {
          phase: 'load-more',
          reason: didUpdate ? 'appended-pages' : 'no-change'
        });
      } catch (error) {
        console.error('[warm-cache-list-store] Failed to load more pages:', error);
        this.state.refreshState = createRefreshState('error', {
          phase: 'load-more',
          error,
          reason: 'load-more-failed'
        });
        return createRefreshResult('error', {
          phase: 'load-more',
          error,
          reason: 'load-more-failed'
        });
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
    // Lazy stores fetch only the initial batch; further fetching is driven by
    // explicit loadMore() calls (e.g. on scroll). This keeps large libraries
    // from hydrating in full on first paint.
    if (this.options.lazy) {
      return this.getSnapshot();
    }

    while (
      this.state.requestId === requestId &&
      this.getActiveHasNextPage(requestId) &&
      this.getAuthoritativeCount(requestId) < this.options.maxItems
    ) {
      const loaded = await this.loadMore(requestId);
      if (loaded.status !== 'updated') break;
    }

    if (this.state.requestId === requestId && this.state.refreshState.status !== 'error') {
      this.state.refreshState = createRefreshState('idle', {
        phase: 'prefetch',
        reason: 'complete'
      });
      this.emitChange();
    }

    return this.getSnapshot();
  }

  replaceData(pages, pagination, { requestId = this.state.requestId, dataState = null } = {}) {
    if (this.state.requestId !== requestId) {
      return;
    }

    this.state.allPages = Array.isArray(pages) ? pages.slice(0, this.options.maxItems) : [];
    const hasReachedCap = this.state.allPages.length >= this.options.maxItems;
    this.state.total = typeof pagination?.total === 'number' ? pagination.total : this.state.allPages.length;
    this.state.hasNextPage = !hasReachedCap && pagination?.hasNextPage === true;
    this.state.nextCursor = this.state.hasNextPage ? pagination?.nextCursor || null : null;
    this.state.dataState = dataState || createDataState(
      this.state.allPages.length ? 'fresh' : 'empty',
      {
        source: 'local'
      }
    );
    this.emitChange();
  }

  applyResponse(response, {
    requestId = this.state.requestId,
    preserveExistingCoverage = false,
    dataState = null
  } = {}) {
    if (this.state.requestId !== requestId || !response?.pages) {
      return false;
    }

    const nextPages = this.reconcilePages(response.pages, { preserveExistingCoverage });
    const nextPagination = this.reconcilePagination(response.pagination, nextPages, {
      preserveExistingCoverage
    });

    this.replaceData(nextPages, nextPagination, { requestId, dataState });
    return true;
  }

  applyFreshResponse(response, {
    requestId = this.state.requestId,
    preserveExistingCoverage = false,
    dataState = null
  } = {}) {
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
      return this.applyResponse(response, { requestId, preserveExistingCoverage, dataState });
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

  applyIncrementalResponse(response, {
    requestId = this.state.requestId,
    dataState = null
  } = {}) {
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
    }, { requestId, dataState });
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

  getUpdateAnchorItemId() {
    const updateOptions = this.buildUpdateCheckOptions(null);
    const sortDirection = updateOptions?.sort === 'oldest' ? 'asc' : 'desc';
    const pinnedFirst = updateOptions?.pinnedFirst === true;

    const anchorPage = this.state.allPages.reduce((currentAnchor, page) => {
      if (!page?.id) {
        return currentAnchor;
      }

      if (!currentAnchor?.id) {
        return page;
      }

      if (pinnedFirst) {
        const currentPinned = currentAnchor.pinned === true ? 1 : 0;
        const nextPinned = page.pinned === true ? 1 : 0;
        if (currentPinned !== nextPinned) {
          return nextPinned > currentPinned ? page : currentAnchor;
        }
      }

      const currentTime = Date.parse(currentAnchor.saved_at || '') || 0;
      const nextTime = Date.parse(page.saved_at || '') || 0;
      if (currentTime !== nextTime) {
        if (sortDirection === 'asc') {
          return nextTime < currentTime ? page : currentAnchor;
        }
        return nextTime > currentTime ? page : currentAnchor;
      }

      if (page.id === currentAnchor.id) {
        return currentAnchor;
      }

      if (sortDirection === 'asc') {
        return page.id < currentAnchor.id ? page : currentAnchor;
      }

      return page.id > currentAnchor.id ? page : currentAnchor;
    }, null);

    return anchorPage?.id || null;
  }

  async checkForUpdates(requestId = this.state.requestId) {
    if (!this.options.checkForUpdates) {
      return {
        hasUpdates: true,
        anchorFound: false,
        canIncrementalSync: false
      };
    }

    const latestKnownId = this.getUpdateAnchorItemId();
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
      return {
        status: 'empty',
        pages: [],
        pagination: {
          total: 0,
          hasNextPage: false,
          nextCursor: null
        },
        error: null,
        reason: 'warm-cache-disabled'
      };
    }

    const cacheState = this.api.getCachedPagesState
      ? await this.api.getCachedPagesState(this.options.warmCacheScope, { allowExpired: true })
      : await (async () => {
        const response = await this.api.getCachedPages(this.options.warmCacheScope, { allowExpired: true });
        return {
          status: response ? 'fresh' : 'empty',
          response,
          error: null,
          ageMs: null,
          timestamp: null,
          reason: 'legacy-api',
          usable: Boolean(response)
        };
      })();
    const payload = cacheState.response;
    const pages = Array.isArray(payload?.pages) ? payload.pages : [];

    return {
      status: cacheState.status,
      pages,
      pagination: {
        total: typeof payload?.pagination?.total === 'number' ? payload.pagination.total : pages.length,
        hasNextPage: payload?.pagination?.hasNextPage === true,
        nextCursor: payload?.pagination?.hasNextPage === true ? payload?.pagination?.nextCursor || null : null
      },
      error: cacheState.error,
      ageMs: cacheState.ageMs,
      timestamp: cacheState.timestamp,
      reason: cacheState.reason,
      usable: cacheState.usable
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
