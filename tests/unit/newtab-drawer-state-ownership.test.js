import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

import {
  beginDrawerWarming,
  clearDrawerWarming,
  computeWarmingProgress,
  createInitialDrawerState,
  nextDrawerRequestId,
  nextDrawerSemanticRequestId,
  resetDrawerState,
  selectDrawerDomain,
  selectDrawerProject,
  setDrawerAllPages,
  setDrawerCurrentFilter,
  setDrawerInitialized,
  setDrawerLoadedScopePages,
  setDrawerProjectsAvailability,
  setDrawerSemantic,
  updateDrawerPageCollections,
  updateDrawerWarming
} from '../../src/newtab-drawer-state.js';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, '..', '..');
const srcDir = resolve(repoRoot, 'src');

// Files that own drawer state and are therefore the ONLY ones allowed to write
// it directly. newtab-drawer-state.js is the single mutation owner; the view
// proxy (newtab-drawer-view.js) delegates its setters through that module, so
// its few remaining `state.total = value`-shaped lines must also route through
// the setters — but since it's the proxy layer, we treat it as part of the
// owned surface and exclude it from the scan.
const OWNERS = new Set([
  'newtab-drawer-state.js'
]);

// Reads that look like writes but aren't: comparisons (===), destructuring,
// property access in template literals, etc. The scan below excludes any line
// whose only `=` is part of `===` / `==` / `=>` / `!=`.
const WRITE_RE = /\bstate\.[a-zA-Z_]+(?:\.[a-zA-Z_]+)?\s*(?:\+\+|--|(?:\+|-|\*|\/)?=(?!=))/;

function directWriteLines(source) {
  return source
    .split('\n')
    .map((line, i) => ({ line, no: i + 1 }))
    .filter(({ line }) => {
      if (line.trim().startsWith('//')) return false;
      return WRITE_RE.test(line);
    });
}

describe('drawer state has a single mutation owner', () => {
  it('no newtab-drawer-*.js file outside newtab-drawer-state.js writes state directly', () => {
    const drawerFiles = readdirSync(srcDir).filter((f) => /^newtab-drawer-.*\.js$/.test(f));
    expect(drawerFiles.length).toBeGreaterThan(8); // sanity: the family exists

    const violations = [];
    for (const file of drawerFiles) {
      if (OWNERS.has(file)) continue;
      const source = readFileSync(resolve(srcDir, file), 'utf8');
      const hits = directWriteLines(source);
      for (const { no, line } of hits) {
        violations.push(`${file}:${no}: ${line.trim()}`);
      }
    }

    if (violations.length > 0) {
      throw new Error(
        'Direct drawer-state writes found outside the single mutation owner.\n' +
          'Every write must route through a function in src/newtab-drawer-state.js ' +
          '(this invariant is what makes the drawer render path followable without ' +
          'holding six files of mutation in your head, and what prevents the races ' +
          'that the warming-UI / hasInitialized comments used to narrate).\n' +
          `Violations:\n  ${violations.join('\n  ')}`
      );
    }
  });
});

describe('drawer state mutation functions', () => {
  // The contract every mutation function must hold: it mutates the bag in
  // place (so existing references observe the change) and applies the same
  // normalization the old proxy setters did. These tests pin the behavior the
  // callers and view proxy both depend on.

  it('nextDrawerRequestId is monotonic and returns the new id', () => {
    const state = createInitialDrawerState();
    const a = nextDrawerRequestId(state);
    const b = nextDrawerRequestId(state);
    expect(a).toBe(1);
    expect(b).toBe(2);
    expect(b).toBe(state.requestId);
  });

  it('nextDrawerSemanticRequestId is monotonic and returns the new id', () => {
    const state = createInitialDrawerState();
    expect(nextDrawerSemanticRequestId(state)).toBe(1);
    expect(nextDrawerSemanticRequestId(state)).toBe(2);
  });

  it('setDrawerAllPages coerces non-arrays to []', () => {
    const state = createInitialDrawerState();
    setDrawerAllPages(state, [{ id: 'p1' }]);
    expect(state.allPages).toEqual([{ id: 'p1' }]);
    setDrawerAllPages(state, null);
    expect(state.allPages).toEqual([]);
  });

  it('setDrawerLoadedScopePages treats non-array as a clear (null)', () => {
    const state = createInitialDrawerState();
    setDrawerLoadedScopePages(state, [{ id: 'p1' }]);
    expect(state.loadedProjectPages).toEqual([{ id: 'p1' }]);
    setDrawerLoadedScopePages(state, 'nope');
    expect(state.loadedProjectPages).toBeNull();
  });

  it('selectDrawerProject / selectDrawerDomain coerce falsy to null', () => {
    const state = createInitialDrawerState();
    selectDrawerProject(state, 'p1');
    expect(state.selectedProjectId).toBe('p1');
    selectDrawerProject(state, '');
    expect(state.selectedProjectId).toBeNull();
    selectDrawerDomain(state, 'example.com');
    expect(state.selectedDomainId).toBe('example.com');
    selectDrawerDomain(state, undefined);
    expect(state.selectedDomainId).toBeNull();
  });

  it('setDrawerProjectsAvailability coerces message to empty string', () => {
    const state = createInitialDrawerState();
    setDrawerProjectsAvailability(state, { available: false, message: 'unsupported' });
    expect(state.projectsAvailable).toBe(false);
    expect(state.projectsUnavailableMessage).toBe('unsupported');
    setDrawerProjectsAvailability(state, { available: true, message: null });
    expect(state.projectsAvailable).toBe(true);
    expect(state.projectsUnavailableMessage).toBe('');
  });

  it('beginDrawerWarming / updateDrawerWarming / clearDrawerWarming manage the warming cluster', () => {
    const state = createInitialDrawerState();
    expect(state.warmUpInProgress).toBe(false);

    beginDrawerWarming(state, { percent: 10, indeterminate: false });
    expect(state.warmUpInProgress).toBe(true);
    expect(state.warmUpProgress).toEqual({ percent: 10, indeterminate: false });

    updateDrawerWarming(state, { percent: 50, indeterminate: false });
    expect(state.warmUpInProgress).toBe(true);
    expect(state.warmUpProgress.percent).toBe(50);

    // clearDrawerWarming drops the flag + clamp bookkeeping but, by design,
    // leaves warmUpProgress at its last reading — the completion UI holds 100%
    // briefly before the dispatcher switches to cards.
    clearDrawerWarming(state);
    expect(state.warmUpInProgress).toBe(false);
    expect(state.warmUpDeterminate).toBe(false);
    expect(state.warmUpLastPercent).toBe(0);
    expect(state.warmUpProgress.percent).toBe(50);
  });

  it('setDrawerSemantic applies partial updates and coerces results to an array', () => {
    const state = createInitialDrawerState();
    setDrawerSemantic(state, { query: 'cats', loading: true });
    expect(state.semanticQuery).toBe('cats');
    expect(state.semanticLoading).toBe(true);
    setDrawerSemantic(state, { results: [{ id: 'r1' }] });
    expect(state.semanticResults).toEqual([{ id: 'r1' }]);
    expect(state.semanticLoading).toBe(true); // untouched by the results-only update
    setDrawerSemantic(state, { results: null });
    expect(state.semanticResults).toEqual([]);
  });

  it('updateDrawerPageCollections updates all three render sources and returns the updated page', () => {
    const state = createInitialDrawerState();
    state.allPages = [{ id: 'p1', pinned: false }, { id: 'p2', pinned: false }];
    state.loadedProjectPages = [{ id: 'p1', pinned: false }];
    state.pages = [{ id: 'p1', pinned: false }];
    const updated = updateDrawerPageCollections(state, 'p1', (p) => ({ ...p, pinned: true }));
    expect(updated).toEqual({ id: 'p1', pinned: true });
    expect(state.allPages[0].pinned).toBe(true);
    expect(state.allPages[1].pinned).toBe(false); // sibling untouched
    expect(state.loadedProjectPages[0].pinned).toBe(true);
    expect(state.pages[0].pinned).toBe(true);
  });

  it('resetDrawerState restores every field to initial values, in place', () => {
    const state = createInitialDrawerState();
    nextDrawerRequestId(state);
    setDrawerAllPages(state, [{ id: 'p1' }]);
    setDrawerInitialized(state, true);
    beginDrawerWarming(state);
    const originalRef = state;

    resetDrawerState(state);

    expect(state).toBe(originalRef); // in place — references still valid
    expect(state.requestId).toBe(0);
    expect(state.allPages).toEqual([]);
    expect(state.hasInitialized).toBe(false);
    expect(state.warmUpInProgress).toBe(false);
  });

  it('setDrawerCurrentFilter initializes a missing currentFilter and applies partial updates', () => {
    const state = createInitialDrawerState();
    delete state.currentFilter;
    setDrawerCurrentFilter(state, { search: 'alpha' });
    expect(state.currentFilter).toEqual({ search: 'alpha', projectId: null, cursor: null });
    setDrawerCurrentFilter(state, { projectId: 'p1' });
    expect(state.currentFilter.projectId).toBe('p1');
    expect(state.currentFilter.search).toBe('alpha'); // untouched
  });

  it('computeWarmingProgress is monotonic once determinate', () => {
    const state = createInitialDrawerState();
    // 24/80 = 30%
    const p1 = computeWarmingProgress({ total: 80, allPages: Array.from({ length: 24 }) }, state, {});
    expect(p1.percent).toBe(30);
    // A regression in the numerator (e.g. dedupe) must not lower the bar.
    const p2 = computeWarmingProgress({ total: 80, allPages: Array.from({ length: 10 }) }, state, {});
    expect(p2.percent).toBe(30);
  });
});
