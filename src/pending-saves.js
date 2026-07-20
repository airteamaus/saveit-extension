// pending-saves.js — durable "pending save" records in storage.local.
//
// When a user saves a page, the backend's async enrichment (~28s) hasn't
// written the Firestore thing doc yet, so the new page is absent from the
// next list fetch. To avoid the page silently not appearing for up to the
// cache TTL (or until a manual refresh), the background writes a pending
// record here at save time. newtab renders pending records as optimistic
// tiles (built via buildOptimisticPage) and the background removes the record
// once enrichment completes — at which point a normal list fetch includes
// the real doc and the tile is replaced.
//
// Records are keyed by normalized URL so a re-save of the same URL collapses
// into one pending entry rather than stacking tiles.

export const PENDING_SAVES_KEY = 'saveit_pendingSaves';

// Normalize a URL for use as a pending-record key. Lowercases the host and
// strips a trailing slash so "https://X/y" and "https://X/y/" collapse. Kept
// intentionally simple — this only needs to match the same URL across a
// re-save, not to canonicalize every possible URL form.
export function normalizePendingUrl(url) {
  if (!url || typeof url !== 'string') {
    return '';
  }
  try {
    const u = new URL(url);
    const host = u.host.toLowerCase();
    const path = u.pathname.replace(/\/$/, '');
    return `${u.protocol}//${host}${path}${u.search}`;
  } catch {
    return url.trim();
  }
}

function deriveDomain(url) {
  try {
    return new URL(url).host;
  } catch {
    return null;
  }
}

// Read all pending saves as an object keyed by normalized url.
// Returns {} when none exist or storage is unavailable.
export async function getPendingSaves(storage) {
  if (!storage?.get) {
    return {};
  }
  const result = await storage.get(PENDING_SAVES_KEY);
  const records = result?.[PENDING_SAVES_KEY];
  if (!records || typeof records !== 'object') {
    return {};
  }
  return records;
}

// Write (or overwrite) a pending save record. The record should carry the
// fields needed to render an optimistic tile: url, title, description, image,
// saved_at, and optionally project_ids / projectId.
export async function addPendingSave(storage, record) {
  if (!storage?.get || !storage?.set) {
    return;
  }
  if (!record?.url) {
    return;
  }
  const key = normalizePendingUrl(record.url);
  if (!key) {
    return;
  }
  const records = await getPendingSaves(storage);
  records[key] = {
    url: record.url,
    title: record.title || '',
    description: record.description || null,
    image: record.image || null,
    saved_at: record.saved_at || new Date().toISOString(),
    project_ids: Array.isArray(record.project_ids) ? record.project_ids : []
  };
  await storage.set({ [PENDING_SAVES_KEY]: records });
}

// Write many pending-save records in a single read-modify-write. Used by bulk
// import so a large batch (up to 1000) doesn't trigger a read-modify-write per
// row. Records map by normalized url, so a batch with duplicate urls (or urls
// already pending from a prior save) collapses to one tile each.
export async function addPendingSaves(storage, records) {
  if (!storage?.get || !storage?.set || !Array.isArray(records) || records.length === 0) {
    return;
  }
  const existing = await getPendingSaves(storage);
  for (const record of records) {
    if (!record?.url) continue;
    const key = normalizePendingUrl(record.url);
    if (!key) continue;
    existing[key] = {
      url: record.url,
      title: record.title || '',
      description: record.description || null,
      image: record.image || null,
      saved_at: record.saved_at || new Date().toISOString(),
      project_ids: Array.isArray(record.project_ids) ? record.project_ids : []
    };
  }
  await storage.set({ [PENDING_SAVES_KEY]: existing });
}

// Remove a single pending save by url (normalized). Safe if it doesn't exist.
export async function clearPendingSave(storage, url) {
  if (!storage?.get || !storage?.remove) {
    return;
  }
  const key = normalizePendingUrl(url);
  if (!key) {
    return;
  }
  const records = await getPendingSaves(storage);
  if (!(key in records)) {
    return;
  }
  delete records[key];
  if (Object.keys(records).length === 0) {
    await storage.remove(PENDING_SAVES_KEY);
  } else {
    await storage.set({ [PENDING_SAVES_KEY]: records });
  }
}

// Build a renderer-safe optimistic page object from a pending record. The
// resulting object has every field the drawer card reads, with null/empty
// defaults for the enrichment-only fields (AI summary, classifications,
// reading time) that aren't known until the real doc arrives. The `optimistic`
// flag marks the tile so the list store can exclude it from anchor selection
// (a synthetic id must never become the incremental-sync anchor).
export function buildOptimisticPage(record, { projectId = null } = {}) {
  const url = record?.url || '';
  const normalized = normalizePendingUrl(url);
  const projectIds = Array.isArray(record?.project_ids) && record.project_ids.length > 0
    ? record.project_ids
    : (projectId ? [projectId] : []);

  return {
    id: `optimistic:${normalized}`,
    url,
    title: record?.title || '',
    description: record?.description || null,
    image: record?.image || null,
    domain: deriveDomain(url),
    saved_at: record?.saved_at || new Date().toISOString(),
    pinned: false,
    manual_tags: [],
    project_ids: projectIds,
    classifications: [],
    primary_classification_label: null,
    ai_summary_brief: null,
    ai_summary_extended: null,
    reading_time_minutes: null,
    optimistic: true
  };
}

// Detect an optimistic (not-yet-enriched) tile. Two equivalent signals exist:
// the `optimistic: true` flag stamped by buildOptimisticPage, and the
// `optimistic:` id prefix used by the store and sync observers. Check both so
// callers don't have to remember which signal a given code path set — and so a
// tile built before the flag was added still counts.
//
// Why this matters: an optimistic id is `optimistic:<normalized-url>`, and the
// URL's protocol leaves `//` in the id (e.g. `optimistic:https://...`). That
// makes the id an invalid Firestore document path, so any action that sends it
// to the backend (pin, edit, privacy, project toggles) crashes. Guard callers
// with this instead of letting those actions fire.
export function isOptimisticPage(page) {
  return page?.optimistic === true || String(page?.id || '').startsWith('optimistic:');
}
