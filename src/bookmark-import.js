// bookmark-import.js - Pure parsers for bookmark import sources.
//
// All four sources (Raindrop CSV, Netscape HTML, Newtab JSON backup, and
// the browser-bookmarks reader) produce the same internal shape consumed by
// the bulk-import step:
//
//   { url, title, notes, tags[], createdAt, projectId? }
//
// Keeping these pure (no DOM, no fetch) makes them trivial to unit-test and
// lets the Data & sync centre swap sources without touching the import step.
//
// Authoritative Raindrop CSV schema (from help.raindrop.io/import):
//   Columns: url (required), folder, title, note, tags, created (optional)
//   - folder uses "/" for nesting (e.g. "Reading/Dev")
//   - tags are comma-separated, quoted: "tag1, tag2"
//   - created accepts a Unix timestamp (seconds) OR ISO 8601

// --- CSV parsing ----------------------------------------------------------
// RFC-4180-ish: double-quoted fields may contain commas, quotes (escaped as "")
// and newlines. Implemented by hand rather than pulling in PapaParse — the
// surface we need is small and a focused parser avoids a dependency for a
// single import path. Returns an array of string arrays (rows of fields).

export function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = '';
  let inQuotes = false;

  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];
    const next = text[i + 1];

    if (inQuotes) {
      if (char === '"' && next === '"') {
        // Escaped quote literal.
        field += '"';
        i += 1;
      } else if (char === '"') {
        inQuotes = false;
      } else {
        field += char;
      }
      continue;
    }

    if (char === '"') {
      inQuotes = true;
    } else if (char === ',') {
      row.push(field);
      field = '';
    } else if (char === '\n') {
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
    } else if (char === '\r') {
      // Swallow; the following \n (if any) ends the row.
      continue;
    } else {
      field += char;
    }
  }

  // Flush the trailing field/row when the input doesn't end on a newline.
  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }

  return rows;
}

// A quoted CSV field can wrap a real newline (parseCsv joins them). Any
// remaining raw \r from Windows line endings inside an unquoted field is
// normalised here so callers never see stray carriage returns.
function clean(value) {
  if (typeof value !== 'string') return '';
  return value.replace(/\r/g, '').trim();
}

// Map a Raindrop "created" value (Unix seconds OR ISO 8601) to an ISO string,
// or null when unparseable. Raindrop emits Unix timestamps as numbers in its
// CSV; exports from other tools sometimes use ISO dates. Tolerate both.
function normalizeCreated(value) {
  if (!value) return null;
  const cleaned = clean(value);
  if (!cleaned) return null;

  // Pure digits → Unix timestamp. Raindrop uses seconds (not ms).
  if (/^\d+$/.test(cleaned)) {
    const seconds = Number(cleaned);
    // Guard against a ms timestamp sneaking through: a 13-digit value is ms.
    const ms = cleaned.length >= 13 ? seconds : seconds * 1000;
    const date = new Date(ms);
    return Number.isNaN(date.getTime()) ? null : date.toISOString();
  }

  const date = new Date(cleaned);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

// Split a Raindrop tags cell into a clean array. The cell is comma-separated
// inside quotes, e.g. "search, app". Tolerate semicolons and stray quotes.
function splitTags(value) {
  if (!value) return [];
  const cleaned = clean(value).replace(/^"|"$/g, '');
  if (!cleaned) return [];
  return cleaned
    .split(/[,;]/)
    .map((tag) => tag.trim())
    .filter(Boolean);
}

// Build the column index map from a header row, case-insensitive. Raindrop's
// canonical order is folder,url,title,note,tags,created but parsing by header
// name (not position) survives column reordering and extra columns.
function indexHeaders(headerRow) {
  const map = {};
  headerRow.forEach((header, index) => {
    const key = clean(header).toLowerCase();
    // Keep the first occurrence so a duplicate header doesn't overwrite.
    if (key && !(key in map)) {
      map[key] = index;
    }
  });
  return map;
}

function rowToBookmark(fields, cols) {
  const get = (name) => (cols[name] !== undefined ? clean(fields[cols[name]]) : '');

  const url = get('url');
  const title = get('title');
  const notes = get('note') || get('notes');
  const tags = splitTags(cols.tags !== undefined ? fields[cols.tags] : '');
  const createdAt = normalizeCreated(cols.created !== undefined ? fields[cols.created] : '');
  const folder = get('folder');

  return {
    url,
    title,
    notes: notes || null,
    tags,
    createdAt,
    folder: folder || null
  };
}

/**
 * Parse a Raindrop.io CSV export into import-ready bookmarks.
 *
 * @param {string} csvText
 * @returns {{ bookmarks: Array<{url:string,title:string,notes:string|null,tags:string[],createdAt:string|null,folder:string|null}>, errors: string[] }}
 *   Rows without a URL are skipped (counted in errors), matching the bulk
 *   import's per-row skip philosophy.
 */
export function parseRaindropCsv(csvText) {
  const errors = [];
  if (typeof csvText !== 'string' || csvText.trim() === '') {
    return { bookmarks: [], errors: ['CSV is empty'] };
  }

  const rows = parseCsv(csvText);
  if (rows.length === 0) {
    return { bookmarks: [], errors: ['CSV has no rows'] };
  }

  const cols = indexHeaders(rows[0]);
  if (cols.url === undefined) {
    return { bookmarks: [], errors: ['CSV is missing a required "url" column'] };
  }

  const bookmarks = [];
  for (let i = 1; i < rows.length; i += 1) {
    const fields = rows[i];
    // Skip fully-blank trailing rows.
    if (fields.every((f) => clean(f) === '')) {
      continue;
    }
    const bookmark = rowToBookmark(fields, cols);
    if (!bookmark.url) {
      errors.push(`Row ${i + 1}: missing URL, skipped`);
      continue;
    }
    bookmarks.push(bookmark);
  }

  return { bookmarks, errors };
}

// --- Netscape HTML parsing ------------------------------------------------
// Every browser (Chrome, Firefox, Safari, Edge) exports bookmarks as the
// Netscape format: <DT><A HREF="…" ADD_DATE="…">Title</A><DD>note
// <H3> marks a folder. We track the open-folder stack so folder reflects the
// nesting. We parse with a tokenizer over <DT>/<DD>/<H3>/<DL> rather than
// relying on DOMParser, so this stays pure and works in any JS context
// (including the test harness and a service worker).

// Match the entire opening <A ...> tag AND capture the HREF value. Capturing
// the full tag (up to and including its closing ">") lets us slice the title
// cleanly as whatever follows the tag — attributes like ADD_DATE must not leak
// into the title text.
const ANCHOR_RE = /<A\b[^>]*\bHREF\s*=\s*"([^"]*)"[^>]*>/i;
const TITLE_CLOSE_RE = /<\/A\s*>/i;
const ADD_DATE_RE = /\bADD_DATE\s*=\s*"([^"]*)"/i;
const H3_TITLE_RE = /<H3[^>]*>([\s\S]*?)<\/H3>/i;

/**
 * Parse a Netscape-format bookmarks HTML export into import-ready bookmarks.
 *
 * @param {string} htmlText
 * @returns {{ bookmarks: Array, errors: string[] }}
 *   Each bookmark carries url, title, notes, tags (empty — Netscape has no tag
 *   concept), createdAt (from ADD_DATE, Unix seconds), and folder (the
 *   <H3>/nesting path joined with "/").
 */
export function parseNetscapeHtml(htmlText) {
  const errors = [];
  if (typeof htmlText !== 'string' || htmlText.trim() === '') {
    return { bookmarks: [], errors: ['HTML is empty'] };
  }

  const bookmarks = [];
  const folderStack = [];

  // Split on <DT> (the per-bookmark delimiter) while preserving <DD>/<DL>/<H3>
  // ordering relative to each bookmark.
  const chunks = htmlText.split(/<DT\b[^>]*>/i);

  for (const chunk of chunks) {
    if (!chunk) continue;

    // Folder open: <H3>Title</H3> pushes onto the stack.
    const h3Match = chunk.match(H3_TITLE_RE);
    if (h3Match) {
      const folderName = clean(h3Match[1].replace(/<[^>]*>/g, ''));
      if (folderName) folderStack.push(folderName);
    }

    // <DL> after an <H3> opens the folder's contents. A </DL> closes it.
    // We approximate by counting net <DL> depth changes across the chunk.

    const anchorMatch = chunk.match(ANCHOR_RE);
    if (anchorMatch) {
      const url = clean(anchorMatch[1]);
      if (!url || !/^https?:\/\//i.test(url)) {
        // Non-http schemes (javascript:, place:, file:) aren't importable.
        continue;
      }

      // Title is the text between the closing ">" of the <A ...> tag and </A>.
      // anchorMatch[0] is the full opening tag, so slice from its end.
      const tagEnd = anchorMatch.index + anchorMatch[0].length;
      const titleRaw = chunk.slice(tagEnd);
      const closeIdx = titleRaw.search(TITLE_CLOSE_RE);
      const titleHtml = closeIdx >= 0 ? titleRaw.slice(0, closeIdx) : titleRaw;
      const title = clean(titleHtml.replace(/<[^>]*>/g, ''));

      // Extract ADD_DATE from the anchor tag itself, not the whole chunk: a
      // folder's <H3 ADD_DATE> can share the same chunk and must not be used.
      const addDateMatch = anchorMatch[0].match(ADD_DATE_RE);
      const createdAt = addDateMatch ? normalizeCreated(addDateMatch[1]) : null;

      // <DD>note appears after the </A> on the following line.
      const ddMatch = chunk.match(/<DD>([\s\S]*?)(?:<DT|<DL|<\/DL|$)/i);
      const notes = ddMatch ? clean(ddMatch[1].replace(/<[^>]*>/g, '')) || null : null;

      bookmarks.push({
        url,
        title,
        notes,
        tags: [],
        createdAt,
        folder: folderStack.length ? folderStack.join('/') : null
      });
    }

    // Folder close: count </DL> after processing this chunk's bookmark.
    const closes = (chunk.match(/<\/DL>/gi) || []).length;
    for (let c = 0; c < closes; c += 1) {
      folderStack.pop();
    }
  }

  return { bookmarks, errors };
}

// --- Newtab JSON backup parsing -------------------------------------------

// The writer always emits 'newtab-backup'. The reader accepts the prior
// 'buckleys-backup' format string too, so .json backups exported before the
// rebrand keep importing unchanged (AGENTS.md rule #7: additive compatibility
// at API boundaries). The presence of a `pages` array is still the real
// schema gate, so very old backups with no `format` field still import.
const ACCEPTED_BACKUP_FORMATS = ['newtab-backup', 'buckleys-backup'];

/**
 * Parse a Newtab JSON backup (produced by bookmark-export.js toJsonBackup).
 * Also accepts legacy 'buckleys-backup' backups.
 *
 * @param {string} jsonText
 * @returns {{ bookmarks: Array, errors: string[] }}
 *   Restores url, title, notes, tags, createdAt, and projectId where present.
 */
export function parseBackupJson(jsonText) {
  const errors = [];
  if (typeof jsonText !== 'string' || jsonText.trim() === '') {
    return { bookmarks: [], errors: ['JSON is empty'] };
  }

  let data;
  try {
    data = JSON.parse(jsonText);
  } catch (error) {
    return { bookmarks: [], errors: [`Invalid JSON: ${error.message}`] };
  }

  if (!data || typeof data !== 'object' || !Array.isArray(data.pages)) {
    return { bookmarks: [], errors: ['JSON is not a Newtab backup (missing "pages" array)'] };
  }

  if (data.format !== undefined && !ACCEPTED_BACKUP_FORMATS.includes(data.format)) {
    return { bookmarks: [], errors: [`JSON is not a Newtab backup (unrecognized format "${data.format}")`] };
  }

  const bookmarks = [];
  data.pages.forEach((page, i) => {
    if (!page || typeof page.url !== 'string' || !page.url) {
      errors.push(`Page ${i + 1}: missing URL, skipped`);
      return;
    }
    bookmarks.push({
      url: page.url,
      title: page.title || '',
      notes: page.notes || page.description || null,
      tags: Array.isArray(page.tags) ? page.tags.map(String) : [],
      createdAt: page.savedAt || page.createdAt || null,
      projectId: page.projectId || null,
      folder: page.folder || null
    });
  });

  return { bookmarks, errors };
}

/**
 * Detect a file's likely source format from its name/content, so the UI can
 * auto-route an uploaded file to the right parser without asking the user.
 *
 * @param {string} filename
 * @param {string} sample - first ~512 chars of the file
 * @returns {'csv'|'html'|'json'|null}
 */
export function detectImportFormat(filename, sample = '') {
  const lower = (filename || '').toLowerCase();
  if (lower.endsWith('.csv')) return 'csv';
  if (lower.endsWith('.json')) return 'json';
  if (lower.endsWith('.html') || lower.endsWith('.htm')) return 'html';

  // Fall back to content sniffing.
  const head = (sample || '').trimStart().slice(0, 512).toLowerCase();
  if (head.startsWith('<!doctype netscape') || head.startsWith('<!doctype html') || head.startsWith('<html')) {
    return 'html';
  }
  if (head.startsWith('{') || head.startsWith('[')) {
    return 'json';
  }
  // A leading line of comma-separated headers — treat as CSV.
  if (head.includes(',') && head.includes('\n')) {
    return 'csv';
  }
  return null;
}
