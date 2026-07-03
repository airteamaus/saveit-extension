import { describe, expect, it, vi } from 'vitest';

import { createDrawerRenderer } from '../../src/newtab-drawer-renderer.js';

// Minimal renderer harness: a real results container and a no-op renderChrome
// so renderLoadingState can be exercised in isolation. The loading state is a
// full-pane swap of the results container, so we only need the container.
function createRenderer() {
  const resultsContainer = document.createElement('div');
  return {
    resultsContainer,
    renderer: createDrawerRenderer({
      documentObj: document,
      resultsContainer,
      getEditingPageId: () => null,
      getSavingEditPageId: () => null,
      getRenderLimit: () => Number.POSITIVE_INFINITY,
      renderChrome: () => {},
      getProjectPills: () => [],
      isProjectsUnavailable: () => false,
      getProjectScopeLabel: () => 'All pages'
    })
  };
}

describe('newtab drawer renderer loading state', () => {
  it('renders the digging-dog illustration, not a spinner or loading copy', () => {
    const { resultsContainer, renderer } = createRenderer();

    renderer.renderLoadingState();

    const html = resultsContainer.innerHTML;
    expect(html).toContain('saved-pages-semantic-loading-pane');
    // The waggy-dog SVG is the loader; its presence is the contract.
    expect(html).toContain('loading-dog-body');
    // The old spinner element and "Gathering…" copy must be gone — they caused
    // a flash of unstyled state on first paint.
    expect(html).not.toContain('saved-pages-drawer-spinner');
    expect(html).not.toContain('Gathering');
  });

  it('ignores the message argument (copy is intentionally not rendered)', () => {
    const { resultsContainer, renderer } = createRenderer();

    // Cold-start callers still pass scope-specific copy; the renderer must not
    // paint it, since swapping text in/out causes a visible flash.
    renderer.renderLoadingState('Searching project pages…');

    expect(resultsContainer.innerHTML).not.toContain('Searching project pages');
    expect(resultsContainer.innerHTML).toContain('loading-dog-body');
  });

  it('renders the dog even when called with no arguments', () => {
    const { resultsContainer, renderer } = createRenderer();

    renderer.renderLoadingState();

    expect(resultsContainer.innerHTML).toContain('loading-dog-body');
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

    renderer.renderLoadingState();

    expect(renderChrome).toHaveBeenCalledTimes(1);
  });
});

describe('newtab drawer renderer warming state', () => {
  it('renders the digging dog plus a determinate progress bar', () => {
    const { resultsContainer, renderer } = createRenderer();

    renderer.renderWarmingState({ percent: 19 });

    const html = resultsContainer.innerHTML;
    expect(html).toContain('saved-pages-warming-pane');
    expect(html).toContain('loading-dog-body');
    expect(html).toContain('saved-pages-warming-bar');
    expect(html).toContain('19%');
    const bar = resultsContainer.querySelector('.saved-pages-warming-bar');
    expect(bar.getAttribute('aria-valuenow')).toBe('19');
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
    const bar = resultsContainer.querySelector('.saved-pages-warming-bar');
    expect(bar.getAttribute('aria-valuenow')).toBeNull();
    const fill = resultsContainer.querySelector('.saved-pages-warming-bar-fill');
    expect(fill.style.width).toBe('');
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

  it('clamps out-of-range percentages to the 0-100 bounds', () => {
    const { resultsContainer, renderer } = createRenderer();

    renderer.renderWarmingState({ percent: 150 });
    let fill = resultsContainer.querySelector('.saved-pages-warming-bar-fill');
    expect(fill.style.width).toBe('100%');

    renderer.renderWarmingState({ percent: -5 });
    fill = resultsContainer.querySelector('.saved-pages-warming-bar-fill');
    expect(fill.style.width).toBe('0%');
  });
});
