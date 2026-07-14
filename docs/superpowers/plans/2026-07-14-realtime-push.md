# Realtime Push for Shared Projects — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** When any member of a shared project saves/enriches/edits a page, every other member viewing an affected surface sees the change within seconds, without manual refresh.

**Architecture:** A Firestore-triggered background function (`realtime-trigger`) writes small event docs to a TTL'd `realtime_events` collection on every `things`/`projects` write. A separate SSE function (`saveit-realtime`, `--concurrency=100`) holds one server-side `onSnapshot` per instance and an in-memory client registry, fanning matching events to connected clients over SSE. The extension's `RealtimeClient` (fetch-based, `Authorization` header) parses SSE frames and dispatches typed events through a `RealtimeEventBus` to existing stores, which react by running their existing `refreshInitial()`. The enrichment poll is removed and replaced by the `enriched` event.

**Tech Stack:** Cloud Functions Gen 2 (nodejs20), `@google-cloud/firestore` ^7.11, `@google-cloud/functions-framework` ^4, Firestore TTL policies, browser `fetch` + `ReadableStream`, ES modules.

## Global Constraints

- **Two repos:** extension at `/Users/rich/Code/saveit-extension`, backend at `/Users/rich/Code/saveit-backend`. Use absolute paths when crossing repos. Bash state does not persist between tool calls — chain commands when changing directories.
- **GCP project:** `bookmarking-477502`, region `us-central1`, Firestore database `(default)`.
- **Backend conventions:** Cloud Functions Gen 2, nodejs20, `@google-cloud/functions-framework` ^4. `shared/` and `contracts/` are copied into each function dir at deploy time (deploy scripts do this); source imports them via `getSharedPath(...)`. Tests are co-located `*.test.js` files, Jest, pure functions tested without a live Firestore.
- **Extension conventions:** ES modules, native ESM loaded via `<script type="module">` in `newtab.html` (no bundler registration needed for new `src/*.js` files imported transitively). Manifest V3. Tests in `tests/unit/` (Jest). `just test` runs them.
- **SSE timeout:** 15 minutes. On timeout/disconnect, the client shows a toast "Refresh to pick up changes" (via existing `toast.show`) and does NOT auto-reconnect.
- **No new client dependencies.** `fetch` + `ReadableStream` are browser APIs. No Firebase client SDK.
- **Event types (wire contract — must match exactly across backend and client):** `project_page_changed`, `page_updated`, `project_metadata_changed`. `change` values: `added`, `removed`, `updated`, `enriched`, `deleted`.
- **scopeKeys format:** strings `project:<projectId>` or `user:<userId>`. These are the routing keys matched against the client registry on the server and against subscriber scopes on the client.
- **Local quality bar (extension):** `just check` (tests, lint, validate, build) passes before wrapping up.
- **Local quality bar (backend):** `cd /Users/rich/Code/saveit-backend/cloud-function && pnpm test` passes (and `cloud-function-enrich` if touched).

---

## File Structure

### Backend (`saveit-backend`)

| File | Responsibility | Create/Modify |
|---|---|---|
| `cloud-function/realtime-events.js` | Pure functions: `computeThingsEvents(before, after)` and `computeProjectsEvents(before, after)` → event doc arrays. Plus `buildScopeKeys(...)`, `buildEventDoc(...)`. | Create |
| `cloud-function/realtime-events.test.js` | Unit tests for every row of the event taxonomy table. | Create |
| `cloud-function/realtime-stream.js` | SSE handler: `handleEventsStream(req, res, user)`, client registry, per-instance `onSnapshot`, heartbeat, `getAccessibleProjectIds(user)`. | Create |
| `cloud-function/realtime-stream.test.js` | Unit tests for SSE frame parsing, scope matching, registry add/remove. | Create |
| `cloud-function/index.js` | Add `matchRealtimeRoute(path)` and dispatch `GET /events/stream` → `handleEventsStream`. | Modify (~924-989) |
| `cloud-function-realtime/index.js` | Thin entry point exporting `realtimeStream` (for the separate `saveit-realtime` deploy) — re-exports from `cloud-function/realtime-stream.js` via shared path, or duplicates the handler. | Create |
| `cloud-function-realtime/package.json` | Mirrors `cloud-function/package.json` deps + Jest config. | Create |
| `scripts/deploy-realtime-function.sh` | Deploys `saveit-realtime` (SSE): gen2, `--concurrency=100`, `--timeout=900s` (15min), `--trigger-http`. | Create |
| `scripts/deploy-realtime-trigger.sh` | Deploys `saveit-realtime-trigger` (Firestore onWrite): gen2, `--trigger-event-filters`. | Create |
| `cloud-function/realtime-trigger.js` | CloudEvent handler `exports.realtimeTrigger = (cloudEvent) => {...}` — parses the Firestore write, calls `computeThingsEvents`/`computeProjectsEvents`, writes event docs to `realtime_events`. | Create |
| `cloud-function/realtime-trigger.test.js` | Unit tests for the CloudEvent → event-doc mapping (mocks Firestore writes). | Create |

### Extension (`saveit-extension`)

| File | Responsibility | Create/Modify |
|---|---|---|
| `src/realtime-event-bus.js` | `RealtimeEventBus` class: `subscribe(type, handler)`, `dispatch(event)`. | Create |
| `tests/unit/realtime-event-bus.test.js` | Unit tests for subscribe/dispatch/unsubscribe. | Create |
| `src/realtime-client.js` | `RealtimeClient` class: `connect()`, `disconnect()`, SSE frame parsing via `fetch` + `ReadableStream`, 15-min timeout → toast, no reconnect. | Create |
| `tests/unit/realtime-client.test.js` | Unit tests for SSE parsing, toast-on-close, no-reconnect. | Create |
| `src/config.js` | Add `realtimeFunctionUrl` per environment. | Modify (~39-65) |
| `src/newtab-app.js` | Create bus + client after auth; register subscribers; pass `toast.show`. | Modify (~130-180) |
| `src/newtab-page.js` | Call `realtimeClient.connect()` after `authController.init()`. | Modify (~142) |
| `src/background.js` | Remove `startEnrichmentPoll`, `checkPageEnriched`, `enrichmentPolls`, the `save-poll.js` import, and the `startEnrichmentPoll(tab.url)` call. | Modify (~371-416, ~546) |
| `src/save-poll.js` | Delete entirely. | Delete |

---

## Task 1: Backend — event computation pure functions

**Files:**
- Create: `/Users/rich/Code/saveit-backend/cloud-function/realtime-events.js`
- Test: `/Users/rich/Code/saveit-backend/cloud-function/realtime-events.test.js`

**Interfaces:**
- Produces: `computeThingsEvents(beforeData, afterData)` → `Array<EventDoc>`; `computeProjectsEvents(beforeData, afterData)` → `Array<EventDoc>`. `EventDoc = { type, change, pageId, projectId, scopeKeys, emittedAt, expireAt }`. Also `REALTIME_EVENT_TTL_MS`.

- [ ] **Step 1: Write the failing tests**

Create `cloud-function/realtime-events.test.js`:

```js
const {
  computeThingsEvents,
  computeProjectsEvents,
  buildScopeKeys,
  REALTIME_EVENT_TTL_MS
} = require('./realtime-events');

const NOW = new Date('2026-07-14T00:00:00.000Z');

function thingDoc(overrides = {}) {
  return {
    user_id: 'uid-alice',
    user_email: 'alice@example.com',
    url: 'https://example.com/',
    title: 'Example',
    saved_at: NOW,
    deleted: false,
    project_ids: [],
    pinned: false,
    ai_summary_brief: null,
    classifications: [],
    primary_classification_label: null,
    ai_enriched_at: null,
    ...overrides
  };
}

function projectDoc(overrides = {}) {
  return {
    name: 'Top Teacher',
    owner_user_id: 'uid-alice',
    owner_user_email: 'alice@example.com',
    visibility: 'company',
    company_domain: 'example.com',
    archived: false,
    ...overrides
  };
}

jest.useFakeTimers({ now: NOW });

describe('computeThingsEvents', () => {
  test('new doc with project_ids emits project_page_changed/added to projects + saver', () => {
    const events = computeThingsEvents(null, thingDoc({
      project_ids: ['project-1', 'project-2']
    }));
    expect(events).toHaveLength(1);
    expect(events[0].type).toBe('project_page_changed');
    expect(events[0].change).toBe('added');
    expect(events[0].scopeKeys).toEqual(
      expect.arrayContaining(['project:project-1', 'project:project-2', 'user:uid-alice'])
    );
  });

  test('new doc with no project_ids emits page_updated/added to saver only', () => {
    const events = computeThingsEvents(null, thingDoc({ project_ids: [] }));
    expect(events).toHaveLength(1);
    expect(events[0].type).toBe('page_updated');
    expect(events[0].change).toBe('added');
    expect(events[0].scopeKeys).toEqual(['user:uid-alice']);
  });

  test('project_ids grew emits added for new projects + saver', () => {
    const events = computeThingsEvents(
      thingDoc({ project_ids: ['project-1'] }),
      thingDoc({ project_ids: ['project-1', 'project-2'] })
    );
    expect(events).toHaveLength(1);
    expect(events[0].change).toBe('added');
    expect(events[0].scopeKeys).toEqual(
      expect.arrayContaining(['project:project-2', 'user:uid-alice'])
    );
    expect(events[0].scopeKeys).not.toContain('project:project-1');
  });

  test('project_ids shrank emits removed for dropped projects + saver', () => {
    const events = computeThingsEvents(
      thingDoc({ project_ids: ['project-1', 'project-2'] }),
      thingDoc({ project_ids: ['project-1'] })
    );
    expect(events).toHaveLength(1);
    expect(events[0].change).toBe('removed');
    expect(events[0].scopeKeys).toEqual(
      expect.arrayContaining(['project:project-2', 'user:uid-alice'])
    );
  });

  test('enrichment fields changed emits page_updated/enriched to projects + saver', () => {
    const events = computeThingsEvents(
      thingDoc({ project_ids: ['project-1'], ai_summary_brief: null, classifications: [] }),
      thingDoc({ project_ids: ['project-1'], ai_summary_brief: 'A summary', classifications: [{ type: 'general', label: 'Tech', confidence: 0.9 }] })
    );
    expect(events).toHaveLength(1);
    expect(events[0].type).toBe('page_updated');
    expect(events[0].change).toBe('enriched');
    expect(events[0].scopeKeys).toEqual(
      expect.arrayContaining(['project:project-1', 'user:uid-alice'])
    );
  });

  test('personal edit (pinned) emits page_updated/updated to saver only', () => {
    const events = computeThingsEvents(
      thingDoc({ project_ids: ['project-1'], pinned: false }),
      thingDoc({ project_ids: ['project-1'], pinned: true })
    );
    expect(events).toHaveLength(1);
    expect(events[0].change).toBe('updated');
    expect(events[0].scopeKeys).toEqual(['user:uid-alice']);
  });

  test('deleted flipped to true emits page_updated/deleted to projects + saver', () => {
    const events = computeThingsEvents(
      thingDoc({ project_ids: ['project-1'], deleted: false }),
      thingDoc({ project_ids: ['project-1'], deleted: true })
    );
    expect(events).toHaveLength(1);
    expect(events[0].change).toBe('deleted');
    expect(events[0].scopeKeys).toEqual(
      expect.arrayContaining(['project:project-1', 'user:uid-alice'])
    );
  });

  test('hard delete (after null) emits project_page_changed/removed to before projects', () => {
    const events = computeThingsEvents(
      thingDoc({ project_ids: ['project-1'] }),
      null
    );
    expect(events).toHaveLength(1);
    expect(events[0].change).toBe('removed');
    expect(events[0].scopeKeys).toEqual(['project:project-1']);
  });

  test('enrichment + project_ids changed in one write emits two events', () => {
    const events = computeThingsEvents(
      thingDoc({ project_ids: ['project-1'], ai_summary_brief: null }),
      thingDoc({ project_ids: ['project-1', 'project-2'], ai_summary_brief: 'Summary' })
    );
    expect(events).toHaveLength(2);
    expect(events.some(e => e.change === 'added' && e.scopeKeys.includes('project:project-2'))).toBe(true);
    expect(events.some(e => e.change === 'enriched')).toBe(true);
  });

  test('no meaningful change emits nothing', () => {
    const events = computeThingsEvents(thingDoc(), thingDoc());
    expect(events).toEqual([]);
  });
});

describe('computeProjectsEvents', () => {
  test('new project emits project_metadata_changed/added', () => {
    const events = computeProjectsEvents(null, projectDoc());
    expect(events).toHaveLength(1);
    expect(events[0].type).toBe('project_metadata_changed');
    expect(events[0].change).toBe('added');
    expect(events[0].scopeKeys).toEqual(['project:project-doc-id']);
  });

  test('renamed project emits project_metadata_changed/updated', () => {
    const events = computeProjectsEvents(
      projectDoc({ name: 'Old' }),
      projectDoc({ name: 'New' })
    );
    expect(events).toHaveLength(1);
    expect(events[0].change).toBe('updated');
    expect(events[0].scopeKeys).toEqual(['project:project-doc-id']);
  });

  test('archived toggle emits updated', () => {
    const events = computeProjectsEvents(
      projectDoc({ archived: false }),
      projectDoc({ archived: true })
    );
    expect(events).toHaveLength(1);
    expect(events[0].change).toBe('updated');
  });
});

describe('buildScopeKeys', () => {
  test('builds project + user keys', () => {
    expect(buildScopeKeys({ projectIds: ['p1', 'p2'], userId: 'uid-1' })).toEqual(
      expect.arrayContaining(['project:p1', 'project:p2', 'user:uid-1'])
    );
  });

  test('omits null userId', () => {
    expect(buildScopeKeys({ projectIds: ['p1'], userId: null })).toEqual(['project:p1']);
  });

  test('empty input returns empty array', () => {
    expect(buildScopeKeys({ projectIds: [], userId: null })).toEqual([]);
  });
});

describe('TTL', () => {
  test('expireAt is emittedAt + 10 min', () => {
    const events = computeThingsEvents(null, thingDoc({ project_ids: ['p1'] }));
    const emitted = events[0].emittedAt.getTime();
    const expire = events[0].expireAt.getTime();
    expect(expire - emitted).toBe(REALTIME_EVENT_TTL_MS);
    expect(REALTIME_EVENT_TTL_MS).toBe(10 * 60 * 1000);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd /Users/rich/Code/saveit-backend/cloud-function && pnpm test realtime-events.test.js`
Expected: FAIL — module `./realtime-events` not found.

- [ ] **Step 3: Write the implementation**

Create `cloud-function/realtime-events.js`:

```js
// realtime-events.js — pure functions that map Firestore before/after docs to
// realtime event documents. No Firestore or I/O — fully unit-testable.

const REALTIME_EVENT_TTL_MS = 10 * 60 * 1000; // 10 minutes

// Fields whose change means "enrichment completed" (tags/summary arrived).
const ENRICHMENT_FIELDS = [
  'ai_summary_brief',
  'ai_summary_extended',
  'classifications',
  'primary_classification_label',
  'ai_enriched_at'
];

// Fields whose change is a personal edit — relevant to the saver only.
const PERSONAL_EDIT_FIELDS = [
  'pinned',
  'title',
  'description',
  'user_notes',
  'manual_tags'
];

function buildScopeKeys({ projectIds = [], userId = null } = {}) {
  const keys = (Array.isArray(projectIds) ? projectIds : [])
    .filter(Boolean)
    .map(id => `project:${id}`);
  if (userId) {
    keys.push(`user:${userId}`);
  }
  return keys;
}

function buildEventDoc({ type, change, pageId = null, projectId = null, scopeKeys, emittedAt }) {
  return {
    type,
    change,
    pageId,
    projectId,
    scopeKeys,
    emittedAt,
    expireAt: new Date(emittedAt.getTime() + REALTIME_EVENT_TTL_MS)
  };
}

function arrayDiff(removed, added) {
  const removedSet = new Set(removed || []);
  const addedSet = new Set(added || []);
  return {
    added: (added || []).filter(id => !removedSet.has(id)),
    removed: (removed || []).filter(id => !addedSet.has(id))
  };
}

function fieldsChanged(before, after, fieldNames) {
  return fieldNames.some(field => {
    const beforeVal = JSON.stringify(before?.[field] ?? null);
    const afterVal = JSON.stringify(after?.[field] ?? null);
    return beforeVal !== afterVal;
  });
}

function now() {
  return new Date();
}

// Map a things-doc before/after pair to zero or more event docs.
function computeThingsEvents(beforeData, afterData) {
  const emittedAt = now();
  const events = [];

  // Hard delete (after absent).
  if (!afterData && beforeData) {
    const projectIds = beforeData.project_ids || [];
    if (projectIds.length > 0) {
      events.push(buildEventDoc({
        type: 'project_page_changed',
        change: 'removed',
        pageId: beforeData.id || null,
        scopeKeys: buildScopeKeys({ projectIds }),
        emittedAt
      }));
    }
    return events;
  }

  // New doc.
  if (!beforeData && afterData) {
    const projectIds = afterData.project_ids || [];
    const userId = afterData.user_id || null;
    if (projectIds.length > 0) {
      events.push(buildEventDoc({
        type: 'project_page_changed',
        change: 'added',
        pageId: afterData.id || null,
        scopeKeys: buildScopeKeys({ projectIds, userId }),
        emittedAt
      }));
    } else {
      // Save with no project — still ping the saver (replaces the poll).
      events.push(buildEventDoc({
        type: 'page_updated',
        change: 'added',
        pageId: afterData.id || null,
        scopeKeys: buildScopeKeys({ userId }),
        emittedAt
      }));
    }
    return events;
  }

  // Update — both before and after present.
  const userId = afterData.user_id || null;
  const beforeProjectIds = beforeData.project_ids || [];
  const afterProjectIds = afterData.project_ids || [];
  const { added: addedProjects, removed: removedProjects } = arrayDiff(beforeProjectIds, afterProjectIds);

  if (addedProjects.length > 0) {
    events.push(buildEventDoc({
      type: 'project_page_changed',
      change: 'added',
      pageId: afterData.id || null,
      scopeKeys: buildScopeKeys({ projectIds: addedProjects, userId }),
      emittedAt
    }));
  }

  if (removedProjects.length > 0) {
    events.push(buildEventDoc({
      type: 'project_page_changed',
      change: 'removed',
      pageId: afterData.id || null,
      scopeKeys: buildScopeKeys({ projectIds: removedProjects, userId }),
      emittedAt
    }));
  }

  // Deletion takes priority over enrichment/edit (a soft-delete write may
  // also touch updated_at but the meaningful change is the deletion).
  if (beforeData.deleted !== true && afterData.deleted === true) {
    events.push(buildEventDoc({
      type: 'page_updated',
      change: 'deleted',
      pageId: afterData.id || null,
      scopeKeys: buildScopeKeys({ projectIds: afterProjectIds, userId }),
      emittedAt
    }));
    return events;
  }

  if (fieldsChanged(beforeData, afterData, ENRICHMENT_FIELDS)) {
    events.push(buildEventDoc({
      type: 'page_updated',
      change: 'enriched',
      pageId: afterData.id || null,
      scopeKeys: buildScopeKeys({ projectIds: afterProjectIds, userId }),
      emittedAt
    }));
  }

  if (fieldsChanged(beforeData, afterData, PERSONAL_EDIT_FIELDS)) {
    events.push(buildEventDoc({
      type: 'page_updated',
      change: 'updated',
      pageId: afterData.id || null,
      scopeKeys: buildScopeKeys({ userId }),
      emittedAt
    }));
  }

  return events;
}

// Map a projects-doc before/after pair to zero or one event docs.
function computeProjectsEvents(beforeData, afterData, docId) {
  const emittedAt = now();

  // Hard delete of a project — no event (members will stop receiving; the
  // project simply disappears on next list refresh).
  if (!afterData && beforeData) {
    return [];
  }

  // New project.
  if (!beforeData && afterData) {
    return [buildEventDoc({
      type: 'project_metadata_changed',
      change: 'added',
      projectId: docId || null,
      scopeKeys: buildScopeKeys({ projectIds: [docId] }),
      emittedAt
    })];
  }

  // Update.
  const metadataFields = ['name', 'archived', 'visibility', 'company_domain'];
  if (fieldsChanged(beforeData, afterData, metadataFields)) {
    return [buildEventDoc({
      type: 'project_metadata_changed',
      change: 'updated',
      projectId: docId || null,
      scopeKeys: buildScopeKeys({ projectIds: [docId] }),
      emittedAt
    })];
  }

  return [];
}

module.exports = {
  computeThingsEvents,
  computeProjectsEvents,
  buildScopeKeys,
  buildEventDoc,
  REALTIME_EVENT_TTL_MS,
  ENRICHMENT_FIELDS,
  PERSONAL_EDIT_FIELDS
};
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd /Users/rich/Code/saveit-backend/cloud-function && pnpm test realtime-events.test.js`
Expected: all tests PASS.

- [ ] **Step 5: Commit**

```bash
cd /Users/rich/Code/saveit-backend
git add cloud-function/realtime-events.js cloud-function/realtime-events.test.js
git commit -m "feat(realtime): pure event-computation functions for things/projects writes"
```

---

## Task 2: Backend — Firestore trigger function (`realtime-trigger`)

**Files:**
- Create: `/Users/rich/Code/saveit-backend/cloud-function/realtime-trigger.js`
- Test: `/Users/rich/Code/saveit-backend/cloud-function/realtime-trigger.test.js`

**Interfaces:**
- Consumes: `computeThingsEvents`, `computeProjectsEvents` from Task 1. `getFirestoreClient()` from `shared/firestore-client.js` (via `getSharedPath`).
- Produces: `exports.realtimeTrigger = async (cloudEvent) => {...}` — a Gen 2 CloudEvent handler for Firestore `document.write` events. Parses `cloudEvent.data` (Firestore `DocumentSnapshot` before/after), calls the compute functions, batch-writes event docs to `realtime_events`.

- [ ] **Step 1: Write the failing tests**

Create `cloud-function/realtime-trigger.test.js`:

```js
// Mock the firestore-client before requiring the trigger module.
jest.mock('./firestore-client', () => {
  const mockBatch = {
    set: jest.fn(),
    commit: jest.fn().mockResolvedValue([])
  };
  const mockCollection = {
    doc: jest.fn(() => ({ collection: () => ({ doc: jest.fn(() => ({})) }) }))
  };
  const mockFirestore = {
    batch: jest.fn(() => mockBatch),
    collection: jest.fn(() => ({
      doc: jest.fn(() => mockCollection.doc())
    }))
  };
  return {
    getFirestoreClient: () => mockFirestore,
    __mockBatch: mockBatch,
    __mockFirestore: mockFirestore
  };
});

// realtime-trigger imports firestore-client via getSharedPath, which resolves
// to the shared/ copy. For tests we stub the shared path resolver.
jest.mock('./paths', () => ({
  getSharedPath: (file) => `./${file.replace(/\.js$/, '')}`,
  getContractsPath: (file) => `./${file}`
}));

const { realtimeTrigger } = require('./realtime-trigger');
const { __mockBatch } = require('./firestore-client');

function makeCloudEvent({ collection, docId, beforeData, afterData }) {
  // Gen 2 Firestore trigger CloudEvent shape — data has value.oldValue/value.
  const toValue = (data) => data ? { name: `${collection}/${docId}`, fields: toFields(data), createTime: '2026-07-14T00:00:00.000Z' } : { name: '', fields: {} };
  return {
    data: {
      value: toValue(afterData),
      oldValue: toValue(beforeData)
    }
  };
}

function toFields(data) {
  // Firestore DocumentSnapshot fields are wrapped in {valueType: {fields/values}}.
  // For testing we pass raw data and the trigger's fromDocument helper unwraps.
  // Simplify: the trigger reads .fields as a plain object (see implementation).
  return data;
}

describe('realtimeTrigger', () => {
  beforeEach(() => {
    __mockBatch.set.mockClear();
    __mockBatch.commit.mockClear();
  });

  test('things write with new project_ids writes one event doc', async () => {
    const cloudEvent = makeCloudEvent({
      collection: 'things',
      docId: 'uid_hash',
      beforeData: null,
      afterData: {
        id: 'uid_hash',
        user_id: 'uid-1',
        user_email: 'a@example.com',
        project_ids: ['project-1'],
        deleted: false
      }
    });
    await realtimeTrigger(cloudEvent);
    expect(__mockBatch.set).toHaveBeenCalledTimes(1);
    const [docRef, eventData] = __mockBatch.set.mock.calls[0];
    expect(eventData.type).toBe('project_page_changed');
    expect(eventData.scopeKeys).toEqual(
      expect.arrayContaining(['project:project-1', 'user:uid-1'])
    );
    expect(__mockBatch.commit).toHaveBeenCalled();
  });

  test('projects write emits project_metadata_changed', async () => {
    const cloudEvent = makeCloudEvent({
      collection: 'projects',
      docId: 'project-1',
      beforeData: null,
      afterData: { name: 'New Project', owner_user_id: 'uid-1', visibility: 'company' }
    });
    await realtimeTrigger(cloudEvent);
    expect(__mockBatch.set).toHaveBeenCalledTimes(1);
    const [, eventData] = __mockBatch.set.mock.calls[0];
    expect(eventData.type).toBe('project_metadata_changed');
  });

  test('no meaningful change writes nothing', async () => {
    const cloudEvent = makeCloudEvent({
      collection: 'things',
      docId: 'uid_hash',
      beforeData: { id: 'uid_hash', user_id: 'uid-1', project_ids: [], deleted: false },
      afterData: { id: 'uid_hash', user_id: 'uid-1', project_ids: [], deleted: false }
    });
    await realtimeTrigger(cloudEvent);
    expect(__mockBatch.set).not.toHaveBeenCalled();
    expect(__mockBatch.commit).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd /Users/rich/Code/saveit-backend/cloud-function && pnpm test realtime-trigger.test.js`
Expected: FAIL — module `./realtime-trigger` not found.

- [ ] **Step 3: Write the implementation**

Create `cloud-function/realtime-trigger.js`:

```js
// realtime-trigger.js — Gen 2 CloudEvent handler for Firestore document writes.
// Fires on things/{id} and projects/{id} writes, computes realtime event docs,
// and batch-writes them to the realtime_events collection.

const { getSharedPath } = require('./paths');
const { getFirestoreClient } = require(getSharedPath('firestore-client.js'));
const logger = require(getSharedPath('logger.js'));
const { computeThingsEvents, computeProjectsEvents } = require('./realtime-events');

// Firestore DocumentSnapshot value → plain JS object. The Gen 2 CloudEvent
// delivers fields as a nested {fields: {fieldName: {valueType: ...}}} structure.
// The @google-cloud/firestore library's DocumentSnapshot.fromProto would handle
// this, but the functions-framework delivers the raw proto JSON in cloudEvent.data.
// We unwrap the common value types here.
function fromDocument(documentSnapshot, docId) {
  if (!documentSnapshot || !documentSnapshot.fields) {
    return null;
  }
  const result = unwrapFields(documentSnapshot.fields);
  // Carry the document id from the resource name if the doc data lacks it.
  if (docId && !result.id) {
    result.id = docId;
  }
  return result;
}

function unwrapFields(fields) {
  const result = {};
  for (const [key, value] of Object.entries(fields)) {
    result[key] = unwrapValue(value);
  }
  return result;
}

function unwrapValue(value) {
  if (value === null || value === undefined) return null;
  // Gen 2 functions-framework delivers Firestore values already unwrapped in
  // most runtimes; handle both the wrapped and unwrapped shapes defensively.
  if (typeof value !== 'object') return value;
  if (value.valueType) return unwrapValueType(value.valueType);
  // Already-unwrapped (common in the emulator/test path):
  if (value.stringValue !== undefined) return value.stringValue;
  if (value.booleanValue !== undefined) return value.booleanValue;
  if (value.integerValue !== undefined) return Number(value.integerValue);
  if (value.doubleValue !== undefined) return value.doubleValue;
  if (value.timestampValue) return new Date(value.timestampValue);
  if (value.arrayValue) return (value.arrayValue.values || []).map(unwrapValue);
  if (value.mapValue) return unwrapFields(value.mapValue.fields || {});
  if (value.nullValue !== undefined) return null;
  return value;
}

function unwrapValueType(valueType) {
  if (valueType.stringValue !== undefined) return valueType.stringValue;
  if (valueType.booleanValue !== undefined) return valueType.booleanValue;
  if (valueType.integerValue !== undefined) return Number(valueType.integerValue);
  if (valueType.doubleValue !== undefined) return valueType.doubleValue;
  if (valueType.timestampValue) return new Date(valueType.timestampValue);
  if (valueType.arrayValue) return (valueType.arrayValue.values || []).map(unwrapValue);
  if (valueType.mapValue) return unwrapFields(valueType.mapValue.fields || {});
  if (valueType.nullValue !== undefined) return null;
  return valueType;
}

async function realtimeTrigger(cloudEvent) {
  const data = cloudEvent?.data;
  if (!data) {
    logger.debug('realtime-trigger: no data in cloudEvent');
    return;
  }

  const resourceName = data.value?.name || data.oldValue?.name || '';
  const resourceParts = resourceName.split('/').filter(Boolean);
  // resourceParts: ['things', 'uid_hash'] or ['projects', 'project-1']
  const collection = resourceParts[0];
  const docId = resourceParts[1] || null;

  const beforeData = fromDocument(data.oldValue, docId);
  const afterData = fromDocument(data.value, docId);

  let events;
  if (collection === 'things') {
    events = computeThingsEvents(beforeData, afterData);
  } else if (collection === 'projects') {
    events = computeProjectsEvents(beforeData, afterData, docId);
  } else {
    logger.debug(`realtime-trigger: ignoring collection ${collection}`);
    return;
  }

  if (!events || events.length === 0) {
    return;
  }

  const firestore = getFirestoreClient();
  const batch = firestore.batch();
  const collectionRef = firestore.collection('realtime_events');

  for (const event of events) {
    const docRef = collectionRef.doc();
    batch.set(docRef, {
      type: event.type,
      change: event.change,
      pageId: event.pageId || null,
      projectId: event.projectId || null,
      scopeKeys: event.scopeKeys,
      emittedAt: event.emittedAt,
      expireAt: event.expireAt
    });
  }

  await batch.commit();
  logger.info('realtime-trigger: wrote event docs', { count: events.length, collection, docId });
}

module.exports = { realtimeTrigger };
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd /Users/rich/Code/saveit-backend/cloud-function && pnpm test realtime-trigger.test.js`
Expected: all tests PASS. (Note: the Firestore value-unwrapping is defensive; if the test mock passes raw objects, `fromDocument` handles them via the unwrapped-shape branches.)

- [ ] **Step 5: Commit**

```bash
cd /Users/rich/Code/saveit-backend
git add cloud-function/realtime-trigger.js cloud-function/realtime-trigger.test.js
git commit -m "feat(realtime): Firestore onWrite trigger that emits realtime_events"
```

---

## Task 3: Backend — SSE handler (`saveit-realtime`)

**Files:**
- Create: `/Users/rich/Code/saveit-backend/cloud-function/realtime-stream.js`
- Test: `/Users/rich/Code/saveit-backend/cloud-function/realtime-stream.test.js`

**Interfaces:**
- Consumes: `withAuth` from `cloud-function/middleware.js`. `getFirestoreClient()` from `shared/firestore-client.js`. `listProjectsForUser` from `cloud-function/firestore-projects.js` (to compute a user's accessible project ids at connect time).
- Produces: `handleEventsStream(req, res, user)` — the SSE request handler. Also `getAccessibleProjectIds(user)` (lean variant returning `string[]`), `formatSseFrame(eventType, data)`, `createClientRegistry()`, `scopeKeysMatch(clientScopeKeys, eventScopeKeys)`.

- [ ] **Step 1: Write the failing tests**

Create `cloud-function/realtime-stream.test.js`:

```js
const {
  formatSseFrame,
  scopeKeysMatch,
  createClientRegistry,
  parseSseEvent
} = require('./realtime-stream');

describe('formatSseFrame', () => {
  test('formats an event frame with type and JSON data', () => {
    const frame = formatSseFrame('project_page_changed', { pageId: 'abc', projectId: 'p1' });
    expect(frame).toBe('event: project_page_changed\ndata: {"pageId":"abc","projectId":"p1"}\n\n');
  });

  test('formats a heartbeat comment', () => {
    const frame = formatSseFrame('heartbeat', null);
    expect(frame).toBe(': keepalive\n\n');
  });
});

describe('scopeKeysMatch', () => {
  test('returns true when any event key is in the client set', () => {
    const clientKeys = new Set(['project:p1', 'user:uid-1']);
    const eventKeys = ['project:p1'];
    expect(scopeKeysMatch(clientKeys, eventKeys)).toBe(true);
  });

  test('returns false when no overlap', () => {
    const clientKeys = new Set(['project:p2']);
    const eventKeys = ['project:p1', 'user:uid-other'];
    expect(scopeKeysMatch(clientKeys, eventKeys)).toBe(false);
  });

  test('user-scoped event matches the saver', () => {
    const clientKeys = new Set(['project:p1', 'user:uid-1']);
    const eventKeys = ['user:uid-1'];
    expect(scopeKeysMatch(clientKeys, eventKeys)).toBe(true);
  });
});

describe('createClientRegistry', () => {
  test('add and remove a client', () => {
    const registry = createClientRegistry();
    const id = registry.add({ scopeKeys: new Set(['user:uid-1']), res: {} });
    expect(registry.size()).toBe(1);
    registry.remove(id);
    expect(registry.size()).toBe(0);
  });

  test('forEachMatching iterates only clients whose scopeKeys intersect', () => {
    const registry = createClientRegistry();
    const res1 = { written: [] };
    const res2 = { written: [] };
    registry.add({ scopeKeys: new Set(['project:p1']), res: res1 });
    registry.add({ scopeKeys: new Set(['project:p2']), res: res2 });
    const matched = [];
    registry.forEachMatching(['project:p1'], (client) => matched.push(client));
    expect(matched).toHaveLength(1);
    expect(matched[0].res).toBe(res1);
  });
});

describe('parseSseEvent', () => {
  test('parses an event frame into {type, data}', () => {
    const frame = 'event: project_page_changed\ndata: {"pageId":"abc"}\n\n';
    const parsed = parseSseEvent(frame);
    expect(parsed.type).toBe('project_page_changed');
    expect(parsed.data).toEqual({ pageId: 'abc' });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd /Users/rich/Code/saveit-backend/cloud-function && pnpm test realtime-stream.test.js`
Expected: FAIL — module `./realtime-stream` not found.

- [ ] **Step 3: Write the implementation**

Create `cloud-function/realtime-stream.js`:

```js
// realtime-stream.js — SSE handler for realtime push. One per-instance
// onSnapshot on realtime_events + an in-memory client registry that fans
// matching events to connected SSE clients.

const { randomUUID } = require('crypto');
const { getSharedPath } = require('./paths');
const { getFirestoreClient } = require(getSharedPath('firestore-client.js'));
const logger = require(getSharedPath('logger.js'));
const { listProjectsForUser } = require('./firestore-projects');

const HEARTBEAT_INTERVAL_MS = 30000;

// SSE wire format. event/data lines terminated by \n, frame by blank line.
function formatSseFrame(eventType, data) {
  if (eventType === 'heartbeat') {
    return ': keepalive\n\n';
  }
  return `event: ${eventType}\ndata: ${JSON.stringify(data)}\n\n`;
}

// Parse a single complete SSE frame (already split on \n\n) into {type, data}.
// Used only in tests; the client does its own parsing. Exported for symmetry.
function parseSseEvent(frame) {
  const lines = frame.split('\n');
  let type = 'message';
  const dataLines = [];
  for (const line of lines) {
    if (line.startsWith('event: ')) {
      type = line.slice(7).trim();
    } else if (line.startsWith('data: ')) {
      dataLines.push(line.slice(6));
    }
  }
  const dataStr = dataLines.join('\n');
  let data = null;
  if (dataStr) {
    try { data = JSON.parse(dataStr); } catch { data = dataStr; }
  }
  return { type, data };
}

function scopeKeysMatch(clientScopeKeys, eventScopeKeys) {
  for (const key of eventScopeKeys) {
    if (clientScopeKeys.has(key)) return true;
  }
  return false;
}

function createClientRegistry() {
  const clients = new Map();

  function add(client) {
    const id = randomUUID();
    clients.set(id, client);
    return id;
  }

  function remove(id) {
    clients.delete(id);
  }

  function size() {
    return clients.size;
  }

  function forEachMatching(eventScopeKeys, callback) {
    for (const client of clients.values()) {
      if (scopeKeysMatch(client.scopeKeys, eventScopeKeys)) {
        callback(client);
      }
    }
  }

  return { add, remove, size, forEachMatching };
}

// Returns the project IDs a user can access (owner or company-domain).
// Leaner than listProjectsForUser — skips per-project page counts.
async function getAccessibleProjectIds(user) {
  const projects = await listProjectsForUser(user, { skipPageCounts: true });
  return projects.map(p => p.id);
}

function computeClientScopeKeys(user, projectIds) {
  return new Set([
    `user:${user.user_id}`,
    ...projectIds.map(id => `project:${id}`)
  ]);
}

// The per-instance realtime listener + registry. One per SSE function instance.
let instanceListener = null;
let instanceRegistry = null;

function getOrCreateInstanceListener() {
  if (!instanceRegistry) {
    instanceRegistry = createClientRegistry();
  }
  if (!instanceListener) {
    const firestore = getFirestoreClient();
    instanceListener = firestore.collection('realtime_events')
      .orderBy('emittedAt')
      .limitToLast(100)
      .onSnapshot(
        (snapshot) => {
          snapshot.docChanges().forEach((change) => {
            if (change.type !== 'added') return;
            const eventData = change.doc.data();
            const eventType = eventData.type;
            const eventScopeKeys = eventData.scopeKeys || [];
            const payload = {
              type: eventType,
              change: eventData.change,
              pageId: eventData.pageId || null,
              projectId: eventData.projectId || null,
              scopeKeys: eventScopeKeys
            };
            instanceRegistry.forEachMatching(eventScopeKeys, (client) => {
              try {
                client.res.write(formatSseFrame(eventType, payload));
              } catch (writeErr) {
                logger.warn('realtime: SSE write failed', { error: writeErr.message });
              }
            });
          });
        },
        (err) => {
          logger.error('realtime: onSnapshot error', { error: err.message });
        }
      );
  }
  return { listener: instanceListener, registry: instanceRegistry };
}

function teardownInstanceListenerIfEmpty() {
  if (instanceRegistry && instanceRegistry.size() === 0 && instanceListener) {
    instanceListener();
    instanceListener = null;
  }
}

async function handleEventsStream(req, res, user) {
  // SSE headers — disable buffering, set the event-stream content type.
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.status(200);
  res.flushHeaders?.();

  // Compute this client's scopeKeys once at connect time.
  let projectIds = [];
  try {
    projectIds = await getAccessibleProjectIds(user);
  } catch (err) {
    logger.error('realtime: failed to compute accessible projects', { error: err.message, user_id: user.user_id });
  }
  const clientScopeKeys = computeClientScopeKeys(user, projectIds);

  const { registry } = getOrCreateInstanceListener();
  const clientId = registry.add({ scopeKeys: clientScopeKeys, res });

  logger.info('realtime: client connected', { clientId, user_id: user.user_id, projectCount: projectIds.length });

  // Heartbeat.
  const heartbeatTimer = setInterval(() => {
    try {
      res.write(formatSseFrame('heartbeat', null));
    } catch {
      // write failed — connection is dead, let req.on('close') clean up
    }
  }, HEARTBEAT_INTERVAL_MS);

  // Cleanup on disconnect (client closed tab, or 15-min function timeout).
  req.on('close', () => {
    clearInterval(heartbeatTimer);
    registry.remove(clientId);
    teardownInstanceListenerIfEmpty();
    logger.info('realtime: client disconnected', { clientId });
  });
}

module.exports = {
  handleEventsStream,
  getAccessibleProjectIds,
  formatSseFrame,
  parseSseEvent,
  scopeKeysMatch,
  createClientRegistry,
  computeClientScopeKeys
};
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd /Users/rich/Code/saveit-backend/cloud-function && pnpm test realtime-stream.test.js`
Expected: all tests PASS.

- [ ] **Step 5: Commit**

```bash
cd /Users/rich/Code/saveit-backend
git add cloud-function/realtime-stream.js cloud-function/realtime-stream.test.js
git commit -m "feat(realtime): SSE handler with per-instance onSnapshot + client registry"
```

---

## Task 4: Backend — wire the SSE route + add `skipPageCounts` to `listProjectsForUser`

**Files:**
- Modify: `/Users/rich/Code/saveit-backend/cloud-function/index.js` (add `matchRealtimeRoute`, dispatch `GET /events/stream`)
- Modify: `/Users/rich/Code/saveit-backend/cloud-function/firestore-projects.js` (add `skipPageCounts` option to `listProjectsForUser`)
- Modify: `/Users/rich/Code/saveit-backend/cloud-function/firestore-projects.test.js` (add test for `skipPageCounts`)

**Interfaces:**
- Consumes: `handleEventsStream` from Task 3. `withAuth` from `middleware.js`.
- Produces: `GET /events/stream` route on the main `saveit` function (for local dev); the separate `saveit-realtime` deploy (Task 6) uses the same handler.

- [ ] **Step 1: Add `skipPageCounts` to `listProjectsForUser`**

Read `/Users/rich/Code/saveit-backend/cloud-function/firestore-projects.js` around line 140-175 (the `listProjectsForUser` function). The function currently calls `countProjectPages` for each project in a `Promise.all`. Add an early return when `options.skipPageCounts === true` that sets each project's page count to `null` (or omits it) instead of running the count queries.

Add to the test file `cloud-function/firestore-projects.test.js`:

```js
describe('listProjectsForUser skipPageCounts', () => {
  test('skipPageCounts=true omits countProjectPages calls', async () => {
    // Build a mock that returns two projects; assert countProjectPages is NOT called.
    // (Adapt to the existing test's mocking pattern in this file.)
  });
});
```

Implement by wrapping the `countProjectPages` `Promise.all` block in `if (!options.skipPageCounts) { ... } else { projects.forEach(p => { p.page_count = null; }); }`.

- [ ] **Step 2: Add `matchRealtimeRoute` and dispatch in `index.js`**

In `/Users/rich/Code/saveit-backend/cloud-function/index.js`, add near `matchAuthRoute` (around line 917):

```js
function matchRealtimeRoute(path) {
  if (path === '/events/stream') {
    return { route: 'events-stream' };
  }
  return null;
}
```

Add the import at the top of `index.js`:

```js
const { handleEventsStream } = require('./realtime-stream');
```

In `exports.savePage`, after the project-route block (around line 989) and before the method `switch` (line 991), add:

```js
const realtimeRoute = matchRealtimeRoute(path);
if (realtimeRoute?.route === 'events-stream') {
  if (req.method !== 'GET') {
    sendErrorResponse(res, 405, 'Method not allowed', { code: 'METHOD_NOT_ALLOWED' });
    return;
  }
  return withAuth(handleEventsStream)(req, res);
}
```

- [ ] **Step 3: Run the existing backend tests to verify nothing broke**

Run: `cd /Users/rich/Code/saveit-backend/cloud-function && pnpm test`
Expected: all tests PASS, including the new `skipPageCounts` test.

- [ ] **Step 4: Commit**

```bash
cd /Users/rich/Code/saveit-backend
git add cloud-function/index.js cloud-function/firestore-projects.js cloud-function/firestore-projects.test.js
git commit -m "feat(realtime): wire GET /events/stream route + skipPageCounts option"
```

---

## Task 5: Backend — separate `saveit-realtime` deploy package + `realtime-trigger` deploy script

**Files:**
- Create: `/Users/rich/Code/saveit-backend/cloud-function-realtime/package.json`
- Create: `/Users/rich/Code/saveit-backend/cloud-function-realtime/index.js`
- Create: `/Users/rich/Code/saveit-backend/scripts/deploy-realtime-function.sh`
- Create: `/Users/rich/Code/saveit-backend/scripts/deploy-realtime-trigger.sh`

**Why a separate deploy package:** the SSE function needs `--concurrency=100` and `--timeout=900s`, distinct from the main `saveit` function's `--min-instances=1` default-concurrency config. Cloud Functions Gen 2 deploy flags are per-function, but the entry point must be exportable from the deploy source. The cleanest approach mirroring `cloud-function-enrich/` is a thin `cloud-function-realtime/` dir that re-exports the handler.

- [ ] **Step 1: Create the `cloud-function-realtime` package**

Create `cloud-function-realtime/package.json` (mirror `cloud-function/package.json` deps — `@google-cloud/firestore`, `@google-cloud/functions-framework`, etc.):

```json
{
  "name": "saveit-realtime",
  "version": "1.0.0",
  "private": true,
  "main": "index.js",
  "dependencies": {
    "@google-cloud/firestore": "^7.11.6",
    "@google-cloud/functions-framework": "^4.0.1"
  },
  "devDependencies": {
    "jest": "^30.2.0"
  },
  "scripts": {
    "test": "jest --testTimeout=20000"
  },
  "jest": {
    "testMatch": ["**/*.test.js"],
    "testPathIgnorePatterns": ["/node_modules/", "/archive/"],
    "testEnvironment": "node"
  }
}
```

Create `cloud-function-realtime/index.js`:

```js
// cloud-function-realtime/index.js — entry point for the saveit-realtime
// Cloud Function (separate deploy with --concurrency=100, --timeout=900s).
// Re-exports the SSE handler from the main cloud-function package; the
// deploy script copies shared/ in and resolves the require path.

const { getSharedPath } = require('./paths');
const { handleEventsStream } = require(getSharedPath('realtime-stream.js'));
const { withAuth } = require(getSharedPath('middleware.js'));

// The functions-framework invokes this on GET /events/stream.
exports.realtimeStream = (req, res) => withAuth(handleEventsStream)(req, res);
```

Note: `cloud-function-realtime/` also needs a `paths.js` resolving `shared/` (copy the pattern from `cloud-function/paths.js`). The deploy script copies `shared/` and `contracts/` in, same as the other deploy scripts.

- [ ] **Step 2: Create the SSE deploy script**

Create `scripts/deploy-realtime-function.sh`:

```bash
#!/bin/bash
# Deploy the saveit-realtime SSE Cloud Function.
# Separate from saveit (the HTTP API) because it needs --concurrency=100
# and --timeout=900s (15 min) for long-lived SSE streams.

set -euo pipefail

PROJECT_ID="${PROJECT_ID:-bookmarking-477502}"
FUNCTION_NAME="saveit-realtime"
REGION="us-central1"
COMMIT_HASH=$(git rev-parse --short HEAD)

cd "$(dirname "$0")/.."

# Copy shared + contracts into the deploy dir (same pattern as deploy-function.sh).
cp -r shared cloud-function-realtime/
cp -r contracts cloud-function-realtime/ 2>/dev/null || true
cp cloud-function/paths.js cloud-function-realtime/paths.js 2>/dev/null || true
cp cloud-function/realtime-stream.js cloud-function-realtime/ 2>/dev/null || true
cp cloud-function/realtime-events.js cloud-function-realtime/ 2>/dev/null || true
cp cloud-function/middleware.js cloud-function-realtime/ 2>/dev/null || true
cp cloud-function/firestore-projects.js cloud-function-realtime/ 2>/dev/null || true

# Regenerate lockfile for the deploy artifact.
( cd cloud-function-realtime && pnpm install --lockfile-only )

gcloud functions deploy "$FUNCTION_NAME" \
  --gen2 \
  --runtime=nodejs20 \
  --region="$REGION" \
  --source=cloud-function-realtime \
  --entry-point=realtimeStream \
  --trigger-http \
  --allow-unauthenticated \
  --memory=512MB \
  --concurrency=100 \
  --timeout=900s \
  --set-env-vars "USE_FIRESTORE=true,SENTRY_RELEASE=$COMMIT_HASH" \
  --update-labels "commit=$COMMIT_HASH" \
  --project="$PROJECT_ID"

# Cleanup: remove the copied dirs so they don't get committed.
rm -rf cloud-function-realtime/shared cloud-function-realtime/contracts

echo "✅ Deployed $FUNCTION_NAME"
```

Make it executable: `chmod +x scripts/deploy-realtime-function.sh`

- [ ] **Step 3: Create the trigger deploy script**

Create `scripts/deploy-realtime-trigger.sh`:

```bash
#!/bin/bash
# Deploy the saveit-realtime-trigger Cloud Function (Firestore onWrite).
# Fires on things/{id} and projects/{id} writes, emits realtime_events docs.
#
# NOTE: Gen 2 Firestore triggers use --trigger-event-filters. A single function
# can only have one trigger, so we deploy TWO functions sharing one source —
# one for things, one for projects — each with its own event filter and a
# router entry point that ignores the other collection. For simplicity this
# script deploys both.

set -euo pipefail

PROJECT_ID="${PROJECT_ID:-bookmarking-477502}"
REGION="us-central1"
COMMIT_HASH=$(git rev-parse --short HEAD)

cd "$(dirname "$0")/.."

# Copy shared + contracts + paths into cloud-function for the deploy source.
cp -r shared cloud-function/
cp -r contracts cloud-function/ 2>/dev/null || true
( cd cloud-function && pnpm install --lockfile-only )

# Deploy the things trigger.
gcloud functions deploy "saveit-realtime-trigger-things" \
  --gen2 \
  --runtime=nodejs20 \
  --region="$REGION" \
  --source=cloud-function \
  --entry-point=realtimeTrigger \
  --trigger-event-filters="type=google.cloud.firestore.document.v1.written" \
  --trigger-event-filters="database=(default)" \
  --trigger-event-filters="collection=things" \
  --memory=256MB \
  --timeout=60s \
  --set-env-vars "USE_FIRESTORE=true,SENTRY_RELEASE=$COMMIT_HASH" \
  --update-labels "commit=$COMMIT_HASH" \
  --project="$PROJECT_ID"

# Deploy the projects trigger.
gcloud functions deploy "saveit-realtime-trigger-projects" \
  --gen2 \
  --runtime=nodejs20 \
  --region="$REGION" \
  --source=cloud-function \
  --entry-point=realtimeTrigger \
  --trigger-event-filters="type=google.cloud.firestore.document.v1.written" \
  --trigger-event-filters="database=(default)" \
  --trigger-event-filters="collection=projects" \
  --memory=256MB \
  --timeout=60s \
  --set-env-vars "USE_FIRESTORE=true,SENTRY_RELEASE=$COMMIT_HASH" \
  --update-labels "commit=$COMMIT_HASH" \
  --project="$PROJECT_ID"

# Cleanup.
rm -rf cloud-function/shared cloud-function/contracts

echo "✅ Deployed saveit-realtime-trigger-things and saveit-realtime-trigger-projects"
```

Make it executable: `chmod +x scripts/deploy-realtime-trigger.sh`

- [ ] **Step 4: Verify the realtime entry point is exported from `cloud-function/index.js`**

The trigger deploy uses `--source=cloud-function --entry-point=realtimeTrigger`. Ensure `cloud-function/index.js` (or `cloud-function/realtime-trigger.js` required by it) exports `realtimeTrigger`. Add to the bottom of `cloud-function/index.js`:

```js
const { realtimeTrigger } = require('./realtime-trigger');
exports.realtimeTrigger = realtimeTrigger;
```

- [ ] **Step 5: Commit**

```bash
cd /Users/rich/Code/saveit-backend
git add cloud-function-realtime/ scripts/deploy-realtime-function.sh scripts/deploy-realtime-trigger.sh cloud-function/index.js
git commit -m "feat(realtime): deploy scripts + saveit-realtime package for SSE and trigger"
```

---

## Task 6: Backend — Firestore TTL policy for `realtime_events`

**Files:**
- Create: `/Users/rich/Code/saveit-backend/scripts/setup-realtime-ttl.sh`

This is a one-time infrastructure setup command, not code. It configures Firestore to auto-delete `realtime_events` docs whose `expireAt` timestamp has passed.

- [ ] **Step 1: Create the TTL setup script**

Create `scripts/setup-realtime-ttl.sh`:

```bash
#!/bin/bash
# Configure a Firestore TTL policy on realtime_events.expireAt.
# Firestore automatically deletes documents whose expireAt timestamp is in the past.
# Run once after the first realtime_events docs are written (the collection must
# exist — it's created on first event write).

set -euo pipefail

PROJECT_ID="${PROJECT_ID:-bookmarking-477502}"
DATABASE_ID="(default)"

echo "Setting TTL policy on realtime_events.expireAt..."

gcloud firestore fields ttl update expireAt \
  --collection-group=realtime_events \
  --project="$PROJECT_ID" \
  --database="$DATABASE_ID"

echo "✅ TTL policy set. Firestore will auto-delete expired realtime_events docs."
```

Make it executable: `chmod +x scripts/setup-realtime-ttl.sh`

- [ ] **Step 2: Commit**

```bash
cd /Users/rich/Code/saveit-backend
git add scripts/setup-realtime-ttl.sh
git commit -m "infra(realtime): Firestore TTL policy script for realtime_events"
```

---

## Task 7: Extension — `RealtimeEventBus`

**Files:**
- Create: `/Users/rich/Code/saveit-extension/src/realtime-event-bus.js`
- Test: `/Users/rich/Code/saveit-extension/tests/unit/realtime-event-bus.test.js`

**Interfaces:**
- Produces: `class RealtimeEventBus` with `subscribe(eventType, handler) → unsubscribe`, `dispatch(event)`, `clear()`. An `event` is `{ type, change, pageId, projectId, scopeKeys }`.

- [ ] **Step 1: Write the failing tests**

Create `tests/unit/realtime-event-bus.test.js`:

```js
import { RealtimeEventBus } from '../../src/realtime-event-bus.js';

describe('RealtimeEventBus', () => {
  test('dispatch calls subscribed handler for matching type', () => {
    const bus = new RealtimeEventBus();
    const handler = jest.fn();
    bus.subscribe('project_page_changed', handler);
    bus.dispatch({ type: 'project_page_changed', change: 'added', projectId: 'p1' });
    expect(handler).toHaveBeenCalledWith({ type: 'project_page_changed', change: 'added', projectId: 'p1' });
  });

  test('dispatch does not call handler for non-matching type', () => {
    const bus = new RealtimeEventBus();
    const handler = jest.fn();
    bus.subscribe('project_page_changed', handler);
    bus.dispatch({ type: 'page_updated', change: 'enriched' });
    expect(handler).not.toHaveBeenCalled();
  });

  test('unsubscribe removes the handler', () => {
    const bus = new RealtimeEventBus();
    const handler = jest.fn();
    const unsubscribe = bus.subscribe('project_page_changed', handler);
    unsubscribe();
    bus.dispatch({ type: 'project_page_changed', change: 'added' });
    expect(handler).not.toHaveBeenCalled();
  });

  test('multiple handlers for the same type all fire', () => {
    const bus = new RealtimeEventBus();
    const h1 = jest.fn();
    const h2 = jest.fn();
    bus.subscribe('project_page_changed', h1);
    bus.subscribe('project_page_changed', h2);
    bus.dispatch({ type: 'project_page_changed', change: 'added' });
    expect(h1).toHaveBeenCalled();
    expect(h2).toHaveBeenCalled();
  });

  test('clear removes all subscribers', () => {
    const bus = new RealtimeEventBus();
    const handler = jest.fn();
    bus.subscribe('project_page_changed', handler);
    bus.clear();
    bus.dispatch({ type: 'project_page_changed', change: 'added' });
    expect(handler).not.toHaveBeenCalled();
  });

  test('dispatch with no subscribers is a no-op', () => {
    const bus = new RealtimeEventBus();
    expect(() => bus.dispatch({ type: 'page_updated', change: 'enriched' })).not.toThrow();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `just test realtime-event-bus`
Expected: FAIL — module not found.

- [ ] **Step 3: Write the implementation**

Create `src/realtime-event-bus.js`:

```js
// realtime-event-bus.js — typed pub/sub that decouples the SSE transport
// (RealtimeClient) from the surfaces that react to changes (stores, sidebar,
// pending-save clearer). Subscribers register for an event type; the bus
// dispatches parsed SSE events to all matching subscribers.

export class RealtimeEventBus {
  constructor() {
    this.subscribers = new Map();
  }

  subscribe(eventType, handler) {
    if (!this.subscribers.has(eventType)) {
      this.subscribers.set(eventType, new Set());
    }
    this.subscribers.get(eventType).add(handler);
    return () => {
      const set = this.subscribers.get(eventType);
      if (set) {
        set.delete(handler);
        if (set.size === 0) {
          this.subscribers.delete(eventType);
        }
      }
    };
  }

  dispatch(event) {
    const set = this.subscribers.get(event?.type);
    if (!set) return;
    for (const handler of set) {
      try {
        handler(event);
      } catch (err) {
        // A failing subscriber must not break other subscribers.
        console.error('[realtime-event-bus] subscriber threw:', err);
      }
    }
  }

  clear() {
    this.subscribers.clear();
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `just test realtime-event-bus`
Expected: all tests PASS.

- [ ] **Step 5: Commit**

```bash
cd /Users/rich/Code/saveit-extension
git add src/realtime-event-bus.js tests/unit/realtime-event-bus.test.js
git commit -m "feat(realtime): RealtimeEventBus typed pub/sub"
```

---

## Task 8: Extension — `RealtimeClient` (fetch-based SSE reader)

**Files:**
- Create: `/Users/rich/Code/saveit-extension/src/realtime-client.js`
- Test: `/Users/rich/Code/saveit-extension/tests/unit/realtime-client.test.js`

**Interfaces:**
- Consumes: `RealtimeEventBus` (Task 7). `getSessionToken()` from `src/session-store.js`. `CONFIG.realtimeFunctionUrl` from `src/config.js` (Task 9). `toast.show` (the `notify` callback).
- Produces: `class RealtimeClient` with `connect()`, `disconnect()`. Constructor: `new RealtimeClient({ bus, notify, getToken, url })`.

- [ ] **Step 1: Write the failing tests**

Create `tests/unit/realtime-client.test.js`:

```js
import { RealtimeClient } from '../../src/realtime-client.js';

// Helper: build a ReadableStream from an array of string chunks.
function makeReadableStream(chunks) {
  const encoder = new TextEncoder();
  return new ReadableStream({
    start(controller) {
      for (const chunk of chunks) {
        controller.enqueue(encoder.encode(chunk));
      }
      controller.close();
    }
  });
}

describe('RealtimeClient', () => {
  let mockFetch;
  let bus;
  let notify;

  beforeEach(() => {
    bus = { dispatch: jest.fn() };
    notify = jest.fn();
    mockFetch = jest.fn();
    global.fetch = mockFetch;
  });

  function makeClient() {
    return new RealtimeClient({
      bus,
      notify,
      getToken: async () => 'test-token',
      url: 'https://example.test/events/stream'
    });
  }

  test('connect sets Authorization header and calls fetch', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      status: 200,
      body: makeReadableStream([]),
      headers: new Map()
    });
    const client = makeClient();
    await client.connect();
    expect(mockFetch).toHaveBeenCalledWith(
      'https://example.test/events/stream',
      expect.objectContaining({
        method: 'GET',
        headers: expect.objectContaining({
          Authorization: 'Bearer test-token',
          Accept: 'text/event-stream'
        })
      })
    );
  });

  test('parses an SSE event frame and dispatches to bus', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      status: 200,
      body: makeReadableStream([
        'event: project_page_changed\n',
        'data: {"type":"project_page_changed","change":"added","projectId":"p1"}\n\n'
      ]),
      headers: new Map()
    });
    const client = makeClient();
    await client.connect();
    // Allow the stream reader microtask to flush.
    await new Promise(r => setTimeout(r, 10));
    expect(bus.dispatch).toHaveBeenCalledWith({
      type: 'project_page_changed',
      change: 'added',
      projectId: 'p1'
    });
  });

  test('ignores heartbeat comments', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      status: 200,
      body: makeReadableStream([': keepalive\n\n']),
      headers: new Map()
    });
    const client = makeClient();
    await client.connect();
    await new Promise(r => setTimeout(r, 10));
    expect(bus.dispatch).not.toHaveBeenCalled();
  });

  test('on stream close, shows toast once and does not reconnect', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      status: 200,
      body: makeReadableStream([]),  // immediately closes
      headers: new Map()
    });
    const client = makeClient();
    await client.connect();
    await new Promise(r => setTimeout(r, 10));
    expect(notify).toHaveBeenCalledWith('Refresh to pick up changes', {});
    // No second fetch (no reconnect).
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  test('on fetch error, shows toast and does not reconnect', async () => {
    mockFetch.mockRejectedValue(new Error('network'));
    const client = makeClient();
    await client.connect();
    await new Promise(r => setTimeout(r, 10));
    expect(notify).toHaveBeenCalledWith('Refresh to pick up changes', {});
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  test('disconnect aborts the fetch', async () => {
    let capturedSignal;
    mockFetch.mockImplementation((url, opts) => {
      capturedSignal = opts.signal;
      return new Promise(() => {});  // never resolves
    });
    const client = makeClient();
    await client.connect();
    client.disconnect();
    expect(capturedSignal.aborted).toBe(true);
    expect(notify).not.toHaveBeenCalled();  // manual disconnect does not toast
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `just test realtime-client`
Expected: FAIL — module not found.

- [ ] **Step 3: Write the implementation**

Create `src/realtime-client.js`:

```js
// realtime-client.js — owns the single SSE connection for one open new-tab
// page. Uses fetch() (not native EventSource) so it can set the Authorization
// header. Parses SSE frames manually from the ReadableStream. On disconnect
// (15-min server timeout, network error, or page hide) shows a toast once and
// does NOT auto-reconnect — the user refreshes to re-establish.

export class RealtimeClient {
  constructor({ bus, notify, getToken, url }) {
    this.bus = bus;
    this.notify = notify || (() => {});
    this.getToken = getToken;
    this.url = url;
    this.controller = null;
    this.disconnected = false;
    this.buffer = '';
  }

  async connect() {
    const token = await this.getToken();
    if (!token) {
      // Not signed in — no realtime stream. Silently skip.
      return;
    }

    this.controller = new AbortController();

    try {
      const response = await fetch(this.url, {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: 'text/event-stream'
        },
        signal: this.controller.signal
      });

      if (!response.ok || !response.body) {
        this.handleDisconnect();
        return;
      }

      await this.readStream(response.body);
    } catch (err) {
      if (err?.name === 'AbortError') {
        // Manual disconnect via disconnect() — don't toast.
        return;
      }
      this.handleDisconnect();
    }
  }

  async readStream(body) {
    const reader = body.getReader();
    const decoder = new TextDecoder();

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        this.buffer += decoder.decode(value, { stream: true });
        this.processBuffer();
      }
    } finally {
      reader.releaseLock?.();
    }

    // Stream ended (server closed — likely the 15-min timeout).
    this.handleDisconnect();
  }

  processBuffer() {
    // SSE frames are separated by a blank line (\n\n).
    let separatorIndex;
    while ((separatorIndex = this.buffer.indexOf('\n\n')) !== -1) {
      const frame = this.buffer.slice(0, separatorIndex);
      this.buffer = this.buffer.slice(separatorIndex + 2);
      this.parseFrame(frame);
    }
  }

  parseFrame(frame) {
    const lines = frame.split('\n');
    let type = null;
    const dataLines = [];

    for (const line of lines) {
      if (line.startsWith(':')) {
        // Comment / heartbeat — ignore.
        return;
      }
      if (line.startsWith('event: ')) {
        type = line.slice(7).trim();
      } else if (line.startsWith('data: ')) {
        dataLines.push(line.slice(6));
      }
    }

    if (!type || dataLines.length === 0) return;

    let data;
    try {
      data = JSON.parse(dataLines.join('\n'));
    } catch {
      // Malformed JSON — skip, don't crash the stream.
      console.warn('[realtime-client] malformed SSE data:', dataLines.join('\n'));
      return;
    }

    this.bus.dispatch(data);
  }

  handleDisconnect() {
    if (this.disconnected) return;
    this.disconnected = true;
    this.notify('Refresh to pick up changes', {});
  }

  disconnect() {
    this.disconnected = true;  // suppress the toast on manual disconnect
    if (this.controller) {
      this.controller.abort();
      this.controller = null;
    }
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `just test realtime-client`
Expected: all tests PASS.

- [ ] **Step 5: Commit**

```bash
cd /Users/rich/Code/saveit-extension
git add src/realtime-client.js tests/unit/realtime-client.test.js
git commit -m "feat(realtime): RealtimeClient fetch-based SSE reader with toast-on-close"
```

---

## Task 9: Extension — config + newtab wiring + remove enrichment poll

**Files:**
- Modify: `/Users/rich/Code/saveit-extension/src/config.js` (add `realtimeFunctionUrl` per env)
- Modify: `/Users/rich/Code/saveit-extension/src/newtab-app.js` (create bus + client, register subscribers)
- Modify: `/Users/rich/Code/saveit-extension/src/newtab-page.js` (call `realtimeClient.connect()` after auth)
- Modify: `/Users/rich/Code/saveit-extension/src/background.js` (remove enrichment poll)
- Delete: `/Users/rich/Code/saveit-extension/src/save-poll.js`

**Interfaces:**
- Consumes: `RealtimeClient` (Task 8), `RealtimeEventBus` (Task 7), `getSessionToken` from `src/session-store.js`, `CONFIG` from `src/config.js`, `toast.show` from `newtab-app.js`, store `refreshInitial()` methods, `clearPendingSave` + `invalidateSavedPagesCacheStorage` from `background.js`.

- [ ] **Step 1: Add `realtimeFunctionUrl` to config**

In `/Users/rich/Code/saveit-extension/src/config.js`, add a `realtimeFunctionUrl` key to each environment (development/staging/production). For now use the same host as `cloudFunctionUrl` — the route `GET /events/stream` is wired on the main function in Task 4, so local dev and the first deploy work without a separate host. When the separate `saveit-realtime` function (Task 5) is deployed, update the staging/prod URLs to its `*.run.app` hostname.

```js
// In the development env block (~line 39):
realtimeFunctionUrl: 'http://localhost:8080',

// In the staging env block (~line 46):
realtimeFunctionUrl: 'https://saveit-staging-5pu7ljvnuq-uc.a.run.app',

// In the production env block (~line 53):
realtimeFunctionUrl: 'https://saveit-5pu7ljvnuq-uc.a.run.app',
```

And add to the returned `CONFIG` object (around line 62-65): `realtimeFunctionUrl: env.realtimeFunctionUrl,`.

- [ ] **Step 2: Wire RealtimeClient + bus into `newtab-app.js`**

In `/Users/rich/Code/saveit-extension/src/newtab-app.js`, after the toast region is created (line ~139) and after the stores are created (line ~158), add:

```js
import { RealtimeEventBus } from './realtime-event-bus.js';
import { RealtimeClient } from './realtime-client.js';
import { getSessionToken } from './session-store.js';
import { CONFIG } from './config.js';
```

After the stores are created (around line 158), add the bus + client + subscriber registration:

```js
const realtimeBus = new RealtimeEventBus();

// Subscriber: the dashboard saved-pages store refreshes on user-scoped page events.
realtimeBus.subscribe('page_updated', (event) => {
  // Only react if this event is scoped to the current user (scopeKeys includes user:<our-uid>).
  // The server already filtered; if we received it, it's relevant. Refresh.
  savedPagesStore.refreshInitial();
  if (event.change === 'enriched' || event.change === 'added') {
    // Clear the optimistic pending-save tile — replaces the enrichment poll.
    // The background SW owns pending-saves; relay via a runtime message.
    browserApi.runtime.sendMessage({ action: 'realtimePageEnriched', url: null, pageId: event.pageId });
  }
});

// Subscriber: project page changes refresh the open project store (if it matches).
realtimeBus.subscribe('project_page_changed', (event) => {
  // The drawer controller checks whether the open project matches event.projectId.
  // If it does, refreshInitial(); if not, mark the project sidebar for refresh.
  drawerController.handleRealtimeProjectEvent?.(event);
});

// Subscriber: project metadata changes refresh the projects list.
realtimeBus.subscribe('project_metadata_changed', () => {
  projectsStore.refreshInitial();
});

const realtimeClient = new RealtimeClient({
  bus: realtimeBus,
  notify: toast.show,
  getToken: getSessionToken,
  url: `${CONFIG.realtimeFunctionUrl}/events/stream`
});
```

Return `realtimeClient` from the app factory (add to the returned object around line 235) so `newtab-page.js` can call `connect()`.

- [ ] **Step 3: Call `realtimeClient.connect()` in `newtab-page.js`**

In `/Users/rich/Code/saveit-extension/src/newtab-page.js`, after `await authController.init();` (line ~142) and after `drawerController.load?.()` (line ~143), add:

```js
void realtimeClient?.connect();
```

Thread `realtimeClient` into `startNewtabPage`'s params (add it to the destructured parameter at line ~113, and pass it from `newtab-app.js` where `startNewtabPage` is called).

Also add a `pagehide` listener to disconnect:

```js
globalThis.addEventListener('pagehide', () => {
  realtimeClient?.disconnect();
}, { once: true });
```

- [ ] **Step 4: Add `handleRealtimeProjectEvent` to the drawer controller**

In the drawer controller (`src/newtab-drawer-runtime.js` or `src/newtab-drawer-data.js`, wherever the open-project state lives), add a method:

```js
function handleRealtimeProjectEvent(event) {
  const openProjectId = state.currentProjectId;  // adapt to the actual state field
  if (event.projectId && event.projectId === openProjectId) {
    savedPagesStore.refreshInitial();
  }
  // Always refresh the projects list (a project's page count changed).
  projectsStore.refreshInitial();
}
```

Expose it on the returned controller object. (Adapt `state.currentProjectId` to the actual field name — check `createInitialDrawerState` in `newtab-drawer-runtime.js`.)

- [ ] **Step 5: Remove the enrichment poll from `background.js`**

In `/Users/rich/Code/saveit-extension/src/background.js`:

1. Remove the import of `createSavePoll` from `./save-poll.js` (line ~top of imports).
2. Remove the `enrichmentPolls` Map declaration (line ~384).
3. Remove `checkPageEnriched` (lines ~371-377).
4. Remove `startEnrichmentPoll` (lines ~385-416).
5. Remove the `startEnrichmentPoll(tab.url)` call at line ~546. Keep the `addPendingSave(...)` call above it — the optimistic tile still renders.
6. Delete `/Users/rich/Code/saveit-extension/src/save-poll.js`.
7. Add a message handler for the realtime enrichment relay (from Step 2's `runtime.sendMessage`):

```js
// In the runtime.onMessage listener (around line 584), add:
if (message.action === 'realtimePageEnriched') {
  // The realtime SSE stream signaled enrichment completion (or a new page).
  // Clear the optimistic tile + invalidate the cache — same as the old poll's onFound.
  (async () => {
    if (message.pageId) {
      // We have a pageId, not a URL. Clear any pending-save whose pageId matches.
      // pending-saves.js keys by URL; if pageId-only, invalidate the whole cache.
      await invalidateSavedPagesCacheStorage(browserApi.storage.local);
    }
  })();
  return false;  // no async response needed
}
```

Note: the old `clearPendingSave` was keyed by URL. The realtime event carries `pageId`, not URL. For the first iteration, invalidating the cache (which forces a refetch that replaces the optimistic tile via `reconcilePages`) is sufficient. If the pending-save record lingers, the existing reconciliation logic in `WarmCacheListStore.reconcilePages` (`warm-cache-list-store.js:712`) drops the optimistic tile when the real doc arrives. Confirm this path covers the case; if not, thread the URL into the event payload (requires adding `url` to the `realtime_events` doc in Task 1).

- [ ] **Step 6: Run the full extension test suite + lint + build**

Run: `just check`
Expected: all tests PASS, lint clean, manifest valid, build succeeds. If `save-poll.test.js` exists, remove it too (it tested the deleted module).

- [ ] **Step 7: Commit**

```bash
cd /Users/rich/Code/saveit-extension
git add src/config.js src/newtab-app.js src/newtab-page.js src/newtab-drawer-runtime.js src/newtab-drawer-data.js src/background.js
git rm src/save-poll.js
# Also remove its test if it exists:
git rm -f tests/unit/save-poll.test.js 2>/dev/null || true
git commit -m "feat(realtime): wire RealtimeClient into newtab lifecycle; remove enrichment poll"
```

---

## Task 10: Extension — E2E test for the realtime flow

**Files:**
- Test: `/Users/rich/Code/saveit-extension/tests/e2e/realtime-push.test.js` (or adapt to the existing E2E framework)

**Goal:** verify end-to-end that a `project_page_changed` SSE event triggers `refreshInitial` on the matching project store, surfacing a new page.

- [ ] **Step 1: Check the existing E2E test structure**

Read `tests/e2e/` to understand the framework (puppeteer? playwright? the `just test-e2e` command). Adapt the test to that framework's patterns.

- [ ] **Step 2: Write the E2E test**

The test should:
1. Start the extension in a test browser with a mock SSE source (intercept `fetch` to `/events/stream` and return a canned SSE frame).
2. Open a project view.
3. Emit a `project_page_changed`/`added` event for that project via the mock SSE source.
4. Assert that the project store called `refreshInitial` (or that the new page appears in the rendered list).

If the E2E framework doesn't easily support SSE mocking, fall back to a focused integration test that instantiates `RealtimeClient` + `RealtimeEventBus` + a mock store, feeds a canned SSE stream, and asserts the store's `refreshInitial` was called. This is the same shape as the unit test in Task 8 but with a real `WarmCacheListStore` mock.

- [ ] **Step 3: Run E2E tests**

Run: `just test-e2e`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
cd /Users/rich/Code/saveit-extension
git add tests/e2e/realtime-push.test.js
git commit -m "test(realtime): E2E test for project_page_changed → refreshInitial flow"
```

---

## Deployment Sequence (after all tasks pass locally)

These steps are manual, run once, in order. They deploy the backend pieces and configure the TTL.

1. **Deploy the trigger:**
   ```bash
   cd /Users/rich/Code/saveit-backend && ./scripts/deploy-realtime-trigger.sh
   ```
2. **Deploy the SSE function:**
   ```bash
   ./scripts/deploy-realtime-function.sh
   ```
3. **Set the TTL policy** (run once, after the first `realtime_events` docs exist — i.e. after a test save triggers the trigger):
   ```bash
   ./scripts/setup-realtime-ttl.sh
   ```
4. **Update the extension config** to point `realtimeFunctionUrl` at the `saveit-realtime` function's hostname (if different from the main function). For the first deploy, the route on the main function (Task 4) works; switch to the dedicated function for production scale.
5. **Smoke test:** open the extension as user A, save a page to a shared project; open as user B in another browser, view the project, and confirm the page appears within seconds.

---

## Self-Review (completed during planning)

**1. Spec coverage:**
- ✅ `realtime-trigger` (Firestore onWrite) → Task 2 + deploy Task 5
- ✅ `saveit-realtime` SSE function (separate, concurrency=100, per-instance onSnapshot, client registry) → Task 3 + deploy Task 5
- ✅ `realtime_events` collection + TTL → Tasks 1-2 (writes) + Task 6 (TTL)
- ✅ Event taxonomy (all rows of both tables) → Task 1 tests cover every row
- ✅ `enriched` fans out to project members + saver → Task 1 (`computeThingsEvents` enrichment branch)
- ✅ Personal edits user-scoped only → Task 1 (`PERSONAL_EDIT_FIELDS` → user scopeKeys only)
- ✅ `RealtimeClient` (fetch + Auth header, SSE parsing, 15-min timeout → toast, no reconnect) → Task 8
- ✅ `RealtimeEventBus` (typed pub/sub) → Task 7
- ✅ Wiring into newtab lifecycle (after auth, pagehide disconnect) → Task 9
- ✅ Enrichment poll removed → Task 9 Step 5
- ✅ 15-min SSE timeout → deploy script `--timeout=900s` (Task 5) + client toast (Task 8)
- ✅ No auto-reconnect → Task 8 tests assert no second fetch

**2. Placeholder scan:** The `handleRealtimeProjectEvent` in Task 9 Step 4 notes "adapt to the actual state field" — this is the one place where the exact field name depends on reading `newtab-drawer-runtime.js` at implementation time. The implementer must verify the field name; the task flags this explicitly rather than guessing. All other steps have complete code.

**3. Type consistency:**
- `EventDoc` shape (`type`, `change`, `pageId`, `projectId`, `scopeKeys`, `emittedAt`, `expireAt`) is consistent across Task 1 (producer), Task 2 (trigger writer), Task 3 (SSE reader → payload), and Task 8 (client parser → `bus.dispatch(data)`).
- `scopeKeys` format (`project:<id>`, `user:<id>`) is consistent across Task 1 (`buildScopeKeys`), Task 3 (`scopeKeysMatch`, `computeClientScopeKeys`), and the client (no transformation needed — it receives the event `scopeKeys` but doesn't use them for routing, since the server already filtered).
- `formatSseFrame` / `parseSseEvent` are symmetric (Task 3 produces, Task 8 consumes).
- `handleEventsStream` signature `(req, res, user)` matches `withAuth`'s contract (Task 4 wires it).
