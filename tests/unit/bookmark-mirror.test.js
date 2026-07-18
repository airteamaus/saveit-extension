import { describe, expect, it, vi } from 'vitest';
import {
  buildDesiredSet,
  computeReconcileOps,
  ensureMirrorFolders,
  indexFolderChildrenByNormalizedUrl,
  mirrorSavedPage,
  reconcile,
  removeMirror
} from '../../src/bookmark-mirror.js';
import {
  getMirrorState,
  setMirrorState,
  setMirrorEnabled,
  getDefaultMirrorState
} from '../../src/bookmark-mirror-settings.js';

// --- helpers --------------------------------------------------------------

// A minimal fake bookmarks API backed by an in-memory tree. Mutations update
// the tree in place; create() returns a fresh node object so callers can read
// its id.
function createFakeBookmarksApi(initialTree) {
  const tree = JSON.parse(JSON.stringify(initialTree || []));
  let nextId = 1000;

  const findNode = (id) => {
    let found = null;
    const walk = (nodes) => {
      for (const node of nodes) {
        if (node.id === id) {
          found = node;
          return;
        }
        if (node.children) {
          walk(node.children);
        }
      }
    };
    walk(tree);
    return found;
  };

  // Detach a node from whichever children array holds it, searching the whole
  // tree. Unlike relying on node.parentId, this works for top-level folders
  // created without an explicit parent link.
  const detach = (id) => {
    const walk = (nodes) => {
      for (const node of nodes) {
        if (Array.isArray(node.children)) {
          const before = node.children.length;
          node.children = node.children.filter((c) => c.id !== id);
          if (node.children.length !== before) {
            return true;
          }
          if (walk(node.children)) {
            return true;
          }
        }
      }
      return false;
    };
    // Also check the top-level array itself.
    for (let i = 0; i < tree.length; i += 1) {
      if (tree[i].id === id) {
        tree.splice(i, 1);
        return;
      }
    }
    walk(tree);
  };

  return {
    _tree: tree,
    async getTree() { return tree; },
    async getChildren(id) {
      const node = findNode(id);
      return node?.children || [];
    },
    async create({ parentId, title, url }) {
      const parent = findNode(parentId);
      const node = {
        id: `b${nextId++}`,
        parentId,
        title,
        ...(url !== undefined ? { url } : {})
      };
      (parent.children ||= []).push(node);
      return node;
    },
    async update(id, patch) {
      const node = findNode(id);
      if (node) {
        Object.assign(node, patch);
      }
      return node;
    },
    async move(id, patch) {
      const node = findNode(id);
      if (!node) {
        return node;
      }
      const oldParent = findNode(node.parentId);
      if (oldParent?.children) {
        oldParent.children = oldParent.children.filter((c) => c.id !== id);
      }
      node.parentId = patch.parentId;
      const newParent = findNode(patch.parentId);
      (newParent.children ||= []).push(node);
      return node;
    },
    async remove(id) {
      detach(id);
    },
    // removeTree: recursively delete a folder and all descendants. Mirrors the
    // real browser API used by removeMirror. detach() handles the whole subtree
    // because it drops the node from its parent's children wholesale.
    async removeTree(id) {
      detach(id);
    }
  };
}

// Fake storage.local: a plain object keyed by storage key.
function createFakeStorage(initial = {}) {
  const store = { ...initial };
  return {
    _store: store,
    async get(keys) {
      if (keys === null) {
        return { ...store };
      }
      const out = {};
      const keyList = Array.isArray(keys) ? keys : [keys];
      for (const k of keyList) {
        if (k in store) {
          out[k] = store[k];
        }
      }
      return out;
    },
    async set(patch) {
      Object.assign(store, patch);
    },
    async remove(keys) {
      const keyList = Array.isArray(keys) ? keys : [keys];
      for (const k of keyList) {
        delete store[k];
      }
    }
  };
}

// A fake API facade returning a fixed page/project set, paginating by limit.
function createFakeApi({ pages = [], projects = [], freshness = null, projectPages = {}, currentUserId = null }) {
  return {
    async getSavedPages({ limit = 100, cursor, projectId } = {}) {
      // When scoped to a project, serve from the projectPages map (simulates
      // the backend's cross-user getThingsForProject for shared projects).
      const source = projectId ? (projectPages[projectId] || []) : pages;
      const startIndex = cursor ? source.findIndex((p) => p.id === cursor) + 1 : 0;
      const slice = source.slice(startIndex, startIndex + limit);
      const nextCursor = startIndex + slice.length < source.length
        ? slice[slice.length - 1]?.id || null
        : null;
      return {
        pages: slice,
        pagination: {
          total: source.length,
          hasNextPage: nextCursor !== null,
          nextCursor
        },
        meta: {}
      };
    },
    async getProjects() { return projects; },
    ...(currentUserId !== null
      ? { async getCurrentUserId() { return currentUserId; } }
      : {}),
    ...(freshness !== null
      ? { async checkSavedPagesUpdates() { return freshness; } }
      : {})
  };
}

const FOLDERS = (overrides = {}) => ({
  byBucket: {
    'project:p1': 'folder-p1',
    'project:p2': 'folder-p2',
    'domain:Software Development': 'folder-sd',
    'domain:__other__': 'folder-other'
  },
  bySubBucket: {},
  bucketPlan: {},
  childrenByFolderId: {},
  ...overrides
});

// --- tests ----------------------------------------------------------------

describe('getDefaultMirrorState', () => {
  it('returns disabled state with empty maps', () => {
    const s = getDefaultMirrorState();
    expect(s.enabled).toBe(false);
    expect(s.rootFolderId).toBeNull();
    expect(s.projectFolders).toEqual({});
    expect(s.domainFolders).toEqual({});
    expect(s.ownership).toEqual({});
    expect(s.lastFullReconcileAt).toBeNull();
  });
});

describe('getMirrorState / setMirrorState', () => {
  it('returns defaults when nothing is stored', async () => {
    const storage = createFakeStorage();
    const state = await getMirrorState(storage);
    expect(state).toEqual(getDefaultMirrorState());
  });

  it('returns defaults when storage is unavailable', async () => {
    expect(await getMirrorState(null)).toEqual(getDefaultMirrorState());
    expect(await getMirrorState({})).toEqual(getDefaultMirrorState());
  });

  it('merges stored state over defaults (additive schema)', async () => {
    const storage = createFakeStorage({
      bookmarkMirror_state: { enabled: true, rootFolderId: 'r' }
    });
    const state = await getMirrorState(storage);
    expect(state.enabled).toBe(true);
    expect(state.rootFolderId).toBe('r');
    // Unspecified keys still default
    expect(state.projectFolders).toEqual({});
    expect(state.ownership).toEqual({});
  });

  it('setMirrorEnabled persists the toggle', async () => {
    const storage = createFakeStorage();
    await setMirrorEnabled(storage, true);
    expect((await getMirrorState(storage)).enabled).toBe(true);
  });

  it('setMirrorState patches top-level fields independently', async () => {
    const storage = createFakeStorage();
    await setMirrorState(storage, { projectFolders: { p1: { id: 'f1', name: 'One' } } });
    await setMirrorState(storage, { ownership: { page1: [] } });
    const state = await getMirrorState(storage);
    // The second patch didn't touch projectFolders, so it survives untouched.
    expect(state.projectFolders).toEqual({ p1: { id: 'f1', name: 'One' } });
    expect(state.ownership).toEqual({ page1: [] });
  });

  it('setMirrorState replaces a nested map wholesale (no deep merge)', async () => {
    const storage = createFakeStorage();
    await setMirrorState(storage, { ownership: { page1: [], page2: [] } });
    // Replacing ownership with a smaller map drops the old keys — callers must
    // read-modify-write the full map when they want to preserve entries.
    await setMirrorState(storage, { ownership: { page3: [] } });
    const state = await getMirrorState(storage);
    expect(state.ownership).toEqual({ page3: [] });
    expect(state.ownership.page1).toBeUndefined();
  });
});

describe('buildDesiredSet', () => {
  it('expands a page in N projects into N project buckets + 1 domain bucket', () => {
    const desired = buildDesiredSet([
      {
        id: 'a', url: 'https://a.com', title: 'A',
        project_ids: ['p1', 'p2'],
        primary_classification_label: 'Software Development'
      }
    ]);
    expect(desired.a.buckets).toEqual([
      'project:p1', 'project:p2', 'domain:Software Development'
    ]);
  });

  it('treats a page with no classification as domain:__other__', () => {
    const desired = buildDesiredSet([{ id: 'a', url: 'https://a.com', title: 'A' }]);
    expect(desired.a.buckets).toEqual(['domain:__other__']);
  });

  it('derives the general label from classifications when primary is absent', () => {
    const desired = buildDesiredSet([{
      id: 'a', url: 'https://a.com', title: 'A',
      classifications: [
        { type: 'topic', label: 'React', confidence: 0.9 },
        { type: 'general', label: 'Software Development', confidence: 0.95 }
      ]
    }]);
    expect(desired.a.buckets).toContain('domain:Software Development');
  });

  it('skips pages missing id or url', () => {
    const desired = buildDesiredSet([
      { id: 'a', title: 'no url' },
      { url: 'https://x.com', title: 'no id' },
      { id: 'ok', url: 'https://ok.com', title: 'OK' }
    ]);
    expect(Object.keys(desired)).toEqual(['ok']);
  });

  it('places a page under ALL its general classifications, matching the UI aggregate', () => {
    // Regression: the UI sidebar builds its category list from the user
    // aggregate, which counts EVERY general classification on a page. A page
    // with general labels "Health and Medicine" AND "Science" appears under
    // both categories in the UI. The mirror previously placed the page under
    // only primary_classification_label (or the single highest-confidence
    // general label), so the other folder was created but left empty.
    const desired = buildDesiredSet([{
      id: 'a', url: 'https://a.com', title: 'A',
      classifications: [
        { type: 'general', label: 'Health and Medicine', confidence: 0.9 },
        { type: 'general', label: 'Science', confidence: 0.8 }
      ]
    }]);
    expect(desired.a.buckets).toEqual(
      expect.arrayContaining(['domain:Health and Medicine', 'domain:Science'])
    );
    expect(desired.a.buckets).toHaveLength(2);
  });
});

describe('computeBucketPlan', () => {
  it('marks buckets over the threshold as needing sub-buckets', async () => {
    const { computeBucketPlan } = await import('../../src/bookmark-mirror.js');
    // 11 pages all in the same domain bucket → needs sub-buckets.
    const pages = Array.from({ length: 11 }, (_, i) => ({
      id: `p${i}`, url: `https://x${i}.com`, title: `P${i}`,
      classifications: [
        { type: 'general', label: 'Software Development', confidence: 0.9 },
        { type: 'domain', label: 'Frontend', confidence: 0.8 }
      ]
    }));
    const desired = buildDesiredSet(pages);
    const plan = computeBucketPlan(desired);
    const bucket = plan.buckets['domain:Software Development'];
    expect(bucket.count).toBe(11);
    expect(bucket.needsSubbuckets).toBe(true);
    expect(bucket.subBuckets).toHaveProperty('Frontend', 11);
  });

  it('does not sub-bucket buckets at or below the threshold', async () => {
    const { computeBucketPlan } = await import('../../src/bookmark-mirror.js');
    const pages = Array.from({ length: 10 }, (_, i) => ({
      id: `p${i}`, url: `https://x${i}.com`, title: `P${i}`,
      classifications: [{ type: 'general', label: 'Cooking', confidence: 0.9 }]
    }));
    const desired = buildDesiredSet(pages);
    const plan = computeBucketPlan(desired);
    expect(plan.buckets['domain:Cooking'].needsSubbuckets).toBe(false);
    expect(plan.buckets['domain:Cooking'].subBuckets).toBeNull();
  });
});

describe('indexFolderChildrenByNormalizedUrl', () => {
  it('indexes only url-bearing nodes, normalized', () => {
    const idx = indexFolderChildrenByNormalizedUrl([
      { id: '1', url: 'https://Example.com/' },
      { id: '2', url: 'https://other.com' },
      { id: '3', title: 'subfolder' }, // no url → skipped
      { id: '4' } // no url → skipped
    ]);
    expect(idx.has('https://example.com')).toBe(true);
    expect(idx.has('https://other.com')).toBe(true);
    expect(idx.size).toBe(2);
  });
});

describe('computeReconcileOps', () => {
  it('empty desired + empty ownership → no ops', () => {
    const ops = computeReconcileOps({}, {}, FOLDERS());
    expect(ops).toEqual({ create: [], move: [], update: [], remove: [], adopt: [] });
  });

  it('new page in a project → create in that project bucket', () => {
    const desired = { p1: { buckets: ['project:p1'], url: 'https://a.com', title: 'A', subLabels: {} } };
    const ops = computeReconcileOps(desired, {}, FOLDERS());
    expect(ops.create).toEqual([
      { saveItPageId: 'p1', bucketKey: 'project:p1', url: 'https://a.com', title: 'A', parentId: 'folder-p1' }
    ]);
    expect(ops.adopt).toHaveLength(0);
  });

  it('new page in a domain bucket → create in that domain folder', () => {
    const desired = { p1: { buckets: ['domain:Software Development'], url: 'https://a.com', title: 'A', subLabels: {} } };
    const ops = computeReconcileOps(desired, {}, FOLDERS());
    expect(ops.create[0].parentId).toBe('folder-sd');
  });

  it('page deleted from server → remove all owned nodes for it', () => {
    const ownership = {
      p1: [
        { bucketKey: 'project:p1', bookmarkId: 'b1', title: 'A', parentId: 'folder-p1' },
        { bucketKey: 'project:p2', bookmarkId: 'b2', title: 'A', parentId: 'folder-p2' }
      ]
    };
    const ops = computeReconcileOps({}, ownership, FOLDERS());
    expect(ops.remove.map((o) => o.bookmarkId).sort()).toEqual(['b1', 'b2']);
    expect(ops.create).toHaveLength(0);
  });

  it('page left one bucket (still in another) → remove only that node', () => {
    const desired = { p1: { buckets: ['project:p1'], url: 'https://a.com', title: 'A', subLabels: {} } };
    const ownership = {
      p1: [
        { bucketKey: 'project:p1', bookmarkId: 'b1', title: 'A', parentId: 'folder-p1' },
        { bucketKey: 'project:p2', bookmarkId: 'b2', title: 'A', parentId: 'folder-p2' }
      ]
    };
    const ops = computeReconcileOps(desired, ownership, FOLDERS());
    expect(ops.remove).toEqual([{ bookmarkId: 'b2' }]);
    expect(ops.create).toHaveLength(0);
    expect(ops.update).toHaveLength(0); // title matches, no drift
  });

  it('title drifted → update', () => {
    const desired = { p1: { buckets: ['project:p1'], url: 'https://a.com', title: 'New Title', subLabels: {} } };
    const ownership = {
      p1: [{ bucketKey: 'project:p1', bookmarkId: 'b1', title: 'Old Title', parentId: 'folder-p1' }]
    };
    const ops = computeReconcileOps(desired, ownership, FOLDERS());
    expect(ops.update).toEqual([{ bookmarkId: 'b1', title: 'New Title' }]);
  });

  it('owned node in wrong folder → move', () => {
    const desired = { p1: { buckets: ['project:p1'], url: 'https://a.com', title: 'A', subLabels: {} } };
    const ownership = {
      p1: [{ bucketKey: 'project:p1', bookmarkId: 'b1', title: 'A', parentId: 'folder-wrong' }]
    };
    const ops = computeReconcileOps(desired, ownership, FOLDERS());
    expect(ops.move).toEqual([{ bookmarkId: 'b1', parentId: 'folder-p1' }]);
  });

  it('stray whose URL matches a desired page → adopt (no create, no duplicate)', () => {
    const desired = { p1: { buckets: ['project:p1'], url: 'https://a.com', title: 'A', subLabels: {} } };
    const folders = FOLDERS({
      childrenByFolderId: {
        'folder-p1': [{ id: 'stray1', url: 'HTTPS://A.COM/', title: 'Old' }]
      }
    });
    const ops = computeReconcileOps(desired, {}, folders);
    expect(ops.create).toHaveLength(0);
    expect(ops.adopt).toEqual([{ bookmarkId: 'stray1', saveItPageId: 'p1', bucketKey: 'project:p1', parentId: 'folder-p1' }]);
    expect(ops.update).toEqual([{ bookmarkId: 'stray1', title: 'A' }]);
  });

  it('stray whose URL does NOT match any desired page → left alone (no op)', () => {
    const desired = { p1: { buckets: ['project:p1'], url: 'https://a.com', title: 'A', subLabels: {} } };
    const folders = FOLDERS({
      childrenByFolderId: {
        'folder-p1': [{ id: 'stray1', url: 'https://unrelated.com', title: 'X' }]
      }
    });
    const ops = computeReconcileOps(desired, {}, folders);
    expect(ops.create).toHaveLength(1);
    expect(ops.adopt).toHaveLength(0);
  });

  it('a stray consumed by one pair is not double-adopted by another', () => {
    const desired = { p1: { buckets: ['project:p1', 'project:p2'], url: 'https://a.com', title: 'A', subLabels: {} } };
    const folders = FOLDERS({
      childrenByFolderId: {
        'folder-p1': [{ id: 'stray1', url: 'https://a.com', title: 'A' }],
        'folder-p2': []
      }
    });
    const ops = computeReconcileOps(desired, {}, folders);
    expect(ops.adopt).toHaveLength(1);
    expect(ops.create).toHaveLength(1);
  });

  it('page in 2 buckets, owned in both → no ops', () => {
    const desired = { p1: { buckets: ['project:p1', 'project:p2'], url: 'https://a.com', title: 'A', subLabels: {} } };
    const folders = FOLDERS();
    const ownership = {
      p1: [
        { bucketKey: 'project:p1', bookmarkId: 'b1', title: 'A', parentId: 'folder-p1' },
        { bucketKey: 'project:p2', bookmarkId: 'b2', title: 'A', parentId: 'folder-p2' }
      ]
    };
    const ops = computeReconcileOps(desired, ownership, folders);
    expect(ops).toEqual({ create: [], move: [], update: [], remove: [], adopt: [] });
  });

  it('multi-bucket page drops to 1 → 1 remove, 1 keep', () => {
    const desired = { p1: { buckets: ['project:p1'], url: 'https://a.com', title: 'A', subLabels: {} } };
    const folders = FOLDERS();
    const ownership = {
      p1: [
        { bucketKey: 'project:p1', bookmarkId: 'b1', title: 'A', parentId: 'folder-p1' },
        { bucketKey: 'project:p2', bookmarkId: 'b2', title: 'A', parentId: 'folder-p2' }
      ]
    };
    const ops = computeReconcileOps(desired, ownership, folders);
    expect(ops.remove.map((o) => o.bookmarkId).sort()).toEqual(['b2']);
    expect(ops.create).toHaveLength(0);
  });

  it('skips a desired pair whose bucket folder is unknown (defensive)', () => {
    const desired = { p1: { buckets: ['project:unknown'], url: 'https://a.com', title: 'A', subLabels: {} } };
    const ops = computeReconcileOps(desired, {}, FOLDERS());
    expect(ops.create).toHaveLength(0);
    expect(ops.adopt).toHaveLength(0);
  });

  it('sub-bucketed bucket resolves parentId from bySubBucket', () => {
    const desired = { p1: { buckets: ['domain:Software Development'], url: 'https://a.com', title: 'A', subLabels: { 'domain:Software Development': 'Frontend' } } };
    const folders = FOLDERS({
      bucketPlan: { 'domain:Software Development': { needsSubbuckets: true } },
      bySubBucket: { 'domain:Software Development': { Frontend: 'folder-sd-frontend' } }
    });
    const ops = computeReconcileOps(desired, {}, folders);
    expect(ops.create[0].parentId).toBe('folder-sd-frontend');
  });
});

describe('ensureMirrorFolders', () => {
  const baseTree = () => [{
    id: 'root',
    title: '',
    children: [{ id: 'toolbar', title: 'Bookmarks Toolbar', children: [] }]
  }];

  const domainLabelFor = (key) => key === '__other__' ? 'Other' : key;

  it('creates Newtab/ and one folder per project + domain bucket', async () => {
    const api = createFakeBookmarksApi(baseTree());
    const bucketPlan = {
      buckets: {
        'project:p1': { count: 2, needsSubbuckets: false, kind: 'project', ref: 'p1', subBuckets: null },
        'domain:Software Development': { count: 3, needsSubbuckets: false, kind: 'domain', ref: 'Software Development', subBuckets: null },
        'domain:__other__': { count: 1, needsSubbuckets: false, kind: 'domain', ref: '__other__', subBuckets: null }
      }
    };
    const { statePatch, folders } = await ensureMirrorFolders({
      bookmarksApi: api,
      state: getDefaultMirrorState(),
      projects: [{ id: 'p1', name: 'Cooking' }],
      bucketPlan,
      domainLabelFor,
      existingTree: null
    });
    expect(statePatch.rootFolderId).toBeTruthy();
    expect(statePatch.projectFolders.p1).toEqual({ id: folders.byBucket['project:p1'], name: 'Cooking' });
    expect(statePatch.domainFolders['Software Development']).toEqual({ id: folders.byBucket['domain:Software Development'], name: 'Software Development' });
    expect(statePatch.domainFolders['__other__']).toEqual({ id: folders.byBucket['domain:__other__'], name: 'Other' });
  });

  it('creates sub-bucket folders under a bucket that exceeds the threshold', async () => {
    const api = createFakeBookmarksApi([{
      id: 'root', title: '', children: [{ id: 'toolbar', title: 'toolbar', children: [] }]
    }]);
    const bucketPlan = {
      buckets: {
        'domain:Software Development': {
          count: 11, needsSubbuckets: true, kind: 'domain', ref: 'Software Development',
          subBuckets: { Frontend: 6, Backend: 5 }
        }
      }
    };
    const { folders } = await ensureMirrorFolders({
      bookmarksApi: api,
      state: { ...getDefaultMirrorState(), rootFolderId: null },
      projects: [],
      bucketPlan,
      domainLabelFor,
      existingTree: null
    });
    const sdFolderId = folders.byBucket['domain:Software Development'];
    expect(sdFolderId).toBeTruthy();
    expect(folders.bySubBucket['domain:Software Development'].Frontend).toBeTruthy();
    expect(folders.bySubBucket['domain:Software Development'].Backend).toBeTruthy();
  });

  it('never creates directly on the immovable root node (regression for "Can\'t modify the root bookmark folders")', async () => {
    // Real browsers throw "Can't modify the root bookmark folders" if you
    // bookmarks.create with parentId === the top-level root id. The fake API
    // below mirrors that constraint so this test catches the v1.17/v1.18 bug
    // where Newtab/ was created on the immovable root.
    const tree = [{
      id: '0', // immovable root, like Chrome's real bookmark tree root
      title: '',
      children: [
        { id: '1', title: 'Bookmarks bar', children: [] },
        { id: '2', title: 'Other bookmarks', children: [] }
      ]
    }];
    let nextId = 100;
    const api = {
      async getTree() { return tree; },
      async getChildren(id) {
        const find = (nodes) => {
          for (const n of nodes) {
            if (n.id === id) return n;
            if (n.children) { const f = find(n.children); if (f) return f; }
          }
          return null;
        };
        return find(tree)?.children || [];
      },
      async create({ parentId, title }) {
        if (parentId === '0') {
          throw new Error("Can't modify the root bookmark folders.");
        }
        const node = { id: `b${nextId++}`, parentId, title, children: [] };
        const find = (nodes) => {
          for (const n of nodes) {
            if (n.id === parentId) return n;
            if (n.children) { const f = find(n.children); if (f) return f; }
          }
          return null;
        };
        const parent = find(tree);
        (parent.children ||= []).push(node);
        return node;
      },
      async update() { return null; }
    };

    const { statePatch } = await ensureMirrorFolders({
      bookmarksApi: api,
      state: getDefaultMirrorState(),
      projects: [],
      bucketPlan: { buckets: {} },
      domainLabelFor,
      existingTree: null
    });

    expect(statePatch.rootFolderId).toBeTruthy();
    const saveIt = (function find(nodes) {
      for (const n of nodes) {
        if (n.id === statePatch.rootFolderId) return n;
        if (n.children) { const f = find(n.children); if (f) return f; }
      }
      return null;
    })(tree);
    expect(saveIt.parentId).toBe('1');
  });

  it('reuses an existing Newtab/ folder rather than duplicating', async () => {
    const tree = [{
      id: 'root',
      children: [{
        id: 'toolbar',
        title: 'toolbar',
        children: [{ id: 'existing-buckleys', title: 'Newtab', children: [] }]
      }]
    }];
    const api = createFakeBookmarksApi(tree);
    const { statePatch } = await ensureMirrorFolders({
      bookmarksApi: api,
      state: getDefaultMirrorState(),
      projects: [],
      bucketPlan: { buckets: {} },
      domainLabelFor,
      existingTree: null
    });
    expect(statePatch.rootFolderId).toBe('existing-buckleys');
  });

  it('migrates a legacy SaveIt/ folder to Newtab/ in place (preserves id + children)', async () => {
    // Pre-rebrand users have a SaveIt/ folder. On the first post-rebrand
    // reconcile we rename it (same id, same children) instead of orphaning it
    // for a fresh tree — otherwise mirrored bookmarks would be lost.
    const tree = [{
      id: 'root',
      children: [{
        id: 'toolbar',
        title: 'toolbar',
        children: [{
          id: 'legacy-saveit',
          title: 'SaveIt',
          children: [{ id: 'stray-bookmark', title: 'Old page', url: 'https://old.com' }]
        }]
      }]
    }];
    const api = createFakeBookmarksApi(tree);
    const { statePatch } = await ensureMirrorFolders({
      bookmarksApi: api,
      state: getDefaultMirrorState(),
      projects: [],
      bucketPlan: { buckets: {} },
      domainLabelFor,
      existingTree: null
    });

    // Same folder id is reused (no new folder created, nothing orphaned).
    expect(statePatch.rootFolderId).toBe('legacy-saveit');
    const migrated = (function find(nodes) {
      for (const n of nodes) {
        if (n.id === 'legacy-saveit') return n;
        if (n.children) { const f = find(n.children); if (f) return f; }
      }
      return null;
    })(api._tree);
    // Title renamed; children preserved.
    expect(migrated.title).toBe('Newtab');
    expect(migrated.children).toHaveLength(1);
    expect(migrated.children[0]).toMatchObject({ id: 'stray-bookmark', url: 'https://old.com' });
  });

  it('migrates an interim Buckleys/ folder to Newtab/ in place (preserves id)', async () => {
    // 'Buckleys' (no apostrophe) was a short-lived interim brand. A user who
    // adopted the mirror then has a tracked rootFolderId pointing at a folder
    // still titled 'Buckleys'; the next reconcile must rename it in place.
    const tree = [{
      id: 'root',
      children: [{
        id: 'toolbar',
        title: 'toolbar',
        children: [{
          id: 'interim-buckleys',
          title: 'Buckleys',
          children: [{ id: 'old-page', title: 'P', url: 'https://p.com' }]
        }]
      }]
    }];
    const api = createFakeBookmarksApi(tree);
    const state = { ...getDefaultMirrorState(), rootFolderId: 'interim-buckleys' };
    const { statePatch } = await ensureMirrorFolders({
      bookmarksApi: api,
      state,
      projects: [],
      bucketPlan: { buckets: {} },
      domainLabelFor,
      existingTree: null
    });
    // Tracked id is reused (no new folder, no orphan).
    expect(statePatch.rootFolderId).toBe('interim-buckleys');
    const migrated = (function find(nodes) {
      for (const n of nodes) {
        if (n.id === 'interim-buckleys') return n;
        if (n.children) { const f = find(n.children); if (f) return f; }
      }
      return null;
    })(api._tree);
    expect(migrated.title).toBe('Newtab');
    expect(migrated.children).toHaveLength(1);
  });

  // Regression guard for the Newtab rebrand: a tracked root titled "Buckley's"
  // (the brand immediately before Newtab) must be renamed in place to Newtab,
  // reusing the same folder id and preserving children.
  it('migrates a Buckley\'s/ folder to Newtab/ in place (preserves id)', async () => {
    const tree = [{
      id: 'root',
      children: [{
        id: 'toolbar',
        title: 'toolbar',
        children: [{
          id: 'prior-buckleys',
          title: "Buckley's",
          children: [{ id: 'prior-page', title: 'P', url: 'https://p.com' }]
        }]
      }]
    }];
    const api = createFakeBookmarksApi(tree);
    const state = { ...getDefaultMirrorState(), rootFolderId: 'prior-buckleys' };
    const { statePatch } = await ensureMirrorFolders({
      bookmarksApi: api,
      state,
      projects: [],
      bucketPlan: { buckets: {} },
      domainLabelFor,
      existingTree: null
    });
    expect(statePatch.rootFolderId).toBe('prior-buckleys');
    const migrated = (function find(nodes) {
      for (const n of nodes) {
        if (n.id === 'prior-buckleys') return n;
        if (n.children) { const f = find(n.children); if (f) return f; }
      }
      return null;
    })(api._tree);
    expect(migrated.title).toBe('Newtab');
    expect(migrated.children).toHaveLength(1);
  });

  it('does not rename a legacy SaveIt/ folder when a Newtab/ folder already exists', async () => {
    // If the user already has Newtab/ (e.g. created it manually or already
    // migrated), a lingering SaveIt/ must be left alone, not claimed.
    const tree = [{
      id: 'root',
      children: [{
        id: 'toolbar',
        title: 'toolbar',
        children: [
          { id: 'current-newtab', title: 'Newtab', children: [] },
          { id: 'legacy-saveit', title: 'SaveIt', children: [] }
        ]
      }]
    }];
    const api = createFakeBookmarksApi(tree);
    const { statePatch } = await ensureMirrorFolders({
      bookmarksApi: api,
      state: getDefaultMirrorState(),
      projects: [],
      bucketPlan: { buckets: {} },
      domainLabelFor,
      existingTree: null
    });
    expect(statePatch.rootFolderId).toBe('current-newtab');
    const legacy = (function find(nodes) {
      for (const n of nodes) {
        if (n.id === 'legacy-saveit') return n;
        if (n.children) { const f = find(n.children); if (f) return f; }
      }
      return null;
    })(api._tree);
    // Legacy folder untouched.
    expect(legacy.title).toBe('SaveIt');
  });

  it('renames a project folder when the project name changed', async () => {
    const api = createFakeBookmarksApi([{
      id: 'root',
      children: [{
        id: 'toolbar',
        children: [
          { id: 'saveit', title: 'SaveIt', children: [{ id: 'p1folder', title: 'OldName', children: [] }] }
        ]
      }]
    }]);
    const state = {
      ...getDefaultMirrorState(),
      rootFolderId: 'saveit',
      projectFolders: { p1: { id: 'p1folder', name: 'OldName' } }
    };
    const bucketPlan = {
      buckets: { 'project:p1': { count: 1, needsSubbuckets: false, kind: 'project', ref: 'p1', subBuckets: null } }
    };
    const { statePatch } = await ensureMirrorFolders({
      bookmarksApi: api,
      state,
      projects: [{ id: 'p1', name: 'NewName' }],
      bucketPlan,
      domainLabelFor,
      existingTree: null
    });
    expect(statePatch.projectFolders.p1).toEqual({ id: 'p1folder', name: 'NewName' });
    const saveItFolder = api._tree[0].children[0].children.find((c) => c.id === 'saveit');
    const renamedFolder = saveItFolder.children.find((c) => c.id === 'p1folder');
    expect(renamedFolder.title).toBe('NewName');
  });

  it('drops projectFolders/domainFolders entries for buckets that no longer exist', async () => {
    const api = createFakeBookmarksApi([{
      id: 'root',
      children: [{
        id: 'toolbar',
        children: [{ id: 'saveit', title: 'SaveIt', children: [] }]
      }]
    }]);
    const state = {
      ...getDefaultMirrorState(),
      rootFolderId: 'saveit',
      projectFolders: { dead: { id: 'fdead', name: 'Gone' } },
      domainFolders: { 'Dead Domain': { id: 'fdeaddomain', name: 'Dead Domain' } }
    };
    const bucketPlan = {
      buckets: { 'project:p1': { count: 1, needsSubbuckets: false, kind: 'project', ref: 'p1', subBuckets: null } }
    };
    const { statePatch } = await ensureMirrorFolders({
      bookmarksApi: api,
      state,
      projects: [{ id: 'p1', name: 'Live' }],
      bucketPlan,
      domainLabelFor,
      existingTree: null
    });
    expect(statePatch.projectFolders.dead).toBeUndefined();
    expect(statePatch.projectFolders.p1).toBeDefined();
    expect(statePatch.domainFolders['Dead Domain']).toBeUndefined();
  });

  it('throws when bookmarks API is unavailable', async () => {
    await expect(ensureMirrorFolders({
      bookmarksApi: { getTree: async () => [] }, // missing create/update
      state: getDefaultMirrorState(),
      projects: [],
      bucketPlan: { buckets: {} },
      domainLabelFor,
      existingTree: null
    })).rejects.toThrow('Bookmarks API not available');
  });
});

describe('mirrorSavedPage', () => {
  it('no-ops when the mirror is disabled', async () => {
    const storage = createFakeStorage();
    const api = createFakeBookmarksApi([]);
    const result = await mirrorSavedPage({
      bookmarksApi: api,
      storage,
      api: createFakeApi({}),
      url: 'https://a.com',
      title: 'A'
    });
    expect(result.created).toBe(false);
  });

  it('creates in the Other domain folder when enabled but no projectId given', async () => {
    const tree = [{
      id: 'root',
      children: [{
        id: 'toolbar',
        children: [{ id: 'saveit', title: 'SaveIt', children: [{ id: 'other', title: 'Other', children: [] }] }]
      }]
    }];
    const api = createFakeBookmarksApi(tree);
    const storage = createFakeStorage({
      bookmarkMirror_state: {
        ...getDefaultMirrorState(),
        enabled: true,
        rootFolderId: 'saveit',
        domainFolders: { '__other__': { id: 'other', name: 'Other' } }
      }
    });
    const result = await mirrorSavedPage({
      bookmarksApi: api,
      storage,
      api: createFakeApi({}),
      url: 'https://a.com',
      title: 'A'
    });
    expect(result.created).toBe(true);
    expect(result.bookmarkId).toBeTruthy();
    const saveItFolder = api._tree[0].children[0].children.find((c) => c.id === 'saveit');
    const otherFolder = saveItFolder.children.find((c) => c.id === 'other');
    expect(otherFolder.children).toHaveLength(1);
    expect(otherFolder.children[0].url).toBe('https://a.com');
  });

  it('falls back to the Newtab root when neither project nor Other folder is tracked', async () => {
    const tree = [{
      id: 'root',
      children: [{
        id: 'toolbar',
        children: [{ id: 'saveit', title: 'SaveIt', children: [] }]
      }]
    }];
    const api = createFakeBookmarksApi(tree);
    const storage = createFakeStorage({
      bookmarkMirror_state: {
        ...getDefaultMirrorState(),
        enabled: true,
        rootFolderId: 'saveit'
      }
    });
    // No project, no Other folder tracked yet → land in Newtab/ root; the next
    // full reconcile will place it in the correct domain folder.
    const result = await mirrorSavedPage({
      bookmarksApi: api,
      storage,
      api: createFakeApi({ projects: [] }),
      url: 'https://a.com',
      title: 'A',
      projectId: 'unknown'
    });
    expect(result.created).toBe(true);
  });
});

describe('reconcile (end-to-end against fakes)', () => {
  it('is a no-op when disabled', async () => {
    const storage = createFakeStorage();
    const api = createFakeApi({ pages: [{ id: 'p1', url: 'https://a.com', title: 'A' }] });
    const bookmarksApi = createFakeBookmarksApi([]);
    const result = await reconcile({ bookmarksApi, api, storage });
    expect(result.applied).toBe(false);
    expect(result.summary.reason).toBe('disabled');
  });

  it('rejects when the saved-pages response lacks the { pages } shape', async () => {
    // Regression guard for the v1.17 bug where a miswired getSavedPages
    // (params sent as a GET body instead of a query string) returned a shape
    // the mirror didn't expect, and reconcile silently produced zero bookmarks.
    // It must throw now, not return an empty success.
    const storage = createFakeStorage();
    await setMirrorEnabled(storage, true);
    const bookmarksApi = createFakeBookmarksApi([
      { id: 'root', children: [{ id: 'toolbar', title: 'toolbar', children: [] }] }
    ]);
    const api = {
      async getSavedPages() {
        // Server returns something, but not { pages: [...] }.
        return { results: [], total: 0 };
      },
      async getProjects() { return []; }
    };

    await expect(reconcile({ bookmarksApi, api, storage, forceFull: true }))
      .rejects.toThrow(/missing the expected/);
  });

  it('creates the folder tree and bookmarks for a fresh enabled mirror', async () => {
    const tree = [{
      id: 'root',
      children: [{ id: 'toolbar', title: 'toolbar', children: [] }]
    }];
    const bookmarksApi = createFakeBookmarksApi(tree);
    const storage = createFakeStorage();
    await setMirrorEnabled(storage, true);

    const api = createFakeApi({
      pages: [
        { id: 'p1', url: 'https://a.com', title: 'A', project_ids: ['proj1'] },
        { id: 'p2', url: 'https://b.com', title: 'B' } // no project, no classification → domain:__other__
      ],
      projects: [{ id: 'proj1', name: 'Cooking' }]
    });

    const result = await reconcile({ bookmarksApi, api, storage });
    expect(result.applied).toBe(true);
    // p1 → project:proj1 + domain:__other__ (2 bookmarks); p2 → domain:__other__ (1).
    expect(result.summary.creates).toBe(3);
    expect(result.summary.adopts).toBe(0);

    const state = await getMirrorState(storage);
    expect(Object.keys(state.ownership).sort()).toEqual(['p1', 'p2']);
    // p1 lives in both its project bucket and the Other domain bucket.
    expect(state.ownership.p1.map((e) => e.bucketKey).sort())
      .toEqual(['domain:__other__', 'project:proj1']);
    // p2 lives only in the Other domain bucket.
    expect(state.ownership.p2[0].bucketKey).toBe('domain:__other__');
    expect(state.lastFullReconcileAt).toBeTypeOf('number');
  });

  it('removes bookmarks for pages deleted server-side', async () => {
    const tree = [{
      id: 'root',
      children: [{
        id: 'toolbar',
        children: [{
          id: 'saveit', title: 'SaveIt', children: [
            { id: 'other', title: 'Other', children: [
              { id: 'b-dead', url: 'https://gone.com', title: 'Gone', parentId: 'other' }
            ] }
          ]
        }]
      }]
    }];
    const bookmarksApi = createFakeBookmarksApi(tree);
    const storage = createFakeStorage({
      bookmarkMirror_state: {
        ...getDefaultMirrorState(),
        enabled: true,
        rootFolderId: 'saveit',
        domainFolders: { '__other__': { id: 'other', name: 'Other' } },
        ownership: {
          dead: [{ bucketKey: 'domain:__other__', bookmarkId: 'b-dead', title: 'Gone', parentId: 'other' }]
        }
      }
    });
    const api = createFakeApi({ pages: [], projects: [] }); // server says nothing exists
    const result = await reconcile({ bookmarksApi, api, storage });
    expect(result.summary.removes).toBe(1);
    const state = await getMirrorState(storage);
    expect(state.ownership).toEqual({});
  });

  it('paginates through the full set when the server returns multiple pages', async () => {
    // Build 250 pages so we cross two limit-100 page boundaries.
    const pages = [];
    for (let i = 0; i < 250; i++) {
      pages.push({ id: `pg${i}`, url: `https://x${i}.com`, title: `X${i}` });
    }
    const api = createFakeApi({ pages, projects: [] });
    const bookmarksApi = createFakeBookmarksApi([{
      id: 'root', children: [{ id: 'toolbar', children: [] }]
    }]);
    const storage = createFakeStorage();
    await setMirrorEnabled(storage, true);
    const result = await reconcile({ bookmarksApi, api, storage });
    expect(result.summary.creates).toBe(250);
  });

  it('short-circuits when freshness says no updates and a recent reconcile exists', async () => {
    const bookmarksApi = createFakeBookmarksApi([{ id: 'root', children: [] }]);
    const storage = createFakeStorage({
      bookmarkMirror_state: {
        ...getDefaultMirrorState(),
        enabled: true,
        lastFullReconcileAt: Date.now() // recent
      }
    });
    const api = createFakeApi({
      pages: [{ id: 'p1', url: 'https://a.com', title: 'A' }],
      freshness: { hasUpdates: false }
    });
    const result = await reconcile({ bookmarksApi, api, storage });
    expect(result.applied).toBe(false);
    expect(result.summary.reason).toBe('freshness-short-circuit');
  });

  it('forceFull=true bypasses the short-circuit', async () => {
    const bookmarksApi = createFakeBookmarksApi([{ id: 'root', children: [{ id: 'toolbar', children: [] }] }]);
    const storage = createFakeStorage({
      bookmarkMirror_state: {
        ...getDefaultMirrorState(),
        enabled: true,
        lastFullReconcileAt: Date.now()
      }
    });
    const api = createFakeApi({
      pages: [{ id: 'p1', url: 'https://a.com', title: 'A' }],
      freshness: { hasUpdates: false }
    });
    const result = await reconcile({ bookmarksApi, api, storage, forceFull: true });
    expect(result.applied).toBe(true);
  });

  it('a single op failure is logged and does not abort the pass', async () => {
    // Pre-create the Newtab/ tree with the Other folder so the only create()
    // calls are bookmark creates (folder creation is not wrapped in try/catch
    // in ensureMirrorFolders).
    const bookmarksApi = createFakeBookmarksApi([{
      id: 'root',
      children: [{
        id: 'toolbar',
        children: [{
          id: 'saveit', title: 'SaveIt',
          children: [{ id: 'other', title: 'Other', children: [] }]
        }]
      }]
    }]);
    const storage = createFakeStorage({
      bookmarkMirror_state: {
        ...getDefaultMirrorState(),
        enabled: true,
        rootFolderId: 'saveit',
        domainFolders: { '__other__': { id: 'other', name: 'Other' } }
      }
    });
    // Sabotage one bookmark create to throw.
    const originalCreate = bookmarksApi.create.bind(bookmarksApi);
    let callCount = 0;
    bookmarksApi.create = async (opts) => {
      callCount++;
      if (callCount === 1) {
        throw new Error('boom');
      }
      return originalCreate(opts);
    };
    const warns = [];
    const api = createFakeApi({
      pages: [
        { id: 'p1', url: 'https://a.com', title: 'A' },
        { id: 'p2', url: 'https://b.com', title: 'B' }
      ]
    });
    const result = await reconcile({ bookmarksApi, api, storage, onWarn: (m) => warns.push(m) });
    expect(warns.length).toBe(1);
    expect(warns[0]).toContain('boom');
    // Second create still happened.
    expect(result.summary.creates).toBe(2);
  });

  it('fetches cross-user pages for shared company projects', async () => {
    // The user owns one page (p-mine) in a shared project. A colleague owns
    // another page (p-colleague) in the same project. Without the cross-user
    // fetch, the colleague's page would never reach the mirror and the shared
    // project folder would be empty.
    const bookmarksApi = createFakeBookmarksApi([{
      id: 'root', children: [{ id: 'toolbar', children: [] }]
    }]);
    const storage = createFakeStorage();
    await setMirrorEnabled(storage, true);

    const api = createFakeApi({
      currentUserId: 'me',
      pages: [
        { id: 'p-mine', url: 'https://mine.com', title: 'Mine', project_ids: ['shared-proj'] }
      ],
      projects: [{
        id: 'shared-proj',
        name: 'Team Links',
        visibility: 'company',
        owner_user_id: 'coworker'
      }],
      projectPages: {
        'shared-proj': [
          { id: 'p-mine', url: 'https://mine.com', title: 'Mine', project_ids: ['shared-proj'] },
          { id: 'p-colleague', url: 'https://theirs.com', title: 'Theirs', project_ids: ['shared-proj'] }
        ]
      }
    });

    const result = await reconcile({ bookmarksApi, api, storage });
    expect(result.applied).toBe(true);

    const state = await getMirrorState(storage);
    // Both the user's own page AND the colleague's page landed in the project.
    expect(Object.keys(state.ownership).sort()).toEqual(['p-colleague', 'p-mine']);
    expect(state.ownership['p-colleague'][0].bucketKey).toBe('project:shared-proj');
    expect(state.ownership['p-mine'].map((e) => e.bucketKey)).toContain('project:shared-proj');
  });
});

describe('removeMirror', () => {
  // A Newtab/ tree with two project sub-folders and a few bookmarks,
  // matching what reconcile would produce.
  const treeWithMirror = () => [{
    id: 'root',
    title: '',
    children: [{
      id: 'toolbar',
      title: 'Bookmarks Toolbar',
      children: [{
        id: 'buckleys-root',
        title: 'Newtab',
        children: [
          { id: 'proj-folder', title: 'Cooking', children: [
            { id: 'bm1', parentId: 'proj-folder', title: 'Recipe', url: 'https://recipe.com' }
          ]},
          { id: 'other-folder', title: 'Other', children: [
            { id: 'bm2', parentId: 'other-folder', title: 'Misc', url: 'https://misc.com' }
          ]}
        ]
      }]
    }]
  }];

  it('removes the Newtab/ root folder and all children via removeTree', async () => {
    const api = createFakeBookmarksApi(treeWithMirror());
    const storage = createFakeStorage();
    // Seed state as if a reconcile had run.
    await setMirrorState(storage, {
      enabled: true,
      rootFolderId: 'buckleys-root',
      projectFolders: { cooking: { id: 'proj-folder', name: 'Cooking' } },
      ownership: { 'p1': [{ bucketKey: 'project:cooking', bookmarkId: 'bm1', title: 'Recipe', parentId: 'proj-folder' }] },
      lastFullReconcileAt: 1000
    });

    const { removed } = await removeMirror({ bookmarksApi: api, storage });
    expect(removed).toBe(true);

    // The Newtab/ folder is gone from the tree (no node with that id remains).
    const tree = await api.getTree();
    const flat = JSON.stringify(tree);
    expect(flat).not.toContain('"buckleys-root"');
    expect(flat).not.toContain('recipe.com');
  });

  it('clears all persisted mirror state', async () => {
    const api = createFakeBookmarksApi(treeWithMirror());
    const storage = createFakeStorage();
    await setMirrorState(storage, {
      enabled: true,
      rootFolderId: 'buckleys-root',
      projectFolders: { cooking: { id: 'proj-folder', name: 'Cooking' } },
      domainFolders: { __other__: { id: 'other-folder', name: 'Other' } },
      ownership: { p1: [{ bucketKey: 'project:cooking', bookmarkId: 'bm1', title: 'R', parentId: 'proj-folder' }] },
      lastFullReconcileAt: 1000
    });

    await removeMirror({ bookmarksApi: api, storage });

    const state = await getMirrorState(storage);
    expect(state.enabled).toBe(false);
    expect(state.rootFolderId).toBeNull();
    expect(state.projectFolders).toEqual({});
    expect(state.domainFolders).toEqual({});
    expect(state.ownership).toEqual({});
    expect(state.lastFullReconcileAt).toBeNull();
  });

  it('still clears state when the folder is already gone (no throw)', async () => {
    const api = createFakeBookmarksApi([]); // empty tree — no Newtab/ folder
    const storage = createFakeStorage();
    await setMirrorState(storage, {
      enabled: true,
      rootFolderId: 'missing-folder',
      ownership: { p1: [] }
    });

    const { removed } = await removeMirror({ bookmarksApi: api, storage });
    // removeTree was called against a node that doesn't exist in the fake; the
    // important assertion is that state is reset regardless.
    const state = await getMirrorState(storage);
    expect(state.enabled).toBe(false);
    expect(state.rootFolderId).toBeNull();
    expect(state.ownership).toEqual({});
  });

  it('returns removed=false when no bookmarks API is provided', async () => {
    const storage = createFakeStorage();
    await setMirrorState(storage, { enabled: true, rootFolderId: 'buckleys-root' });
    const { removed } = await removeMirror({ storage });
    expect(removed).toBe(false);
    // State is still cleared.
    expect((await getMirrorState(storage)).enabled).toBe(false);
  });

  it('throws when storage is unavailable', async () => {
    await expect(removeMirror({ storage: null })).rejects.toThrow(/Storage not available/);
  });
});
