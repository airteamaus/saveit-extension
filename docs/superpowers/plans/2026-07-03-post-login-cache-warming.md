# Post-login Cache Warming with Progress Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the bare "Sign in to browse saved pages" panel with a warming-up state (digging dog + determinate progress bar showing percentage) right after OAuth login, while the All-pages cache warms fully.

**Architecture:** The All-pages `WarmCacheListStore` stays `lazy: true` for normal browsing. On OAuth sign-in, `handleSignedIn` flips the store to non-lazy via a new `setLazy(false)` method so the existing `prefetchAllPages()` loop runs to completion; the store self-resets `lazy = true` when the loop ends. The store already emits per-batch `change` events carrying `allPages.length` and `total`, so a new warming subscriber reads those snapshots and updates a determinate progress bar in the drawer. A new `renderWarmingState` renderer paints the digging dog plus the bar. On completion the bar holds at 100% for ~300ms, then the existing results-render path takes over.

**Tech Stack:** Vanilla JS (browser extension), Vitest (unit tests), Playwright (E2E), existing WarmCacheListStore + drawer-renderer patterns.

**Spec:** `docs/superpowers/specs/2026-07-03-post-login-cache-warming-design.md`

---

## File Structure

**Modify:**
- `src/warm-cache-list-store.js` — add `setLazy(value)`; make `prefetchAllPages()` self-reset `lazy = true` on completion / early-return.
- `src/newtab-drawer-renderer.js` — add `renderWarmingState({ percent, indeterminate })`; export it.
- `src/newtab-drawer-sync-lifecycle.js` — in `handleSignedIn`, call `savedPagesStore.setLazy(false)` before triggering the load.
- `src/newtab-drawer-sync-observers.js` — extend `createDrawerStoreSubscriptions` so the saved-pages subscriber drives the warming UI while it is active, including the ~300ms completion pause.
- `src/newtab-drawer-sync.js` — accept `renderDrawerWarmingState`, forward it to the store-subscriptions factory.
- `src/newtab-drawer-runtime.js` — add the `renderDrawerWarmingState` wrapper; thread it into the coordinator and the data controller.
- `src/newtab-drawer-ui.js` — add the `renderWarmingState` wrapper exposing the renderer method.
- `src/newtab.css` — add `.saved-pages-warming-pane` and `.saved-pages-warming-bar*` rules reusing existing tokens.
- `src/newtab-drawer-data.js` — accept `renderDrawerWarmingState` factory param; use it instead of `renderDrawerLoadingState` on the cold post-login path when warming is active.

**Create / extend tests:**
- `tests/unit/warm-cache-list-store.test.js` — extend with `setLazy` + self-reset coverage.
- `tests/unit/newtab-drawer-renderer.test.js` — extend with `renderWarmingState` coverage.
- `tests/unit/newtab-drawer-sync-observers.test.js` — extend with warming-subscriber coverage.

---

## Task 1: Add `setLazy` and self-resetting `prefetchAllPages` to the store

**Files:**
- Modify: `src/warm-cache-list-store.js` (constructor options ~line 149; `prefetchAllPages` ~line 547-573)
- Test: `tests/unit/warm-cache-list-store.test.js`

- [ ] **Step 1: Write the failing tests**

Append to `tests/unit/warm-cache-list-store.test.js` (inside the top-level `describe('WarmCacheListStore', ...)` block, after the existing `'does not prefetch beyond the initial batch when lazy...'` test):

```js
it('setLazy(false) makes a lazy store run the full prefetch on hydrate', async () => {
  const firstBatch = makePages(50);
  const secondBatch = makePages(40, 51);
  const getList = vi
    .fn()
    .mockResolvedValueOnce({
      pages: firstBatch,
      pagination: { total: 90, hasNextPage: true, nextCursor: 'page-50' },
      meta: { fromCache: false }
    })
    .mockResolvedValueOnce({
      pages: secondBatch,
      pagination: { total: 90, hasNextPage: false, nextCursor: null },
      meta: { fromCache: false }
    });
  const { store } = createStore({ getList }, { lazy: true });

  store.setLazy(false);
  await store.hydrate();
  await vi.waitFor(() => {
    expect(store.getSnapshot().allPages).toHaveLength(90);
  });

  expect(getList).toHaveBeenCalledTimes(2);
});

it('prefetchAllPages resets lazy back to true after completing', async () => {
  const firstBatch = makePages(50);
  const secondBatch = makePages(40, 51);
  const getList = vi
    .fn()
    .mockResolvedValueOnce({
      pages: firstBatch,
      pagination: { total: 90, hasNextPage: true, nextCursor: 'page-50' },
      meta: { fromCache: false }
    })
    .mockResolvedValueOnce({
      pages: secondBatch,
      pagination: { total: 90, hasNextPage: false, nextCursor: null },
      meta: { fromCache: false }
    });
  const { store } = createStore({ getList }, { lazy: true });

  store.setLazy(false);
  await store.hydrate();
  await vi.waitFor(() => {
    expect(store.getSnapshot().allPages).toHaveLength(90);
  });

  // After the warm completes, the lazy flag must be restored so subsequent
  // visits / scroll-driven fetches keep the lazy optimization.
  expect(store.options.lazy).toBe(true);
});

it('prefetchAllPages resets lazy to true even on the lazy early-return path', async () => {
  const firstBatch = makePages(50);
  const getList = vi.fn().mockResolvedValueOnce({
    pages: firstBatch,
    pagination: { total: 90, hasNextPage: true, nextCursor: 'page-50' },
    meta: { fromCache: false }
  });
  const { store } = createStore({ getList }, { lazy: true });

  // Leave lazy true; calling prefetchAllPages directly hits the early return.
  await store.prefetchAllPages();

  expect(store.options.lazy).toBe(true);
});

it('does not change the lazy flag when setLazy is not called (regression guard)', async () => {
  const firstBatch = makePages(50);
  const getList = vi.fn().mockResolvedValueOnce({
    pages: firstBatch,
    pagination: { total: 90, hasNextPage: true, nextCursor: 'page-50' },
    meta: { fromCache: false }
  });
  const { store } = createStore({ getList }, { lazy: true });

  await store.hydrate();
  await new Promise(resolve => setTimeout(resolve, 0));

  // A lazy store that was never opted out must stay lazy.
  expect(store.options.lazy).toBe(true);
  expect(store.getSnapshot().allPages).toHaveLength(50);
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/unit/warm-cache-list-store.test.js`
Expected: FAIL — `store.setLazy is not a function` (first three tests); the fourth should already PASS (regression guard).

- [ ] **Step 3: Add `setLazy` method**

In `src/warm-cache-list-store.js`, add this method to the `WarmCacheListStore` class immediately after the `subscribe` method (which ends at ~line 182, just before `emitChange`):

```js
  // Allow callers to temporarily disable the lazy guard so a full eager warm-up
  // runs once (e.g. right after OAuth login, to drive a progress bar). The
  // warm-up loop self-resets this to true on completion so normal scroll-driven
  // fetching keeps the lazy optimization afterwards.
  setLazy(value) {
    this.options.lazy = Boolean(value);
  }
```

- [ ] **Step 4: Make `prefetchAllPages` self-reset lazy on every exit path**

In `src/warm-cache-list-store.js`, replace the entire `prefetchAllPages` method (currently lines ~547-573) with:

```js
  async prefetchAllPages(requestId = this.state.requestId) {
    // Lazy stores fetch only the initial batch; further fetching is driven by
    // explicit loadMore() calls (e.g. on scroll). This keeps large libraries
    // from hydrating in full on first paint.
    if (this.options.lazy) {
      // Keep the flag honest: a store that opted out via setLazy(false) and
      // then re-entered this early return (e.g. reset back to lazy) still
      // ends up lazy afterwards. A store that was always lazy is a no-op.
      this.options.lazy = true;
      return this.getSnapshot();
    }

    try {
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
    } finally {
      // Restore lazy semantics for the rest of the session so scroll-driven
      // pagination keeps the optimization from commit #15.
      this.options.lazy = true;
    }

    return this.getSnapshot();
  }
```

Note: the `try/finally` ensures the reset happens on success, on `break`, and if `loadMore` throws. The early-return branch above also resets (a no-op for always-lazy stores, but correct if a caller flipped the flag back to true before the loop ran).

- [ ] **Step 5: Run tests to verify they pass**

Run: `npx vitest run tests/unit/warm-cache-list-store.test.js`
Expected: PASS — all tests green, including the four new ones.

- [ ] **Step 6: Commit**

```bash
git add src/warm-cache-list-store.js tests/unit/warm-cache-list-store.test.js
git commit -m "Add setLazy + self-resetting prefetch for post-login warm-up

WarmCacheListStore.setLazy(false) lets a normally-lazy store run a full
eager warm-up once (for the post-login progress bar). prefetchAllPages
self-resets lazy=true via try/finally so scroll-driven pagination keeps
its optimization for the rest of the session."
```

---

## Task 2: Add `renderWarmingState` to the drawer renderer

**Files:**
- Modify: `src/newtab-drawer-renderer.js` (add method ~line 256, after `renderLoadingState`; export it ~line 543)
- Test: `tests/unit/newtab-drawer-renderer.test.js`

- [ ] **Step 1: Write the failing tests**

Append a new `describe` block at the end of `tests/unit/newtab-drawer-renderer.test.js`:

```js
describe('newtab drawer renderer warming state', () => {
  it('renders the digging dog plus a determinate progress bar', () => {
    const { resultsContainer, renderer } = createRenderer();

    renderer.renderWarmingState({ percent: 19 });

    const html = resultsContainer.innerHTML;
    expect(html).toContain('saved-pages-warming-pane');
    expect(html).toContain('loading-dog-body');
    expect(html).toContain('saved-pages-warming-bar');
    expect(html).toContain('19%');
  });

  it('clamps the bar width to the given percentage', () => {
    const { resultsContainer, renderer } = createRenderer();

    renderer.renderWarmingState({ percent: 42 });

    const bar = resultsContainer.querySelector('.saved-pages-warming-bar-fill');
    expect(bar.style.width).toBe('42%');
  });

  it('renders an indeterminate bar (no % text) when indeterminate is true', () => {
    const { resultsContainer, renderer } = createRenderer();

    renderer.renderWarmingState({ indeterminate: true });

    const html = resultsContainer.innerHTML;
    expect(html).toContain('saved-pages-warming-bar');
    expect(html).toContain('saved-pages-warming-bar-indeterminate');
    expect(html).not.toMatch(/\d+%/);
  });

  it('invokes renderChrome so surrounding chrome stays consistent', () => {
    const renderChrome = vi.fn();
    const resultsContainer = document.createElement('div');
    const renderer = createDrawerRenderer({
      documentObj: document,
      resultsContainer,
      getRenderLimit: () => Number.POSITIVE_INFINITY,
      renderChrome,
      getProjectPills: () => [],
      isProjectsUnavailable: () => false,
      getProjectScopeLabel: () => 'All pages'
    });

    renderer.renderWarmingState({ percent: 5 });

    expect(renderChrome).toHaveBeenCalledTimes(1);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/unit/newtab-drawer-renderer.test.js`
Expected: FAIL — `renderer.renderWarmingState is not a function`.

- [ ] **Step 3: Implement `renderWarmingState`**

In `src/newtab-drawer-renderer.js`, add this method immediately after `renderLoadingState` (which ends at ~line 256, just before `renderErrorState`):

```js
  // Post-login warming state: the digging dog plus a determinate progress bar.
  // Replaces the sign-in / bare-loading panel while the cache warms fully.
  // `percent` is a 0-100 integer; when `indeterminate` is true (e.g. the server
  // has not yet returned a total) no percentage is shown and the bar gets the
  // indeterminate modifier class for a shimmer animation.
  function renderWarmingState({ percent = 0, indeterminate = false } = {}) {
    const clampedPercent = Math.max(0, Math.min(100, Math.round(percent)));
    const barFillStyle = `width: ${clampedPercent}%`;
    const barClass = indeterminate
      ? 'saved-pages-warming-bar saved-pages-warming-bar-indeterminate'
      : 'saved-pages-warming-bar';
    const percentLabel = indeterminate ? '' : `<span class="saved-pages-warming-percent">${clampedPercent}%</span>`;

    renderDrawerState(`
      <div class="saved-pages-semantic-loading saved-pages-semantic-loading-pane saved-pages-warming-pane" aria-live="polite">
        ${LOADING_ILLUSTRATION_SVG}
        <div class="saved-pages-warming-copy">Gathering your saved pages…</div>
        <div class="${barClass}" role="progressbar" aria-valuemin="0" aria-valuemax="100"${indeterminate ? '' : ` aria-valuenow="${clampedPercent}"`}>
          <div class="saved-pages-warming-bar-fill" style="${barFillStyle}"></div>
        </div>
        ${percentLabel}
      </div>
    `);
  }
```

- [ ] **Step 4: Export `renderWarmingState`**

In the `return { ... }` statement at the end of `createDrawerRenderer` (~line 536-547), add `renderWarmingState,` to the list (alphabetically near `renderSemanticResults`):

```js
  return {
    clearPagesSection,
    refreshCard,
    renderEmptyState,
    renderErrorState,
    renderHomeView,
    renderLoadingState,
    renderResults,
    renderSemanticLoadingState,
    renderSemanticResults,
    renderSignInState,
    renderWarmingState
  };
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npx vitest run tests/unit/newtab-drawer-renderer.test.js`
Expected: PASS — all tests green.

- [ ] **Step 6: Commit**

```bash
git add src/newtab-drawer-renderer.js tests/unit/newtab-drawer-renderer.test.js
git commit -m "Add renderWarmingState: dog + determinate progress bar

New drawer state for the post-login warming moment. Reuses the digging
dog illustration above a progress bar; shows a percentage when
determinate, or a shimmer bar (no %) when the total is unknown."
```

---

## Task 3: Add CSS for the warming pane and progress bar

**Files:**
- Modify: `src/newtab.css` (append after the `.saved-pages-semantic-loading-image` block, ~line 948)

- [ ] **Step 1: Add the CSS rules**

In `src/newtab.css`, append this block immediately after the `.saved-pages-semantic-loading-image { ... }` rule (which ends around line 948):

```css
/* Post-login warming state: the digging dog plus a determinate progress bar.
   Sits inside .saved-pages-semantic-loading-pane so it inherits the pane's
   vertical centering and min-height. */
.saved-pages-warming-pane {
  gap: 4px;
}

.saved-pages-warming-copy {
  color: var(--color-text-light);
  font-size: var(--font-size-xl);
  margin-top: var(--spacing-sm);
}

.saved-pages-warming-bar {
  width: 320px;
  max-width: 80%;
  height: 6px;
  background: var(--color-border);
  border-radius: var(--radius-full);
  overflow: hidden;
  margin-top: var(--spacing-md);
  position: relative;
}

.saved-pages-warming-bar-fill {
  height: 100%;
  background: var(--color-primary);
  border-radius: var(--radius-full);
  transition: width 0.4s ease;
}

.saved-pages-warming-percent {
  color: var(--color-text-light);
  font-size: var(--font-size-md);
  margin-top: var(--spacing-xs);
  font-variant-numeric: tabular-nums;
}

/* Indeterminate variant: a shimmer sweeps across an empty track when the
   server hasn't returned a total yet. Disabled under reduced-motion. */
.saved-pages-warming-bar-indeterminate .saved-pages-warming-bar-fill {
  width: 40% !important;
  background: linear-gradient(
    90deg,
    transparent 0%,
    var(--color-primary) 50%,
    transparent 100%
  );
  animation: saved-pages-warming-shimmer 1.2s ease-in-out infinite;
}

@media (prefers-reduced-motion: reduce) {
  .saved-pages-warming-bar-fill {
    transition: none;
  }
  .saved-pages-warming-bar-indeterminate .saved-pages-warming-bar-fill {
    animation: none;
    background: var(--color-primary);
    opacity: 0.5;
  }
}

@keyframes saved-pages-warming-shimmer {
  0% { transform: translateX(-100%); }
  100% { transform: translateX(250%); }
}
```

- [ ] **Step 2: Lint the CSS**

Run: `npx stylelint "src/**/*.css"`
Expected: no errors.

- [ ] **Step 3: Check formatting**

Run: `npx prettier --check "src/**/*.css"`
Expected: all files pass. If it reports `newtab.css`, run `npx prettier --write "src/newtab.css"` and re-check.

- [ ] **Step 4: Commit**

```bash
git add src/newtab.css
git commit -m "Add warming pane + progress bar styles

Reuses existing tokens (color-primary fill, color-border track,
radius-full pill). Indeterminate variant uses a shimmer sweep,
disabled under prefers-reduced-motion."
```

---

## Task 4: Wire `setLazy(false)` into `handleSignedIn`

**Files:**
- Modify: `src/newtab-drawer-sync-lifecycle.js` (the `handleSignedIn` function, ~line 50-66)
- Test: `tests/unit/newtab-drawer-sync-lifecycle.test.js`

Note: the existing tests in this file build `savedPagesStore` as a plain inline object (no helper), so the new test must do the same and include `setLazy: vi.fn()` on that object.

- [ ] **Step 1: Write the failing test**

Append this test inside the top-level `describe('drawer sync lifecycle', ...)` block in `tests/unit/newtab-drawer-sync-lifecycle.test.js`:

```js
it('flips the saved-pages store to non-lazy on sign-in so the warm-up runs fully', async () => {
  const savedPagesStore = {
    hydrate: vi.fn().mockResolvedValue(undefined),
    reset: vi.fn(),
    setLazy: vi.fn()
  };
  const lifecycle = createDrawerSyncLifecycle({
    api: { getSavedPages: vi.fn(), isExtension: true },
    state: { hasInitialized: false },
    savedPagesStore,
    projectsStore: { reset: vi.fn() },
    getCurrentUser: vi.fn(() => ({ uid: 'u1' })),
    isDrawerOpen: vi.fn(() => true),
    getSearchQuery: vi.fn(() => ''),
    notifySavedPagesTotalChange: vi.fn(),
    loadDrawerResults: vi.fn().mockResolvedValue(undefined),
    renderDrawerSignInState: vi.fn(),
    resetDrawerState: vi.fn(),
    setSuppressSavedPagesStoreSync: vi.fn()
  });

  await lifecycle.handleSignedIn();

  expect(savedPagesStore.setLazy).toHaveBeenCalledWith(false);
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run tests/unit/newtab-drawer-sync-lifecycle.test.js`
Expected: FAIL — `savedPagesStore.setLazy is not a function` (production code calls it but the production method doesn't exist yet from the test's perspective; once Task 1 lands this is already true, but this test asserts the *call*). If Task 1 is already merged, this test should FAIL only because the call hasn't been added to `handleSignedIn` yet — `expected setLazy to have been called with false`.

- [ ] **Step 3: Add the `setLazy(false)` call**

In `src/newtab-drawer-sync-lifecycle.js`, edit the `handleSignedIn` function. Replace its body (currently lines 50-66) with:

```js
  async function handleSignedIn() {
    // A one-time full eager warm-up drives the post-login progress bar. The
    // store self-resets lazy=true when the warm-up finishes, so this only
    // affects the current sign-in moment.
    savedPagesStore.setLazy(false);

    if (isDrawerOpen()) {
      if (state.hasInitialized) {
        await loadDrawerResults(getSearchQuery(), { syncUrl: false });
        return;
      }

      state.hasInitialized = false;
      savedPagesStore.reset({ emit: false });
      await loadDrawerResults(getSearchQuery(), { syncUrl: false });
      return;
    }

    state.hasInitialized = false;
    savedPagesStore.reset({ emit: false });
    await loadSummary();
  }
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/unit/newtab-drawer-sync-lifecycle.test.js`
Expected: PASS — all tests green, including the new one.

- [ ] **Step 5: Commit**

```bash
git add src/newtab-drawer-sync-lifecycle.js tests/unit/newtab-drawer-sync-lifecycle.test.js
git commit -m "Flip saved-pages store to non-lazy on sign-in

handleSignedIn calls setLazy(false) so prefetchAllPages runs to
completion once, driving the post-login progress bar. The store
self-resets lazy=true afterwards."
```

---

## Task 5: Drive the warming UI from the saved-pages store subscriber

This is the central wiring task: while the warming UI is active, every store `change` event updates the progress bar; on completion, hold at 100% for ~300ms, then hand off to results rendering.

The renderer is threaded through the existing wrapper pattern (the same way `renderDrawerSignInState` already flows today): `newtab-drawer-ui.js` exposes `renderWarmingState`, `newtab-drawer-runtime.js` wraps it as `renderDrawerWarmingState`, the coordinator accepts and forwards it, and `createDrawerStoreSubscriptions` consumes it.

**Files:**
- Modify: `src/newtab-drawer-sync-observers.js` (extend `createDrawerStoreSubscriptions`)
- Modify: `src/newtab-drawer-sync.js` (accept `renderDrawerWarmingState`, forward it)
- Modify: `src/newtab-drawer-runtime.js` (add `renderDrawerWarmingState` wrapper, thread into the coordinator call)
- Modify: `src/newtab-drawer-ui.js` (add `renderWarmingState` wrapper exposing the renderer method)
- Test: `tests/unit/newtab-drawer-sync-observers.test.js`

- [ ] **Step 1: Write the failing tests**

Append to `tests/unit/newtab-drawer-sync-observers.test.js`, inside the top-level describe (or as a new sibling describe block — match the file's existing structure):

```js
describe('createDrawerStoreSubscriptions warming UI', () => {
  function createWarmingHarness({ snapshot, drawerOpen = true } = {}) {
    const savedPagesStore = {
      _listeners: [],
      subscribe(listener) {
        this._listeners.push(listener);
        return () => {
          this._listeners = this._listeners.filter(l => l !== listener);
        };
      },
      emit() {
        this._listeners.forEach(l => l());
      },
      getSnapshot: () => snapshot
    };
    const renderedStates = [];
    const renderWarmingState = vi.fn(opts => renderedStates.push(opts));
    const timers = { setTimeout: vi.fn((fn) => { fn(); return 0; }), clearTimeout: vi.fn() };
    const api = { isExtension: true };
    const getCurrentUser = () => ({ uid: 'u1' });
    const state = { hasInitialized: true, query: '' };
    const syncDrawerStateFromStore = vi.fn();
    const notifySavedPagesTotalChange = vi.fn();

    const { initStoreSubscriptions } = createDrawerStoreSubscriptions({
      api,
      state,
      savedPagesStore,
      projectsStore: { subscribe: () => () => {} },
      getCurrentUser,
      isDrawerOpen: () => drawerOpen,
      getSuppressSavedPagesStoreSync: () => false,
      notifySavedPagesTotalChange,
      syncDrawerStateFromStore,
      syncProjectsStateFromStore: vi.fn(),
      renderWarmingState,
      timers
    });
    initStoreSubscriptions();

    return { savedPagesStore, renderWarmingState, renderedStates, syncDrawerStateFromStore };
  }

  it('renders the warming bar with a percentage derived from allPages/total', () => {
    const harness = createWarmingHarness({
      snapshot: {
        allPages: Array.from({ length: 24 }, (_, i) => ({ id: `p${i}` })),
        total: 80,
        refreshState: { status: 'loading', phase: 'prefetch', reason: null }
      }
    });

    harness.savedPagesStore.emit();

    expect(harness.renderWarmingState).toHaveBeenCalled();
    // 24 / 80 = 30%
    expect(harness.renderedStates.at(-1)).toEqual(expect.objectContaining({ percent: 30 }));
  });

  it('renders indeterminate when total is unknown (0 or null) on the first batch', () => {
    const harness = createWarmingHarness({
      snapshot: {
        allPages: [{ id: 'p1' }],
        total: 0,
        refreshState: { status: 'loading', phase: 'prefetch', reason: null }
      }
    });

    harness.savedPagesStore.emit();

    expect(harness.renderedStates.at(-1)).toEqual(expect.objectContaining({ indeterminate: true }));
  });

  it('clamps the percentage and never decreases once determinate', () => {
    const harness = createWarmingHarness({
      snapshot: {
        allPages: Array.from({ length: 40 }, (_, i) => ({ id: `p${i}` })),
        total: 80,
        refreshState: { status: 'loading', phase: 'prefetch', reason: null }
      }
    });

    harness.savedPagesStore.emit(); // 50%
    // Next batch reports a smaller numerator temporarily (e.g. dedupe) — must
    // not regress the displayed percentage.
    harness.savedPagesStore.getSnapshot = () => ({
      allPages: Array.from({ length: 30 }, (_, i) => ({ id: `p${i}` })),
      total: 80,
      refreshState: { status: 'loading', phase: 'prefetch', reason: null }
    });
    harness.savedPagesStore.emit();

    expect(harness.renderedStates.at(-1).percent).toBe(50);
  });

  it('on completion, holds at 100% then hands off to results rendering', () => {
    const harness = createWarmingHarness({
      snapshot: {
        allPages: Array.from({ length: 80 }, (_, i) => ({ id: `p${i}` })),
        total: 80,
        refreshState: { status: 'idle', phase: 'prefetch', reason: 'complete' }
      }
    });

    harness.savedPagesStore.emit();

    // Final warming render is at 100%.
    expect(harness.renderedStates.at(-1)).toEqual(expect.objectContaining({ percent: 100 }));
    // After the (faked, synchronous) ~300ms timer fires, results rendering takes over.
    expect(harness.syncDrawerStateFromStore).toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/unit/newtab-drawer-sync-observers.test.js`
Expected: FAIL — the new `createWarmingHarness` references `renderWarmingState` and `timers` params that `createDrawerStoreSubscriptions` does not yet accept.

- [ ] **Step 3: Extend `createDrawerStoreSubscriptions` to drive the warming UI**

In `src/newtab-drawer-sync-observers.js`, modify the `createDrawerStoreSubscriptions` factory signature (currently lines 99-110). Add `renderWarmingState` and `timers` params:

```js
export function createDrawerStoreSubscriptions({
  api,
  state,
  savedPagesStore,
  projectsStore,
  getCurrentUser,
  isDrawerOpen,
  getSuppressSavedPagesStoreSync,
  notifySavedPagesTotalChange,
  syncDrawerStateFromStore,
  syncProjectsStateFromStore,
  renderWarmingState,
  timers = { setTimeout, clearTimeout }
}) {
```

Then, immediately before the existing `function initStoreSubscriptions() {` line, insert warming-state tracking and helpers:

```js
  // Warming-UI state. Lives here because the subscriber that drives it lives
  // here. Reset whenever a non-warming render path runs (e.g. sign-out, a
  // fresh load that hits the warm-cache fast path).
  let warming = { active: false, lastPercent: 0, determinate: false, completionTimer: null };

  function clearWarmingCompletionTimer() {
    if (warming.completionTimer) {
      timers.clearTimeout(warming.completionTimer);
      warming.completionTimer = null;
    }
  }

  function resetWarming() {
    clearWarmingCompletionTimer();
    warming = { active: false, lastPercent: 0, determinate: false, completionTimer: null };
  }

  // Computes the warming percentage for a snapshot. Returns { percent, indeterminate }.
  // Once we've shown a determinate reading we never go back below it (clamp),
  // and an unknown total caps the displayed value at 99 until completion.
  function computeWarmingProgress(snapshot) {
    const total = typeof snapshot?.total === 'number' && snapshot.total > 0
      ? Math.min(snapshot.total, Number.POSITIVE_INFINITY)
      : null;
    const loaded = Array.isArray(snapshot?.allPages) ? snapshot.allPages.length : 0;

    if (total == null) {
      return { percent: warming.determinate ? Math.min(warming.lastPercent, 99) : 0, indeterminate: !warming.determinate };
    }

    const computed = total > 0 ? Math.min(100, Math.round((loaded / total) * 100)) : 0;
    // Clamp: never decrease once determinate.
    const percent = warming.determinate ? Math.max(warming.lastPercent, computed) : computed;
    warming.determinate = true;
    warming.lastPercent = percent;
    return { percent, indeterminate: false };
  }

  function isWarmUpActive(snapshot) {
    const phase = snapshot?.refreshState?.phase;
    const status = snapshot?.refreshState?.status;
    // Active while prefetching (loading) OR just-finished (idle/complete),
    // which the caller transitions out of via the completion pause.
    return phase === 'prefetch' && (status === 'loading' || (status === 'idle' && snapshot.refreshState.reason === 'complete'));
  }
```

Then replace the body of the existing `savedPagesStore.subscribe(() => { ... })` callback inside `initStoreSubscriptions`. The new callback body (the `projectsStore.subscribe` listener stays unchanged):

```js
    savedPagesStore.subscribe(() => {
      notifySavedPagesTotalChange();

      const snapshot = savedPagesStore.getSnapshot();

      // Drive the warming UI while it's active. This takes priority over the
      // normal sync path so the progress bar updates on every batch.
      if (isWarmUpActive(snapshot) && typeof renderWarmingState === 'function' && isDrawerOpen()) {
        if (!warming.active) {
          warming.active = true;
        }

        const complete = snapshot.refreshState.status === 'idle'
          && snapshot.refreshState.reason === 'complete';
        const progress = complete ? { percent: 100, indeterminate: false } : computeWarmingProgress(snapshot);

        // Always paint 100% on completion, even if we were indeterminate.
        if (complete) {
          warming.determinate = true;
          warming.lastPercent = 100;
        }

        renderWarmingState(progress);

        if (complete && !warming.completionTimer) {
          // Brief completion pause so the user sees the bar fill, then hand
          // off to the normal results-render path.
          warming.completionTimer = timers.setTimeout(() => {
            warming.completionTimer = null;
            resetWarming();
            if (shouldSyncDrawerStoreUpdate({
              suppressSavedPagesStoreSync: getSuppressSavedPagesStoreSync(),
              hasInitialized: state.hasInitialized,
              isExtension: api.isExtension,
              hasCurrentUser: Boolean(getCurrentUser())
            }) && isDrawerOpen()) {
              syncDrawerStateFromStore(snapshot, { query: state.query, render: true });
            }
          }, 300);
        }

        return;
      }

      // If we were warming and are no longer (e.g. store reset, sign-out),
      // drop warming state so a future warm-up starts fresh.
      if (warming.active && !isWarmUpActive(snapshot)) {
        resetWarming();
      }

      if (!shouldSyncDrawerStoreUpdate({
        suppressSavedPagesStoreSync: getSuppressSavedPagesStoreSync(),
        hasInitialized: state.hasInitialized,
        isExtension: api.isExtension,
        hasCurrentUser: Boolean(getCurrentUser())
      })) {
        return;
      }

      syncDrawerStateFromStore(snapshot, {
        query: state.query,
        render: isDrawerOpen()
      });
    });
```

- [ ] **Step 4: Thread `renderDrawerWarmingState` through the coordinator**

In `src/newtab-drawer-sync.js`:

(a) Add `renderDrawerWarmingState` to the destructured params of `createDrawerSyncCoordinator` (currently lines 9-29). Insert it immediately after `renderDrawerSignInState`:

```js
export function createDrawerSyncCoordinator({
  api,
  state,
  savedPagesStore,
  projectsStore,
  getCurrentUser,
  isDrawerOpen,
  getSearchQuery,
  notifySavedPagesTotalChange,
  refreshFavorites,
  syncDrawerStateFromStore,
  syncProjectsStateFromStore,
  loadDrawerBasePages,
  loadDrawerProjectPages,
  loadDrawerResults,
  renderDrawerSignInState,
  renderDrawerWarmingState,
  resetDrawerState,
  setSuppressSavedPagesStoreSync,
  getSuppressSavedPagesStoreSync,
  windowObj = window
}) {
```

(b) Pass it into the `createDrawerStoreSubscriptions({...})` call (currently lines 56-67). Add `renderDrawerWarmingState,` to that argument object:

```js
  const storeSubscriptions = createDrawerStoreSubscriptions({
    api,
    state,
    savedPagesStore,
    projectsStore,
    getCurrentUser,
    isDrawerOpen,
    getSuppressSavedPagesStoreSync,
    notifySavedPagesTotalChange,
    syncDrawerStateFromStore,
    syncProjectsStateFromStore,
    renderDrawerWarmingState
  });
```

- [ ] **Step 5: Add the `renderWarmingState` UI wrapper**

In `src/newtab-drawer-ui.js`, immediately after the existing `renderSignInState` function (currently lines 73-75), add:

```js
  function renderWarmingState(options = {}) {
    drawerRenderer.renderWarmingState(options);
  }
```

Then add `renderWarmingState,` to the object returned by `createDrawerUiController` (find its existing `return { ... }` which already includes `renderSignInState`, `renderResults`, etc.).

- [ ] **Step 6: Wire the wrapper through the runtime**

In `src/newtab-drawer-runtime.js`:

(a) Immediately after line 88 (`const renderDrawerSignInState = (...args) => uiController.renderSignInState(...args);`), add:

```js
  const renderDrawerWarmingState = (...args) => uiController.renderWarmingState(...args);
```

(b) In the `createDrawerSyncCoordinatorFn({...})` call (currently lines 171-195), add `renderDrawerWarmingState,` to the argument object, immediately after `renderDrawerSignInState,` (around line 186):

```js
    renderDrawerSignInState,
    renderDrawerWarmingState,
```

- [ ] **Step 7: Run tests to verify they pass**

Run: `npx vitest run tests/unit/newtab-drawer-sync-observers.test.js`
Expected: PASS — all tests green, including the four new ones.

- [ ] **Step 8: Run the full unit suite to catch regressions**

Run: `npx vitest run`
Expected: PASS — no regressions. If `newtab-drawer-runtime.test.js` constructs the coordinator with a mocked factory and asserts on the params passed, it may need `renderDrawerWarmingState: vi.fn()` added to its fixture; add it only if a test there fails.

- [ ] **Step 9: Commit**

```bash
git add src/newtab-drawer-sync-observers.js src/newtab-drawer-sync.js src/newtab-drawer-runtime.js src/newtab-drawer-ui.js tests/unit/newtab-drawer-sync-observers.test.js
git commit -m "Drive post-login warming UI from the saved-pages subscriber

While the store is in the prefetch phase, every change event updates a
determinate progress bar (allPages.length / total). Clamps so the
displayed % never decreases; falls back to indeterminate when the total
is unknown. On completion, holds at 100% for ~300ms then hands off to
results rendering. Threaded through the existing render-wrapper pattern
(renderDrawerWarmingState)."
```

---

## Task 6: Make the cold post-login load render the warming state

The store subscriber (Task 5) drives the bar *after* the first batch lands. But there's a window between sign-in and the first batch where the drawer would otherwise show the generic loading dog. This task makes that initial paint use `renderDrawerWarmingState({ indeterminate: true })` on the post-login path.

This file already receives `renderDrawerLoadingState` and `renderDrawerSignInState` as factory params; `renderDrawerWarmingState` is threaded the same way.

**Files:**
- Modify: `src/newtab-drawer-data.js` (factory signature ~line 21-24; `loadDrawerBasePages` cold-load branch ~line 206-208)
- Modify: `src/newtab-drawer-runtime.js` (pass `renderDrawerWarmingState` into `createDrawerDataControllerFn` call, ~line 130-133)

- [ ] **Step 1: Add `renderDrawerWarmingState` to the data-controller factory params**

In `src/newtab-drawer-data.js`, add `renderDrawerWarmingState,` to the destructured params of `createDrawerDataController` (currently lines 10-32). Insert it immediately after `renderDrawerSignInState,` (line 23):

```js
  renderDrawerLoadingState,
  renderDrawerErrorState,
  renderDrawerSignInState,
  renderDrawerWarmingState,
  renderDrawerResults,
```

- [ ] **Step 2: Pass the wrapper from the runtime**

In `src/newtab-drawer-runtime.js`, in the `createDrawerDataControllerFn({...})` call (currently lines 119-139), add `renderDrawerWarmingState,` to the argument object immediately after `renderDrawerSignInState,` (line 132):

```js
    renderDrawerLoadingState,
    renderDrawerErrorState,
    renderDrawerSignInState,
    renderDrawerWarmingState,
    renderDrawerResults,
```

- [ ] **Step 3: Replace the cold-load renderer call**

In `src/newtab-drawer-data.js`, find this block in `loadDrawerBasePages` (currently ~lines 205-208):

```js
    const savedPagesSnapshot = savedPagesStore.getSnapshot();
    if (!savedPagesSnapshot.allPages.length && !hasRenderableWarmCache(savedPagesSnapshot)) {
      renderDrawerLoadingState(trimmedQuery ? 'Searching your saved pages…' : 'Gathering your saved pages…');
    }
```

Replace the `renderDrawerLoadingState(...)` line with a warming-aware choice:

```js
    const savedPagesSnapshot = savedPagesStore.getSnapshot();
    if (!savedPagesSnapshot.allPages.length && !hasRenderableWarmCache(savedPagesSnapshot)) {
      // Post-login the store is in non-lazy prefetch mode (set by
      // handleSignedIn). Show the warming bar instead of the bare dog so the
      // user sees progress immediately. The subscriber in
      // createDrawerStoreSubscriptions takes over bar updates once the first
      // batch lands.
      if (savedPagesStore.options.lazy === false && renderDrawerWarmingState) {
        renderDrawerWarmingState({ indeterminate: true });
      } else {
        renderDrawerLoadingState(trimmedQuery ? 'Searching your saved pages…' : 'Gathering your saved pages…');
      }
    }
```

Note: `savedPagesStore.options.lazy === false` is true only during the post-login warm-up window (set by `handleSignedIn` in Task 4, self-reset to `true` by the store in Task 1). The guard `&& renderDrawerWarmingState` keeps this path safe if the wrapper is ever absent.

- [ ] **Step 4: Lint and run the suite**

Run: `npx eslint src/newtab-drawer-data.js src/newtab-drawer-runtime.js`
Run: `npx vitest run`
Expected: no lint errors; all tests pass. (If `newtab-drawer-runtime.test.js` constructs the data controller with a fixture, add `renderDrawerWarmingState: vi.fn()` only if a test fails.)

- [ ] **Step 5: Commit**

```bash
git add src/newtab-drawer-data.js src/newtab-drawer-runtime.js
git commit -m "Show warming bar (not bare dog) on the cold post-login load

When the store is in non-lazy prefetch mode, the initial empty-load
paint uses renderDrawerWarmingState({ indeterminate: true }) so the user
sees the warming UI immediately. The store subscriber takes over bar
updates once the first batch lands."
```

---

## Task 7: E2E coverage for the post-login warming flow

**Files:**
- Modify or extend: `tests/e2e/standalone.spec.js` (or add a focused spec)

- [ ] **Step 1: Read the existing E2E harness**

Run: `head -80 tests/e2e/standalone.spec.js`

Confirm how the standalone mode is loaded (`just preview` / `file://` URL), whether sign-in is simulated via mock data, and how the drawer is opened. Match the existing pattern.

- [ ] **Step 2: Add an E2E test**

Add a test that (a) loads the standalone page, (b) triggers the signed-in state via the existing mock hook, (c) opens the saved-pages drawer, and (d) asserts the warming pane is visible (`.saved-pages-warming-pane`) and then transitions to results cards (`.saved-pages-drawer-card`) once the mock data finishes loading. Use `page.waitForSelector` with a timeout. If the standalone mock doesn't exercise the multi-batch prefetch (it likely returns a single mock response), assert only that the warming pane appears and that cards eventually render — don't assert the percentage value in E2E (the unit tests own that).

If the standalone harness cannot simulate the post-login lazy-flip (because mock mode returns data synchronously and skips `prefetchAllPages`), document this in a comment and add the test as a smoke check for the warming pane's presence in the DOM when `renderWarmingState` is invoked. The unit tests remain the source of truth for the progress logic.

- [ ] **Step 3: Run the E2E test**

Run: `just test-e2e`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add tests/e2e/standalone.spec.js
git commit -m "Add E2E smoke check for post-login warming UI"
```

---

## Task 8: Full local check

- [ ] **Step 1: Run the full local check**

Run: `just check`
Expected: lint, CSS lint, formatting, manifest validation, and tests all pass.

- [ ] **Step 2: Manual smoke test in the browser**

Run: `just run` (Firefox) — sign in via the hero Sign in button, watch the warming pane appear and the bar advance, confirm it reaches 100%, briefly pauses, then cards paint. Verify under `prefers-reduced-motion` (DevTools → Rendering → Emulate reduced motion) that the shimmer is replaced by the static half-opacity fill and the width transition is gone.

- [ ] **Step 3: If all green, the feature is done — no further commit unless changes were made.**

---

## Notes for the implementer

- **`prefetchAllPages` self-reset is load-bearing.** Tasks 1 and 4 depend on it. The `try/finally` in Task 1 is what guarantees the lazy flag returns to `true` even if a batch errors.
- **The warming subscriber takes priority** over the normal sync path while active (Task 5). This is intentional — without it, the first `change` event would call `syncDrawerStateFromStore` and paint cards mid-warm-up.
- **Clamp behavior** (Task 5, `computeWarmingProgress`): once determinate, never decrease; if total becomes unknown again, hold last known % but cap at 99. This matches the "Clamp to last known" decision.
- **Completion pause is ~300ms** under normal motion; under reduced-motion the CSS disables transitions but the JS timer is unchanged (the pause is a content cue, not a motion cue, so it's fine).
- **Project/Domain/Favorites views are out of scope** (per spec YAGNI). They continue to warm silently.
