// Bookmark mirror: a server-authoritative rendering of a user's saved pages
// into the browser's native bookmarks tree as Buckley's/<project>/ folders.
//
// The server is canonical. The browser folder is a managed rendering of it:
//   - Pages are created/moved/removed to match the server set.
//   - The mirror only ever touches bookmarks it OWNS — others (including
//     strays the user drops inside Buckley's/) are left alone. Ownership is
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

const ROOT_FOLDER_TITLE = "Buckley's";
// Earlier brand names for the root folder. Users who enabled the mirror under
// a previous name keep that folder (same id, same children); on the next
// reconcile we rename it in place to the current title rather than orphaning
// it for a fresh tree. 'SaveIt' is the pre-rebrand name; 'Buckleys' was a
// short-lived interim brand before the apostrophe was added.
const LEGACY_ROOT_FOLDER_TITLES = ['SaveIt', 'Buckleys'];
const OTHER_FOLDER_TITLE = 'Other'; // pages with no AI general classification
const GENERAL_SUBBUCKET_TITLE = 'General'; // sub-folder for pages with no AI domain classification within a >10 bucket
// Sentinel general label for pages that have no AI 'general' classification.
const OTHER_DOMAIN_KEY = '__other__';
// Above this count a project/domain folder is split into per-subdomain child folders.
const SUBBUCKET_THRESHOLD = 10;
const RECONCILE_PAGE_SIZE = 100;
// Re-fetch the whole collection if the last full reconcile is older than this.
// Within the window the HEAD freshness check can short-circuit a reconcile.
const FULL_RECONCILE_INTERVAL_MS = 6 * 60 * 60 * 1000; // 6h

const DEFAULT_BOOKMARKS_API = globalThis.browser?.bookmarks || globalThis.chrome?.bookmarks;

// --- classification extraction --------------------------------------------

// The AI classification hierarchy: 'general' (broad area, e.g. "Software
// Development") -> 'domain' (specialised sub-area, e.g. "Frontend Development")
// -> 'topic' (specific concept). Each page may carry several of each type.
// For folder placement we only ever need one label per level; pick the
// highest-confidence one of the requested type.

function topClassificationLabel(classifications, type) {
  if (!Array.isArray(classifications)) return null;
  let best = null;
  for (const c of classifications) {
    if (!c || c.type !== type) continue;
    if (!best || (c.confidence ?? 0) > (best.confidence ?? 0)) {
      best = c;
    }
  }
  return best?.label || null;
}

// The broad "domain" / folder-level bucket labels for a page. Mirrors the
// user-aggregate semantics (shared/user-aggregates.js buildUserAggregate): a
// page appears under EVERY one of its 'general' classifications, not just the
// primary one. When the page has no general classification at all it falls
// back to the sentinel "Other" key. Returns an array of general keys (labels
// or OTHER_DOMAIN_KEY), de-duplicated, order-stable.
//
// primary_classification_label is included when present so a page whose
// primary label was set by the enricher but whose classifications array also
// carries it doesn't double-count; it just guarantees the primary label is
// represented even if the array omitted it.
function generalBucketLabels(page) {
  const labels = new Set();
  const classifications = Array.isArray(page?.classifications) ? page.classifications : [];
  for (const c of classifications) {
    if (c?.type === 'general' && c.label) {
      labels.add(c.label);
    }
  }
  if (page?.primary_classification_label) {
    labels.add(page.primary_classification_label);
  }
  if (labels.size === 0) {
    return [OTHER_DOMAIN_KEY];
  }
  return Array.from(labels);
}

// The sub-bucket label for a page within a >10 folder: the AI 'domain'
// (specialised sub-area) classification label, falling back to a "General"
// sentinel when absent. Returns null when no domain classification exists.
function subBucketLabel(page) {
  return topClassificationLabel(page?.classifications, 'domain') || GENERAL_SUBBUCKET_TITLE;
}

// --- bucket keys ----------------------------------------------------------
// A bucket key names a single folder placement. Two families:
//   project:<projectId>  -> Buckley's/<ProjectName>/[<SubLabel>/]
//   domain:<generalKey>  -> Buckley's/<GeneralLabel-or-Other>/[<SubLabel>/]
// The generalKey is the label string or the OTHER_DOMAIN_KEY sentinel.

function projectBucketKey(projectId) {
  return `project:${projectId}`;
}

function domainBucketKey(generalKey) {
  return `domain:${generalKey}`;
}

function isProjectBucket(key) {
  return key.startsWith('project:');
}

function projectIdFromBucket(key) {
  return key.slice('project:'.length);
}

function generalKeyFromBucket(key) {
  return key.slice('domain:'.length);
}

// --- pure planning helpers -------------------------------------------------

// Build the desired-set map:
//   { [saveItPageId]: { buckets: Array<bucketKey>, url, title, subLabels: { [bucketKey]: subLabel|null } } }
// A page in N projects expands to N project buckets. A page also gets one
// domain bucket per general classification label (or "Other" when it has
// none) — so a project page appears in its project folder AND each of its
// domain folders, mirroring the sidebar's project + category split. Each
// bucket entry becomes its own bookmark.
export function buildDesiredSet(pages) {
  const desired = {};
  for (const page of pages || []) {
    if (!page?.id || !page?.url) {
      continue;
    }
    const buckets = [];
    const subLabels = {};

    const projectIds = Array.isArray(page.project_ids) ? page.project_ids : [];
    for (const projectId of projectIds) {
      const key = projectBucketKey(projectId);
      buckets.push(key);
      subLabels[key] = subBucketLabel(page);
    }

    // One domain bucket per general classification label (matching the user
    // aggregate's per-category thing list), or a single Other bucket.
    for (const gKey of generalBucketLabels(page)) {
      const dKey = domainBucketKey(gKey);
      buckets.push(dKey);
      subLabels[dKey] = subBucketLabel(page);
    }

    desired[page.id] = {
      buckets,
      url: page.url,
      title: page.title || '',
      subLabels
    };
  }
  return desired;
}

// Compute the folder plan from a desired set: which buckets exist, how many
// pages each holds, and whether each needs sub-bucket folders (> threshold).
// Pure; the folder builder consumes this to decide what to create.
//
// Returns { buckets: { [bucketKey]: { count, needsSubbuckets, kind, ref } } }
// where kind is 'project'|'domain' and ref is the projectId or generalKey.
export function computeBucketPlan(desired) {
  const counts = new Map();
  // subLabel distribution per bucket: { bucketKey: Map<subLabel, count> }
  const subDistribution = new Map();

  for (const entry of Object.values(desired || {})) {
    for (const key of entry.buckets) {
      counts.set(key, (counts.get(key) || 0) + 1);
      const sub = entry.subLabels?.[key] || GENERAL_SUBBUCKET_TITLE;
      if (!subDistribution.has(key)) subDistribution.set(key, new Map());
      const dist = subDistribution.get(key);
      dist.set(sub, (dist.get(sub) || 0) + 1);
    }
  }

  const buckets = {};
  for (const [key, count] of counts) {
    const needsSubbuckets = count > SUBBUCKET_THRESHOLD;
    let kind; let ref;
    if (isProjectBucket(key)) {
      kind = 'project';
      ref = projectIdFromBucket(key);
    } else {
      kind = 'domain';
      ref = generalKeyFromBucket(key);
    }
    buckets[key] = {
      count,
      needsSubbuckets,
      kind,
      ref,
      subBuckets: needsSubbuckets ? Object.fromEntries(subDistribution.get(key)) : null
    };
  }
  return { buckets };
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
// folders shape: {
//   rootId,
//   byBucket: { [bucketKey]: folderId },          // top-level project/domain folder
//   bySubBucket: { [bucketKey]: { [subLabel]: folderId } }, // sub-buckets for >10 folders
//   bucketPlan: { [bucketKey]: { needsSubbuckets } },       // from computeBucketPlan
//   childrenByFolderId: { [folderId]: node[] }
// }
export function computeReconcileOps(desired, ownership, folders) {
  const ops = {
    create: [],   // { saveItPageId, bucketKey, url, title, parentId }
    move: [],     // { bookmarkId, parentId }
    update: [],   // { bookmarkId, title }
    remove: [],   // { bookmarkId }
    adopt: []     // { bookmarkId, saveItPageId, bucketKey }
  };

  // Resolve the parent folder for a (bucketKey, page) pair. When the bucket is
  // sub-bucketed, descend into the page's sub-label folder under it.
  const folderIdFor = (bucketKey, want) => {
    const topId = folders.byBucket?.[bucketKey];
    if (!topId) return null;
    const needsSub = folders.bucketPlan?.[bucketKey]?.needsSubbuckets;
    if (!needsSub) return topId;
    const subLabel = want?.subLabels?.[bucketKey] || GENERAL_SUBBUCKET_TITLE;
    return folders.bySubBucket?.[bucketKey]?.[subLabel] || topId;
  };

  // --- 1. Walk ownership: drop pages/buckets we no longer want, drift-fix the rest.
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
      const stillWanted = want.buckets.includes(entry.bucketKey);
      if (!stillWanted) {
        // Page still exists but left this particular bucket (project or domain).
        ops.remove.push({ bookmarkId: entry.bookmarkId });
        continue;
      }

      if (want.title !== entry.title) {
        ops.update.push({ bookmarkId: entry.bookmarkId, title: want.title });
      }

      const expectedParent = folderIdFor(entry.bucketKey, want);
      if (expectedParent && entry.parentId && expectedParent !== entry.parentId) {
        ops.move.push({ bookmarkId: entry.bookmarkId, parentId: expectedParent });
      }
    }
  }

  // --- 2. Walk desired: ensure a node exists for each (page, bucket) pair.
  const ownedPairs = new Set();
  for (const [pageId, entries] of Object.entries(ownership || {})) {
    for (const entry of entries) {
      ownedPairs.add(`${pageId}::${entry.bucketKey}`);
    }
  }

  const consumedStrayBookmarkIds = new Set(
    ops.remove.map((op) => op.bookmarkId)
  );

  for (const [pageId, want] of Object.entries(desired)) {
    for (const bucketKey of want.buckets) {
      if (ownedPairs.has(`${pageId}::${bucketKey}`)) {
        continue;
      }

      const parentId = folderIdFor(bucketKey, want);
      if (!parentId) {
        // Folder for this bucket doesn't exist yet (ensureMirrorFolders
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
        ops.adopt.push({ bookmarkId: stray.id, saveItPageId: pageId, bucketKey, parentId });
        consumedStrayBookmarkIds.add(stray.id);
        if (want.title !== (stray.title || '')) {
          ops.update.push({ bookmarkId: stray.id, title: want.title });
        }
      } else {
        ops.create.push({
          saveItPageId: pageId,
          bucketKey,
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
// existing Buckley's/ root regardless of where the user may have moved it — we
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

// Recursively search the whole tree for a node by id (folder or bookmark).
// Used by the rebrand migration to look up a tracked rootFolderId and check
// whether its title still needs renaming.
function findNodeById(nodes, id) {
  for (const node of nodes || []) {
    if (node.id === id) {
      return node;
    }
    if (node.children) {
      const found = findNodeById(node.children, id);
      if (found) {
        return found;
      }
    }
  }
  return null;
}

// Resolve a top-level folder under Buckley's/ for a given title, reusing an
// existing one or creating it. `tracked` is the caller's { id, name } map to
// keep in sync (projectFolders or domainFolders).
async function ensureTopLevelFolder({
  bookmarksApi, saveItChildren, rootFolderId, desiredTitle, tracked, trackedKey, existing
}) {
  const known = tracked[trackedKey];
  if (known?.id) {
    if (known.name !== desiredTitle) {
      await bookmarksApi.update(known.id, { title: desiredTitle });
      tracked[trackedKey] = { id: known.id, name: desiredTitle };
    }
    return known.id;
  }
  // Reuse an existing folder of the same title if present (covers first run
  // and the "left over from a previous reconcile" case).
  let folder = existing || findChildFolder(saveItChildren, desiredTitle);
  if (!folder) {
    folder = await bookmarksApi.create({ parentId: rootFolderId, title: desiredTitle });
  }
  tracked[trackedKey] = { id: folder.id, name: desiredTitle };
  return folder.id;
}

// Ensure Buckley's/ exists, then one top-level folder per project and per domain
// (general classification label), plus per-sub-domain child folders under any
// bucket that exceeds the sub-bucket threshold. Returns a folders descriptor
// consumed by computeReconcileOps + reconcile.
//
// `bucketPlan` is the output of computeBucketPlan(desired); it tells us which
// buckets exist, their kind (project/domain), their ref (projectId/generalKey),
// and whether they need sub-buckets (> threshold). `domainLabelFor(ref)` maps a
// general key (or OTHER_DOMAIN_KEY) to a display title.
export async function ensureMirrorFolders({
  bookmarksApi,
  state,
  projects,
  bucketPlan,
  domainLabelFor,
  existingTree
}) {
  if (!bookmarksApi?.getTree || !bookmarksApi?.create || !bookmarksApi?.update) {
    throw new Error('Bookmarks API not available');
  }

  const tree = existingTree || await bookmarksApi.getTree();
  // bookmarks.getTree() returns a single immovable root node whose children
  // are the writable top-level containers (Bookmarks bar / Other bookmarks /
  // Mobile bookmarks in Chrome; the toolbar/other roots in Firefox). Creating
  // directly on that immovable root throws "Can't modify the root bookmark
  // folders", so descend one level and use the first writable container
  // (one that itself holds children) as the parent for Buckley's/.
  const treeRoot = Array.isArray(tree) && tree.length ? tree[0] : null;
  const writableContainers = treeRoot && Array.isArray(treeRoot.children)
    ? treeRoot.children.filter((node) => Array.isArray(node.children))
    : [];
  // Fallback: some trees aren't wrapped in an outer root (test fixtures), so
  // accept top-level containers directly.
  const writableRoot = writableContainers[0]
    || (Array.isArray(tree) ? tree.find((node) => Array.isArray(node.children)) : null)
    || treeRoot;

  if (!writableRoot) {
    throw new Error('No writable bookmarks root found');
  }

  const rootParentId = writableRoot.id;

  // --- Buckley's/ root ---
  let rootFolderId = state.rootFolderId;
  if (rootFolderId) {
    // Rebrand migration for a tracked root: if the tracked folder still
    // carries a legacy title (e.g. 'SaveIt' or 'Buckleys'), rename it in
    // place. Catches users who adopted the mirror under a previous brand and
    // have a persisted rootFolderId, whom the untracked branch below misses.
    const tracked = findNodeById(tree, rootFolderId);
    if (tracked && tracked.title !== ROOT_FOLDER_TITLE && LEGACY_ROOT_FOLDER_TITLES.includes(tracked.title)) {
      await bookmarksApi.update(rootFolderId, { title: ROOT_FOLDER_TITLE });
    }
  } else {
    // The user may have moved Buckley's/ anywhere; search the whole tree
    // before creating a duplicate.
    let rootFolder = findFolderByTitleRecursive(tree, ROOT_FOLDER_TITLE);
    if (!rootFolder) {
      // Rebrand migration: claim a legacy folder (SaveIt/ or Buckleys/) by
      // renaming it in place (preserving its id and children) so existing
      // users keep their mirrored bookmarks rather than getting a fresh empty
      // tree.
      for (const legacyTitle of LEGACY_ROOT_FOLDER_TITLES) {
        const legacy = findFolderByTitleRecursive(tree, legacyTitle);
        if (legacy) {
          await bookmarksApi.update(legacy.id, { title: ROOT_FOLDER_TITLE });
          rootFolder = { ...legacy, title: ROOT_FOLDER_TITLE };
          break;
        }
      }
    }
    if (!rootFolder) {
      rootFolder = await bookmarksApi.create({
        parentId: rootParentId,
        title: ROOT_FOLDER_TITLE
      });
    }
    rootFolderId = rootFolder.id;
  }

  // Always re-read Buckley's/'s children so we observe the current truth
  // (the user may have added folders since our last reconcile).
  const saveItChildren = (await bookmarksApi.getChildren(rootFolderId)) || [];

  // Project name lookup for project bucket titles.
  const projectNameFor = new Map(
    (projects || []).filter((p) => p?.id && p.archived !== true)
      .map((p) => [p.id, p.name || 'Untitled'])
  );

  const projectFolders = { ...state.projectFolders };
  const domainFolders = { ...state.domainFolders };
  const byBucket = {};
  const bySubBucket = {};

  // Index Buckley's children by title once for reuse lookups.
  const saveItChildByTitle = new Map(
    saveItChildren.filter((n) => n.url === undefined).map((n) => [n.title, n])
  );

  // --- one top-level folder per bucket in the plan ---
  for (const [bucketKey, plan] of Object.entries(bucketPlan?.buckets || {})) {
    let desiredTitle;
    let tracked;
    let trackedKey;
    if (plan.kind === 'project') {
      desiredTitle = projectNameFor.get(plan.ref) || 'Untitled';
      tracked = projectFolders;
      trackedKey = plan.ref;
    } else {
      desiredTitle = domainLabelFor ? domainLabelFor(plan.ref) : plan.ref;
      tracked = domainFolders;
      trackedKey = plan.ref;
    }

    const existing = saveItChildByTitle.get(desiredTitle);
    const folderId = await ensureTopLevelFolder({
      bookmarksApi,
      saveItChildren,
      rootFolderId,
      desiredTitle,
      tracked,
      trackedKey,
      existing
    });
    byBucket[bucketKey] = folderId;

    // --- sub-bucket folders when the bucket exceeds the threshold ---
    if (plan.needsSubbuckets && plan.subBuckets) {
      const subChildren = (await bookmarksApi.getChildren(folderId)) || [];
      const subChildByTitle = new Map(
        subChildren.filter((n) => n.url === undefined).map((n) => [n.title, n])
      );
      const subMap = {};
      for (const subLabel of Object.keys(plan.subBuckets)) {
        const existingSub = subChildByTitle.get(subLabel);
        if (existingSub) {
          subMap[subLabel] = existingSub.id;
        } else {
          const created = await bookmarksApi.create({ parentId: folderId, title: subLabel });
          subMap[subLabel] = created.id;
        }
      }
      bySubBucket[bucketKey] = subMap;
    }
  }

  // Drop tracking entries for projects/domains that no longer have a bucket.
  const liveProjectRefs = new Set(
    Object.values(bucketPlan?.buckets || {})
      .filter((b) => b.kind === 'project')
      .map((b) => b.ref)
  );
  for (const id of Object.keys(projectFolders)) {
    if (!liveProjectRefs.has(id)) {
      delete projectFolders[id];
    }
  }
  const liveDomainRefs = new Set(
    Object.values(bucketPlan?.buckets || {})
      .filter((b) => b.kind === 'domain')
      .map((b) => b.ref)
  );
  for (const key of Object.keys(domainFolders)) {
    if (!liveDomainRefs.has(key)) {
      delete domainFolders[key];
    }
  }

  return {
    statePatch: { rootFolderId, projectFolders, domainFolders },
    folders: { rootId: rootFolderId, byBucket, bySubBucket }
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
// When projectId is given, scopes to that project (used to pull cross-user
// pages for shared company projects).
async function fetchAllPages(api, { projectId } = {}) {
  const all = [];
  let cursor = null;
  do {
    const res = await api.getSavedPages({
      limit: RECONCILE_PAGE_SIZE,
      sort: 'newest',
      cursor,
      skipCache: true,
      ...(projectId ? { projectId } : {})
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
async function applyOps({ bookmarksApi, ops, ownership, onWarn }) {
  const nextOwnership = {};
  for (const [pageId, entries] of Object.entries(ownership || {})) {
    nextOwnership[pageId] = entries.map((e) => ({ ...e }));
  }
  const ensureOwnership = (pageId, bucketKey, bookmarkId, title, parentId) => {
    (nextOwnership[pageId] ||= []).push({ bucketKey, bookmarkId, title, parentId });
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
    // The adopt op carries the resolved parentId from computeReconcileOps.
    ensureOwnership(op.saveItPageId, op.bucketKey, op.bookmarkId, title, op.parentId);
  }

  // 5. creates
  for (const op of ops.create) {
    try {
      const created = await bookmarksApi.create({
        parentId: op.parentId,
        title: op.title,
        url: op.url
      });
      ensureOwnership(op.saveItPageId, op.bucketKey, created.id, op.title, op.parentId);
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
 * @param {object} options.api - API facade (getSavedPages, getProjects)
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

  // Shared (company) projects can contain pages saved by other users. Those
  // pages don't appear in the user's own saved-page set above, so the shared
  // project folder would be created but left empty. Fetch the project-scoped
  // page set for each shared project the user doesn't own and merge them in.
  // (Project-scoped queries route to getThingsForProject on the backend, which
  // crosses user boundaries for company projects.)
  const currentUserId = typeof api.getCurrentUserId === 'function'
    ? await api.getCurrentUserId()
    : null;
  const sharedProjects = projects.filter(
    (p) => p.visibility === 'company' && p.owner_user_id && p.owner_user_id !== currentUserId
  );
  if (sharedProjects.length > 0) {
    const sharedPages = await Promise.all(
      sharedProjects.map((p) => fetchAllPages(api, { projectId: p.id }).catch((error) => {
        onWarn?.(`shared project fetch failed for ${p.id}: ${error?.message || error}`);
        return [];
      }))
    );
    // De-duplicate by page id: a page may appear both in the user's own set
    // and in a shared project. buildDesiredSet keys by id, so later entries
    // would overwrite earlier ones — keep the first (own) occurrence.
    const seenIds = new Set(pages.map((p) => p.id));
    for (const batch of sharedPages) {
      for (const page of batch) {
        if (page?.id && !seenIds.has(page.id)) {
          seenIds.add(page.id);
          pages.push(page);
        }
      }
    }
  }

  const desired = buildDesiredSet(pages);
  const bucketPlan = computeBucketPlan(desired);

  // Map a general-key (or the OTHER_DOMAIN_KEY sentinel) to a folder title.
  const domainLabelFor = (generalKey) =>
    generalKey === OTHER_DOMAIN_KEY ? OTHER_FOLDER_TITLE : generalKey;

  const { statePatch, folders } = await ensureMirrorFolders({
    bookmarksApi,
    state,
    projects,
    bucketPlan,
    domainLabelFor,
    existingTree: null
  });
  const mergedState = { ...state, ...statePatch };
  await setMirrorState(storage, statePatch);

  // Read live children of every folder so computeReconcileOps can find strays.
  // Include both top-level buckets and their sub-bucket folders.
  const allFolderIds = [
    ...Object.values(folders.byBucket),
    ...Object.values(folders.bySubBucket).flatMap((m) => Object.values(m))
  ].filter(Boolean);
  const childrenByFolderId = await readFolderChildrenByFolderId(bookmarksApi, allFolderIds);

  const ops = computeReconcileOps(desired, mergedState.ownership, {
    byBucket: folders.byBucket,
    bySubBucket: folders.bySubBucket,
    bucketPlan: bucketPlan.buckets,
    childrenByFolderId
  });

  const { nextOwnership } = await applyOps({
    bookmarksApi,
    ops,
    ownership: mergedState.ownership,
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
  api: _api, // accepted for call-site compatibility; classification arrives via reconcile
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

  // At save time we only know the project (if any); classification arrives
  // later via enrichment. So save into the project folder when given, else into
  // the "Other" domain folder. The next full reconcile moves it to the correct
  // domain/sub-bucket folder once the AI classification lands.
  let targetFolderId = projectId
    ? state.projectFolders[projectId]?.id
    : state.domainFolders?.[OTHER_DOMAIN_KEY]?.id;

  if (!targetFolderId) {
    // Fall back to the Buckley's/ root if neither a project nor Other folder is
    // tracked yet — the next reconcile will place it correctly.
    targetFolderId = state.rootFolderId;
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
  LEGACY_ROOT_FOLDER_TITLES,
  OTHER_FOLDER_TITLE,
  OTHER_DOMAIN_KEY,
  GENERAL_SUBBUCKET_TITLE,
  SUBBUCKET_THRESHOLD,
  FULL_RECONCILE_INTERVAL_MS
};
