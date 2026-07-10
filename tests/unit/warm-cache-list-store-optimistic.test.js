import { describe, it, expect, vi } from 'vitest';

import { WarmCacheListStore } from '../../src/warm-cache-list-store.js';

function createStore() {
  const api = {
    isExtension: true,
    getCachedPages: vi.fn(async () => null),
    setCachedPages: vi.fn(async () => {})
  };
  const store = new WarmCacheListStore(api, {
    initialFetchLimit: 50,
    prefetchBatchLimit: 100,
    warmCacheScope: { surface: 'test' },
    buildInitialFetchOptions: () => ({ limit: 50, sort: 'newest' }),
    buildUpdateCheckOptions: (latestKnownId) => ({ sort: 'newest', latestKnownId })
  });
  return { api, store };
}

function realPage(n) {
  return {
    id: `real-${n}`,
    url: `https://example.com/${n}`,
    title: `Real ${n}`,
    saved_at: `2026-07-09T10:00:0${n}.000Z`,
    pinned: false
  };
}

function optimisticPage(url, savedAt = '2026-07-09T11:00:00.000Z') {
  return {
    id: `optimistic:${url}`,
    url,
    title: 'Pending',
    saved_at: savedAt,
    pinned: false,
    optimistic: true
  };
}

async function seed(store, pages) {
  await store.setPages(pages, { total: pages.length, hasNextPage: false, nextCursor: null });
}

describe('WarmCacheListStore optimistic tiles', () => {
  it('prependOptimisticPage adds the tile at the front and marks it optimistic', async () => {
    const { store } = createStore();
    await seed(store, [realPage(1), realPage(2)]);

    await store.prependOptimisticPage(optimisticPage('https://example.com/new'));

    const snap = store.getSnapshot();
    expect(snap.allPages).toHaveLength(3);
    expect(snap.allPages[0].url).toBe('https://example.com/new');
    expect(snap.allPages[0].optimistic).toBe(true);
  });

  it('force-overwrites optimistic:true even if the caller forgot the flag', async () => {
    const { store } = createStore();
    await seed(store, [realPage(1)]);

    // caller passes a page without the optimistic flag
    await store.prependOptimisticPage({ id: 'optimistic:https://x.com/y', url: 'https://x.com/y', saved_at: '2026-07-09T11:00:00.000Z' });

    expect(store.getSnapshot().allPages[0].optimistic).toBe(true);
  });

  it('dedupes by id so a re-save of the same URL replaces rather than stacks', async () => {
    const { store } = createStore();
    await seed(store, [realPage(1)]);

    const first = optimisticPage('https://example.com/dup', '2026-07-09T11:00:00.000Z');
    first.title = 'First';
    await store.prependOptimisticPage(first);

    const second = optimisticPage('https://example.com/dup', '2026-07-09T11:00:01.000Z');
    second.title = 'Second';
    await store.prependOptimisticPage(second);

    const snap = store.getSnapshot();
    const optimisticTiles = snap.allPages.filter(p => p.optimistic);
    expect(optimisticTiles).toHaveLength(1);
    expect(optimisticTiles[0].title).toBe('Second');
  });

  it('getUpdateAnchorItemId skips optimistic tiles (never the incremental-sync anchor)', async () => {
    const { store } = createStore();
    // optimistic tile has the newest saved_at, but must NOT be picked as anchor
    await seed(store, [realPage(1), realPage(2)]);
    await store.prependOptimisticPage(optimisticPage('https://example.com/newer', '2026-07-09T12:00:00.000Z'));

    const anchorId = store.getUpdateAnchorItemId();
    // anchor is a real id, not the optimistic synthetic id
    expect(anchorId).toMatch(/^real-/);
    expect(anchorId).not.toMatch(/^optimistic:/);
  });

  it('persistWarmCache does not write optimistic tiles to the warm cache', async () => {
    const { api, store } = createStore();
    await seed(store, [realPage(1)]);
    await store.prependOptimisticPage(optimisticPage('https://example.com/pending'));

    // Explicit persist — filter should strip the optimistic tile.
    await store.persistWarmCache();

    expect(api.setCachedPages).toHaveBeenCalled();
    const payload = api.setCachedPages.mock.calls.at(-1)[0];
    const cachedUrls = payload.pages.map(p => p.url);
    expect(cachedUrls).toContain('https://example.com/1');
    expect(cachedUrls).not.toContain('https://example.com/pending');
  });

  it('prependOptimisticPage does NOT persist to the warm cache (regression)', async () => {
    const { api, store } = createStore();
    await seed(store, [realPage(1), realPage(2)]);

    // Clear the mock calls from seed
    api.setCachedPages.mockClear();

    await store.prependOptimisticPage(optimisticPage('https://example.com/new'));

    // prependOptimisticPage must not trigger a warm-cache write — otherwise
    // adding a tile to an un-hydrated store would nuke the real-pages cache.
    expect(api.setCachedPages).not.toHaveBeenCalled();
  });
});

describe('WarmCacheListStore optimistic reconciliation on fetch', () => {
  function createStore({ onOptimisticReconciled } = {}) {
    const api = {
      isExtension: true,
      getCachedPages: vi.fn(async () => null),
      setCachedPages: vi.fn(async () => {})
    };
    const store = new WarmCacheListStore(api, {
      initialFetchLimit: 50,
      prefetchBatchLimit: 100,
      warmCacheScope: { surface: 'test' },
      getList: vi.fn(),
      onOptimisticReconciled,
      buildInitialFetchOptions: () => ({ limit: 50, sort: 'newest' }),
      buildUpdateCheckOptions: (latestKnownId) => ({ sort: 'newest', latestKnownId })
    });
    return { api, store };
  }

  // Drive a fetch through applyResponse so reconcilePages runs.
  async function applyList(store, pages) {
    store.applyResponse(
      { pages, pagination: { total: pages.length, hasNextPage: false, nextCursor: null } },
      { requestId: store.state.requestId }
    );
  }

  it('keeps the optimistic tile when a refresh returns a list without the real doc yet', async () => {
    const { store } = createStore();
    // initial real list
    await store.setPages(
      [{ id: 'real-1', url: 'https://example.com/1', title: 'Real 1', saved_at: '2026-07-09T10:00:00.000Z', pinned: false }],
      { total: 1, hasNextPage: false, nextCursor: null }
    );
    await store.prependOptimisticPage(optimisticPage('https://example.com/new'));

    // a refresh returns the same old list (enrichment not complete)
    await applyList(store, [{ id: 'real-1', url: 'https://example.com/1', title: 'Real 1', saved_at: '2026-07-09T10:00:00.000Z', pinned: false }]);

    const snap = store.getSnapshot();
    // optimistic tile survives
    expect(snap.allPages.filter(p => p.optimistic)).toHaveLength(1);
    expect(snap.allPages.find(p => p.optimistic).url).toBe('https://example.com/new');
  });

  it('drops the optimistic tile when the real doc with the same url arrives', async () => {
    const { store } = createStore();
    await store.setPages(
      [{ id: 'real-1', url: 'https://example.com/1', title: 'Real 1', saved_at: '2026-07-09T10:00:00.000Z', pinned: false }],
      { total: 1, hasNextPage: false, nextCursor: null }
    );
    await store.prependOptimisticPage(optimisticPage('https://example.com/enriched'));

    // the real doc for the pending url arrives
    await applyList(store, [
      { id: 'real-enriched', url: 'https://example.com/enriched', title: 'Real Enriched', saved_at: '2026-07-09T11:00:00.000Z', pinned: false, ai_summary_brief: 'summary' },
      { id: 'real-1', url: 'https://example.com/1', title: 'Real 1', saved_at: '2026-07-09T10:00:00.000Z', pinned: false }
    ]);

    const snap = store.getSnapshot();
    // optimistic tile is gone, replaced by the real doc
    expect(snap.allPages.filter(p => p.optimistic)).toHaveLength(0);
    expect(snap.allPages.find(p => p.id === 'real-enriched')).toBeDefined();
    expect(snap.allPages.find(p => p.id === 'real-enriched').ai_summary_brief).toBe('summary');
  });

  it('calls onOptimisticReconciled with the resolved URL when the real doc arrives', async () => {
    const onOptimisticReconciled = vi.fn();
    const { store } = createStore({ onOptimisticReconciled });
    await store.setPages(
      [{ id: 'real-1', url: 'https://example.com/1', saved_at: '2026-07-09T10:00:00.000Z', pinned: false }],
      { total: 1, hasNextPage: false, nextCursor: null }
    );
    await store.prependOptimisticPage(optimisticPage('https://example.com/reconciled'));

    // real doc arrives — should trigger the callback
    await applyList(store, [
      { id: 'real-r', url: 'https://example.com/reconciled', saved_at: '2026-07-09T11:00:00.000Z', pinned: false },
      { id: 'real-1', url: 'https://example.com/1', saved_at: '2026-07-09T10:00:00.000Z', pinned: false }
    ]);

    expect(onOptimisticReconciled).toHaveBeenCalledTimes(1);
    expect(onOptimisticReconciled).toHaveBeenCalledWith(['https://example.com/reconciled']);
  });

  it('does NOT call onOptimisticReconciled when no optimistic tiles are resolved', async () => {
    const onOptimisticReconciled = vi.fn();
    const { store } = createStore({ onOptimisticReconciled });
    await store.setPages(
      [{ id: 'real-1', url: 'https://example.com/1', saved_at: '2026-07-09T10:00:00.000Z', pinned: false }],
      { total: 1, hasNextPage: false, nextCursor: null }
    );

    // no optimistic tiles at all
    await applyList(store, [
      { id: 'real-1', url: 'https://example.com/1', saved_at: '2026-07-09T10:00:00.000Z', pinned: false }
    ]);

    expect(onOptimisticReconciled).not.toHaveBeenCalled();
  });
});
