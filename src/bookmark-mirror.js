// Bookmark mirror: a server-authoritative rendering of a user's saved pages
// into the browser's native bookmarks tree as SaveIt/<project>/ folders.
//
// The server is canonical. The browser folder is a managed rendering of it:
//   - Pages are created/moved/removed to match the server set.
//   - The mirror only ever touches bookmarks it OWNS — others (including
//     strays the user drops inside SaveIt/) are left alone. Ownership is
//     tracked in the persisted state map keyed by saveItPageId.
//   - A stray whose URL matches a desired page is ADOPTED (claimed, then
//     updated/moved like any owned node) rather than duplicated.
//
// Two entry points:
//   reconcile()       — full diff of server set vs. local tree (alarm-driven)
//   mirrorSavedPage() — fast create on the toolbar save path (no diff)

import { normalizeUrl } from './bookmark-reader.js';
import {
  getMirrorState,
  setMirrorState
} from './bookmark-mirror-settings.js';

const ROOT_FOLDER_TITLE = 'SaveIt';
const UNFILED_PROJECT_KEY = null; // sentinel for the Unfiled pseudo-project
const UNFILED_FOLDER_TITLE = 'Unfiled';
const RECONCILE_PAGE_SIZE = 100;
// Re-fetch the whole collection if the last full reconcile is older than this.
// Within the window the HEAD freshness check can short-circuit a reconcile.
const FULL_RECONCILE_INTERVAL_MS = 6 * 60 * 60 * 1000; // 6h

const DEFAULT_BOOKMARKS_API = globalThis.browser?.bookmarks || globalThis.chrome?.bookmarks;

// --- pure planning helpers -------------------------------------------------

// Build the desired-set map: { [saveItPageId]: { projects: Array<projectId|null>, url, title } }.
// A page in zero projects expands to [null] (Unfiled). A page in N projects
// expands to N entries so it gets N bookmark nodes.
export function buildDesiredSet(pages) {
  const desired = {};
  for (const page of pages || []) {
    if (!page?.id || !page?.url) {
      continue;
    }
    const projects = Array.isArray(page.project_ids) && page.project_ids.length > 0
      ? page.project_ids.slice()
      : [UNFILED_PROJECT_KEY];
    desired[page.id] = { projects, url: page.url, title: page.title || '' };
  }
  return desired;
}

// Group all bookmark nodes that live directly inside a folder by normalized URL.
// Used to find adoptable strays. `children` is an array of bookmark tree nodes.
export function indexFolderChildrenByNormalizedUrl(children) {
  const index = new Map();
  for (const node of children || []) {
    if (typeof node.url !== 'string' || node.url === '') {
      continue; // skip subfolders / separators
    }
    index.set(normalizeUrl(node.url), node);
  }
  return index;
}

// Pure diff between desired state and currently-owned state, given a set of
// known folder contents (for adoption). Returns op lists; callers execute them.
//
// folders shape: { rootId, unfiledId, byProject: { [projectId]: folderId }, childrenByFolderId: { [folderId]: node[] } }
export function computeReconcileOps(desired, ownership, folders) {
  const ops = {
    create: [],   // { saveItPageId, projectId, url, title, parentId }
    move: [],     // { bookmarkId, parentId }
    update: [],   // { bookmarkId, title }
    remove: [],   // { bookmarkId }
    adopt: []     // { bookmarkId, saveItPageId, projectId }
  };

  const folderIdFor = (projectId) =>
    projectId === UNFILED_PROJECT_KEY ? folders.unfiledId : folders.byProject[projectId];

  // --- 1. Walk ownership: drop pages/projects we no longer want, drift-fix the rest.
  for (const [pageId, entries] of Object.entries(ownership || {})) {
    const want = desired[pageId];
    if (!want) {
      // Server no longer has this page at all → remove every node we own for it.
      for (const entry of entries) {
        ops.remove.push({ bookmarkId: entry.bookmarkId });
      }
      continue;
    }

    for (const entry of entries) {
      const stillWanted = want.projects.includes(entry.projectId);
      if (!stillWanted) {
        // Page still exists but left this particular project.
        ops.remove.push({ bookmarkId: entry.bookmarkId });
        continue;
      }

      if (want.title !== entry.title) {
        ops.update.push({ bookmarkId: entry.bookmarkId, title: want.title });
      }

      const expectedParent = folderIdFor(entry.projectId);
      if (expectedParent && entry.parentId && expectedParent !== entry.parentId) {
        ops.move.push({ bookmarkId: entry.bookmarkId, parentId: expectedParent });
      }
    }
  }

  // --- 2. Walk desired: ensure a node exists for each (page, project) pair.
  const ownedPairs = new Set();
  for (const [pageId, entries] of Object.entries(ownership || {})) {
    for (const entry of entries) {
      ownedPairs.add(`${pageId}::${entry.projectId}`);
    }
  }

  const consumedStrayBookmarkIds = new Set(
    ops.remove.map((op) => op.bookmarkId)
  );

  for (const [pageId, want] of Object.entries(desired)) {
    for (const projectId of want.projects) {
      if (ownedPairs.has(`${pageId}::${projectId}`)) {
        continue;
      }

      const parentId = folderIdFor(projectId);
      if (!parentId) {
        // Folder for this project doesn't exist yet (ensureMirrorFolders
        // should have created it; skip defensively rather than throw).
        continue;
      }

      // Try to adopt a stray in the target folder matching by URL.
      const folderChildren = folders.childrenByFolderId?.[parentId] || [];
      const index = indexFolderChildrenByNormalizedUrl(folderChildren);
      const stray = index.get(normalizeUrl(want.url));

      if (stray && !consumedStrayBookmarkIds.has(stray.id)) {
        // Claim the stray rather than duplicate. A subsequent update op will
        // fix its title if needed.
        ops.adopt.push({ bookmarkId: stray.id, saveItPageId: pageId, projectId });
        consumedStrayBookmarkIds.add(stray.id);
        if (want.title !== (stray.title || '')) {
          ops.update.push({ bookmarkId: stray.id, title: want.title });
        }
      } else {
        ops.create.push({
          saveItPageId: pageId,
          projectId,
          url: want.url,
          title: want.title,
          parentId
        });
      }
    }
  }

  return ops;
}

// --- folder management -----------------------------------------------------

function findChildFolder(parentChildren, title) {
  for (const node of parentChildren || []) {
    if (node.url === undefined && node.title === title) {
      return node;
    }
  }
  return null;
}

// Recursively search the whole tree for a folder by title. Used to locate an
// existing SaveIt/ root regardless of where the user may have moved it — we
// must not create a duplicate just because it isn't under the default root.
function findFolderByTitleRecursive(nodes, title) {
  for (const node of nodes || []) {
    if (node.url === undefined && node.title === title) {
      return node;
    }
    if (node.children) {
      const found = findFolderByTitleRecursive(node.children, title);
      if (found) {
        return found;
      }
    }
  }
  return null;
}

// Ensure SaveIt/, SaveIt/Unfiled/, and SaveIt/<project>/ all exist, and that
// project folder titles match the current project names. Returns a folders
// descriptor consumed by computeReconcileOps + reconcile.
//
// `existingTree` is the browser bookmarks tree (array of root nodes from
// getTree()); we walk it to find/create the SaveIt/ root under the first
// writable root node (bookmarks toolbar on both Chrome and Firefox).
export async function ensureMirrorFolders({
  bookmarksApi,
  state,
  projects,
  existingTree
}) {
  if (!bookmarksApi?.getTree || !bookmarksApi?.create || !bookmarksApi?.update) {
    throw new Error('Bookmarks API not available');
  }

  const tree = existingTree || await bookmarksApi.getTree();
  // Root nodes have no url and contain children. Use the first one as the
  // parent for SaveIt/ (the bookmarks toolbar in both browsers is rooted
  // under one of these; the first root works universally for a top-level
  // folder).
  const writableRoot = (Array.isArray(tree) ? tree : []).find(
    (node) => Array.isArray(node.children)
  ) || tree?.[0];

  if (!writableRoot) {
    throw new Error('No writable bookmarks root found');
  }

  const rootParentId = writableRoot.id;

  // --- SaveIt/ root ---
  let rootFolderId = state.rootFolderId;
  if (!rootFolderId) {
    // The user may have moved SaveIt/ anywhere; search the whole tree before
    // creating a duplicate.
    let saveItFolder = findFolderByTitleRecursive(tree, ROOT_FOLDER_TITLE);
    if (!saveItFolder) {
      saveItFolder = await bookmarksApi.create({
        parentId: rootParentId,
        title: ROOT_FOLDER_TITLE
      });
    }
    rootFolderId = saveItFolder.id;
  }

  // Always re-read SaveIt/'s children so we observe the current truth
  // (the user may have added folders since our last reconcile).
  let saveItChildren = (await bookmarksApi.getChildren(rootFolderId)) || [];

  // --- Unfiled/ ---
  let unfiledFolderId = state.unfiledFolderId;
  if (!unfiledFolderId) {
    let unfiledFolder = findChildFolder(saveItChildren, UNFILED_FOLDER_TITLE);
    if (!unfiledFolder) {
      const created = await bookmarksApi.create({
        parentId: rootFolderId,
        title: UNFILED_FOLDER_TITLE
      });
      unfiledFolder = created;
    }
    unfiledFolderId = unfiledFolder.id;
  }

  // --- per-project folders, with rename handling ---
  const projectFolders = { ...state.projectFolders };
  const byProject = {};
  for (const project of projects || []) {
    if (!project?.id || project.archived === true) {
      continue; // archived projects are not mirrored
    }
    const desiredName = project.name || 'Untitled';
    const known = projectFolders[project.id];

    if (known?.id) {
      byProject[project.id] = known.id;
      if (known.name !== desiredName) {
        // Project renamed server-side → rename the folder to match.
        await bookmarksApi.update(known.id, { title: desiredName });
        projectFolders[project.id] = { id: known.id, name: desiredName };
      }
      continue;
    }

    // Not tracked yet. Look for an existing folder with the right name, else create.
    let folder = findChildFolder(saveItChildren, desiredName);
    if (!folder) {
      folder = await bookmarksApi.create({
        parentId: rootFolderId,
        title: desiredName
      });
    }
    byProject[project.id] = folder.id;
    projectFolders[project.id] = { id: folder.id, name: desiredName };
  }

  // Drop tracking entries for projects that no longer exist. Their bookmark
  // folders stay (the user might be using them); we just forget the link so a
  // future project with the same id re-binds cleanly. Bookmark contents under
  // them become strays and are left alone per policy.
  const liveProjectIds = new Set((projects || []).map((p) => p?.id).filter(Boolean));
  for (const id of Object.keys(projectFolders)) {
    if (!liveProjectIds.has(id)) {
      delete projectFolders[id];
    }
  }

  return {
    statePatch: { rootFolderId, unfiledFolderId, projectFolders },
    folders: { rootId: rootFolderId, unfiledId: unfiledFolderId, byProject }
  };
}

// Read all children of every folder we care about, for adoption lookups.
async function readFolderChildrenByFolderId(bookmarksApi, folderIds) {
  const entries = await Promise.all(
    folderIds.map(async (id) => [id, (await bookmarksApi.getChildren(id)) || []])
  );
  return Object.fromEntries(entries);
}

// --- orchestration ---------------------------------------------------------

// Fetch the entire saved-page set, paging through cursors. Bypasses the
// WarmCacheListStore (which is UI-windowed) — the mirror wants the whole set.
async function fetchAllPages(api) {
  const all = [];
  let cursor = null;
  do {
    const res = await api.getSavedPages({
      limit: RECONCILE_PAGE_SIZE,
      sort: 'newest',
      cursor,
      skipCache: true
    });
    // Require the expected { pages, pagination } shape. Previously a non-
    // conforming response (e.g. a request that returned the wrong shape) was
    // silently coerced to [], which made reconcile create zero bookmarks with
    // no error — the bug that hid the GET-body-vs-query-string mismatch in
    // background.js for the whole v1.17 cycle. Throw so miswired calls fail
    // loudly instead.
    if (!res || !Array.isArray(res.pages)) {
      throw new Error('Saved pages response was missing the expected { pages } shape');
    }
    all.push(...res.pages);
    cursor = res?.pagination?.hasNextPage ? res.pagination.nextCursor : null;
  } while (cursor);
  return all;
}

// Decide whether a HEAD freshness check is worth doing before a full fetch.
// Within the reconcile window, the HEAD can short-circuit a no-op reconcile.
async function shouldShortCircuitReconcile(api, state, now) {
  if (!state.lastFullReconcileAt) {
    return false;
  }
  if (now - state.lastFullReconcileAt > FULL_RECONCILE_INTERVAL_MS) {
    return false;
  }
  if (typeof api.checkSavedPagesUpdates !== 'function') {
    return false;
  }
  try {
    const freshness = await api.checkSavedPagesUpdates({});
    // If the server reports no updates and we reconciled recently, skip.
    return freshness?.hasUpdates === false;
  } catch {
    return false;
  }
}

// Apply an op plan against the bookmarks API and produce the next ownership map.
// Executed op-by-op; a single op failure is logged and skipped (the next
// reconcile will retry) rather than aborting the whole pass.
async function applyOps({ bookmarksApi, ops, ownership, folders, onWarn }) {
  const nextOwnership = {};
  for (const [pageId, entries] of Object.entries(ownership || {})) {
    nextOwnership[pageId] = entries.map((e) => ({ ...e }));
  }
  const ensureOwnership = (pageId, projectId, bookmarkId, title, parentId) => {
    (nextOwnership[pageId] ||= []).push({ projectId, bookmarkId, title, parentId });
  };

  // 1. removes
  for (const op of ops.remove) {
    try {
      await bookmarksApi.remove(op.bookmarkId);
    } catch (error) {
      // Already gone is fine; anything else is non-fatal — next reconcile retries.
      onWarn?.(`remove failed for ${op.bookmarkId}: ${error?.message || error}`);
    }
  }

  // 2. moves
  for (const op of ops.move) {
    try {
      await bookmarksApi.move(op.bookmarkId, { parentId: op.parentId });
    } catch (error) {
      onWarn?.(`move failed for ${op.bookmarkId}: ${error?.message || error}`);
    }
  }

  // 3. updates
  for (const op of ops.update) {
    try {
      await bookmarksApi.update(op.bookmarkId, { title: op.title });
      // Reflect the new title in ownership entries that reference this bookmark.
      for (const entries of Object.values(nextOwnership)) {
        const entry = entries.find((e) => e.bookmarkId === op.bookmarkId);
        if (entry) {
          entry.title = op.title;
        }
      }
    } catch (error) {
      onWarn?.(`update failed for ${op.bookmarkId}: ${error?.message || error}`);
    }
  }

  // 4. adoptions — claim existing strays into the ownership map.
  for (const op of ops.adopt) {
    const desired = ownership?.[op.saveItPageId];
    // Use the title we just updated to (or will update to) for drift tracking.
    const updateOp = ops.update.find((u) => u.bookmarkId === op.bookmarkId);
    const title = updateOp?.title ?? desired?.title ?? '';
    const parentId = op.projectId === UNFILED_PROJECT_KEY
      ? folders.unfiledId
      : folders.byProject[op.projectId];
    ensureOwnership(op.saveItPageId, op.projectId, op.bookmarkId, title, parentId);
  }

  // 5. creates
  for (const op of ops.create) {
    try {
      const created = await bookmarksApi.create({
        parentId: op.parentId,
        title: op.title,
        url: op.url
      });
      ensureOwnership(op.saveItPageId, op.projectId, created.id, op.title, op.parentId);
    } catch (error) {
      onWarn?.(`create failed for ${op.saveItPageId}: ${error?.message || error}`);
    }
  }

  // Purge ownership entries whose bookmark was removed this pass — without
  // this, removed pages would linger in the map forever (we copied them in
  // at the top, and the removes loop above doesn't touch nextOwnership).
  const removedBookmarkIds = new Set(ops.remove.map((op) => op.bookmarkId));
  for (const pageId of Object.keys(nextOwnership)) {
    nextOwnership[pageId] = nextOwnership[pageId].filter(
      (entry) => !removedBookmarkIds.has(entry.bookmarkId)
    );
    if (nextOwnership[pageId].length === 0) {
      delete nextOwnership[pageId];
    }
  }

  return { nextOwnership };
}

/**
 * Run a full reconcile of the browser mirror against the server set.
 *
 * @param {object} options
 * @param {object} [options.bookmarksApi]
 * @param {object} options.api - SaveIt API facade (getSavedPages, getProjects)
 * @param {object} options.storage - browser.storage.local-compatible
 * @param {function} [options.onWarn] - non-fatal warning sink (logger)
 * @param {boolean} [options.forceFull] - skip the HEAD short-circuit
 * @returns {Promise<{ applied: boolean, summary: object }>}
 */
export async function reconcile({
  bookmarksApi = DEFAULT_BOOKMARKS_API,
  api,
  storage,
  onWarn,
  forceFull = false
} = {}) {
  if (!bookmarksApi?.getTree) {
    throw new Error('Bookmarks API not available');
  }
  if (!storage?.get || !storage?.set) {
    throw new Error('Storage not available');
  }

  const state = await getMirrorState(storage);
  if (!state.enabled) {
    return { applied: false, summary: { reason: 'disabled' } };
  }

  const now = Date.now();
  if (!forceFull && await shouldShortCircuitReconcile(api, state, now)) {
    return { applied: false, summary: { reason: 'freshness-short-circuit' } };
  }

  const [pages, projectsResult] = await Promise.all([
    fetchAllPages(api),
    typeof api.getProjects === 'function' ? api.getProjects() : []
  ]);
  const projects = Array.isArray(projectsResult) ? projectsResult : [];

  const { statePatch, folders } = await ensureMirrorFolders({
    bookmarksApi,
    state,
    projects,
    existingTree: null
  });
  const mergedState = { ...state, ...statePatch };
  await setMirrorState(storage, statePatch);

  // Read live children of every folder so computeReconcileOps can find strays.
  const allFolderIds = [
    folders.unfiledId,
    ...Object.values(folders.byProject)
  ].filter(Boolean);
  const childrenByFolderId = await readFolderChildrenByFolderId(bookmarksApi, allFolderIds);

  const desired = buildDesiredSet(pages);
  const ops = computeReconcileOps(desired, mergedState.ownership, {
    rootId: folders.rootId,
    unfiledId: folders.unfiledId,
    byProject: folders.byProject,
    childrenByFolderId
  });

  const { nextOwnership } = await applyOps({
    bookmarksApi,
    ops,
    ownership: mergedState.ownership,
    folders,
    onWarn
  });

  await setMirrorState(storage, {
    ownership: nextOwnership,
    lastFullReconcileAt: now
  });

  return {
    applied: true,
    summary: {
      pages: pages.length,
      creates: ops.create.length,
      adopts: ops.adopt.length,
      updates: ops.update.length,
      moves: ops.move.length,
      removes: ops.remove.length
    }
  };
}

/**
 * Fast-path create used by the toolbar save flow. Creates the bookmark
 * immediately in the right folder (or Unfiled). Does NOT update the ownership
 * map: the next periodic reconcile claims it by URL match. The "leave strays
 * alone" policy means an unclaimed-but-mirrored bookmark is safe in the interim.
 *
 * @returns {Promise<{ created: boolean, bookmarkId: string|null }>}
 */
export async function mirrorSavedPage({
  bookmarksApi = DEFAULT_BOOKMARKS_API,
  storage,
  api,
  url,
  title,
  projectId = null
} = {}) {
  if (!bookmarksApi?.create) {
    return { created: false, bookmarkId: null };
  }
  const state = await getMirrorState(storage);
  if (!state.enabled || !state.rootFolderId) {
    return { created: false, bookmarkId: null };
  }

  // Ensure the target project folder exists. Cheap path: if we already track
  // it, reuse; otherwise do a focused ensure for just this project.
  let targetFolderId = projectId === UNFILED_PROJECT_KEY || !projectId
    ? state.unfiledFolderId
    : state.projectFolders[projectId]?.id;

  if (!targetFolderId) {
    const projects = Array.isArray(api?.getProjects)
      ? await api.getProjects().catch(() => [])
      : [];
    const { statePatch, folders } = await ensureMirrorFolders({
      bookmarksApi,
      state,
      projects,
      existingTree: null
    });
    await setMirrorState(storage, statePatch);
    targetFolderId = projectId === UNFILED_PROJECT_KEY || !projectId
      ? folders.unfiledId
      : folders.byProject[projectId];

    if (!targetFolderId) {
      // No project folder could be resolved → fall back to Unfiled so the
      // bookmark still lands somewhere under SaveIt/.
      targetFolderId = folders.unfiledId;
    }
  }

  const created = await bookmarksApi.create({
    parentId: targetFolderId,
    title: title || '',
    url
  });
  return { created: true, bookmarkId: created.id };
}

export const _internal = {
  ROOT_FOLDER_TITLE,
  UNFILED_FOLDER_TITLE,
  UNFILED_PROJECT_KEY,
  FULL_RECONCILE_INTERVAL_MS
};
