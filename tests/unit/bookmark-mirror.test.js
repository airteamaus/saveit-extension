import { describe, expect, it, vi } from 'vitest';
import {
  buildDesiredSet,
  computeReconcileOps,
  ensureMirrorFolders,
  indexFolderChildrenByNormalizedUrl,
  mirrorSavedPage,
  reconcile
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
      const node = findNode(id);
      if (!node) {
        return;
      }
      const parent = findNode(node.parentId);
      if (parent?.children) {
        parent.children = parent.children.filter((c) => c.id !== id);
      }
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
function createFakeApi({ pages = [], projects = [], freshness = null }) {
  return {
    async getSavedPages({ limit = 100, cursor } = {}) {
      const startIndex = cursor ? pages.findIndex((p) => p.id === cursor) + 1 : 0;
      const slice = pages.slice(startIndex, startIndex + limit);
      const nextCursor = startIndex + slice.length < pages.length
        ? slice[slice.length - 1]?.id || null
        : null;
      return {
        pages: slice,
        pagination: {
          total: pages.length,
          hasNextPage: nextCursor !== null,
          nextCursor
        },
        meta: {}
      };
    },
    async getProjects() { return projects; },
    ...(freshness !== null
      ? { async checkSavedPagesUpdates() { return freshness; } }
      : {})
  };
}

const FOLDERS = (overrides = {}) => ({
  rootId: 'root-saveit',
  unfiledId: 'folder-unfiled',
  byProject: { 'p1': 'folder-p1', 'p2': 'folder-p2' },
  childrenByFolderId: {},
  ...overrides
});

// --- tests ----------------------------------------------------------------

describe('getDefaultMirrorState', () => {
  it('returns disabled state with empty maps', () => {
    const s = getDefaultMirrorState();
    expect(s.enabled).toBe(false);
    expect(s.rootFolderId).toBeNull();
    expect(s.unfiledFolderId).toBeNull();
    expect(s.projectFolders).toEqual({});
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
  it('expands a page in N projects into N desired entries', () => {
    const desired = buildDesiredSet([
      { id: 'a', url: 'https://a.com', title: 'A', project_ids: ['p1', 'p2'] }
    ]);
    expect(desired.a.projects).toEqual(['p1', 'p2']);
  });

  it('treats a page with no projects as Unfiled ([null])', () => {
    const desired = buildDesiredSet([{ id: 'a', url: 'https://a.com', title: 'A' }]);
    expect(desired.a.projects).toEqual([null]);
  });

  it('skips pages missing id or url', () => {
    const desired = buildDesiredSet([
      { id: 'a', title: 'no url' },
      { url: 'https://x.com', title: 'no id' },
      { id: 'ok', url: 'https://ok.com', title: 'OK' }
    ]);
    expect(Object.keys(desired)).toEqual(['ok']);
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

  it('new page in Unfiled → create', () => {
    const desired = { p1: { projects: [null], url: 'https://a.com', title: 'A' } };
    const ops = computeReconcileOps(desired, {}, FOLDERS());
    expect(ops.create).toEqual([
      { saveItPageId: 'p1', projectId: null, url: 'https://a.com', title: 'A', parentId: 'folder-unfiled' }
    ]);
    expect(ops.adopt).toHaveLength(0);
  });

  it('page in a project → create with that project\'s folder', () => {
    const desired = { p1: { projects: ['p1'], url: 'https://a.com', title: 'A' } };
    const ops = computeReconcileOps(desired, {}, FOLDERS());
    expect(ops.create[0].parentId).toBe('folder-p1');
  });

  it('page deleted from server → remove all owned nodes for it', () => {
    const ownership = {
      p1: [
        { projectId: 'p1', bookmarkId: 'b1', title: 'A', parentId: 'folder-p1' },
        { projectId: 'p2', bookmarkId: 'b2', title: 'A', parentId: 'folder-p2' }
      ]
    };
    const ops = computeReconcileOps({}, ownership, FOLDERS());
    expect(ops.remove.map((o) => o.bookmarkId).sort()).toEqual(['b1', 'b2']);
    expect(ops.create).toHaveLength(0);
  });

  it('page left one project (still in another) → remove only that node', () => {
    const desired = { p1: { projects: ['p1'], url: 'https://a.com', title: 'A' } };
    const ownership = {
      p1: [
        { projectId: 'p1', bookmarkId: 'b1', title: 'A', parentId: 'folder-p1' },
        { projectId: 'p2', bookmarkId: 'b2', title: 'A', parentId: 'folder-p2' }
      ]
    };
    const ops = computeReconcileOps(desired, ownership, FOLDERS());
    expect(ops.remove).toEqual([{ bookmarkId: 'b2' }]);
    expect(ops.create).toHaveLength(0);
    expect(ops.update).toHaveLength(0); // title matches, no drift
  });

  it('title drifted → update', () => {
    const desired = { p1: { projects: ['p1'], url: 'https://a.com', title: 'New Title' } };
    const ownership = {
      p1: [{ projectId: 'p1', bookmarkId: 'b1', title: 'Old Title', parentId: 'folder-p1' }]
    };
    const ops = computeReconcileOps(desired, ownership, FOLDERS());
    expect(ops.update).toEqual([{ bookmarkId: 'b1', title: 'New Title' }]);
  });

  it('owned node in wrong folder → move', () => {
    const desired = { p1: { projects: ['p1'], url: 'https://a.com', title: 'A' } };
    const ownership = {
      p1: [{ projectId: 'p1', bookmarkId: 'b1', title: 'A', parentId: 'folder-wrong' }]
    };
    const ops = computeReconcileOps(desired, ownership, FOLDERS());
    expect(ops.move).toEqual([{ bookmarkId: 'b1', parentId: 'folder-p1' }]);
  });

  it('stray whose URL matches a desired page → adopt (no create, no duplicate)', () => {
    const desired = { p1: { projects: ['p1'], url: 'https://a.com', title: 'A' } };
    const folders = FOLDERS({
      childrenByFolderId: {
        'folder-p1': [{ id: 'stray1', url: 'HTTPS://A.COM/', title: 'Old' }]
      }
    });
    const ops = computeReconcileOps(desired, {}, folders);
    expect(ops.create).toHaveLength(0);
    expect(ops.adopt).toEqual([{ bookmarkId: 'stray1', saveItPageId: 'p1', projectId: 'p1' }]);
    // Adopted stray with mismatched title is also queued for update.
    expect(ops.update).toEqual([{ bookmarkId: 'stray1', title: 'A' }]);
  });

  it('stray whose URL does NOT match any desired page → left alone (no op)', () => {
    const desired = { p1: { projects: ['p1'], url: 'https://a.com', title: 'A' } };
    const folders = FOLDERS({
      childrenByFolderId: {
        'folder-p1': [{ id: 'stray1', url: 'https://unrelated.com', title: 'X' }]
      }
    });
    const ops = computeReconcileOps(desired, {}, folders);
    expect(ops.create).toHaveLength(1); // a.com still needs creating
    expect(ops.adopt).toHaveLength(0);
  });

  it('stray in a DIFFERENT folder than the target → not adopted (only same-folder strays)', () => {
    const desired = { p1: { projects: ['p1'], url: 'https://a.com', title: 'A' } };
    const folders = FOLDERS({
      childrenByFolderId: {
        'folder-p1': [],
        'folder-unfiled': [{ id: 'stray1', url: 'https://a.com', title: 'A' }]
      }
    });
    const ops = computeReconcileOps(desired, {}, folders);
    expect(ops.adopt).toHaveLength(0);
    expect(ops.create).toHaveLength(1);
  });

  it('a stray consumed by one pair is not double-adopted by another', () => {
    // Same URL in two projects, only one stray exists in p1's folder.
    const desired = { p1: { projects: ['p1', 'p2'], url: 'https://a.com', title: 'A' } };
    const folders = FOLDERS({
      childrenByFolderId: {
        'folder-p1': [{ id: 'stray1', url: 'https://a.com', title: 'A' }],
        'folder-p2': []
      }
    });
    const ops = computeReconcileOps(desired, {}, folders);
    expect(ops.adopt).toHaveLength(1);
    expect(ops.create).toHaveLength(1); // the p2 entry still needs creating
  });

  it('page in 3 projects, owned in 3 → no ops', () => {
    const desired = { p1: { projects: ['p1', 'p2', 'p3'], url: 'https://a.com', title: 'A' } };
    const folders = FOLDERS({ byProject: { p1: 'f1', p2: 'f2', p3: 'f3' } });
    const ownership = {
      p1: [
        { projectId: 'p1', bookmarkId: 'b1', title: 'A', parentId: 'f1' },
        { projectId: 'p2', bookmarkId: 'b2', title: 'A', parentId: 'f2' },
        { projectId: 'p3', bookmarkId: 'b3', title: 'A', parentId: 'f3' }
      ]
    };
    const ops = computeReconcileOps(desired, ownership, folders);
    expect(ops).toEqual({ create: [], move: [], update: [], remove: [], adopt: [] });
  });

  it('multi-project page drops to 1 → 2 removes, 1 keep', () => {
    const desired = { p1: { projects: ['p1'], url: 'https://a.com', title: 'A' } };
    const folders = FOLDERS({ byProject: { p1: 'f1', p2: 'f2', p3: 'f3' } });
    const ownership = {
      p1: [
        { projectId: 'p1', bookmarkId: 'b1', title: 'A', parentId: 'f1' },
        { projectId: 'p2', bookmarkId: 'b2', title: 'A', parentId: 'f2' },
        { projectId: 'p3', bookmarkId: 'b3', title: 'A', parentId: 'f3' }
      ]
    };
    const ops = computeReconcileOps(desired, ownership, folders);
    expect(ops.remove.map((o) => o.bookmarkId).sort()).toEqual(['b2', 'b3']);
    expect(ops.create).toHaveLength(0);
  });

  it('skips a desired pair whose project folder is unknown (defensive)', () => {
    const desired = { p1: { projects: ['unknown-proj'], url: 'https://a.com', title: 'A' } };
    const ops = computeReconcileOps(desired, {}, FOLDERS());
    expect(ops.create).toHaveLength(0);
    expect(ops.adopt).toHaveLength(0);
  });
});

describe('ensureMirrorFolders', () => {
  const baseTree = () => [{
    id: 'root',
    title: '',
    children: [{ id: 'toolbar', title: 'Bookmarks Toolbar', children: [] }]
  }];

  it('creates SaveIt/, Unfiled/, and project folders when none exist', async () => {
    const api = createFakeBookmarksApi(baseTree());
    const { statePatch, folders } = await ensureMirrorFolders({
      bookmarksApi: api,
      state: getDefaultMirrorState(),
      projects: [{ id: 'p1', name: 'Cooking' }],
      existingTree: null
    });

    expect(statePatch.rootFolderId).toBeTruthy();
    expect(statePatch.unfiledFolderId).toBeTruthy();
    expect(statePatch.projectFolders.p1).toEqual({ id: folders.byProject.p1, name: 'Cooking' });
    expect(statePatch.unfiledFolderId).toBe(folders.unfiledId);
  });

  it('reuses an existing SaveIt/ folder rather than duplicating', async () => {
    const tree = [{
      id: 'root',
      children: [{
        id: 'toolbar',
        title: 'toolbar',
        children: [{ id: 'existing-saveit', title: 'SaveIt', children: [] }]
      }]
    }];
    const api = createFakeBookmarksApi(tree);
    const { statePatch } = await ensureMirrorFolders({
      bookmarksApi: api,
      state: getDefaultMirrorState(),
      projects: [],
      existingTree: null
    });
    expect(statePatch.rootFolderId).toBe('existing-saveit');
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
    const { statePatch } = await ensureMirrorFolders({
      bookmarksApi: api,
      state,
      projects: [{ id: 'p1', name: 'NewName' }],
      existingTree: null
    });
    expect(statePatch.projectFolders.p1).toEqual({ id: 'p1folder', name: 'NewName' });
    // The folder node in the tree should now have the new title.
    const saveItFolder = api._tree[0].children[0].children.find((c) => c.id === 'saveit');
    const renamedFolder = saveItFolder.children.find((c) => c.id === 'p1folder');
    expect(renamedFolder.title).toBe('NewName');
  });

  it('drops projectFolders entries for projects that no longer exist', async () => {
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
      projectFolders: { dead: { id: 'fdead', name: 'Gone' } }
    };
    const { statePatch } = await ensureMirrorFolders({
      bookmarksApi: api,
      state,
      projects: [{ id: 'p1', name: 'Live' }],
      existingTree: null
    });
    expect(statePatch.projectFolders.dead).toBeUndefined();
    expect(statePatch.projectFolders.p1).toBeDefined();
  });

  it('skips archived projects', async () => {
    const api = createFakeBookmarksApi([{
      id: 'root',
      children: [{
        id: 'toolbar',
        children: [{ id: 'saveit', title: 'SaveIt', children: [] }]
      }]
    }]);
    const { folders } = await ensureMirrorFolders({
      bookmarksApi: api,
      state: { ...getDefaultMirrorState(), rootFolderId: 'saveit' },
      projects: [{ id: 'p1', name: 'Archived', archived: true }],
      existingTree: null
    });
    expect(folders.byProject.p1).toBeUndefined();
  });

  it('throws when bookmarks API is unavailable', async () => {
    await expect(ensureMirrorFolders({
      bookmarksApi: { getTree: async () => [] }, // missing create/update
      state: getDefaultMirrorState(),
      projects: [],
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

  it('creates in Unfiled when enabled but no projectId given', async () => {
    const tree = [{
      id: 'root',
      children: [{
        id: 'toolbar',
        children: [{ id: 'saveit', title: 'SaveIt', children: [{ id: 'unfiled', title: 'Unfiled', children: [] }] }]
      }]
    }];
    const api = createFakeBookmarksApi(tree);
    const storage = createFakeStorage({
      bookmarkMirror_state: {
        ...getDefaultMirrorState(),
        enabled: true,
        rootFolderId: 'saveit',
        unfiledFolderId: 'unfiled'
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
    const unfiledFolder = saveItFolder.children.find((c) => c.id === 'unfiled');
    expect(unfiledFolder.children).toHaveLength(1);
    expect(unfiledFolder.children[0].url).toBe('https://a.com');
  });

  it('falls back to Unfiled when project folder cannot be resolved', async () => {
    const tree = [{
      id: 'root',
      children: [{
        id: 'toolbar',
        children: [{ id: 'saveit', title: 'SaveIt', children: [{ id: 'unfiled', title: 'Unfiled', children: [] }] }]
      }]
    }];
    const api = createFakeBookmarksApi(tree);
    const storage = createFakeStorage({
      bookmarkMirror_state: {
        ...getDefaultMirrorState(),
        enabled: true,
        rootFolderId: 'saveit',
        unfiledFolderId: 'unfiled'
      }
    });
    // api.getProjects returns nothing → project folder cannot be resolved →
    // mirrorSavedPage should fall back to Unfiled rather than throw.
    const fakeApi = createFakeApi({ projects: [] });
    const result = await mirrorSavedPage({
      bookmarksApi: api,
      storage,
      api: fakeApi,
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
        { id: 'p2', url: 'https://b.com', title: 'B' } // unfiled
      ],
      projects: [{ id: 'proj1', name: 'Cooking' }]
    });

    const result = await reconcile({ bookmarksApi, api, storage });
    expect(result.applied).toBe(true);
    expect(result.summary.creates).toBe(2);
    expect(result.summary.adopts).toBe(0);

    // Ownership map should now track both pages.
    const state = await getMirrorState(storage);
    expect(Object.keys(state.ownership).sort()).toEqual(['p1', 'p2']);
    expect(state.ownership.p1[0].projectId).toBe('proj1');
    expect(state.ownership.p2[0].projectId).toBeNull();
    expect(state.lastFullReconcileAt).toBeTypeOf('number');
  });

  it('removes bookmarks for pages deleted server-side', async () => {
    const tree = [{
      id: 'root',
      children: [{
        id: 'toolbar',
        children: [{
          id: 'saveit', title: 'SaveIt', children: [
            { id: 'unfiled', title: 'Unfiled', children: [
              { id: 'b-dead', url: 'https://gone.com', title: 'Gone', parentId: 'unfiled' }
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
        unfiledFolderId: 'unfiled',
        ownership: {
          dead: [{ projectId: null, bookmarkId: 'b-dead', title: 'Gone', parentId: 'unfiled' }]
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
    // Pre-create the SaveIt/ tree so the only create() calls are bookmark
    // creates (folder creation is not wrapped in try/catch in ensureMirrorFolders).
    const bookmarksApi = createFakeBookmarksApi([{
      id: 'root',
      children: [{
        id: 'toolbar',
        children: [{
          id: 'saveit', title: 'SaveIt',
          children: [{ id: 'unfiled', title: 'Unfiled', children: [] }]
        }]
      }]
    }]);
    const storage = createFakeStorage({
      bookmarkMirror_state: {
        ...getDefaultMirrorState(),
        enabled: true,
        rootFolderId: 'saveit',
        unfiledFolderId: 'unfiled'
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
});
