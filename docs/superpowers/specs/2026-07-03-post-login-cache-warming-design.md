# Post-login cache warming with progress

**Date:** 2026-07-03
**Status:** Approved

## Problem

After OAuth login, the saved-pages drawer shows a bare "Sign in to browse saved pages" panel (or, on cold cache, the digging-dog loader with no progress signal). Users get no feedback that their full library is being fetched, and the sign-in copy is confusing once they've already signed in.

## Goal

After OAuth login, show a centered "warming up" state (digging dog + determinate progress bar showing percentage) while the All-pages cache warms fully. When complete, briefly pause at 100%, then transition to the saved-page cards.

## Decisions (from brainstorming)

| Decision | Choice |
|---|---|
| Scope | **Hybrid** — All-pages store stays lazy for normal browsing, but does a one-time full warm-up right after OAuth login |
| Location | Centered in the main content pane, replacing the sign-in / dog panel |
| Visual | **Option A** — digging dog stays, determinate progress bar added below it |
| Numbers | Percentage only (e.g. `19%`) |
| Edge cases (no reliable total) | Clamp to last known percentage; never decrease; cap at 99 if total unknown |
| Completion transition | Brief (~300ms) completion pause at 100%, then swap to content |
| Mechanism | Flip the store's `lazy` flag to `false` post-login, run existing `prefetchAllPages()`, then reset lazy to `true` |

## Architecture

```
OAuth completes
  → onAuthStateChanged fires in newtab
  → handleSignedIn()
  → All-pages store: setLazy(false)
  → hydrate()/refreshInitial() cold path runs prefetchAllPages()
  → drawer shows warming UI (dog + bar)
  → store emits change per batch
  → drawer subscriber reads snapshot, updates bar %
  → warm completes → ~300ms completion pause → swap to cards
  → store resets lazy = true
```

The store's `lazy` flag is flipped back to `true` afterward so subsequent visits and normal scroll-driven fetching retain the optimization introduced in commit #15.

## Components & data flow

### 1. Store layer — `src/warm-cache-list-store.js`

- Add `setLazy(value)` — mutates `this.options.lazy`. The only runtime reader of `lazy` is the guard at the top of `prefetchAllPages()`, so this is a safe, narrow change.
- `prefetchAllPages()` and the existing per-batch `change` events already emit everything the progress bar needs (`allPages.length`, `total`). No other store changes required for data plumbing.
- The `lazy` reset to `true` happens **inside `prefetchAllPages()` itself**, right before the existing completion `emitChange`, so the lazy flag is restored as part of the warm-up's own completion — callers don't have to remember to reset it. This means: `setLazy(false)` is called externally (in `handleSignedIn`) to opt in; `prefetchAllPages()` self-resets on the way out (both on success and on the `lazy`-bypass early-return, to keep the flag honest in every path).

### 2. Wiring — `src/newtab-drawer-sync-lifecycle.js` (`handleSignedIn`)

- In the post-login path, before triggering the load: call `savedPagesStore.setLazy(false)`.
- The existing `hydrate()` / `refreshInitial()` cold path already calls `void this.prefetchAllPages(requestId)` — which now runs the full loop because `lazy` is false.

### 3. Drawer UI — `src/newtab-drawer-renderer.js`

- New `renderWarmingState({ percent, indeterminate })`:
  - Reuses the digging-dog SVG (`LOADING_ILLUSTRATION_SVG`) above a progress bar element.
  - Renders into `#saved-pages-results`, replacing the sign-in panel.
  - Percentage = `Math.min(100, round(allPages.length / Math.min(total, maxItems) * 100))`.
- Edge handling:
  - If `total` is 0/unknown after the first batch, or `refreshState.status === 'error'` → clamp to last known percent (never decrease; cap at 99 if total is unknown).
- Completion: when `refreshState.phase === 'prefetch' && status === 'idle' && reason === 'complete'`, hold the bar at 100% for ~300ms (dog stops digging), then hand off to the existing results-render path.

### 4. Subscriber (drawer runtime)

- Add a listener on the All-pages store (alongside the existing store subscriber in `src/newtab-drawer-sync-observers.js`) that, while the warming UI is active, reads the snapshot and updates the bar's width and percentage text. Detaches once warming completes.

## State machine (warming UI)

```
signed-out
  → warming (indeterminate, until first batch gives a total)
  → warming (determinate, % climbs per batch)
  → complete (bar full, ~300ms pause, dog stops digging)
  → results (cards paint)
```

Edge cases:
- **No total returned** → stay indeterminate (no `%` shown), keep dog. Once at least one determinate reading has been shown, "clamp to last known" applies on subsequent uncertainty.
- **Mid-warm error** → clamp at last known `%`, keep dog, surface nothing alarming. The existing error-state path still runs if the load hard-fails.

## CSS

- New rules in `src/newtab.css` for the warming pane and progress bar, reusing existing tokens (`--color-primary` fill, `--color-border` track, `--radius-full` for the pill). Reduced-motion: the dog's tail-wag animation already respects `prefers-reduced-motion`; the bar's width transition is a property change (not an animation) and remains acceptable, but the completion pause can be shortened or skipped under reduced-motion.

## Testing

- **Unit — `warm-cache-list-store`:**
  - `setLazy(false)` enables the `prefetchAllPages` loop; `lazy` resets to `true` after completion.
  - Percentage calculation from `allPages.length` / `total`.
  - Clamp behavior on unknown total and on error.
- **Unit — drawer renderer:**
  - Warming UI renders dog + bar.
  - Percentage text updates from snapshot.
  - Completion-pause timer fires the transition to results.
- **E2E (existing Playwright harness):**
  - Post-login flow shows the warming state, then transitions to results.

## Out of scope (YAGNI)

- Project / Domain / Favorites views already do full silent warm-ups; not adding the progress bar there in this pass. Only the post-login All-pages moment is in scope.
- No separate background-prefetch cache layer.
- No hero-header indicator.
