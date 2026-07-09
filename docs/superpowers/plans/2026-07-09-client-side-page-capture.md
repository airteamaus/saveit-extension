# Client-side page capture — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Capture title, description, and cleaned article content from the page in the browser at save time so auth-gated pages keep their real metadata, with the client as the authoritative source for single saves and Jina retained only for bulk import.

**Architecture:** At save time the extension injects a Readability-based extractor into the active tab via `chrome.scripting.executeScript` and sends a richer payload (`source: 'client'` + a `client` object). The backend persists `source` and a JSON-encoded `client_payload` into the BigQuery `save_events` row; the async enrichment worker SELECTs them back and branches in `enrichEvent` — for `source: 'client'` it skips Jina entirely and feeds client content to the AI step; for `source: 'jina'` (bulk import + legacy) it runs today's Jina path with added login-wall detection. No fallback ladders: the dispatch is on input origin, and capture failure degrades to basic mode visibly.

**Tech Stack:** Firefox/Chrome MV3 extension (esbuild, Vitest + happy-dom); Node.js Cloud Functions + BigQuery + Firestore (Jest); Mozilla Readability (`@mozilla/readability`).

## Global Constraints

These apply to every task; do not repeat them but honor them throughout.

- **Two repos.** Extension at `/Users/rich/Code/saveit-extension`; backend at `/Users/rich/Code/saveit-backend`. Bash state does not persist between calls — chain `cd` with the command. Use absolute paths.
- **`source` is required and explicit everywhere downstream.** BigQuery rows, Firestore docs, the enrichment event, `enrichEvent`, `buildThingObject` all treat `source` as authoritative. The *only* place absence is tolerated is the ingress shim in the save handler, which normalizes once to `'jina'` with a deprecation warning. No other code infers from absence.
- **No fallback ladders.** Client is the source for single saves; Jina is the source for bulk import. Capture failure on a single save → basic mode (URL + title, AI skipped), never Jina. The two paths are symmetric (both can land in basic mode on content failure), not chained.
- **Readability is the only extractor.** `capture_method ∈ {'readability', 'none'}`. Do not write a heuristic. A future heuristic is gated on telemetry.
- **Backend-first rollout.** The extension tasks (Tasks 11-13) must not be executed until the backend tasks (Tasks 1-10) are deployed, because the extension depends on the backend persisting `client_payload`.
- **Additive contracts.** Never change existing field meanings. New fields only.
- **Match existing patterns.** The extension uses ES modules + esbuild; the cloud functions use CommonJS + Jest. Follow each repo's conventions.
- **Commits are scoped.** Each task ends with a commit (or commits) in the relevant repo. Extension tasks commit in `saveit-extension`; backend tasks commit in `saveit-backend`.
- **Content cap.** Client content is truncated to 12,000 characters, head-weighted.
- **Test failure modes, not just happy paths.** Every task includes the failure-mode test from the spec's testing table.

## File Structure

### Extension (`saveit-extension`) — files created/modified

| File | Responsibility | Action |
|---|---|---|
| `src/page-capture.js` | NEW. Pure functions: meta-tag extraction, Readability invocation, content truncation, the `client` object builder. No browser APIs — receives a `document`, returns data. Fully unit-testable. | Create |
| `src/page-capture-injector.js` | NEW. Thin wrapper around `chrome.scripting.executeScript` that injects `page-capture.js`'s extractor into a tab and returns the `client` object (or a failure marker). This is the only file that touches the `scripting` API. | Create |
| `src/background.js` | Modify `savePageFromTab` (line 427) to call the injector before the POST and add `source` + `client` to `pageData`. | Modify |
| `manifest.json` | Add `"scripting"` to `permissions` (line 17-24). | Modify |
| `package.json` | Add `@mozilla/readability` to `dependencies`. | Modify |
| `tests/unit/page-capture.test.js` | NEW. Unit tests for `page-capture.js` pure functions. | Create |
| `tests/unit/background-save-payload.test.js` | NEW. Tests that `savePageFromTab` includes `source` + `client` and that capture failure still saves. | Create |

### Backend (`saveit-backend`) — files created/modified

| File | Responsibility | Action |
|---|---|---|
| `contracts/save_events.schema.json` | Add `source`, `client_payload`, `fetch_status` column defs. | Modify |
| `contracts/firestore-things-schema.js` | Add `source`, `author`, `image`, `published_time`, `lang`, `fetch_status` to `THINGS_SCHEMA`. | Modify |
| `cloud-function/index.js` | `handleSavePage`: ingress shim (normalize absent `source` → `'jina'` + warn), persist `source`/`client_payload` into the BigQuery row. `handleBulkImport`: set `source: 'jina'` on rows. | Modify |
| `cloud-function-enrich/index.js` | `fetchEventById`: add `source`, `client_payload` to the SELECT. | Modify |
| `cloud-function-enrich/enrichment-core.js` | `enrichEvent`: branch on `event.source`. `extractBasicMetadata`: client-aware path. `buildThingObject`: write `source` + client fields. | Modify |
| `cloud-function-enrich/jina-reader.js` | `isBlockedContent`: add login-wall / auth-screen detection. | Modify |
| `cloud-function-enrich/enrichment-core.js` | `fetchOrRetrieveContent`: when login wall detected, set `metrics.fetch_status`. | Modify |
| `scripts/migrate-save-events-source.sql` | NEW. DDL: ALTER TABLE add columns + backfill UPDATE. Reference script, run manually against BigQuery. | Create |
| `scripts/backfill-things-source.js` | NEW. Firestore backfill: set `source: 'jina'` on all existing things. | Create |
| `cloud-function/index.test.js` | Tests for ingress shim. | Modify |
| `cloud-function-enrich/enrichment-core.test.js` | Tests for `source` dispatch + client metadata path. | Modify |
| `cloud-function-enrich/enrich-worker.test.js` | Update `toHaveBeenCalledWith` assertions to include `source`. | Modify |
| `cloud-function-enrich/jina-reader.test.js` | Tests for login-wall detection. | Modify |

---

## Backend tasks (Tasks 1-10) — ship first

These must be done and deployed before the extension tasks.

### Task 1: Update the `save_events` contract schema

**Files:**
- Modify: `/Users/rich/Code/saveit-backend/contracts/save_events.schema.json`
- Test: `/Users/rich/Code/saveit-backend/cloud-function/validation.test.js` (existing — confirm schema loads)

**Interfaces:**
- Consumes: nothing (schema is source of truth).
- Produces: a schema that downstream tasks (handleSavePage writes, tests) validate against. Columns: `source` (STRING), `client_payload` (STRING, JSON), `fetch_status` (STRING).

- [ ] **Step 1: Read the current schema**

```bash
cat /Users/rich/Code/saveit-backend/contracts/save_events.schema.json
```

Confirm it is the 9-column file (ending with `project_id`). The array has 9 objects.

- [ ] **Step 2: Add the three new column definitions**

After the `project_id` object (the last entry), add three entries. The full file becomes:

```json
[
  {
    "name": "event_id",
    "type": "STRING"
  },
  {
    "name": "event_timestamp",
    "type": "TIMESTAMP"
  },
  {
    "name": "user_email",
    "type": "STRING"
  },
  {
    "name": "user_name",
    "type": "STRING"
  },
  {
    "name": "url",
    "type": "STRING"
  },
  {
    "name": "title",
    "type": "STRING"
  },
  {
    "name": "event_type",
    "type": "STRING"
  },
  {
    "name": "user_id",
    "type": "STRING"
  },
  {
    "name": "project_id",
    "type": "STRING"
  },
  {
    "name": "source",
    "type": "STRING",
    "description": "Content acquisition source: 'client' (browser-captured at save) or 'jina' (server-side fetch). Required for new rows; legacy rows backfilled to 'jina'."
  },
  {
    "name": "client_payload",
    "type": "STRING",
    "description": "JSON-encoded client capture object (title, description, content, etc.). Present when source='client'; NULL for source='jina'."
  },
  {
    "name": "fetch_status",
    "type": "STRING",
    "description": "How content acquisition ended: 'ok', 'auth_wall', 'blocked', 'capture_failed'. NULL for legacy rows."
  }
]
```

- [ ] **Step 3: Verify the JSON is valid**

```bash
node -e "JSON.parse(require('fs').readFileSync('/Users/rich/Code/saveit-backend/contracts/save_events.schema.json','utf8')); console.log('valid JSON, entries:', JSON.parse(require('fs').readFileSync('/Users/rich/Code/saveit-backend/contracts/save_events.schema.json','utf8')).length)"
```

Expected: `valid JSON, entries: 12`

- [ ] **Step 4: Run the contract validation script if it exists**

```bash
cd /Users/rich/Code/saveit-backend && ls scripts/ | grep -i schema
```

If a `validate-schemas.sh` exists, run it. If not, skip — Step 3 is the validation.

- [ ] **Step 5: Commit**

```bash
cd /Users/rich/Code/saveit-backend && git add contracts/save_events.schema.json && git commit -m "feat(contracts): add source, client_payload, fetch_status to save_events schema"
```

---

### Task 2: Update the Firestore `things` schema

**Files:**
- Modify: `/Users/rich/Code/saveit-backend/contracts/firestore-things-schema.js` (the `THINGS_SCHEMA` object, lines ~13-217, and `EXAMPLE_DOCUMENT` ~253-282)

**Interfaces:**
- Consumes: nothing.
- Produces: schema field defs that `buildThingObject` (Task 6) will write and `firestore-queries.js` may later project. Field names: `source`, `author`, `image`, `published_time`, `lang`, `fetch_status`.

- [ ] **Step 1: Read the file around the schema end**

```bash
sed -n '200,220p' /Users/rich/Code/saveit-backend/contracts/firestore-things-schema.js
```

Find the last field in `THINGS_SCHEMA` (it is `primary_classification_label`, ending around line 217 with `};`).

- [ ] **Step 2: Add the new field definitions before the closing `};`**

Insert these entries immediately after `primary_classification_label` and before the `};` that closes `THINGS_SCHEMA`:

```js
  source: {
    type: 'string',
    required: true,
    description: "Content acquisition source: 'client' (browser-captured) or 'jina' (server-side fetch via Jina Reader)",
    example: 'client'
  },
  fetch_status: {
    type: 'string',
    description: "How content acquisition ended: 'ok', 'auth_wall', 'blocked', 'capture_failed'",
    example: 'ok'
  },
  author: {
    type: 'string',
    description: 'Page author (from Readability byline or meta author tag)',
    example: 'Jane Doe'
  },
  image: {
    type: 'string',
    description: 'Primary image URL (from og:image)',
    example: 'https://example.com/og-image.png'
  },
  published_time: {
    type: 'string',
    description: 'Article publish time (from article:published_time meta)',
    example: '2026-07-01T10:00:00Z'
  },
  lang: {
    type: 'string',
    description: 'Page language (from Readability lang or html lang attr)',
    example: 'en'
  }
```

- [ ] **Step 3: Add the new fields to `EXAMPLE_DOCUMENT`**

Find `EXAMPLE_DOCUMENT` (around line 253-282) and add the new fields alongside the existing ones (e.g. after `primary_classification_label`):

```js
  source: 'client',
  fetch_status: 'ok',
  author: 'Jane Doe',
  image: 'https://example.com/og-image.png',
  published_time: '2026-07-01T10:00:00Z',
  lang: 'en'
```

- [ ] **Step 4: Verify the file loads**

```bash
cd /Users/rich/Code/saveit-backend/cloud-function-enrich && node -e "const { THINGS_SCHEMA } = require('../contracts/firestore-things-schema.js'); console.log('source field:', THINGS_SCHEMA.source?.type); console.log('total fields:', Object.keys(THINGS_SCHEMA).length)"
```

Expected: `source field: string` and a count roughly 6 higher than before.

- [ ] **Step 5: Run existing schema tests**

```bash
cd /Users/rich/Code/saveit-backend/cloud-function-enrich && pnpm test 2>&1 | tail -20
```

Expected: all pass. If `validateThing` tests assert on exact field counts, update them.

- [ ] **Step 6: Commit**

```bash
cd /Users/rich/Code/saveit-backend && git add contracts/firestore-things-schema.js && git commit -m "feat(contracts): add source, client fields, fetch_status to things schema"
```

---

### Task 3: DDL migration + backfill script for BigQuery

This is a reference SQL script run manually against BigQuery — not executed by tests. It must be reviewed and run before deploying the backend code that writes the new columns.

**Files:**
- Create: `/Users/rich/Code/saveit-backend/scripts/migrate-save-events-source.sql`

- [ ] **Step 1: Write the migration script**

Create `/Users/rich/Code/saveit-backend/scripts/migrate-save-events-source.sql`:

```sql
-- Migration: add source/client_payload/fetch_status to save_events
-- Run manually against the bookmarking-477502.saveit dataset before deploying
-- the backend code that writes these columns.
--
-- BigQuery streaming inserts reject unknown columns, so the column MUST exist
-- before the new handleSavePage code is deployed.

-- 1. Add columns (idempotent — re-running errors harmlessly on "already exists")
ALTER TABLE `bookmarking-477502.saveit.save_events`
  ADD COLUMN IF NOT EXISTS source STRING;
ALTER TABLE `bookmarking-477502.saveit.save_events`
  ADD COLUMN IF NOT EXISTS client_payload STRING;
ALTER TABLE `bookmarking-477502.saveit.save_events`
  ADD COLUMN IF NOT EXISTS fetch_status STRING;

-- 2. Backfill: every existing row was enriched via Jina (the only source that
--    existed before this change). This is a recorded fact, not an inference.
UPDATE `bookmarking-477502.saveit.save_events`
SET source = 'jina'
WHERE source IS NULL;
```

- [ ] **Step 2: Commit (the script is not executed here — it is run during deployment)**

```bash
cd /Users/rich/Code/saveit-backend && git add scripts/migrate-save-events-source.sql && git commit -m "feat(migrations): add save_events source/client_payload DDL + backfill"
```

- [ ] **Step 3: Flag for deployment**

Note in the deployment checklist: this script must be run against the production dataset before Task 4's code is deployed. The plan executor should surface this — do not auto-run it.

---

### Task 3b: Firestore `things` backfill script

Backfills `source: 'jina'` on all existing Firestore thing docs. The physical Firestore collection has no schema enforcement, so this is a write script, not a DDL migration.

**Files:**
- Create: `/Users/rich/Code/saveit-backend/scripts/backfill-things-source.js`

- [ ] **Step 1: Read an existing backfill script for the pattern**

```bash
cat /Users/rich/Code/saveit-backend/scripts/backfill-user-aggregates.js
```

This is the closest analog (invoked by `just rebuild-aggregates`). Mirror its structure: how it obtains the Firestore client, how it iterates the collection in batches, how it logs progress.

- [ ] **Step 2: Write the backfill script**

Create `/Users/rich/Code/saveit-backend/scripts/backfill-things-source.js`:

```js
// Backfill: set source='jina' on all existing things docs.
// Every prior thing was enriched via Jina (the only source before this change),
// so 'jina' is a recorded fact, not an inference.
//
// Usage: node scripts/backfill-things-source.js [--dry-run]
//
// Run once after deploying the backend changes. Idempotent: re-running only
// updates docs where source is still missing.

const { getFirestoreClient } = require('../shared/firebase-client');

const COLLECTION = 'things';
const BATCH_SIZE = 500;

async function main() {
  const dryRun = process.argv.includes('--dry-run');
  const db = getFirestoreClient();
  const collection = db.collection(COLLECTION);

  let updated = 0;
  let skipped = 0;
  let lastDoc = null;

  do {
    let query = collection.orderBy('__name__').limit(BATCH_SIZE);
    if (lastDoc) {
      query = query.startAfter(lastDoc);
    }
    const snapshot = await query.get();

    if (snapshot.empty) {
      break;
    }

    const batch = db.batch();
    let batchCount = 0;

    for (const doc of snapshot.docs) {
      const data = doc.data();
      if (data.source === undefined || data.source === null) {
        if (!dryRun) {
          batch.update(doc.ref, { source: 'jina' });
        }
        batchCount++;
        updated++;
      } else {
        skipped++;
      }
    }

    if (batchCount > 0 && !dryRun) {
      await batch.commit();
      console.log(`Updated ${batchCount} docs (total: ${updated})`);
    }

    lastDoc = snapshot.docs[snapshot.docs.length - 1];
  } while (true);

  console.log(`Backfill ${dryRun ? '(dry-run) ' : ''}complete: ${updated} updated, ${skipped} already had source.`);
}

main().catch((err) => {
  console.error('Backfill failed:', err);
  process.exit(1);
});
```

> **Note:** Confirm `getFirestoreClient` is the correct export name by reading `shared/firebase-client.js` — it may be named differently (e.g. `getSharedPath('firebase-client')` returning `{ getDb }`). Match the existing `backfill-user-aggregates.js` pattern exactly for client acquisition.

- [ ] **Step 3: Commit**

```bash
cd /Users/rich/Code/saveit-backend && git add scripts/backfill-things-source.js && git commit -m "feat(scripts): backfill source=jina on existing things docs"
```

- [ ] **Step 4: Flag for deployment**

Add to the deployment checkpoint: run `node scripts/backfill-things-source.js` after deploying the backend, alongside the BigQuery migration (Task 3). Consider a `--dry-run` first to confirm the count.

---

### Task 4: `handleSavePage` — ingress shim + persist `source`/`client_payload`

This is the load-bearing backend write change. It must land after Task 3's DDL is run.

**Files:**
- Modify: `/Users/rich/Code/saveit-backend/cloud-function/index.js` (lines 279-365, `handleSavePage`)
- Modify: `/Users/rich/Code/saveit-backend/cloud-function/index.test.js`

**Interfaces:**
- Consumes: `req.body.source` (`'client'` | `'jina'`), `req.body.client` (object, optional).
- Produces: a BigQuery row with `source`, `client_payload` (JSON string), and the existing fields. Later tasks (5, 6) read `source`/`client_payload` back.

- [ ] **Step 1: Write the failing test for the ingress shim**

Append to `/Users/rich/Code/saveit-backend/cloud-function/index.test.js`. First read the file to find the test helpers (how `handleSavePage` is invoked in tests — likely via a mocked req/res with auth stubbed):

```bash
grep -n "handleSavePage\|describe\|mockBigquery\|insert" /Users/rich/Code/saveit-backend/cloud-function/index.test.js | head -40
```

Then add this test (adapt the invocation style to match the existing tests — the key assertions are on the BigQuery row). Use the existing test's setup pattern for auth + BigQuery mocking:

```js
describe('handleSavePage source handling', () => {
  // Reuse the existing test file's auth + bigquery mock setup.
  // The key assertions are about what gets written to the row.

  it('normalizes absent source to jina with a deprecation warning', async () => {
    const capturedRows = [];
    // mock bigquery.insert to capture rows — match the existing test's mock shape
    mockBigqueryInsert(capturedRows);

    await invokeHandleSavePage({
      body: { url: 'https://example.com', title: 'Example' }
      // no source — simulates a legacy extension
    });

    expect(capturedRows).toHaveLength(1);
    expect(capturedRows[0].source).toBe('jina');
    expect(capturedRows[0].client_payload).toBeNull();
    // deprecation warning was logged
    expect(mockLoggerWarn).toHaveBeenCalledWith(
      expect.stringContaining('source missing')
    );
  });

  it('persists source=client and JSON-encodes the client object', async () => {
    const capturedRows = [];
    mockBigqueryInsert(capturedRows);

    const client = { title: 'Real Title', content: 'body text', capture_method: 'readability' };
    await invokeHandleSavePage({
      body: { url: 'https://example.com', title: 'Tab Title', source: 'client', client }
    });

    expect(capturedRows[0].source).toBe('client');
    expect(JSON.parse(capturedRows[0].client_payload)).toEqual(client);
  });

  it('rejects unknown source values', async () => {
    const res = await invokeHandleSavePage({
      body: { url: 'https://example.com', source: 'bogus' }
    });
    expect(res.status).toBe(400);
  });
});
```

> **Note on test helpers:** The exact `invokeHandleSavePage`, `mockBigqueryInsert`, and `mockLoggerWarn` names must match what the existing tests in `index.test.js` already use. Read the file first and adapt these names to the established pattern. If no such helpers exist, model the new test on the closest existing `handleSavePage` test.

- [ ] **Step 2: Run the test to verify it fails**

```bash
cd /Users/rich/Code/saveit-backend/cloud-function && pnpm test -- index.test.js 2>&1 | tail -30
```

Expected: the three new tests fail (source not yet read/written).

- [ ] **Step 3: Implement the ingress shim and persistence**

In `/Users/rich/Code/saveit-backend/cloud-function/index.js`, modify `handleSavePage` (lines 279-365). The current body starts:

```js
const handleSavePage = withAuthAndErrorHandling(
  async (req, res, user) => {
    const { url, title } = req.body;
    const projectId = typeof req.body?.projectId === 'string'
      ? req.body.projectId.trim()
      : null;
```

Replace with (add source handling after the `projectId` extraction):

```js
const handleSavePage = withAuthAndErrorHandling(
  async (req, res, user) => {
    const { url, title } = req.body;
    const projectId = typeof req.body?.projectId === 'string'
      ? req.body.projectId.trim()
      : null;

    // --- source handling (ingress shim) ---
    // source is required for new clients. Legacy clients omit it; normalize
    // once to 'jina' (the only source that existed before this change) and
    // warn. Downstream code treats source as authoritative — no inference.
    const VALID_SOURCES = ['client', 'jina'];
    let source = req.body?.source;
    if (source === undefined) {
      logger.warn('save request missing source — normalizing to jina (legacy client)', {
        url
      });
      source = 'jina';
    } else if (!VALID_SOURCES.includes(source)) {
      sendErrorResponse(res, 400, `Invalid source: ${source}`, { code: 'INVALID_SOURCE' });
      return;
    }

    // client object is only meaningful for source='client'. JSON-encode for
    // the STRING column; null otherwise.
    const clientPayload = source === 'client' && req.body?.client
      ? JSON.stringify(req.body.client)
      : null;
```

Then update the BigQuery row object (currently lines 304-314) to include the new fields. The current row:

```js
    const rows = [{
      event_id: eventId,
      event_timestamp: eventTimestamp,
      user_id: user.user_id,
      user_email: user.email || null,
      user_name: null,
      url: url,
      title: title || null,
      event_type: 'save',
      project_id: projectId || null
    }];
```

Becomes:

```js
    const rows = [{
      event_id: eventId,
      event_timestamp: eventTimestamp,
      user_id: user.user_id,
      user_email: user.email || null,
      user_name: null,
      url: url,
      title: title || null,
      event_type: 'save',
      project_id: projectId || null,
      source,
      client_payload: clientPayload,
      fetch_status: null
    }];
```

- [ ] **Step 4: Run the tests to verify they pass**

```bash
cd /Users/rich/Code/saveit-backend/cloud-function && pnpm test -- index.test.js 2>&1 | tail -30
```

Expected: all pass, including the three new tests.

- [ ] **Step 5: Commit**

```bash
cd /Users/rich/Code/saveit-backend && git add cloud-function/index.js cloud-function/index.test.js && git commit -m "feat(save): normalize source at ingress, persist client_payload to BigQuery"
```

---

### Task 5: `handleBulkImport` — set `source: 'jina'` on rows

Bulk import has no active page, so it is always Jina-sourced. This keeps the dispatch explicit.

**Files:**
- Modify: `/Users/rich/Code/saveit-backend/cloud-function/index.js` (`handleBulkImport`, lines ~372-505; the row object is around lines 418-428)

- [ ] **Step 1: Read the bulk import row construction**

```bash
sed -n '410,445p' /Users/rich/Code/saveit-backend/cloud-function/index.js
```

- [ ] **Step 2: Add `source` to each bulk-import row**

Find the row object in `handleBulkImport` (same shape as `handleSavePage`'s row). Add three fields:

```js
      source: 'jina',
      client_payload: null,
      fetch_status: null
```

Add a brief comment explaining why bulk import is always Jina (no active page to capture from):

```js
      // Bulk import has no active browser tab, so client capture is impossible.
      // source is explicitly 'jina' — not inferred.
      source: 'jina',
      client_payload: null,
      fetch_status: null
```

- [ ] **Step 3: Add or update a test asserting bulk rows carry source='jina'**

In `index.test.js`, find or add a bulk-import test and assert `rows[0].source === 'jina'`. If no bulk-import test exists, add a minimal one modeled on the Task 4 tests.

- [ ] **Step 4: Run tests**

```bash
cd /Users/rich/Code/saveit-backend/cloud-function && pnpm test -- index.test.js 2>&1 | tail -20
```

Expected: pass.

- [ ] **Step 5: Commit**

```bash
cd /Users/rich/Code/saveit-backend && git add cloud-function/index.js cloud-function/index.test.js && git commit -m "feat(bulk-import): set source=jina explicitly on rows"
```

---

### Task 6: Worker SELECT — add `source` + `client_payload` to `fetchEventById`

**This is the load-bearing read change.** The worker's `event` object is exactly the SELECTed row, so `event.source`/`event.client_payload` only exist if they're in this SELECT.

**Files:**
- Modify: `/Users/rich/Code/saveit-backend/cloud-function-enrich/index.js` (`fetchEventById`, line 255-273)
- Modify: `/Users/rich/Code/saveit-backend/cloud-function-enrich/enrich-worker.test.js`

**Interfaces:**
- Consumes: the new BigQuery columns (Task 3's DDL must be run).
- Produces: `event.source` (string) and `event.client_payload` (JSON string or null) on the event object that `enrichEvent` receives. Task 7 consumes these.

- [ ] **Step 1: Read the current `fetchEventById`**

```bash
sed -n '255,273p' /Users/rich/Code/saveit-backend/cloud-function-enrich/index.js
```

Current SELECT (line 257):
```sql
    SELECT event_id, event_timestamp, user_id, user_email, url, title, project_id
    FROM `${datasetId}.save_events`
    WHERE event_id = @event_id
    LIMIT 1
```

- [ ] **Step 2: Add `source` and `client_payload` to the SELECT**

Change the SELECT line to:

```sql
    SELECT event_id, event_timestamp, user_id, user_email, url, title, project_id,
           source, client_payload
    FROM `${datasetId}.save_events`
    WHERE event_id = @event_id
    LIMIT 1
```

- [ ] **Step 3: Add JSON parsing to the returned event**

After `return rows[0];` (line 272), parse `client_payload` into a structured `client` field so downstream code gets an object, not a string. Modify the return:

```js
  if (rows.length === 0) {
    return null;
  }

  const event = rows[0];
  // client_payload is stored as a JSON STRING column; parse it into a structured
  // client object for downstream use. Null for source='jina' rows.
  if (event.client_payload) {
    try {
      event.client = JSON.parse(event.client_payload);
    } catch (parseError) {
      logger.warn('Failed to parse client_payload JSON', {
        event_id: event.event_id,
        error: parseError.message
      });
      event.client = null;
    }
  } else {
    event.client = null;
  }

  return event;
```

- [ ] **Step 4: Update the worker test assertions**

In `/Users/rich/Code/saveit-backend/cloud-function-enrich/enrich-worker.test.js`, the test mocks `fetchEventById` (or the BigQuery query). Find the mock event object (around lines 278-282, 340-343 where `mockEnrichEvent.toHaveBeenCalledWith(mockEvent, {...})` is asserted) and add `source` + `client_payload` + `client` to the mock event so the assertions stay accurate. Add `source: 'client'` (or `'jina'`) and the parsed `client` to the mock.

- [ ] **Step 5: Run tests**

```bash
cd /Users/rich/Code/saveit-backend/cloud-function-enrich && pnpm test -- enrich-worker.test.js 2>&1 | tail -20
```

Expected: pass.

- [ ] **Step 6: Commit**

```bash
cd /Users/rich/Code/saveit-backend && git add cloud-function-enrich/index.js cloud-function-enrich/enrich-worker.test.js && git commit -m "feat(enrich): SELECT source + client_payload in fetchEventById"
```

---

### Task 7: `enrichEvent` — branch on `source`

The core dispatch. For `source: 'client'` with content, skip Jina entirely and feed client content to the AI step. For `source: 'client'` with null content, basic mode. For `source: 'jina'`, today's path.

**Files:**
- Modify: `/Users/rich/Code/saveit-backend/cloud-function-enrich/enrichment-core.js` (`enrichEvent`, lines 327-456; `extractBasicMetadata`, lines 103-130; `buildThingObject`, lines 274-303)
- Modify: `/Users/rich/Code/saveit-backend/cloud-function-enrich/enrichment-core.test.js`

**Interfaces:**
- Consumes: `event.source`, `event.client` (object or null) from Task 6.
- Produces: enriched things written to Firestore, with `source` and client fields on the doc. Consumes the schemas from Tasks 1-2.

- [ ] **Step 1: Write failing tests for the source dispatch**

In `enrichment-core.test.js`, add tests. These call `enrichEvent` with a mocked event and assert on what gets written (mock `writeThingToFirestore` and capture the thing object). Adapt helper names to the existing test file's pattern:

```js
describe('enrichEvent source dispatch', () => {
  beforeEach(() => {
    // mock writeThingToFirestore to capture the thing; mock enrichWithAI;
    // mock checkDuplicateThing to return false; mock Jina fetchPageContent
  });

  it('source=client with content skips Jina and feeds client content to AI', async () => {
    mockCheckDuplicateThing(false);
    const capturedThing = mockWriteThingCapture();
    mockEnrichWithAIReturns({ classifications: [], aiSummaryBrief: 'summary', aiSummaryExtended: null });

    await enrichEvent({
      event_id: 'e1', user_id: 'u1', url: 'https://drive.google.com/file',
      title: 'Tab Title', source: 'client',
      client: { title: 'Doc Title', description: 'desc', content: 'the doc body', capture_method: 'readability' },
      event_timestamp: '2026-07-01T00:00:00Z'
    });

    // Jina was never called
    expect(mockJinaFetchPageContent).not.toHaveBeenCalled();
    // AI was called with the client content
    expect(mockEnrichWithAI).toHaveBeenCalledWith(
      'https://drive.google.com/file',
      'Doc Title',                       // client title preferred
      'the doc body',                    // client content
      expect.anything(),
      expect.anything()
    );
    // Thing carries source + client fields
    expect(capturedThing.source).toBe('client');
    expect(capturedThing.title).toBe('Doc Title');
    expect(capturedThing.description).toBe('desc');
  });

  it('source=client with null content writes basic mode, skips AI and Jina', async () => {
    mockCheckDuplicateThing(false);
    const capturedThing = mockWriteThingCapture();

    await enrichEvent({
      event_id: 'e2', user_id: 'u2', url: 'https://example.com',
      title: 'Tab Title', source: 'client',
      client: { title: '', content: null, capture_method: 'none' },
      event_timestamp: '2026-07-01T00:00:00Z'
    });

    expect(mockJinaFetchPageContent).not.toHaveBeenCalled();
    expect(mockEnrichWithAI).not.toHaveBeenCalled();
    expect(capturedThing.title).toBe('Tab Title');   // fell back to event title
    expect(capturedThing.description).toBeNull();
    expect(capturedThing.source).toBe('client');
  });

  it('source=jina runs the existing Jina path', async () => {
    mockCheckDuplicateThing(false);
    mockJinaFetchPageContentReturns({ title: 'J Title', content: 'jina body', description: 'j desc' });
    const capturedThing = mockWriteThingCapture();

    await enrichEvent({
      event_id: 'e3', user_id: 'u3', url: 'https://example.com',
      title: 'Tab', source: 'jina', client: null,
      event_timestamp: '2026-07-01T00:00:00Z'
    });

    expect(mockJinaFetchPageContent).toHaveBeenCalledWith('https://example.com');
    expect(capturedThing.source).toBe('jina');
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

```bash
cd /Users/rich/Code/saveit-backend/cloud-function-enrich && pnpm test -- enrichment-core.test.js 2>&1 | tail -30
```

Expected: the client-path tests fail (no dispatch yet).

- [ ] **Step 3: Add a client-aware branch in `enrichEvent`**

In `/Users/rich/Code/saveit-backend/cloud-function-enrich/enrichment-core.js`, modify `enrichEvent` (line 327+). After the duplicate check (which ends around line 378) and **before** the existing Step 1 (`fetchOrRetrieveContent`, line 381), insert the client branch. The existing lines 380-403 are:

```js
  // Step 1: Fetch or retrieve content
  const { content, contentRef, jinaTitle, jinaDescription } =
    await fetchOrRetrieveContent(event, hash, metrics);

  // Step 2: Extract basic metadata
  const basicMetadata = extractBasicMetadata(event, content, jinaTitle, jinaDescription);
  metrics.reading_time_minutes = basicMetadata.readingTime || 0;

  if (content) {
    logger.info(`Enriched ${event.url}: ${basicMetadata.readingTime} min read, ${content.length} chars`);
  }

  // Step 3: AI enrichment (only if we have content)
  let aiData = {
    classifications: null,
    aiSummaryBrief: null,
    aiSummaryExtended: null
  };

  if (content) {
    aiData = await enrichWithAI(event.url, basicMetadata.title, content, metrics, {
      invalidateCache
    });
  }
```

Insert a client branch right after the duplicate check block (after line 378 `}`) and restructure so the Jina path is the `else`. Replace the block starting at the "Step 1" comment through the AI enrichment block:

```js
  // --- source dispatch ---
  // source='client': content was captured in the browser at save time (where
  //   the user's session is live). Jina is never called. If the client content
  //   is null (capture failed), write basic mode — no Jina, no AI.
  // source='jina': today's path (bulk import, legacy clients).
  if (event.source === 'client') {
    const client = event.client || {};
    const clientContent = client.content || null;

    let basicMetadata;
    let contentRef = null;

    if (clientContent) {
      basicMetadata = extractBasicMetadataFromClient(event, client);
      metrics.reading_time_minutes = basicMetadata.readingTime || 0;
      contentRef = null; // client content is not stored in the GCS dedup store

      logger.info(`Enriched (client) ${event.url}: ${basicMetadata.readingTime} min read, ${clientContent.length} chars`);
    } else {
      // capture failed — basic mode
      basicMetadata = {
        title: client.title || event.title || 'Untitled',
        readingTime: null,
        description: null
      };
      metrics.fetch_status = 'capture_failed';
    }

    // AI step runs only with content
    let aiData = { classifications: null, aiSummaryBrief: null, aiSummaryExtended: null };
    if (clientContent) {
      metrics.fetch_status = 'ok';
      aiData = await enrichWithAI(event.url, basicMetadata.title, clientContent, metrics, {
        invalidateCache
      });
    }

    const thing = buildThingObject(event, basicMetadata, aiData, domain, contentRef, startTimeISO);
    await writeThingToFirestore(thing);
    await writeClassificationsToFirestore(thing);

    const { rebuildUserAggregatesForUser } = require('./aggregate-writers');
    await rebuildUserAggregatesForUser(thing.user_id);

    if (process.env.VECTOR_SEARCH_INDEX && thing.classifications?.length) {
      try {
        const { upsertClassificationVectors } = require(getSharedPath('vector-search-client.js'));
        await upsertClassificationVectors(
          thing.classifications.map((c, i) => ({
            id: `${thing.id}_${c.type}_${i}`,
            embedding: c.embedding,
            restricts: {
              user_id: thing.user_id,
              deleted: 'false',
              thing_id: thing.id,
              classification_label: c.label,
              classification_type: c.type
            }
          }))
        );
      } catch (error) {
        logger.warn('Vector Search upsert failed (non-fatal)', {
          thing_id: thing.id, error: error.message
        });
      }
    }

    const endTime = new Date();
    const endTimeISO = endTime.toISOString();
    await recordEnrichmentSuccess(event.event_id, startTimeISO, endTimeISO);
    metrics.enrichment_duration_ms = endTime - startTime;
    const logLevel = metrics.error ? 'warn' : 'info';
    logger[logLevel]('Enrichment completed (client source)', { enrichment_metrics: metrics });
    return;
  }

  // --- source='jina' path (existing logic, unchanged) ---
  // Step 1: Fetch or retrieve content
  const { content, contentRef, jinaTitle, jinaDescription } =
    await fetchOrRetrieveContent(event, hash, metrics);

  // Step 2: Extract basic metadata
  const basicMetadata = extractBasicMetadata(event, content, jinaTitle, jinaDescription);
  metrics.reading_time_minutes = basicMetadata.readingTime || 0;

  if (content) {
    logger.info(`Enriched ${event.url}: ${basicMetadata.readingTime} min read, ${content.length} chars`);
  }

  // Step 3: AI enrichment (only if we have content)
  let aiData = {
    classifications: null,
    aiSummaryBrief: null,
    aiSummaryExtended: null
  };

  if (content) {
    aiData = await enrichWithAI(event.url, basicMetadata.title, content, metrics, {
      invalidateCache
    });
  }
```

> **Why duplicate the persist/aggregate/vector-search block in the client branch instead of sharing it?** The two branches produce `basicMetadata`, `aiData`, `contentRef`, and `metrics` differently but converge on the same persist logic. A shared helper would obscure the dispatch. The duplication is explicit and matches the spec's "branch at the top" decision. If it bothers you, refactor after the tests pass — but keep the dispatch visible.

- [ ] **Step 4: Add `extractBasicMetadataFromClient`**

In the same file, add a new function near `extractBasicMetadata` (after line 130):

```js
// Build metadata from the client-captured object. Client title/description are
// authoritative — they came from the page the user was actually viewing.
// Falls back to event.title only if client.title is empty.
function extractBasicMetadataFromClient(event, client) {
  const title = (client.title && client.title.trim())
    ? client.title.trim()
    : (event.title || 'Untitled');
  const description = client.description || null;
  const readingTime = client.content
    ? calculateReadingTime(client.content)
    : null;

  return { title, readingTime, description };
}
```

(Confirm `calculateReadingTime` is in scope — it's already used by `extractBasicMetadata` at line 112.)

Add it to the module exports alongside `extractBasicMetadata` if the file exports these (check the bottom of the file; if `extractBasicMetadata` isn't exported, no need to export this one either — it's only called internally).

- [ ] **Step 5: Run the tests to verify they pass**

```bash
cd /Users/rich/Code/saveit-backend/cloud-function-enrich && pnpm test -- enrichment-core.test.js 2>&1 | tail -30
```

Expected: the three dispatch tests pass.

- [ ] **Step 6: Commit**

```bash
cd /Users/rich/Code/saveit-backend && git add cloud-function-enrich/enrichment-core.js cloud-function-enrich/enrichment-core.test.js && git commit -m "feat(enrich): dispatch on source — client path skips Jina"
```

---

### Task 8: `buildThingObject` — write `source` + client fields to Firestore

**Files:**
- Modify: `/Users/rich/Code/saveit-backend/cloud-function-enrich/enrichment-core.js` (`buildThingObject`, lines 274-303)
- Modify: `/Users/rich/Code/saveit-backend/cloud-function-enrich/enrichment-core.test.js`

**Interfaces:**
- Consumes: `event.source`, `event.client` (Task 6).
- Produces: Firestore thing docs with `source`, `author`, `image`, `published_time`, `lang`, `fetch_status`.

- [ ] **Step 1: Write a failing test asserting `source` + client fields land on the thing**

In `enrichment-core.test.js`, there are likely existing `buildThingObject` tests (it's a pure function). Add:

```js
describe('buildThingObject source + client fields', () => {
  it('writes source and client enrichment fields', () => {
    const event = {
      user_id: 'u1', user_email: 'u@e.com', url: 'https://example.com',
      event_id: 'e1', event_timestamp: '2026-07-01T00:00:00Z', project_id: null,
      source: 'client',
      client: { byline: 'Jane Doe', image: 'https://e.com/img.png', published_time: '2026-07-01', lang: 'en' }
    };
    const basicMetadata = { title: 'T', readingTime: 5, description: 'D' };
    const aiData = { classifications: [], aiSummaryBrief: null, aiSummaryExtended: null };

    const thing = buildThingObject(event, basicMetadata, aiData, 'example.com', null, '2026-07-01T00:00:00Z');

    expect(thing.source).toBe('client');
    expect(thing.author).toBe('Jane Doe');
    expect(thing.image).toBe('https://e.com/img.png');
    expect(thing.published_time).toBe('2026-07-01');
    expect(thing.lang).toBe('en');
  });

  it('defaults source to null when event has no source (defensive)', () => {
    const event = { user_id: 'u1', url: 'https://example.com', event_id: 'e1', event_timestamp: '2026-07-01T00:00:00Z' };
    const basicMetadata = { title: 'T', readingTime: null, description: null };
    const aiData = { classifications: null, aiSummaryBrief: null, aiSummaryExtended: null };

    const thing = buildThingObject(event, basicMetadata, aiData, 'example.com', null, '2026-07-01T00:00:00Z');
    expect(thing.source).toBeNull();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
cd /Users/rich/Code/saveit-backend/cloud-function-enrich && pnpm test -- enrichment-core.test.js 2>&1 | tail -20
```

- [ ] **Step 3: Add the fields to `buildThingObject`**

In `/Users/rich/Code/saveit-backend/cloud-function-enrich/enrichment-core.js`, the `buildThingObject` return object (lines 278-302) currently ends with:

```js
    classifications,
    ai_enriched_at: aiSummaryBrief ? bigquery.timestamp(startTimeISO) : null
  };
```

Add the new fields before the closing `};`:

```js
    classifications,
    ai_enriched_at: aiSummaryBrief ? bigquery.timestamp(startTimeISO) : null,
    source: event.source || null,
    author: event.client?.byline || null,
    image: event.client?.image || null,
    published_time: event.client?.published_time || null,
    lang: event.client?.lang || null
  };
```

- [ ] **Step 4: Run the tests to verify they pass**

```bash
cd /Users/rich/Code/saveit-backend/cloud-function-enrich && pnpm test -- enrichment-core.test.js 2>&1 | tail -20
```

- [ ] **Step 5: Commit**

```bash
cd /Users/rich/Code/saveit-backend && git add cloud-function-enrich/enrichment-core.js cloud-function-enrich/enrichment-core.test.js && git commit -m "feat(enrich): write source + client fields to Firestore thing"
```

---

### Task 9: Jina login-wall detection in `isBlockedContent`

Extends detection so login/auth-wall content is treated as a failed fetch, not real content. Only affects the `source: 'jina'` path.

**Files:**
- Modify: `/Users/rich/Code/saveit-backend/cloud-function-enrich/jina-reader.js` (`isBlockedContent`, lines 24-64)
- Modify: `/Users/rich/Code/saveit-backend/cloud-function-enrich/jina-reader.test.js`

**Interfaces:**
- Consumes: Jina content string.
- Produces: `{ blocked: true, reason }` for login-wall content. The existing `ContentBlockedError` path in `fetchOrRetrieveContent` already handles the consequence (basic mode). Task 10 wires `metrics.fetch_status`.

- [ ] **Step 1: Read the existing `isBlockedContent`**

```bash
sed -n '24,64p' /Users/rich/Code/saveit-backend/cloud-function-enrich/jina-reader.js
```

- [ ] **Step 2: Write failing tests for login-wall detection**

In `jina-reader.test.js`, find the existing `isBlockedContent` tests and add:

```js
describe('isBlockedContent login-wall detection', () => {
  it('detects a Google sign-in page', () => {
    const content = '<h1>Sign in</h1><p>Use your Google Account to continue to Example.</p>';
    const result = isBlockedContent(content);
    expect(result.blocked).toBe(true);
    expect(result.reason).toMatch(/sign.?in|login|auth/i);
  });

  it('detects a generic "please sign in to continue" page', () => {
    const result = isBlockedContent('Please sign in to continue to the application.');
    expect(result.blocked).toBe(true);
  });

  it('detects a 401/403 status hint in content', () => {
    const result = isBlockedContent('401 Unauthorized. Please log in.');
    expect(result.blocked).toBe(true);
  });

  it('does NOT flag a legitimate article that mentions signing in', () => {
    // A real article about authentication should not be flagged just for
    // containing "sign in". This is the false-positive guard.
    const content = 'Single sign-on (SSO) lets users sign in once. This article covers SAML and OAuth. ' +
      'It is a long article about identity federation, with many paragraphs of technical detail. '.repeat(20);
    const result = isBlockedContent(content);
    // A long, content-rich article is not a login wall.
    expect(result.blocked).toBe(false);
  });
});
```

> **The false-positive guard test is critical.** Login-wall detection must not flag legitimate articles about authentication. The heuristic must combine a login phrase with a signal that the page is *short* or *dominated* by the login prompt — not just contain the phrase.

- [ ] **Step 3: Run the tests to verify they fail**

```bash
cd /Users/rich/Code/saveit-backend/cloud-function-enrich && pnpm test -- jina-reader.test.js 2>&1 | tail -20
```

- [ ] **Step 4: Implement login-wall detection**

In `/Users/rich/Code/saveit-backend/cloud-function-enrich/jina-reader.js`, modify `isBlockedContent`. After the existing explicit block patterns check (line 43) and **before** the Cloudflare check (line 46), add a login-wall section. The key design: combine a login phrase with a "page is dominated by login UI" signal (short content, or login phrase near the very start).

```js
function isBlockedContent(content) {
  if (!content || typeof content !== 'string') {
    return { blocked: false };
  }

  // Explicit block message patterns (very specific phrases)
  const explicitBlockPatterns = [
    { pattern: /your request has been blocked/i, reason: 'Request blocked message' },
    { pattern: /access denied/i, reason: 'Access denied message' },
    { pattern: /403 forbidden/i, reason: '403 Forbidden error' },
    { pattern: /you are not authorized/i, reason: 'Not authorized message' },
    { pattern: /this page is blocked/i, reason: 'Page blocked message' }
  ];

  // Check explicit block patterns first
  for (const { pattern, reason } of explicitBlockPatterns) {
    if (pattern.test(content)) {
      return { blocked: true, reason };
    }
  }

  // Login-wall detection. A login page is characterized by a login phrase
  // COMBINED with a signal that the page is dominated by the login UI — either
  // very short content, or the login phrase appears in the first 300 chars
  // (i.e. it's the page's primary content, not a mention in a long article).
  // This avoids false positives on legitimate articles about authentication.
  const loginPhrase = /\b(sign in|log in|login|please sign in to continue)\b/i;
  const authStatusHint = /\b(401|403)\b.*(unauthorized|forbidden)|\b(unauthorized|forbidden)\b.*\b(401|403)\b/i;
  const isShort = content.length < 600;
  const loginInHead = loginPhrase.test(content.slice(0, 300));

  if ((loginPhrase.test(content) && isShort) || loginInHead || authStatusHint.test(content)) {
    // Guard against false positives: if the content is long and substantive,
    // it's an article that happens to mention login, not a login wall.
    if (content.length > 1500 && !loginInHead && !authStatusHint.test(content)) {
      // fall through — not a login wall
    } else {
      return { blocked: true, reason: 'Login/auth wall detected' };
    }
  }

  // Cloudflare challenge detection (must have BOTH keywords)
  const hasCloudflare = /cloudflare/i.test(content);
  const hasBrowserCheck = /checking your browser/i.test(content);
  if (hasCloudflare && hasBrowserCheck) {
    return { blocked: true, reason: 'Cloudflare browser check' };
  }

  // Very short content (<150 chars) with strong block indicators
  if (content.length < 150) {
    const hasBlockedPhrase = /\b(blocked|denied|forbidden)\s+(by|from|access)/i.test(content);
    const hasSecurityPhrase = /(security|firewall|waf)\s+(block|deny|prevent)/i.test(content);

    if (hasBlockedPhrase || hasSecurityPhrase) {
      return { blocked: true, reason: `Short content (${content.length} chars) with block phrase` };
    }
  }

  return { blocked: false };
}
```

- [ ] **Step 5: Run the tests to verify they pass**

```bash
cd /Users/rich/Code/saveit-backend/cloud-function-enrich && pnpm test -- jina-reader.test.js 2>&1 | tail -20
```

Expected: all pass, including the false-positive guard. If the false-positive guard fails, tune the thresholds (the `> 1500` length gate and the head-window size) until it passes.

- [ ] **Step 6: Commit**

```bash
cd /Users/rich/Code/saveit-backend && git add cloud-function-enrich/jina-reader.js cloud-function-enrich/jina-reader.test.js && git commit -m "feat(jina): detect login/auth walls so they are not stored as content"
```

---

### Task 10: Wire `fetch_status` on the Jina path

Records how content acquisition ended, so the failure is visible on the stored record. The client path already sets `metrics.fetch_status` (Task 7).

**Files:**
- Modify: `/Users/rich/Code/saveit-backend/cloud-function-enrich/enrichment-core.js` (`fetchOrRetrieveContent`, lines 26-92, and `buildThingObject` to persist `fetch_status`)
- Modify: `/Users/rich/Code/saveit-backend/cloud-function-enrich/enrichment-core.test.js`

**Interfaces:**
- Consumes: the `metrics` object threaded through `enrichEvent`.
- Produces: `metrics.fetch_status` set on both paths; persisted onto the Firestore thing.

- [ ] **Step 1: Write a failing test**

In `enrichment-core.test.js`:

```js
it('sets fetch_status=auth_wall when Jina hits a login wall', async () => {
  mockCheckDuplicateThing(false);
  mockJinaFetchPageContentThrows(ContentBlockedError);  // login wall → ContentBlockedError
  const capturedThing = mockWriteThingCapture();

  await enrichEvent({
    event_id: 'e4', user_id: 'u4', url: 'https://private-app.com',
    title: 'Private', source: 'jina', client: null,
    event_timestamp: '2026-07-01T00:00:00Z'
  });

  expect(capturedThing.fetch_status).toBe('auth_wall');
});
```

- [ ] **Step 2: Run to verify it fails**

```bash
cd /Users/rich/Code/saveit-backend/cloud-function-enrich && pnpm test -- enrichment-core.test.js 2>&1 | tail -20
```

- [ ] **Step 3: Set `fetch_status` in `fetchOrRetrieveContent`**

In `/Users/rich/Code/saveit-backend/cloud-function-enrich/enrichment-core.js`, `fetchOrRetrieveContent` (lines 26-92). The existing branches already set `metrics.fallback_to_basic` and `metrics.error`. Add `metrics.fetch_status` alongside:

- On successful content fetch (line 48 area, after `metrics.jina_fetch_success = true`):
  ```js
  metrics.fetch_status = 'ok';
  ```
- On `ContentBlockedError` caught (line 71-81) — distinguish login walls from generic blocks. The `ContentBlockedError` reason already carries the distinction (Task 9 sets `reason: 'Login/auth wall detected'`). Set:
  ```js
  metrics.fetch_status = fetchError.reason && /login|auth/i.test(fetchError.reason)
    ? 'auth_wall'
    : 'blocked';
  ```
- On "Jina returned no content" (line 62-69, `metrics.fallback_to_basic = true`):
  ```js
  metrics.fetch_status = 'blocked';
  ```

- [ ] **Step 4: Persist `fetch_status` in `buildThingObject`**

Add to the return object (after the fields from Task 8):

```js
    fetch_status: metrics ? (metrics.fetch_status || null) : null
```

> **Note:** `buildThingObject` currently does not receive `metrics`. You have two options: (a) pass `metrics` as a new arg to `buildThingObject`, or (b) set `fetch_status` on the thing after `buildThingObject` returns, in `enrichEvent`, where `metrics` is in scope. **Prefer (b)** — it avoids widening `buildThingObject`'s signature for a single field. In `enrichEvent`, after `const thing = buildThingObject(...)`, add `thing.fetch_status = metrics.fetch_status || null;` before `writeThingToFirestore(thing)`. Do this on BOTH the client and jina branches.

- [ ] **Step 5: Run the tests to verify they pass**

```bash
cd /Users/rich/Code/saveit-backend/cloud-function-enrich && pnpm test 2>&1 | tail -20
```

Expected: all pass.

- [ ] **Step 6: Commit**

```bash
cd /Users/rich/Code/saveit-backend && git add cloud-function-enrich/enrichment-core.js cloud-function-enrich/enrichment-core.test.js && git commit -m "feat(enrich): record fetch_status on both source paths"
```

---

### Deployment checkpoint (after Task 10)

**Before proceeding to the extension tasks:**

1. Run the migration script from Task 3 against the production BigQuery dataset:
   ```bash
   cd /Users/rich/Code/saveit-backend && ./scripts/migrate-save-events-source.sql
   ```
   (Run via `bq query` or the BigQuery console. Verify columns exist: `bq query --use_legacy_sql=false "SELECT source, client_payload FROM saveit.save_events LIMIT 1"`.)
2. Run the Firestore things backfill (Task 3b):
   ```bash
   cd /Users/rich/Code/saveit-backend && node scripts/backfill-things-source.js --dry-run
   # confirm the count, then:
   node scripts/backfill-things-source.js
   ```
3. Deploy the backend Cloud Functions:
   ```bash
   cd /Users/rich/Code/saveit-backend && ./scripts/deploy-function.sh
   ```
   (Confirm the exact deploy command against the backend's justfile/scripts — there is a `deploy-staging` and `deploy-prod` recipe.)
4. Verify a legacy save still works (old behavior, `source` normalized to `jina`).

**Do not start the extension tasks until the backend is deployed and the migration is run.** The extension will send `client_payload` that the backend must persist.

---

## Extension tasks (Tasks 11-13) — after backend is deployed

### Task 11: Add `@mozilla/readability` dependency + the `page-capture.js` pure module

**Files:**
- Modify: `/Users/rich/Code/saveit-extension/package.json`
- Create: `/Users/rich/Code/saveit-extension/src/page-capture.js`
- Create: `/Users/rich/Code/saveit-extension/tests/unit/page-capture.test.js`

**Interfaces:**
- Consumes: a `document` object (DOM). No browser/chrome APIs.
- Produces: `buildClientObject(document)` → returns the `client` object (or a failure-shape object with `content: null`, `capture_method: 'none'`).

- [ ] **Step 1: Install the dependency**

```bash
cd /Users/rich/Code/saveit-extension && npm install @mozilla/readability
```

Confirm it lands in `dependencies` (not devDependencies) in `package.json` — it ships in the bundle.

- [ ] **Step 2: Write the failing unit test**

Create `/Users/rich/Code/saveit-extension/tests/unit/page-capture.test.js`:

```js
import { describe, expect, it } from 'vitest';
import { buildClientObject, truncateContent } from '../../src/page-capture.js';

describe('truncateContent', () => {
  it('truncates to 12000 chars head-weighted', () => {
    const long = 'a'.repeat(20000);
    const result = truncateContent(long);
    expect(result.length).toBe(12000);
  });

  it('leaves short content unchanged', () => {
    expect(truncateContent('short')).toBe('short');
  });

  it('handles null input', () => {
    expect(truncateContent(null)).toBeNull();
  });
});

describe('buildClientObject', () => {
  it('extracts title, content, and meta from a document', () => {
    // happy-dom provides a DOM in the test environment
    document.head.innerHTML = `
      <meta property="og:title" content="OG Title">
      <meta property="og:description" content="OG desc">
      <meta property="og:image" content="https://example.com/img.png">
      <meta property="article:published_time" content="2026-07-01T10:00:00Z">
      <meta name="author" content="Jane Doe">
    `;
    document.body.innerHTML = `
      <article>
        <h1>OG Title</h1>
        <p>This is the article body. It has enough text for Readability to detect it as the main content. ${'x'.repeat(200)}</p>
      </article>
    `;

    const client = buildClientObject(document);

    expect(client.capture_method).toBe('readability');
    expect(client.title).toBeTruthy();
    expect(client.content).toBeTruthy();
    expect(client.content.length).toBeLessThanOrEqual(12000);
    expect(client.image).toBe('https://example.com/img.png');
    expect(client.byline).toBe('Jane Doe');
    expect(client.published_time).toBe('2026-07-01T10:00:00Z');
    expect(client.captured_at).toBeTruthy();
  });

  it('returns capture_method none and null content when Readability finds nothing', () => {
    // A page with no article content (e.g. a bare app shell)
    document.head.innerHTML = '';
    document.body.innerHTML = '<div id="app"></div>';

    const client = buildClientObject(document);

    expect(client.capture_method).toBe('none');
    expect(client.content).toBeNull();
  });
});
```

- [ ] **Step 3: Run the test to verify it fails**

```bash
cd /Users/rich/Code/saveit-extension && npx vitest run tests/unit/page-capture.test.js
```

Expected: fails (`page-capture.js` doesn't exist yet).

- [ ] **Step 4: Implement `src/page-capture.js`**

Create `/Users/rich/Code/saveit-extension/src/page-capture.js`:

```js
// page-capture.js — pure DOM extraction for save-time capture.
// Receives a `document`, returns a structured `client` object. No browser APIs,
// so it is fully unit-testable with happy-dom. The injector (page-capture-injector.js)
// is responsible for running this inside chrome.scripting.executeScript.

import { Readability } from '@mozilla/readability';

const MAX_CONTENT_CHARS = 12000;

// Read a meta tag by name or property, returning its content attribute.
function readMeta(document, selector) {
  const el = document.querySelector(selector);
  return el?.getAttribute('content')?.trim() || null;
}

// Truncate content head-weighted. Intros carry the most summary signal, so we
// keep the beginning. (Research: head ~70-80% beats head-only for long pages,
// but for a 12k cap most articles fit entirely.)
export function truncateContent(content) {
  if (!content) {
    return null;
  }
  const trimmed = content.trim();
  if (trimmed.length <= MAX_CONTENT_CHARS) {
    return trimmed;
  }
  return trimmed.slice(0, MAX_CONTENT_CHARS);
}

// Build the client object from a document. Returns capture_method 'readability'
// when Readability finds an article, or 'none' when it returns null (dashboards,
// app shells). No heuristic fallback — 'none' is the honest signal.
export function buildClientObject(document) {
  // Meta extraction (independent of Readability — works even on non-articles)
  const metaTitle = readMeta(document, 'meta[property="og:title"]')
    || readMeta(document, 'meta[name="twitter:title"]');
  const metaDescription = readMeta(document, 'meta[property="og:description"]')
    || readMeta(document, 'meta[name="twitter:description"]')
    || readMeta(document, 'meta[name="description"]');
  const image = readMeta(document, 'meta[property="og:image"]')
    || readMeta(document, 'meta[name="twitter:image"]')
    || readMeta(document, 'meta[name="twitter:image:src"]');
  const byline = readMeta(document, 'meta[name="author"]')
    || readMeta(document, 'meta[property="article:author"]');
  const siteName = readMeta(document, 'meta[property="og:site_name"]');
  const publishedTime = readMeta(document, 'meta[property="article:published_time"]')
    || readMeta(document, 'meta[name="date"]');
  const lang = readMeta(document, 'meta[http-equiv="content-language"]')
    || document.documentElement?.getAttribute('lang');

  // Readability mutates the document it's passed — always operate on a clone.
  const clone = document.cloneNode(true);
  let article = null;
  try {
    article = new Readability(clone).parse();
  } catch {
    article = null;
  }

  if (!article || !article.textContent || !article.textContent.trim()) {
    // No article found. capture_method 'none' is the visible signal — no
    // heuristic masking. Meta fields are still returned where available.
    return {
      title: metaTitle || document.title || '',
      description: metaDescription || '',
      content: null,
      excerpt: null,
      byline,
      site_name: siteName,
      image,
      published_time: publishedTime,
      lang,
      captured_at: new Date().toISOString(),
      capture_method: 'none'
    };
  }

  return {
    title: metaTitle || article.title || document.title || '',
    description: metaDescription || article.excerpt || '',
    content: truncateContent(article.textContent),
    excerpt: article.excerpt || null,
    byline: byline || article.byline || null,
    site_name: siteName || article.siteName || null,
    image,
    published_time: publishedTime,
    lang: lang || article.lang || null,
    captured_at: new Date().toISOString(),
    capture_method: 'readability'
  };
}
```

- [ ] **Step 5: Run the test to verify it passes**

```bash
cd /Users/rich/Code/saveit-extension && npx vitest run tests/unit/page-capture.test.js
```

Expected: pass. If the "Readability finds nothing" test fails because happy-dom's bare `<div id="app">` still yields text, adjust the test fixture to be truly empty.

- [ ] **Step 6: Verify the bundle builds (esbuild resolves the new import)**

```bash
cd /Users/rich/Code/saveit-extension && node scripts/bundle.js
```

Expected: builds successfully (the import is reachable once the injector or background imports it — but even standalone, `node scripts/bundle.js` should succeed).

- [ ] **Step 7: Commit**

```bash
cd /Users/rich/Code/saveit-extension && git add package.json package-lock.json src/page-capture.js tests/unit/page-capture.test.js && git commit -m "feat(capture): add Readability-based page-capture pure module"
```

---

### Task 12: The `scripting` injector

**Files:**
- Create: `/Users/rich/Code/saveit-extension/src/page-capture-injector.js`
- Modify: `/Users/rich/Code/saveit-extension/manifest.json` (add `"scripting"` permission)
- Create: `/Users/rich/Code/saveit-extension/tests/unit/page-capture-injector.test.js`

**Interfaces:**
- Consumes: `chrome.scripting` (via the `browserApi` global pattern used in `background.js`), `buildClientObject` from `page-capture.js`.
- Produces: `capturePageContent(tabId)` → returns the `client` object, or a failure-shape object on any error.

- [ ] **Step 1: Add the `scripting` permission to the manifest**

In `/Users/rich/Code/saveit-extension/manifest.json`, the `permissions` array (lines 17-24) is currently:

```json
  "permissions": [
    "activeTab",
    "alarms",
    "bookmarks",
    "notifications",
    "storage",
    "identity"
  ],
```

Add `"scripting"` (alphabetical order, after "notifications"):

```json
  "permissions": [
    "activeTab",
    "alarms",
    "bookmarks",
    "notifications",
    "scripting",
    "storage",
    "identity"
  ],
```

- [ ] **Step 2: Write the failing test**

Create `/Users/rich/Code/saveit-extension/tests/unit/page-capture-injector.test.js`:

```js
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

describe('capturePageContent', () => {
  let originalBrowser;

  beforeEach(() => {
    originalBrowser = globalThis.browser;
  });

  afterEach(() => {
    if (originalBrowser === undefined) {
      delete globalThis.browser;
    } else {
      globalThis.browser = originalBrowser;
    }
  });

  it('returns the client object when executeScript succeeds', async () => {
    const capturedClient = {
      title: 'Real Title', content: 'body', capture_method: 'readability'
    };
    globalThis.browser = {
      scripting: {
        executeScript: vi.fn(async () => [{ result: capturedClient }])
      }
    };

    const { capturePageContent } = await import('../../src/page-capture-injector.js');
    const result = await capturePageContent(42);

    expect(globalThis.browser.scripting.executeScript).toHaveBeenCalledWith(expect.objectContaining({
      target: { tabId: 42 },
      world: 'ISOLATED'
    }));
    expect(result).toEqual(capturedClient);
  });

  it('returns a failure-shape object when executeScript throws (chrome:// page)', async () => {
    globalThis.browser = {
      scripting: {
        executeScript: vi.fn(async () => {
          throw new Error('Cannot access contents of the page');
        })
      }
    };

    const { capturePageContent } = await import('../../src/page-capture-injector.js');
    const result = await capturePageContent(99);

    expect(result.capture_method).toBe('none');
    expect(result.content).toBeNull();
  });
});
```

- [ ] **Step 3: Run the test to verify it fails**

```bash
cd /Users/rich/Code/saveit-extension && npx vitest run tests/unit/page-capture-injector.test.js
```

- [ ] **Step 4: Implement the injector**

Create `/Users/rich/Code/saveit-extension/src/page-capture-injector.js`:

```js
// page-capture-injector.js — the only module that touches chrome.scripting.
// Injects buildClientObject (from page-capture.js) into the active tab and
// returns the client object. On any failure (chrome:// pages, crashed tabs,
// CSP blocking), returns a failure-shape object — never throws, so the save
// still proceeds with basic mode.

import { buildClientObject } from './page-capture.js';

const browserApi = globalThis.browser ?? globalThis.chrome;

// This function body is stringified and injected. It must be self-contained —
// esbuild bundles it into the call's `func`. It receives `buildClientObject`
// via the `args` parameter (executeScript supports passing args to `func`).
function injectedCapture(buildClientObjectFn) {
  return buildClientObjectFn(document);
}

export async function capturePageContent(tabId) {
  if (!browserApi?.scripting?.executeScript) {
    return failureShape('scripting API unavailable');
  }

  try {
    const results = await browserApi.scripting.executeScript({
      target: { tabId },
      world: 'ISOLATED',
      func: injectedCapture,
      args: [buildClientObject]
    });

    // executeScript returns [{ result, frameId }, ...]
    const result = results?.[0]?.result;
    if (result && typeof result === 'object') {
      return result;
    }
    return failureShape('no result from injection');
  } catch (error) {
    // chrome://, about:, PDF viewer, crashed tab, or CSP blocking injection.
    // These are expected — return the failure shape so the save proceeds.
    return failureShape(error?.message || 'injection failed');
  }
}

function failureShape(reason) {
  return {
    title: '',
    description: '',
    content: null,
    excerpt: null,
    byline: null,
    site_name: null,
    image: null,
    published_time: null,
    lang: null,
    captured_at: new Date().toISOString(),
    capture_method: 'none',
    capture_error: reason
  };
}
```

> **Important caveat for the implementer:** Passing `buildClientObject` as an `args` argument to `executeScript` may not work directly — `chrome.scripting.executeScript` with `func` serializes the function and its args, and complex function args may not survive serialization. **If this fails in manual testing, the fallback approach is to inline the `buildClientObject` logic directly into `injectedCapture`'s body** (so the injected function is fully self-contained and imports Readability via a dynamically-imported bundle URL, or via `files` injection). Test this early in manual verification (Task 13 Step 4). The cleanest robust pattern may be to use `files: [...]` pointing at a bundled capture script instead of `func`. Confirm during implementation.

- [ ] **Step 5: Run the test to verify it passes**

```bash
cd /Users/rich/Code/saveit-extension && npx vitest run tests/unit/page-capture-injector.test.js
```

- [ ] **Step 6: Validate the manifest**

```bash
cd /Users/rich/Code/saveit-extension && npx web-ext lint
```

Expected: 0 errors. The `"scripting"` permission should not produce a host-prompt warning (it's a quiet permission).

- [ ] **Step 7: Commit**

```bash
cd /Users/rich/Code/saveit-extension && git add src/page-capture-injector.js tests/unit/page-capture-injector.test.js manifest.json && git commit -m "feat(capture): add scripting injector + scripting permission"
```

---

### Task 13: Wire capture into `savePageFromTab`

**Files:**
- Modify: `/Users/rich/Code/saveit-extension/src/background.js` (`savePageFromTab`, lines 427-490; the `saveCurrentPage` handler lines 549-567)
- Create or extend: `/Users/rich/Code/saveit-extension/tests/unit/background-save-payload.test.js`

**Interfaces:**
- Consumes: `capturePageContent` from `page-capture-injector.js`.
- Produces: POSTs with `{ ...pageData, source: 'client', client }`.

- [ ] **Step 1: Write the failing test**

Create `/Users/rich/Code/saveit-extension/tests/unit/background-save-payload.test.js`. This test verifies that the save POST includes `source` and `client`. Since `savePageFromTab` is not exported, test it via the message handler or by extracting the payload-building into a testable helper. **Preferred: extract a pure `buildPageData(tab, { projectId, client })` helper** so the payload shape is unit-testable without mocking the whole background. If extraction is too invasive, test via the message handler with `fetch` mocked.

Helper-extraction test:

```js
import { describe, expect, it } from 'vitest';
import { buildPageData } from '../../src/background.js';

describe('buildPageData', () => {
  it('includes source=client and the client object', () => {
    const tab = { url: 'https://example.com', title: 'Tab' };
    const client = { title: 'Real', content: 'body', capture_method: 'readability' };
    const data = buildPageData(tab, { projectId: null, client });
    expect(data.source).toBe('client');
    expect(data.client).toEqual(client);
    expect(data.url).toBe('https://example.com');
    expect(data.title).toBe('Tab');
    expect(data.saved_at).toBeTruthy();
  });

  it('includes source=client even when capture failed (content null)', () => {
    const tab = { url: 'https://example.com', title: 'Tab' };
    const client = { title: '', content: null, capture_method: 'none' };
    const data = buildPageData(tab, { projectId: 'p1', client });
    expect(data.source).toBe('client');
    expect(data.client.content).toBeNull();
    expect(data.projectId).toBe('p1');
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
cd /Users/rich/Code/saveit-extension && npx vitest run tests/unit/background-save-payload.test.js
```

- [ ] **Step 3: Extract `buildPageData` and wire capture into `savePageFromTab`**

In `/Users/rich/Code/saveit-extension/src/background.js`:

Add the import at the top (after line 10):

```js
import { capturePageContent } from './page-capture-injector.js';
```

Add the `buildPageData` helper and export it (near `savePageFromTab`, before line 427):

```js
// Build the POST payload. Extracted so the payload shape is unit-testable
// without mocking the full save flow. source is always 'client' for single
// saves — the browser captured the page the user was viewing.
export function buildPageData(tab, { projectId = null, client }) {
  return {
    url: tab.url,
    title: tab.title,
    saved_at: new Date().toISOString(),
    ...(projectId ? { projectId } : {}),
    source: 'client',
    client
  };
}
```

Modify `savePageFromTab` (lines 427-490) to capture before building the payload. The current start:

```js
async function savePageFromTab(tab, { projectId = null } = {}) {
  const pageData = {
    url: tab.url,
    title: tab.title,
    saved_at: new Date().toISOString(),
    ...(projectId ? { projectId } : {})
  };
```

Becomes:

```js
async function savePageFromTab(tab, { projectId = null } = {}) {
  // Capture page content from the active tab before building the payload.
  // The user is logged in here, so this is the authoritative source for
  // title/description/content. On failure, capturePageContent returns a
  // failure-shape object — the save proceeds, enrichment is skipped.
  const client = await capturePageContent(tab.id);

  const pageData = buildPageData(tab, { projectId, client });
```

The rest of `savePageFromTab` (the POST, cache invalidation, bookmark mirror, badge, notification) is unchanged — `pageData` now carries `source` + `client`.

- [ ] **Step 4: Run the tests**

```bash
cd /Users/rich/Code/saveit-extension && npx vitest run
```

Expected: all pass, including the new `buildPageData` tests and the existing background tests.

- [ ] **Step 5: Build the bundle and run the full quality gate**

```bash
cd /Users/rich/Code/saveit-extension && just check
```

(`just check` runs tests, lint, validate manifest, build — per AGENTS.md.) Expected: all pass.

- [ ] **Step 6: Manual verification (load the extension and save a page)**

This is the critical end-to-end check that `executeScript` injection actually works with the `func` + `args` pattern. Load the extension:

```bash
cd /Users/rich/Code/saveit-extension && just run
```

Then:
1. Open a normal article page. Click save. Check the backend received `source: 'client'` and a populated `client` object (inspect BigQuery: `bq query "SELECT source, JSON_EXTRACT(client_payload, '$.capture_method') FROM saveit.save_events ORDER BY event_timestamp DESC LIMIT 1"`).
2. Open a Google Drive doc (logged in). Click save. Confirm the title is the real doc title, not "Sign in".
3. Open `chrome://settings`. Click save. Confirm the save succeeds with `capture_method: 'none'` (basic mode, no crash).

**If Step 6.1 fails** (injection doesn't return the client object), the `func` + `args` serialization caveat from Task 12 applies. Switch to a self-contained injected function or a `files:`-based injection. This is the highest-risk step in the whole plan — verify it before considering the extension work done.

- [ ] **Step 7: Commit**

```bash
cd /Users/rich/Code/saveit-extension && git add src/background.js tests/unit/background-save-payload.test.js && git commit -m "feat(save): capture page content at save time, send source=client"
```

---

## Final verification

After all tasks complete:

- [ ] **Backend**: `cd /Users/rich/Code/saveit-backend/cloud-function && pnpm test && cd ../cloud-function-enrich && pnpm test` — all pass.
- [ ] **Extension**: `cd /Users/rich/Code/saveit-extension && just check` — all pass.
- [ ] **End-to-end**: a real auth-gated save produces a thing with the real title (Task 13 Step 6.2).
- [ ] **Legacy compat**: an old-extension save still works (normalized to `source: 'jina'`).
- [ ] **Bulk import**: still enriches via Jina (`source: 'jina'`); a login-wall URL goes to basic mode with `fetch_status: 'auth_wall'`.

## Non-goals (do not implement)

- Migration of existing pages to client-sourced content (follow-up).
- UI for the new fields (`image`, `author`, `published_time`) — stored now, consumed later.
- A heuristic extractor — gated on telemetry.
- Client-side AI.
- Removing the Jina path entirely (bulk import still needs it).

## Sources

- Spec: `docs/superpowers/specs/2026-07-09-client-side-page-capture-design.md`
- Mozilla Readability: https://github.com/mozilla/readability
- chrome.scripting: https://developer.chrome.com/docs/extensions/reference/api/scripting
