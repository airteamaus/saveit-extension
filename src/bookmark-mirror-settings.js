// Persisted state for the bookmark mirror. Stored under a single key in
// storage.local — follows the same single-string-key pattern as
// LAST_KNOWN_USER_KEY in background.js, rather than introducing a new
// settings/preferences framework for what is currently one toggle.
//
// Shape:
//   {
//     enabled: bool,                       // mirror toggle (off by default)
//     rootFolderId: string | null,         // Buckley's/ folder id once created
//     unfiledFolderId: string | null,      // Buckley's/Unfiled/ folder id
//     projectFolders: { [projectId]: { id, name } },
//     ownership: { [saveItPageId]: [{ projectId: string|null, bookmarkId: string }] },
//     lastFullReconcileAt: number | null   // epoch ms; gates the HEAD short-circuit
//   }

const MIRROR_STATE_KEY = 'bookmarkMirror_state';

export function getDefaultMirrorState() {
  return {
    enabled: false,
    rootFolderId: null,
    unfiledFolderId: null, // legacy, kept for migration; unused by the bucket model
    projectFolders: {},
    domainFolders: {},
    ownership: {},
    lastFullReconcileAt: null
  };
}

// Read state, deep-merging against defaults so callers never have to defend
// against missing keys after a schema change. Keeps consumers simple.
export async function getMirrorState(storage) {
  if (!storage?.get) {
    return getDefaultMirrorState();
  }
  try {
    const result = await storage.get(MIRROR_STATE_KEY);
    const stored = result?.[MIRROR_STATE_KEY];
    if (!stored || typeof stored !== 'object') {
      return getDefaultMirrorState();
    }
    return {
      ...getDefaultMirrorState(),
      ...stored,
      projectFolders: { ...(stored.projectFolders || {}) },
      domainFolders: { ...(stored.domainFolders || {}) },
      ownership: { ...(stored.ownership || {}) }
    };
  } catch {
    return getDefaultMirrorState();
  }
}

export async function setMirrorState(storage, patch) {
  if (!storage?.set) {
    return null;
  }
  const current = await getMirrorState(storage);
  // Merge at the top level only. Nested maps (projectFolders, ownership) are
  // replaced wholesale — callers that mutate them must read-modify-write the
  // full map. Avoids accidental partial-merge surprises.
  const next = { ...current, ...patch };
  await storage.set({ [MIRROR_STATE_KEY]: next });
  return next;
}

export async function setMirrorEnabled(storage, enabled) {
  return setMirrorState(storage, { enabled: Boolean(enabled) });
}

export function getMirrorStateKey() {
  return MIRROR_STATE_KEY;
}
