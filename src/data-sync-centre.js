// data-sync-centre.js - Consolidated Data & sync modal.
//
// Brings Import, Export, and Browser bookmark sync together into one screen so
// the three "move data in / out" features share a home instead of being
// scattered across the avatar dropdown. A sibling surface to sharing-centre.js:
// same dialog chrome (.project-editor-backdrop / .project-editor-dialog, .hidden
// toggle) and open/close lifecycle (backdrop click + Escape + close button) via
// dialog-lifecycle.js.
//
// Three sections, each a single verb:
//   §1 Import   — bring bookmarks in (browser, CSV/HTML/JSON file)
//   §2 Export   — download your data (CSV/JSON/HTML)
//   §3 Sync     — see your pages in the browser's bookmarks (the mirror)
//
// Import reuses the existing import-panel flow (readAllBookmarks +
// api.bulkImportBookmarks) for the browser source; file sources route through
// the pure parsers in bookmark-import.js. Export pages through getSavedPages
// (the same paginated read the mirror uses) and serialize via bookmark-export.js.
// Sync reads/writes the existing getBookmarkMirrorState / setBookmarkMirrorEnabled
// runtime messages.

import { readAllBookmarks } from './bookmark-reader.js';
import { invalidateSavedPagesCacheStorage } from './saved-pages-cache.js';
import { addPendingSaves } from './pending-saves.js';
import { createDialogLifecycle } from './dialog-lifecycle.js';
import { createEl, createQueryId } from './shared-ui-helpers.js';
import { sendRuntimeMessage } from './send-runtime-message.js';
import {
  parseRaindropCsv,
  parseNetscapeHtml,
  parseBackupJson,
  detectImportFormat
} from './bookmark-import.js';
import { toRaindropCsv, toJsonBackup, toNetscapeHtml } from './bookmark-export.js';

export function createDataSyncCentre({
  api,
  documentObj = document,
  runtime = globalThis.browser?.runtime || globalThis.chrome?.runtime,
  browserStorage = globalThis.browser?.storage?.local || globalThis.chrome?.storage?.local,
  notify = () => {},
  onImportComplete = () => {}
} = {}) {
  const queryId = createQueryId(documentObj);
  const getBackdrop = () => queryId('data-sync-centre-backdrop');
  const getDialog = () => queryId('data-sync-centre-dialog');

  let state = {
    busy: false,       // disables actions during import/export
    message: null,     // status line ('Importing 42 bookmarks…')
    error: null,
    syncEnabled: false // mirror toggle state
  };

  const { show, close } = createDialogLifecycle({
    getBackdrop,
    getDialog,
    documentObj,
    onClose: () => {
      state = { busy: false, message: null, error: null, syncEnabled: state.syncEnabled };
    }
  });

  const el = createEl(documentObj);

  // --- helpers -------------------------------------------------------------

  function setStatus(message, isError = false) {
    state.message = message;
    state.error = isError ? message : null;
    render();
  }

  // Fetch every saved page by paging through cursors. Mirrors the mirror's
  // fetchAllPages pattern — export wants the whole set, not the UI window.
  async function fetchAllSavedPages() {
    const all = [];
    let cursor = null;
    do {
      const res = await api.getSavedPages({ limit: 100, sort: 'newest', cursor, skipCache: true });
      if (!res || !Array.isArray(res.pages)) {
        throw new Error('Saved pages response was missing the expected { pages } shape');
      }
      all.push(...res.pages);
      cursor = res?.pagination?.hasNextPage ? res.pagination.nextCursor : null;
    } while (cursor);
    return all;
  }

  // Trigger a browser download of text content. Creates a transient anchor
  // with a Blob URL; the browser handles the save dialog.
  function downloadText(filename, text, mime = 'text/plain') {
    const blob = new Blob([text], { type: `${mime};charset=utf-8` });
    const url = URL.createObjectURL(blob);
    const anchor = documentObj.createElement('a');
    anchor.href = url;
    anchor.download = filename;
    anchor.style.display = 'none';
    documentObj.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    // Revoke on the next tick so the download has started.
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  function timestampForFilename() {
    return new Date().toISOString().slice(0, 10); // YYYY-MM-DD
  }

  // --- Import ---------------------------------------------------------------

  // Read a File object as text.
  function readFileAsText(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result || ''));
      reader.onerror = () => reject(new Error('Could not read the selected file'));
      reader.readAsText(file);
    });
  }

  // Parse an uploaded file into the shared bookmark shape, auto-detecting format.
  async function parseUploadedFile(file) {
    const text = await readFileAsText(file);
    const sample = text.slice(0, 512);
    const format = detectImportFormat(file.name, sample);
    if (format === 'csv') return parseRaindropCsv(text);
    if (format === 'html') return parseNetscapeHtml(text);
    if (format === 'json') return parseBackupJson(text);
    return { bookmarks: [], errors: ['Could not identify the file format. Use CSV, HTML, or JSON.'] };
  }

  // Run the bulk import for a parsed bookmark set, then report the result.
  async function runImport(bookmarks) {
    state.busy = true;
    setStatus(`Importing ${bookmarks.length} ${bookmarks.length === 1 ? 'bookmark' : 'bookmarks'}…`);
    try {
      const result = await api.bulkImportBookmarks({ bookmarks });

      // Write a pending-save record per imported bookmark so newtab renders
      // instant draft tiles — the same optimistic flow a single save uses. The
      // backend's async enrichment (~28s) means the real docs don't exist yet,
      // so without these drafts the pages would be invisible until enrichment
      // completes AND a later refresh runs. The realtime relay replaces each
      // draft with the real doc once enrichment lands.
      const pendingRecords = bookmarks.map((b) => ({
        url: b.url,
        title: b.title || '',
        description: b.notes || null,
        saved_at: b.createdAt || new Date().toISOString(),
        project_ids: b.projectId ? [b.projectId] : []
      }));
      await addPendingSaves(browserStorage, pendingRecords).catch(() => {});

      await invalidateSavedPagesCacheStorage(browserStorage).catch(() => {});
      onImportComplete(result);
      state.busy = false;
      // Close the modal so the user sees their list with the new draft tiles,
      // then surface a confirmation toast on top. When some were skipped
      // (invalid URLs or duplicates), use an amber warning toast so the user
      // knows not everything came through.
      close();
      if (result.skipped > 0) {
        notify(`Imported ${result.imported}, skipped ${result.skipped} (already saved or invalid)`, { type: 'warning' });
      } else {
        notify('Import complete', { type: 'success' });
      }
    } catch (error) {
      state.busy = false;
      setStatus(error.message || 'Import failed. Please try again.', true);
    }
  }

  // Build the Import section: a file picker + a "from this browser" button.
  function renderImportSection() {
    // A real (but visually hidden) input, triggered by a button via
    // input.click(). The label-wrapping-a-hidden-input pattern is unreliable in
    // Chromium — the label's synthesized click doesn't reliably reach an
    // out-of-flow, zero-opacity input, so the dialog never opens. A button
    // calling input.click() works everywhere.
    const fileInput = el('input', {
      attrs: { type: 'file', accept: '.csv,.html,.htm,.json', 'aria-label': 'Choose a bookmark file to import' }
    });
    fileInput.className = 'data-sync-file-input';

    fileInput.addEventListener('change', async () => {
      const file = fileInput.files?.[0];
      if (!file) return;
      state.busy = true;
      setStatus(`Reading ${file.name}…`);
      try {
        const { bookmarks, errors } = await parseUploadedFile(file);
        if (!bookmarks.length) {
          state.busy = false;
          setStatus(errors[0] || 'No importable bookmarks found in that file.', true);
          return;
        }
        await runImport(bookmarks);
      } catch (error) {
        state.busy = false;
        setStatus(error.message || 'Could not read that file.', true);
      }
      // Reset so the same file can be selected again.
      fileInput.value = '';
    });

    const fileBtn = el('button', {
      className: 'btn-primary',
      text: 'Choose a file',
      attrs: { type: 'button', disabled: state.busy ? 'disabled' : null },
      onClick: () => fileInput.click()
    });

    const browserBtn = el('button', {
      className: 'btn-secondary',
      text: 'From this browser\u2019s bookmarks',
      attrs: { type: 'button', disabled: state.busy ? 'disabled' : null },
      onClick: async () => {
        state.busy = true;
        setStatus('Reading your browser bookmarks…');
        try {
          const { bookmarks } = await readAllBookmarks();
          if (!bookmarks.length) {
            state.busy = false;
            setStatus('No importable bookmarks found in this browser.', true);
            return;
          }
          await runImport(bookmarks);
        } catch (error) {
          state.busy = false;
          setStatus(error.message || 'Could not read browser bookmarks.', true);
        }
      }
    });

    return renderSection('Import', 'Bring bookmarks into Buckley\u2019s.', [
      fileInput,
      el('div', { className: 'data-sync-actions', children: [
        fileBtn,
        browserBtn
      ] }),
      el('p', { className: 'data-sync-hint', text: 'Accepts Raindrop CSV, browser bookmarks HTML, or a Buckley\u2019s JSON backup.' })
    ]);
  }

  // --- Export ---------------------------------------------------------------

  async function handleExport(format) {
    state.busy = true;
    setStatus('Gathering your saved pages…');
    try {
      const [pages, projectsResult] = await Promise.all([
        fetchAllSavedPages(),
        typeof api.getProjects === 'function' ? api.getProjects({ skipCache: true }) : []
      ]);
      const projects = Array.isArray(projectsResult) ? projectsResult : [];
      const projectNameById = new Map(projects.map((p) => [p.id, p.name || 'Untitled']));
      const date = timestampForFilename();

      if (format === 'csv') {
        downloadText(`buckleys-${date}.csv`, toRaindropCsv(pages, projectNameById), 'text/csv');
      } else if (format === 'json') {
        downloadText(`buckleys-${date}.json`, toJsonBackup(pages, projects), 'application/json');
      } else if (format === 'html') {
        downloadText(`buckleys-${date}.html`, toNetscapeHtml(pages), 'text/html');
      }

      state.busy = false;
      setStatus(`Exported ${pages.length} ${pages.length === 1 ? 'page' : 'pages'}.`);
      notify('Export complete', { type: 'success' });
    } catch (error) {
      state.busy = false;
      setStatus(error.message || 'Export failed. Please try again.', true);
    }
  }

  function renderExportSection() {
    const disabled = state.busy ? { disabled: 'disabled' } : null;
    return renderSection('Export', 'Download a copy of your data.', [
      el('div', { className: 'data-sync-actions', children: [
        el('button', { className: 'btn-secondary', text: 'CSV (Raindrop)', attrs: { type: 'button', ...disabled }, onClick: () => void handleExport('csv') }),
        el('button', { className: 'btn-secondary', text: 'JSON (backup)', attrs: { type: 'button', ...disabled }, onClick: () => void handleExport('json') }),
        el('button', { className: 'btn-secondary', text: 'HTML (bookmarks)', attrs: { type: 'button', ...disabled }, onClick: () => void handleExport('html') })
      ] }),
      el('p', { className: 'data-sync-hint', text: 'CSV round-trips with Raindrop. JSON is a full backup. HTML imports into any browser.' })
    ]);
  }

  // --- Browser sync ---------------------------------------------------------

  // Optimistic toggle: flip the UI immediately, send the message, revert on
  // failure. Disabling removes the Buckley's/ folder (the background handler
  // calls removeMirror), so confirm the destructive turn-off.
  async function handleSyncToggle(next) {
    if (state.busy) return;
    if (!next) {
      const confirmed = documentObj.confirm(
        'Turning off browser sync will remove the Buckley\u2019s bookmark folder from this browser. Your saved pages on the server are not affected.'
      );
      if (!confirmed) return;
    }
    state.syncEnabled = next;
    state.busy = true;
    render();
    try {
      await sendRuntime({ action: 'setBookmarkMirrorEnabled', enabled: next });
      notify(next ? 'Browser bookmark sync enabled' : 'Browser bookmark sync disabled — folder removed');
    } catch {
      state.syncEnabled = !next; // revert
      notify('Could not change browser bookmark sync — try again', { type: 'error' });
    } finally {
      state.busy = false;
      render();
    }
  }

  function renderSyncSection() {
    const toggle = el('button', {
      className: 'sharing-centre-toggle',
      text: state.syncEnabled ? 'Turn off sync' : 'Turn on sync',
      attrs: { type: 'button', 'aria-pressed': state.syncEnabled ? 'true' : 'false', disabled: state.busy ? 'disabled' : null },
      onClick: () => void handleSyncToggle(!state.syncEnabled)
    });

    return renderSection('Browser sync', 'See your pages in your browser\u2019s bookmarks.', [
      el('div', { className: 'data-sync-row', children: [
        el('div', { className: 'data-sync-row-main', children: [
          el('span', { className: 'data-sync-row-name', text: state.syncEnabled ? 'Sync is on' : 'Sync is off' }),
          el('span', { className: 'sharing-centre-audience', text: 'A Buckley\u2019s folder is kept in sync with your saved pages. One-way: server \u2192 browser.' })
        ] }),
        toggle
      ] })
    ]);
  }

  // --- shared section builder (mirrors sharing-centre.renderSection) --------

  function renderSection(title, hint, children) {
    return el('section', { className: 'sharing-centre-section', children: [
      el('div', { className: 'sharing-centre-section-header', children: [
        el('h3', { className: 'sharing-centre-section-title', text: title }),
        hint ? el('p', { className: 'sharing-centre-section-hint', text: hint }) : null
      ].filter(Boolean) }),
      ...children
    ] });
  }

  // Thin wrapper over the shared sendRuntimeMessage helper so the call sites
  // below can pass just the message. `runtime` is the injected factory param
  // (the browser.runtime or chrome.runtime namespace).
  function sendRuntime(message) {
    return sendRuntimeMessage(runtime, message);
  }

  function render() {
    const dialog = getDialog();
    if (!dialog) return;

    const header = el('div', { className: 'sharing-centre-header', children: [
      el('h2', { className: 'project-editor-title', text: 'Data & sync', attrs: { id: 'data-sync-centre-title' } }),
      el('button', { className: 'project-editor-close', text: '\u2715', attrs: { 'aria-label': 'Close' }, onClick: close })
    ] });

    const statusLine = state.message
      ? el('p', { className: state.error ? 'sharing-centre-error' : 'sharing-centre-status', text: state.message })
      : null;

    dialog.replaceChildren(
      header,
      renderImportSection(),
      renderExportSection(),
      renderSyncSection(),
      statusLine
    );
  }

  async function open() {
    show();
    // Read the mirror state so the toggle renders correctly on first paint.
    try {
      const res = await sendRuntime({ action: 'getBookmarkMirrorState' });
      state.syncEnabled = Boolean(res?.enabled);
    } catch {
      // Non-extension contexts (standalone preview) have no runtime — leave off.
      state.syncEnabled = false;
    }
    render();
  }

  return { open, close };
}
