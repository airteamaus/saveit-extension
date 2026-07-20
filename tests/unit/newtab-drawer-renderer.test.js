import { describe, expect, it, vi } from 'vitest';

import { createDrawerRenderer, renderDrawerCardMarkup } from '../../src/newtab-drawer-renderer.js';

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

describe('newtab drawer renderer pinned shelf', () => {
  it('renders a Pinned shelf with a compact card per pinned page', () => {
    const { resultsContainer, renderer } = createRenderer();

    renderer.renderPinnedShelf([
      { id: 'p1', title: 'Pinned One', url: 'https://a.example', domain: 'a.example', pinned: true },
      { id: 'p2', title: 'Pinned Two', url: 'https://b.example', domain: 'b.example', pinned: true }
    ]);

    expect(resultsContainer.querySelectorAll('.saved-pages-home-pinned-card')).toHaveLength(2);
    // The compact card carries the same nav attrs as the drawer card so
    // existing click delegation handles open-URL unchanged. Unpinning happens
    // from the drawer card below; the shelf card carries no pin button.
    const firstCard = resultsContainer.querySelector('.saved-pages-home-pinned-card');
    expect(firstCard.getAttribute('data-url')).toBe('https://a.example');
    expect(firstCard.getAttribute('role')).toBe('link');
    expect(firstCard.querySelector('[data-action="pin"]')).toBeNull();
    // Favicon + title render.
    expect(firstCard.querySelector('.saved-pages-home-pinned-card-favicon')).not.toBeNull();
    expect(firstCard.querySelector('.saved-pages-home-pinned-card-title').textContent).toBe('Pinned One');
  });

  it('orders the pinned section before the pages section in the DOM', () => {
    // The shelf reads as a header above the browse list, so it must precede
    // data-section="pages" when both are present.
    const { resultsContainer, renderer } = createRenderer();

    // Render the browse list first (creates data-section="pages"), then the
    // shelf — the shelf must move itself before pages.
    renderer.renderResults([{ id: 'r1', title: 'Recent', url: 'https://c.example', domain: 'c.example' }]);
    renderer.renderPinnedShelf([{ id: 'p1', title: 'Pinned', url: 'https://a.example', pinned: true }]);

    const sections = [...resultsContainer.querySelectorAll('[data-section]')].map(s => s.dataset.section);
    const pinnedIdx = sections.indexOf('pinned');
    const pagesIdx = sections.indexOf('pages');
    expect(pinnedIdx).toBeGreaterThan(-1);
    expect(pagesIdx).toBeGreaterThan(-1);
    expect(pinnedIdx).toBeLessThan(pagesIdx);
  });

  it('clearPinnedShelf removes the shelf section so the browse list owns the pane', () => {
    const { resultsContainer, renderer } = createRenderer();

    renderer.renderPinnedShelf([{ id: 'p1', title: 'Pinned', url: 'https://a.example', pinned: true }]);
    expect(resultsContainer.querySelector('[data-section="pinned"]')).not.toBeNull();

    renderer.clearPinnedShelf();
    expect(resultsContainer.querySelector('[data-section="pinned"]')).toBeNull();
  });
});

describe('renderDrawerCardMarkup optimistic-tile action buttons', () => {
  // Regression (Sentry 7621707108): an optimistic tile's synthetic id
  // ("optimistic:https://...") contains "//", which Firestore rejects as a
  // document path. Actions that POST that id (pin/edit/privacy/projects) must
  // render disabled so the user can't trigger the failing call. Delete stays
  // enabled — it cancels the pending save client-side.
  function actionsFor(page) {
    const html = renderDrawerCardMarkup(page, {
      getProjectPills: () => [],
      projectsUnavailable: false
    });
    const container = document.createElement('div');
    container.innerHTML = html;
    const get = (action) => container.querySelector(`[data-action="${action}"]`);
    return { container, get };
  }

  it('disables pin, edit, privacy, and projects on an optimistic tile', () => {
    const { get } = actionsFor({
      id: 'optimistic:https://chrome.google.com/webstore/devconsole/x',
      optimistic: true,
      url: 'https://chrome.google.com/webstore/devconsole/x',
      title: 'Store Listing',
      domain: 'chrome.google.com'
    });

    for (const action of ['pin', 'edit', 'toggle-privacy', 'projects']) {
      const btn = get(action);
      expect(btn, `expected ${action} button to exist`).not.toBeNull();
      expect(btn.hasAttribute('disabled'), `${action} should be disabled`).toBe(true);
      expect(btn.getAttribute('title')).toBe('Saving…');
    }
  });

  it('keeps the delete button enabled on an optimistic tile (cancels the pending save)', () => {
    const { get } = actionsFor({
      id: 'optimistic:https://x.example',
      optimistic: true,
      url: 'https://x.example',
      title: 'Pending'
    });

    const deleteBtn = get('delete');
    expect(deleteBtn).not.toBeNull();
    expect(deleteBtn.hasAttribute('disabled')).toBe(false);
  });

  it('leaves all actions enabled on a real (enriched) page', () => {
    const { get } = actionsFor({
      id: 'user1_abc1234567890def',
      url: 'https://example.com/article',
      title: 'Real article',
      domain: 'example.com'
    });

    for (const action of ['pin', 'edit', 'toggle-privacy', 'projects', 'delete']) {
      const btn = get(action);
      expect(btn, `expected ${action} button to exist`).not.toBeNull();
      expect(btn.hasAttribute('disabled'), `${action} should NOT be disabled`).toBe(false);
    }
  });

  it('disables the remove-project pill button on an optimistic tile', () => {
    const html = renderDrawerCardMarkup(
      {
        id: 'optimistic:https://x.example',
        optimistic: true,
        url: 'https://x.example',
        title: 'Pending',
        project_ids: ['proj-1']
      },
      {
        getProjectPills: () => [{ id: 'proj-1', name: 'Research' }],
        projectsUnavailable: false
      }
    );
    const container = document.createElement('div');
    container.innerHTML = html;
    const removeBtn = container.querySelector('[data-action="remove-project"]');
    expect(removeBtn).not.toBeNull();
    expect(removeBtn.hasAttribute('disabled')).toBe(true);
  });
});

describe('renderDrawerCardMarkup privacy button icon', () => {
  // Regression: a malformed ternary previously left a stray duplicated
  // `<path>` as literal text inside the SVG in BOTH private and non-private
  // states, and the icon path did not actually differ between states. The
  // eye-off icon carries the diagonal slash (`M1 1l22 22`); the eye icon
  // carries an iris `<circle>`. Neither state should leak raw `:`-prefixed
  // template text.
  function privacySvg(page) {
    const html = renderDrawerCardMarkup(page, {
      getProjectPills: () => [],
      projectsUnavailable: false
    });
    const container = document.createElement('div');
    container.innerHTML = html;
    return container.querySelector('[data-action="toggle-privacy"] svg');
  }

  it('renders the eye icon and no stray template text when the page is not private', () => {
    const svg = privacySvg({ id: 'p1', url: 'https://x.example', title: 'T' });
    const svgText = svg.textContent;

    expect(svg.querySelector('circle')).not.toBeNull();
    // No leftover `: '...'` template fragment inside the SVG.
    expect(svgText).not.toContain(": '<path");
    expect(svgText.trim()).toBe('');
  });

  it('renders the eye-off icon (diagonal slash) when the page is private', () => {
    const svg = privacySvg({ id: 'p2', url: 'https://x.example', title: 'T', private: true });
    const svgText = svg.textContent;

    expect(svg.querySelector('circle')).toBeNull();
    expect(svgText).not.toContain(": '<path");
    expect(svgText.trim()).toBe('');
  });

  it('uses different icon paths for the two states', () => {
    const eye = privacySvg({ id: 'p1', url: 'https://x.example', title: 'T' });
    const eyeOff = privacySvg({ id: 'p2', url: 'https://x.example', title: 'T', private: true });

    expect(eye.querySelectorAll('path').length).toBe(1);
    expect(eyeOff.querySelectorAll('path').length).toBe(3);
    expect(eye.innerHTML).not.toBe(eyeOff.innerHTML);
  });
});
