import { describe, expect, it, vi } from 'vitest';

import { createDrawerRenderer, renderDrawerCardMarkup } from '../../src/newtab-drawer-renderer.js';

// Minimal renderer harness: real results + launch-strip containers and a
// no-op renderChrome so renderLoadingState can be exercised in isolation.
function createRenderer() {
  const resultsContainer = document.createElement('div');
  const launchStripContainer = document.createElement('div');
  return {
    resultsContainer,
    launchStripContainer,
    renderer: createDrawerRenderer({
      documentObj: document,
      resultsContainer,
      launchStripContainer,
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

describe('newtab drawer renderer launch strip', () => {
  it('renders a launch chip per pinned page with rename and unpin actions', () => {
    const { launchStripContainer, renderer } = createRenderer();

    renderer.renderLaunchStrip([
      { id: 'p1', title: 'Pinned One', url: 'https://a.example', domain: 'a.example', pinned: true },
      { id: 'p2', title: 'Pinned Two', url: 'https://b.example', domain: 'b.example', pinned: true }
    ]);

    const chips = launchStripContainer.querySelectorAll('.launch-chip');
    expect(chips).toHaveLength(2);
    // The chip carries the same nav attrs as the index row so the strip's
    // click delegation handles open-URL unchanged; unpin reuses the shared
    // pin contract; rename carries its own action.
    const firstChip = chips[0];
    expect(firstChip.getAttribute('data-url')).toBe('https://a.example');
    expect(firstChip.getAttribute('role')).toBe('link');
    expect(firstChip.querySelector('[data-action="pin"]')).not.toBeNull();
    expect(firstChip.querySelector('[data-action="chip-rename"]')).not.toBeNull();
    // Favicon + full label render (labels are never truncated).
    expect(firstChip.querySelector('.launch-chip-favicon')).not.toBeNull();
    expect(firstChip.querySelector('.launch-chip-label').textContent).toBe('Pinned One');
  });

  it('renders the strip outside the results pane so it never competes with the index sections', () => {
    const { resultsContainer, launchStripContainer, renderer } = createRenderer();

    renderer.renderResults([{ id: 'r1', title: 'Recent', url: 'https://c.example', domain: 'c.example' }]);
    renderer.renderLaunchStrip([{ id: 'p1', title: 'Pinned', url: 'https://a.example', pinned: true }]);

    expect(launchStripContainer.querySelectorAll('.launch-chip')).toHaveLength(1);
    expect(resultsContainer.querySelectorAll('.launch-chip')).toHaveLength(0);
  });

  it('clearLaunchStrip empties the strip container', () => {
    const { launchStripContainer, renderer } = createRenderer();

    renderer.renderLaunchStrip([{ id: 'p1', title: 'Pinned', url: 'https://a.example', pinned: true }]);
    expect(launchStripContainer.querySelectorAll('.launch-chip')).toHaveLength(1);

    renderer.clearLaunchStrip();
    expect(launchStripContainer.children).toHaveLength(0);
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
