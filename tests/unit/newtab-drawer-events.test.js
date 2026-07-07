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
    openSavedPagesDrawer: noop,
    closeSavedPagesDrawer: noop,
    loadDrawerResults: noop,
    loadDrawerDomainPages: noop,
    navigateDrawerCard: handlers.navigateDrawerCard,
    handleDrawerEditCancel: handlers.handleDrawerEditCancel,
    handleDrawerEditStart: noop,
    handleDrawerPin: noop,
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
