// bookmark-export.js - Pure serializers for exporting saved pages.
//
// Three formats, all producing strings the caller can wrap in a Blob and
// download. Export reads pages through the existing getSavedPages read (which
// already returns url, title, description, domain, saved_at, manual_tags,
// project_ids), so no backend export endpoint is needed.
//
// The internal page shape (what the API returns) is:
//   { id, url, title, description, domain, saved_at, manual_tags[], project_ids[] }
//
// Project names are resolved by the caller and passed as a Map so the
// serializer stays pure and testable.

// --- CSV helpers (shared with the import-side parser philosophy) -----------
// Escape a single CSV field per RFC-4180: wrap in quotes if it contains a
// comma, quote, newline, or leading/trailing space; double any inner quotes.
function csvField(value) {
  const str = value == null ? '' : String(value);
  if (/[",\n\r]/.test(str) || /^\s|\s$/.test(str)) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

function csvRow(fields) {
  return fields.map(csvField).join(',');
}

/**
 * Serialize pages to a Raindrop.io-compatible CSV. Round-trips with
 * parseRaindropCsv: columns folder,url,title,note,tags,created match
 * Raindrop's documented import schema.
 *
 * @param {Array} pages - saved pages from getSavedPages
 * @param {Map<string,string>} [projectNameById] - projectId -> project name, for the folder column
 * @returns {string} CSV text
 */
export function toRaindropCsv(pages, projectNameById = new Map()) {
  const header = csvRow(['folder', 'url', 'title', 'note', 'tags', 'created']);
  const lines = [header];

  for (const page of pages || []) {
    if (!page?.url) continue;

    // A page may belong to several projects; use the first project name as the
    // folder (Raindrop's folder is single-valued). No project → blank folder.
    const projectIds = Array.isArray(page.project_ids) ? page.project_ids : [];
    const folder = projectIds.length
      ? projectIds.map((id) => projectNameById.get(id)).filter(Boolean)[0] || ''
      : '';

    const tags = Array.isArray(page.manual_tags) ? page.manual_tags.join(', ') : '';
    // Raindrop expects a Unix timestamp (seconds) for created. saved_at is ISO.
    const created = page.saved_at ? toUnixSeconds(page.saved_at) : '';

    lines.push(csvRow([
      folder,
      page.url,
      page.title || '',
      page.description || '',
      tags,
      created
    ]));
  }

  return `${lines.join('\n')}\n`;
}

function toUnixSeconds(isoOrMs) {
  if (isoOrMs == null) return '';
  const date = new Date(isoOrMs);
  const ms = date.getTime();
  return Number.isNaN(ms) ? '' : String(Math.floor(ms / 1000));
}

/**
 * Serialize pages + projects to a versioned Buckley's JSON backup. This is the
 * full-fidelity format: round-trips with parseBackupJson.
 *
 * @param {Array} pages
 * @param {Array} [projects]
 * @returns {string} pretty-printed JSON
 */
export function toJsonBackup(pages, projects = []) {
  const backup = {
    format: 'buckleys-backup',
    version: 1,
    exportedAt: new Date().toISOString(),
    pages: (pages || [])
      .filter((page) => page?.url)
      .map((page) => ({
        url: page.url,
        title: page.title || '',
        description: page.description || null,
        notes: page.notes || page.description || null,
        tags: Array.isArray(page.manual_tags) ? page.manual_tags : [],
        savedAt: page.saved_at || null,
        projectId: Array.isArray(page.project_ids) ? page.project_ids[0] || null : null
      })),
    projects: (projects || [])
      .filter((project) => project?.id)
      .map((project) => ({
        id: project.id,
        name: project.name || '',
        visibility: project.visibility || null
      }))
  };

  return JSON.stringify(backup, null, 2);
}

// Escape HTML text content for the Netscape format. ADD_DATE values are
// Unix-seconds attribute strings; titles get full attribute escaping.
function escapeHtmlText(text) {
  return String(text == null ? '' : text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}
function escapeHtmlAttr(text) {
  return escapeHtmlText(text).replace(/"/g, '&quot;');
}

/**
 * Serialize pages to a Netscape-format bookmarks HTML file, importable by every
 * browser (Chrome, Firefox, Safari, Edge). A single flat folder under
 * "Buckley's" — browser import doesn't need project/domain subfolders, and a
 * flat export is the least surprising artifact.
 *
 * @param {Array} pages
 * @returns {string} bookmarks HTML
 */
export function toNetscapeHtml(pages) {
  const date = new Date().toISOString();
  const lines = [
    '<!DOCTYPE NETSCAPE-Bookmark-file-1>',
    '<META HTTP-EQUIV="Content-Type" CONTENT="text/html; charset=UTF-8">',
    '<TITLE>Bookmarks</TITLE>',
    '<H1>Bookmarks</H1>',
    '<DL><p>',
    `    <DT><H3 ADD_DATE="${toUnixSeconds(date)}">Buckley's</H3>`,
    '    <DL><p>'
  ];

  for (const page of pages || []) {
    if (!page?.url) continue;
    const addDate = page.saved_at ? toUnixSeconds(page.saved_at) : '';
    const title = page.title || page.url;
    lines.push(
      `        <DT><A HREF="${escapeHtmlAttr(page.url)}"${addDate ? ` ADD_DATE="${addDate}"` : ''}>${escapeHtmlText(title)}</A>`
    );
    if (page.description) {
      lines.push(`        <DD>${escapeHtmlText(page.description)}`);
    }
  }

  lines.push('    </DL><p>', '</DL><p>');
  return `${lines.join('\n')}\n`;
}
