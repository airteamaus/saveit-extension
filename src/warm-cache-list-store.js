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
      })),
      // Called with [url, ...] when optimistic tiles are reconciled (the real
      // doc arrived and replaced the synthetic tile). The caller uses this to
      // clear stale pending-save records from storage.local. Optional — if not
      // provided, reconciliation still drops the tile from the in-memory list.
      onOptimisticReconciled: options.onOptimisticReconciled || null
    };
    this.state = createInitialState();
    this.events = new EventTarget();
    this.loadingPromise = null;
    // Tracks seen ids across the batches of one refresh chain so the chain can
    // drop stale entries when it reaches authoritative coverage. Bookkeeping
    // only — state.allPages is always the display + pagination source.
    this.refreshSession = null;
  }

  subscribe(listener) {
    this.events.addEventListener('change', listener);
    return () => this.events.removeEventListener('change', listener);
  }

  // Allow callers to temporarily disable the lazy guard so a full eager warm-up
  // runs once (e.g. right after OAuth login, to drive a progress bar). The
  // warm-up loop self-resets this to true on completion so normal scroll-driven
  // fetching keeps the lazy optimization afterwards.
  setLazy(value) {
    this.options.lazy = Boolean(value);
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
    this.refreshSession = null;
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
        const active = this._activePagination(requestId);
        if (
          active.hasNextPage &&
          active.nextCursor &&
          this.state.allPages.length < this.options.maxItems
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

  // Effective pagination for the prefetch loop. state.allPages is always the
  // display + pagination source for normal operation, but during an in-flight
  // refresh chain the session carries the *fresh* cursor the loop must follow
  // — reconcilePagination collapses state.hasNextPage to false once state
  // reaches the (smaller) authoritative total, which would otherwise stop the
  // refresh before it has seen every authoritative batch. This is the single
  // narrow exception to "state is the source of truth"; it replaces the
  // buffer's separate pagination without the dual-data-source read overhead.
  _activePagination(requestId = this.state.requestId) {
    if (this.refreshSession?.requestId === requestId) {
      return {
        hasNextPage: this.refreshSession.hasNextPage,
        nextCursor: this.refreshSession.nextCursor
      };
    }
    return {
      hasNextPage: this.state.hasNextPage,
      nextCursor: this.state.nextCursor
    };
  }

  async loadMore(requestId = this.state.requestId) {
    if (this.loadingPromise) {
      return this.loadingPromise;
    }

    const active = this._activePagination(requestId);
    if (
      !this.options.getList ||
      !active.hasNextPage ||
      !active.nextCursor
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
        const previousCursor = active.nextCursor;
        const response = await this.options.getList(
          this.buildLoadMoreFetchOptions(previousCursor)
        );

        if (this.state.requestId !== requestId) {
          return createRefreshResult('skipped', {
            phase: 'load-more',
            reason: 'stale-request'
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

        // If this batch is part of an in-flight refresh chain, accumulate the
        // seen ids. When the chain reaches authoritative coverage, filter state
        // to the seen set — this is the only path that drops stale entries.
        if (this.refreshSession?.requestId === requestId) {
          this.refreshSession = this._advanceRefreshSession(response, this.refreshSession.total, requestId);
          if (this._refreshSessionHasCoverage(this.refreshSession)) {
            this._completeRefreshSession(requestId);
          }
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
      // Defensive reset: the eager path below restores lazy=true in its finally,
      // so this early-return path must too — otherwise a store that was flipped
      // to non-lazy and then back could drift. For an always-lazy store this is
      // a no-op.
      this.options.lazy = true;
      return this.getSnapshot();
    }

    try {
      while (
        this.state.requestId === requestId &&
        this._activePagination(requestId).hasNextPage &&
        this.state.allPages.length < this.options.maxItems
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
    } finally {
      // Restore lazy semantics for the rest of the session so scroll-driven
      // pagination keeps its lazy optimization afterwards.
      this.options.lazy = true;
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

    const { pages: nextPages, reconciledOptimisticUrls } =
      this.reconcilePages(response.pages, { preserveExistingCoverage });
    const nextPagination = this.reconcilePagination(response.pagination, nextPages, {
      preserveExistingCoverage
    });

    this.replaceData(nextPages, nextPagination, { requestId, dataState });

    // If optimistic tiles were resolved (real docs arrived), notify the caller
    // so it can clear the corresponding pending-save records from storage.
    if (reconciledOptimisticUrls.length > 0 && this.options.onOptimisticReconciled) {
      this.options.onOptimisticReconciled(reconciledOptimisticUrls);
    }

    return true;
  }

  applyFreshResponse(response, {
    requestId = this.state.requestId,
    preserveExistingCoverage = false,
    dataState = null
  } = {}) {
    if (this.state.requestId !== requestId || !Array.isArray(response?.pages)) {
      return false;
    }

    const authoritativeTotal = typeof response?.pagination?.total === 'number'
      ? response.pagination.total
      : response?.pages?.length || 0;

    // Merge the fresh batch into state by id. This is the core guarantee: a
    // refresh never shrinks state.allPages below current coverage — it only
    // adds new ids or replaces existing ones. reconcilePages (via
    // mergeListPages / upsertListPages) can only grow or replace-by-id.
    this.applyResponse(response, { requestId, preserveExistingCoverage, dataState });

    if (!preserveExistingCoverage) {
      this.refreshSession = null;
      return true;
    }

    // Fast path: state already holds exactly the authoritative set (e.g. a
    // broad warm cache whose total matches the fresh response). reconcilePages
    // has already collapsed hasNextPage via reconcilePagination's coverage
    // branch, so there's nothing more to fetch and no stale entries to drop.
    // Strict equality is required: if state has MORE pages than the total, the
    // extras may be stale entries the server no longer affirms, and the session
    // must run to discover which (the drops-stale case).
    const cappedAuthoritativeTotal = Math.min(authoritativeTotal, this.options.maxItems);
    if (this.state.allPages.length === cappedAuthoritativeTotal) {
      this.refreshSession = null;
      return true;
    }

    // Track seen ids across the prefetch batches that follow, so the chain can
    // drop stale entries when it reaches authoritative coverage. For a lazy
    // store that only fetches one batch, coverage is usually never reached and
    // the session is discarded on the next reset — no filtering, no stale-drop.
    this.refreshSession = this._advanceRefreshSession(response, authoritativeTotal, requestId);

    if (this._refreshSessionHasCoverage(this.refreshSession)) {
      this._completeRefreshSession(requestId);
    }
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

    this.refreshSession = null;
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

    // Reconcile optimistic tiles: when the real (enriched) doc for a pending
    // save arrives in the incoming list, drop the matching optimistic tile —
    // it has a synthetic id that won't collide with the real page's id, so
    // mergeListPages would otherwise leave it orphaned. Match by url.
    const incomingUrls = new Set(
      normalizedIncomingPages.map(p => p?.url).filter(Boolean)
    );

    // Track which optimistic tiles are being resolved (real doc arrived) so
    // the caller can clear the corresponding pending-save records.
    const reconciledOptimisticUrls = this.state.allPages
      .filter(p => p.optimistic === true && incomingUrls.has(p.url))
      .map(p => p.url);

    const survivingOptimistic = this.state.allPages.filter(
      p => p.optimistic === true && !incomingUrls.has(p.url)
    );

    let pages;
    if (!preserveExistingCoverage || this.state.allPages.length <= normalizedIncomingPages.length) {
      // Full replace, but keep optimistic tiles whose real doc hasn't arrived
      // yet (the incoming list may be a refresh that predates enrichment).
      // Tiles are prepended: they carry the newest saved_at, so they belong
      // above the incoming newest-first list.
      pages = [...survivingOptimistic, ...normalizedIncomingPages];
    } else {
      const merged = mergeListPages(normalizedIncomingPages, this.state.allPages, this.options.maxItems);
      // mergeListPages dedupes by id and preserves existing coverage; re-apply
      // the optimistic reconciliation so superseded tiles are stripped here too.
      pages = merged.filter(
        p => !(p.optimistic === true && incomingUrls.has(p.url))
      );
    }

    return { pages, reconciledOptimisticUrls };
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
    this.refreshSession = null;
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

  // Prepend an optimistic tile (a page captured at save time, before the
  // backend's async enrichment has written the real doc). The tile must carry
  // an `optimistic: true` flag so getUpdateAnchorItemId excludes it from
  // anchor selection — a synthetic optimistic id must never become the
  // incremental-sync anchor the backend won't recognize. Dedupes by id so a
  // re-save of the same URL replaces rather than stacks.
  //
  // Does NOT persist to the warm cache. Optimistic tiles are ephemeral —
  // persisting them would overwrite the real-pages cache with a single-tile
  // state (especially when the store hasn't hydrated yet, which would nuke
  // the entire cache). The warm cache is only written when real server data
  // arrives via applyResponse/replaceData.
  async prependOptimisticPage(page, { requestId = this.state.requestId } = {}) {
    if (!page?.id) {
      return this.getSnapshot();
    }

    const withoutExisting = this.state.allPages.filter(p => p.id !== page.id);
    const nextPages = [{ ...page, optimistic: true }, ...withoutExisting];
    this.replaceData(nextPages, {
      total: this.state.total,
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
      // Optimistic tiles carry a synthetic id the backend won't recognize, so
      // they must never become the incremental-sync anchor — skip them.
      if (!page?.id || page.optimistic === true) {
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

  // Create or extend the per-refresh-chain session that tracks seen ids across
  // batches. Bookkeeping only — state.allPages remains the display source; the
  // session exists so _completeRefreshSession can drop stale entries when the
  // chain reaches authoritative coverage.
  _advanceRefreshSession(response, fallbackTotal, requestId) {
    const pages = Array.isArray(response?.pages) ? response.pages : [];
    const existing = this.refreshSession?.requestId === requestId
      ? this.refreshSession
      : {
        requestId,
        accumulatedPages: [],
        total: null,
        hasNextPage: false,
        nextCursor: null
      };

    existing.accumulatedPages = upsertListPages(
      existing.accumulatedPages,
      pages,
      this.options.maxItems
    );
    existing.total = typeof response?.pagination?.total === 'number'
      ? response.pagination.total
      : fallbackTotal;
    existing.hasNextPage = response?.pagination?.hasNextPage === true;
    existing.nextCursor = existing.hasNextPage
      ? response?.pagination?.nextCursor || null
      : null;
    return existing;
  }

  // True when the chain has fetched the full authoritative set: the accumulated
  // pages meet the (capped) total AND the server reports no next page. This is
  // the only condition under which a refresh drops stale entries — until it
  // holds, the refresh can only add/replace-by-id.
  _refreshSessionHasCoverage(session) {
    if (!session || session.hasNextPage) {
      return false;
    }
    const cappedTotal = typeof session.total === 'number'
      ? Math.min(session.total, this.options.maxItems)
      : null;
    return cappedTotal === null
      ? true
      : session.accumulatedPages.length >= cappedTotal;
  }

  // Replace state with the accumulated authoritative set, dropping any cached
  // pages the refresh chain never saw. The only path that shrinks the list,
  // and it only fires when the server has affirmed the full set.
  _completeRefreshSession(requestId) {
    const session = this.refreshSession;
    if (!session || session.requestId !== requestId) {
      return;
    }

    this.refreshSession = null;
    this.replaceData(
      session.accumulatedPages.slice(0, this.options.maxItems),
      {
        total: session.total,
        hasNextPage: session.hasNextPage,
        nextCursor: session.nextCursor
      },
      { requestId }
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

    // Optimistic tiles are ephemeral — they exist only to bridge the gap
    // between save and enrichment. Persisting them to the warm cache would
    // serve unenriched placeholders on cold starts, so strip them here.
    const realPages = this.state.allPages.filter(p => p.optimistic !== true);

    await this.api.setCachedPages(
      buildListCachePayload(
        realPages,
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
