import { describe, expect, it, vi, beforeEach } from 'vitest';

import { initSavedPagesDrawerEvents } from '../../src/newtab-drawer-events.js';

// The edit form's keydown behaviour: Enter in the title input and Cmd/Ctrl+Enter
// anywhere submit the form; Enter in the textarea inserts a newline (no submit);
// Escape cancels. This pins those contracts since browser implicit submission
// is unreliable and the form has multiple buttons.

function buildHarness() {
  document.body.innerHTML = `
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
    <div id="editor-backdrop" class="hidden"></div>
    <div id="editor-dialog" class="hidden"></div>
  `;

  const handlers = {
    handleDrawerEditCancel: vi.fn(),
    handleDrawerUpdate: vi.fn(),
    handleDrawerTogglePrivacy: vi.fn(),
    navigateDrawerCard: vi.fn()
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
    projectManager: {},
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
    handleDrawerScrollNearEnd: noop,
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
    textarea.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', metaKey: true, bubbles: true }));

    expect(handleDrawerUpdate).toHaveBeenCalledWith('page-1', expect.objectContaining({ title: 'My page' }));
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
      projectManager: {},
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

describe('pinned shelf card navigation', () => {
  // Regression: the pinned shelf renders cards with class
  // .saved-pages-home-pinned-card, but the click delegation only matched
  // .saved-pages-drawer-card, so clicking a pinned card did nothing.
  function buildMinimalHarness() {
    document.body.innerHTML = `
      <div id="results">
        <article class="saved-pages-home-pinned-card" data-page-id="pin-1" data-url="https://example.com/pinned" role="link" tabindex="0">
          <h3>Pinned One</h3>
        </article>
      </div>
    `;
    const handlers = {
      navigateDrawerCard: vi.fn(),
      handleDrawerEditCancel: vi.fn(),
      handleDrawerTogglePrivacy: vi.fn(),
      handleDrawerUpdate: vi.fn()
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
      projectManager: {},
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
    return handlers;
  }

  beforeEach(() => {
    document.body.innerHTML = '';
  });

  it('clicking a pinned shelf card routes to navigateDrawerCard with the card', () => {
    const { navigateDrawerCard } = buildMinimalHarness();
    const card = document.querySelector('.saved-pages-home-pinned-card');
    card.dispatchEvent(new MouseEvent('click', { bubbles: true }));

    expect(navigateDrawerCard).toHaveBeenCalledTimes(1);
    // The routed element is the pinned card itself, carrying data-url.
    expect(navigateDrawerCard.mock.calls[0][0]).toBe(card);
  });

  it('Enter on a focused pinned card routes to navigateDrawerCard', () => {
    const { navigateDrawerCard } = buildMinimalHarness();
    const card = document.querySelector('.saved-pages-home-pinned-card');
    card.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));

    expect(navigateDrawerCard).toHaveBeenCalledTimes(1);
    expect(navigateDrawerCard.mock.calls[0][0]).toBe(card);
  });
});
