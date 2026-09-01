import { describe, expect, it, vi, beforeEach } from 'vitest';

import { initSavedPagesDrawerEvents } from '../../src/newtab-drawer-events.js';

// The edit form's keydown behaviour: Enter in the title input and Cmd/Ctrl+Enter
// anywhere submit the form; Enter in the textarea inserts a newline (no submit);
// Escape cancels. This pins those contracts since browser implicit submission
// is unreliable and the form has multiple buttons.

function buildHarness() {
  document.body.innerHTML = `
    <main class="desk-page">
      <form id="search-form"><input id="search-input"></form>
      <div id="results">
        <div class="saved-pages-drawer-card" data-url="https://example.com">
          <form class="saved-pages-drawer-edit-form" data-page-id="page-1">
            <input class="saved-pages-drawer-edit-input" name="title" type="text" value="My page">
            <textarea class="saved-pages-drawer-edit-textarea" name="ai_summary_brief">summary</textarea>
            <button class="saved-pages-drawer-edit-save" type="submit">Save</button>
            <button class="saved-pages-drawer-edit-cancel" type="button" data-action="cancel-edit">Cancel</button>
          </form>
        </div>
      </div>
      <aside id="sidebar"></aside>
      <div id="strip"></div>
    </main>
    <div id="editor-backdrop" class="hidden"></div>
    <div id="editor-dialog" class="hidden"></div>
  `;

  const handlers = {
    handleDrawerEditCancel: vi.fn(),
    handleDrawerUpdate: vi.fn(),
    handleDrawerTogglePrivacy: vi.fn(),
    navigateDrawerCard: vi.fn(),
    handleDrawerScrollNearEnd: vi.fn(),
    handleFeedScrollNearEnd: vi.fn()
  };

  const noop = () => {};
  initSavedPagesDrawerEvents({
    savedPagesDrawerSearchForm: document.getElementById('search-form'),
    savedPagesDrawerSearchInput: document.getElementById('search-input'),
    savedPagesDrawerClearBtn: null,
    savedPagesDrawerResults: document.getElementById('results'),
    projectSidebar: document.getElementById('sidebar'),
    projectEditorBackdrop: document.getElementById('editor-backdrop'),
    projectEditorDialog: document.getElementById('editor-dialog'),
    launchStrip: document.getElementById('strip'),
    projectManager: { closeEditor: vi.fn() },
    savedPagesView: {},
    loadDrawerResults: noop,
    loadDrawerDomainPages: noop,
    navigateDrawerCard: handlers.navigateDrawerCard,
    handleDrawerEditCancel: handlers.handleDrawerEditCancel,
    handleDrawerEditStart: noop,
    handleDrawerPin: noop,
    handleDrawerTogglePrivacy: handlers.handleDrawerTogglePrivacy,
    handleDrawerUpdate: handlers.handleDrawerUpdate,
    handleDrawerDelete: noop,
    handleDrawerScrollNearEnd: handlers.handleDrawerScrollNearEnd,
    handleFeedScrollNearEnd: handlers.handleFeedScrollNearEnd,
    setDrawerSearchValue: noop,
    setDrawerToggleState: noop,
    windowObj: window,
    documentObj: document
  });

  return handlers;
}

describe('edit form keydown', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  it('Enter in the title input submits the form (saves)', () => {
    const { handleDrawerUpdate, handleDrawerEditCancel } = buildHarness();
    const titleInput = document.querySelector('input[name="title"]');

    titleInput.focus();
    titleInput.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));

    // Submit handler reads FormData and calls handleDrawerUpdate.
    expect(handleDrawerUpdate).toHaveBeenCalledWith('page-1', {
      title: 'My page',
      ai_summary_brief: 'summary'
    });
    expect(handleDrawerEditCancel).not.toHaveBeenCalled();
  });

  it('Enter in the textarea does NOT submit (inserts a newline instead)', () => {
    const { handleDrawerUpdate } = buildHarness();
    const textarea = document.querySelector('textarea[name="ai_summary_brief"]');

    textarea.focus();
    textarea.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));

    expect(handleDrawerUpdate).not.toHaveBeenCalled();
  });

  it('Cmd/Ctrl+Enter in the textarea submits the form', () => {
    const { handleDrawerUpdate } = buildHarness();
    const textarea = document.querySelector('textarea[name="ai_summary_brief"]');

    textarea.focus();
    textarea.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Enter', metaKey: true, bubbles: true })
    );

    expect(handleDrawerUpdate).toHaveBeenCalledWith(
      'page-1',
      expect.objectContaining({ title: 'My page' })
    );
  });

  it('Escape cancels the edit without submitting', () => {
    const { handleDrawerUpdate, handleDrawerEditCancel } = buildHarness();
    const titleInput = document.querySelector('input[name="title"]');

    titleInput.focus();
    titleInput.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));

    expect(handleDrawerEditCancel).toHaveBeenCalled();
    expect(handleDrawerUpdate).not.toHaveBeenCalled();
  });
});

describe('privacy toggle click delegation', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  it('a card privacy button click routes to handleDrawerTogglePrivacy with the page id', () => {
    document.body.innerHTML = `
      <div id="results">
        <div class="saved-pages-drawer-card" data-page-id="page-7">
          <button type="button" data-action="toggle-privacy" data-id="page-7">Hide from organisation</button>
        </div>
      </div>
    `;
    const handlers = {
      handleDrawerTogglePrivacy: vi.fn(),
      handleDrawerUpdate: vi.fn(),
      handleDrawerEditCancel: vi.fn(),
      navigateDrawerCard: vi.fn()
    };
    const noop = () => {};
    initSavedPagesDrawerEvents({
      savedPagesDrawerSearchForm: null,
      savedPagesDrawerSearchInput: null,
      savedPagesDrawerClearBtn: null,
      savedPagesDrawerResults: document.getElementById('results'),
      projectSidebar: null,
      projectEditorBackdrop: null,
      projectEditorDialog: null,
      projectManager: { closeEditor: vi.fn() },
      savedPagesView: {},
      openSavedPagesDrawer: noop,
      closeSavedPagesDrawer: noop,
      loadDrawerResults: noop,
      loadDrawerDomainPages: noop,
      navigateDrawerCard: handlers.navigateDrawerCard,
      handleDrawerEditCancel: handlers.handleDrawerEditCancel,
      handleDrawerEditStart: noop,
      handleDrawerPin: noop,
      handleDrawerTogglePrivacy: handlers.handleDrawerTogglePrivacy,
      handleDrawerUpdate: handlers.handleDrawerUpdate,
      handleDrawerDelete: noop,
      handleDrawerScrollNearEnd: noop,
      setDrawerSearchValue: noop,
      setDrawerToggleState: noop,
      isDrawerOpen: () => true,
      windowObj: window,
      documentObj: document
    });

    const btn = document.querySelector('[data-action="toggle-privacy"]');
    btn.dispatchEvent(new MouseEvent('click', { bubbles: true }));

    expect(handlers.handleDrawerTogglePrivacy).toHaveBeenCalledTimes(1);
    expect(handlers.handleDrawerTogglePrivacy).toHaveBeenCalledWith('page-7');
  });
});

describe('launch chip navigation and rename', () => {
  // The launch strip renders chips in their own container outside the results
  // pane, so the strip's delegation must route navigation, unpin, and rename.
  function buildMinimalHarness() {
    document.body.innerHTML = `
      <div id="results"></div>
      <div id="strip">
        <article class="launch-chip" data-page-id="pin-1" data-url="https://example.com/pinned" role="link" tabindex="0">
          <span class="launch-chip-label">Pinned One</span>
          <button class="launch-chip-action" type="button" data-action="chip-rename" data-id="pin-1">Rename</button>
          <button class="launch-chip-action" type="button" data-action="pin" data-id="pin-1">Unpin</button>
        </article>
      </div>
    `;
    const handlers = {
      navigateDrawerCard: vi.fn(),
      handleDrawerEditCancel: vi.fn(),
      handleDrawerTogglePrivacy: vi.fn(),
      handleDrawerUpdate: vi.fn(),
      handleDrawerPin: vi.fn()
    };
    const noop = () => {};
    initSavedPagesDrawerEvents({
      savedPagesDrawerSearchForm: null,
      savedPagesDrawerSearchInput: null,
      savedPagesDrawerClearBtn: null,
      savedPagesDrawerResults: document.getElementById('results'),
      launchStrip: document.getElementById('strip'),
      projectSidebar: null,
      projectEditorBackdrop: null,
      projectEditorDialog: null,
      // Escape bubbles to the document-level editor-close handler; stub it.
      projectManager: { closeEditor: vi.fn() },
      savedPagesView: {},
      openSavedPagesDrawer: noop,
      closeSavedPagesDrawer: noop,
      loadDrawerResults: noop,
      loadDrawerDomainPages: noop,
      navigateDrawerCard: handlers.navigateDrawerCard,
      handleDrawerEditCancel: handlers.handleDrawerEditCancel,
      handleDrawerEditStart: noop,
      handleDrawerPin: handlers.handleDrawerPin,
      handleDrawerTogglePrivacy: handlers.handleDrawerTogglePrivacy,
      handleDrawerUpdate: handlers.handleDrawerUpdate,
      handleDrawerDelete: noop,
      handleDrawerScrollNearEnd: noop,
      setDrawerSearchValue: noop,
      setDrawerToggleState: noop,
      isDrawerOpen: () => true,
      windowObj: window,
      documentObj: document
    });
    return handlers;
  }

  beforeEach(() => {
    document.body.innerHTML = '';
  });

  it('clicking a chip routes to navigateDrawerCard with the chip', () => {
    const { navigateDrawerCard } = buildMinimalHarness();
    const chip = document.querySelector('.launch-chip');
    chip.dispatchEvent(new MouseEvent('click', { bubbles: true }));

    expect(navigateDrawerCard).toHaveBeenCalledTimes(1);
    // The routed element is the chip itself, carrying data-url.
    expect(navigateDrawerCard.mock.calls[0][0]).toBe(chip);
  });

  it('Enter on a focused chip routes to navigateDrawerCard', () => {
    const { navigateDrawerCard } = buildMinimalHarness();
    const chip = document.querySelector('.launch-chip');
    chip.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));

    expect(navigateDrawerCard).toHaveBeenCalledTimes(1);
    expect(navigateDrawerCard.mock.calls[0][0]).toBe(chip);
  });

  it('unpin routes through the shared pin handler', () => {
    const { handleDrawerPin } = buildMinimalHarness();
    document
      .querySelector('[data-action="pin"]')
      .dispatchEvent(new MouseEvent('click', { bubbles: true }));

    expect(handleDrawerPin).toHaveBeenCalledWith('pin-1');
  });

  it('rename swaps the label for an input and commits a title-only update on Enter', () => {
    const { handleDrawerUpdate } = buildMinimalHarness();
    document
      .querySelector('[data-action="chip-rename"]')
      .dispatchEvent(new MouseEvent('click', { bubbles: true }));

    const input = document.querySelector('.launch-chip-rename-input');
    expect(input).not.toBeNull();
    expect(input.value).toBe('Pinned One');

    input.value = 'Mail';
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));

    // Title-only: undefined ai_summary_brief means "keep existing" in
    // handleDrawerUpdate.
    expect(handleDrawerUpdate).toHaveBeenCalledWith('pin-1', { title: 'Mail' });
  });

  it('Escape cancels the rename and restores the label', () => {
    const { handleDrawerUpdate } = buildMinimalHarness();
    document
      .querySelector('[data-action="chip-rename"]')
      .dispatchEvent(new MouseEvent('click', { bubbles: true }));

    const input = document.querySelector('.launch-chip-rename-input');
    input.value = 'Changed';
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));

    expect(handleDrawerUpdate).not.toHaveBeenCalled();
    expect(document.querySelector('.launch-chip-label')).not.toBeNull();
    expect(document.querySelector('.launch-chip-rename-input')).toBeNull();
  });
});

describe('scroll near-end lazy load', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  // happy-dom does no layout, so the results container's scrollTop/
  // clientHeight/scrollHeight are all 0 and isNearScrollEnd is trivially
  // true — every dispatched scroll event reaches the rAF gate.
  function dispatchResultsScroll() {
    document.getElementById('results').dispatchEvent(new Event('scroll'));
  }

  async function flushAnimationFrame() {
    await new Promise((resolve) => setTimeout(resolve, 32));
  }

  it('routes scroll to the feed load-more while the feed owns the results pane', async () => {
    const { handleDrawerScrollNearEnd, handleFeedScrollNearEnd } = buildHarness();
    // The feed's personal archive view grows on scroll; the drawer's list
    // pagination must NOT run against the feed's pane.
    document.getElementById('results').innerHTML = '<div data-section="feed"></div>';
    dispatchResultsScroll();
    await flushAnimationFrame();
    expect(handleFeedScrollNearEnd).toHaveBeenCalledTimes(1);
    expect(handleDrawerScrollNearEnd).not.toHaveBeenCalled();
  });

  it('still routes scroll to the personal lazy-load when the feed section is absent', async () => {
    const { handleDrawerScrollNearEnd } = buildHarness();
    dispatchResultsScroll();
    await flushAnimationFrame();
    expect(handleDrawerScrollNearEnd).toHaveBeenCalledTimes(1);
  });
});

describe('launch strip scroll collapse', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  // happy-dom clamps scrollTop on non-scrollable content differently than
  // real engines, so drive the handler with a defined scrollTop directly.
  function setResultsScrollTop(value) {
    const results = document.getElementById('results');
    Object.defineProperty(results, 'scrollTop', { value, configurable: true });
    return results;
  }

  it('collapses the strip once the user scrolls into the index', () => {
    buildHarness();
    const strip = document.getElementById('strip');
    expect(strip.classList.contains('is-collapsed')).toBe(false);

    setResultsScrollTop(120);
    document.getElementById('results').dispatchEvent(new Event('scroll'));
    expect(strip.classList.contains('is-collapsed')).toBe(true);
  });

  it('expands again when scrolled back to the top', () => {
    buildHarness();
    const strip = document.getElementById('strip');

    setResultsScrollTop(120);
    document.getElementById('results').dispatchEvent(new Event('scroll'));
    expect(strip.classList.contains('is-collapsed')).toBe(true);

    setResultsScrollTop(0);
    document.getElementById('results').dispatchEvent(new Event('scroll'));
    expect(strip.classList.contains('is-collapsed')).toBe(false);
  });

  it('stays expanded for small scrolls (threshold is 48px)', () => {
    buildHarness();
    const strip = document.getElementById('strip');

    setResultsScrollTop(48);
    document.getElementById('results').dispatchEvent(new Event('scroll'));
    expect(strip.classList.contains('is-collapsed')).toBe(false);
  });
});

describe('header scroll mode', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  // Same happy-dom workaround as the strip suite: drive scrollTop directly.
  function scrollResultsTo(value) {
    const results = document.getElementById('results');
    Object.defineProperty(results, 'scrollTop', { value, configurable: true });
    results.dispatchEvent(new Event('scroll'));
  }

  function pageEl() {
    return document.querySelector('.desk-page');
  }

  it('enters scroll mode at 96px but not at 95px', () => {
    buildHarness();
    scrollResultsTo(95);
    expect(pageEl().classList.contains('is-scroll-mode')).toBe(false);

    scrollResultsTo(96);
    expect(pageEl().classList.contains('is-scroll-mode')).toBe(true);
  });

  it('holds scroll mode through the hysteresis band and exits at 32px', () => {
    buildHarness();
    scrollResultsTo(120);
    expect(pageEl().classList.contains('is-scroll-mode')).toBe(true);

    scrollResultsTo(33);
    expect(pageEl().classList.contains('is-scroll-mode')).toBe(true);

    scrollResultsTo(32);
    expect(pageEl().classList.contains('is-scroll-mode')).toBe(false);
  });

  it('stays resting for small scrolls even though the strip collapses', () => {
    buildHarness();
    scrollResultsTo(60);
    expect(document.getElementById('strip').classList.contains('is-collapsed')).toBe(true);
    expect(pageEl().classList.contains('is-scroll-mode')).toBe(false);
  });

  it('reveals in stages on the way up: strip first, then the header', () => {
    buildHarness();
    scrollResultsTo(120);
    scrollResultsTo(40);
    expect(document.getElementById('strip').classList.contains('is-collapsed')).toBe(false);
    expect(pageEl().classList.contains('is-scroll-mode')).toBe(true);

    scrollResultsTo(32);
    expect(pageEl().classList.contains('is-scroll-mode')).toBe(false);
  });

  it('also works when the window is the scroller (narrow layout fallback)', () => {
    buildHarness();
    const scrollingElement = document.scrollingElement || document.documentElement;
    Object.defineProperty(scrollingElement, 'scrollTop', { value: 200, configurable: true });
    window.dispatchEvent(new Event('scroll'));
    expect(pageEl().classList.contains('is-scroll-mode')).toBe(true);
  });
});
