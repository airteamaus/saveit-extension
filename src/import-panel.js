// import-panel.js - Bookmark import modal on the new-tab page.
//
// Three-step flow:
//   1. Preview  — counts bookmarks found, how many are new, offers Import
//   2. Progress — single bulk request in flight
//   3. Result   — imported N (skipped M), with a close button
//
// Reads bookmarks via bookmark-reader and sends them via API.bulkImportBookmarks,
// then invalidates the saved-pages cache once so the new pages appear.

import { readAllBookmarks } from './bookmark-reader.js';
import { invalidateSavedPagesCacheStorage } from './saved-pages-cache.js';
import { createDialogLifecycle } from './dialog-lifecycle.js';
import { createEl, createQueryId } from './shared-ui-helpers.js';

const STEP = { PREVIEW: 'preview', PROGRESS: 'progress', RESULT: 'result' };

export function createImportPanel({
  api,
  documentObj = document,
  browserStorage = globalThis.browser?.storage?.local || globalThis.chrome?.storage?.local,
  onImportComplete = () => {}
} = {}) {
  // Resolve the dialog elements lazily/tolerantly so the panel can be created
  // even when the document doesn't expose the elements (e.g. test harnesses).
  const queryId = createQueryId(documentObj);
  const getBackdrop = () => queryId('import-panel-backdrop');
  const getDialog = () => queryId('import-panel-dialog');
  let state = { step: STEP.PREVIEW, bookmarks: null, total: 0, skipped: 0, result: null, error: null };

  const { show, close } = createDialogLifecycle({
    getBackdrop,
    getDialog,
    documentObj,
    onClose: () => {
      state = { step: STEP.PREVIEW, bookmarks: null, total: 0, skipped: 0, result: null, error: null };
    }
  });

  const el = createEl(documentObj);

  function renderPreview() {
    getDialog()?.replaceChildren(
      el('div', { className: 'import-panel-header', children: [
        el('h2', { className: 'project-editor-title', text: 'Import bookmarks', attrs: { id: 'import-panel-title' } }),
        el('button', { className: 'project-editor-close', text: '✕', attrs: { 'aria-label': 'Close' }, onClick: close })
      ] }),
      el('p', {
        className: 'import-panel-summary',
        text: state.bookmarks.length > 0
          ? `Found ${state.total} bookmarks — ${state.bookmarks.length} to import (${state.skipped} already saved or skipped).`
          : 'No importable bookmarks found.'
      }),
      el('div', { className: 'import-panel-actions', children: [
        el('button', { className: 'btn-secondary', text: 'Cancel', onClick: close }),
        state.bookmarks.length > 0
          ? el('button', { className: 'btn-primary', text: `Import ${state.bookmarks.length} bookmarks`, onClick: runImport })
          : el('button', { className: 'btn-primary', text: 'Close', onClick: close })
      ] })
    );
  }

  function renderProgress() {
    getDialog()?.replaceChildren(
      el('div', { className: 'import-panel-header', children: [
        el('h2', { className: 'project-editor-title', text: 'Importing bookmarks…', attrs: { id: 'import-panel-title' } })
      ] }),
      el('div', { className: 'import-panel-progress', children: [
        el('div', { className: 'import-panel-spinner' }),
        el('p', { className: 'import-panel-summary', text: `Importing ${state.bookmarks.length} bookmarks…` })
      ] })
    );
  }

  function renderResult() {
    const { result, error } = state;
    getDialog()?.replaceChildren(
      el('div', { className: 'import-panel-header', children: [
        el('h2', {
          className: 'project-editor-title',
          text: error ? 'Import failed' : 'Import complete',
          attrs: { id: 'import-panel-title' }
        }),
        el('button', { className: 'project-editor-close', text: '✕', attrs: { 'aria-label': 'Close' }, onClick: close })
      ] }),
      el('p', {
        className: 'import-panel-summary',
        text: error
          ? error.message || 'Something went wrong. Please try again.'
          : `Imported ${result.imported} bookmarks${result.skipped ? ` (${result.skipped} skipped)` : ''}.`
      }),
      el('div', { className: 'import-panel-actions', children: [
        el('button', { className: 'btn-primary', text: 'Done', onClick: close })
      ] })
    );
  }

  async function runImport() {
    state.step = STEP.PROGRESS;
    renderProgress();
    try {
      const result = await api.bulkImportBookmarks({ bookmarks: state.bookmarks });
      // Refresh the saved-pages cache once for the whole batch.
      await invalidateSavedPagesCacheStorage(browserStorage).catch(() => {});
      state.result = result;
      state.step = STEP.RESULT;
      onImportComplete(result);
    } catch (error) {
      state.error = error;
      state.step = STEP.RESULT;
    }
    renderResult();
  }

  // Open the panel and read bookmarks for the preview.
  async function open() {
    show();
    // Loading state while reading the bookmark tree.
    getDialog()?.replaceChildren(
      el('div', { className: 'import-panel-header', children: [
        el('h2', { className: 'project-editor-title', text: 'Reading bookmarks…', attrs: { id: 'import-panel-title' } })
      ] }),
      el('div', { className: 'import-panel-progress', children: [
        el('div', { className: 'import-panel-spinner' })
      ] })
    );

    try {
      const { bookmarks, total, skipped } = await readAllBookmarks();
      state = { step: STEP.PREVIEW, bookmarks, total, skipped, result: null, error: null };
      renderPreview();
    } catch (error) {
      state.error = error;
      state.step = STEP.RESULT;
      renderResult();
    }
  }

  return { open, close };
}
