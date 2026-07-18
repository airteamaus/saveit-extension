# Slack `/links` Command — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship a Slack slash command `/links <query>` that returns two ephemeral buckets — the caller's own matching saves, and org-mates' non-private matching saves — by adding a `private` flag and `company_domain` Vector Search restrict namespace, backfilling existing data, and deploying a new `saveit-slack` Cloud Function.

**Architecture:** A new 7th Cloud Function (`saveit-slack`) verifies the Slack signature, acks within 3s, then async-resolves the Slack user's email → Firebase uid → company_domain, runs two Vector Search queries (bucket 1 restricts on `user_id`, bucket 2 restricts on `company_domain` + `private:'false'`), hydrates from Firestore, and POSTs the formatted result to Slack's `response_url`. The Vector Search index gains two additive restrict namespaces (`company_domain`, `private`); existing per-user isolation is untouched. A one-shot backfill populates both new tokens on every existing datapoint. The extension gains a per-page "Hide from organisation" toggle.

**Tech Stack:** Cloud Functions Gen 2 (nodejs20), `@google-cloud/firestore`, `@google-cloud/aiplatform` (MatchServiceClient), `firebase-admin` (getUserByEmail), Slack signing-secret HMAC (node:crypto), ES modules (extension), Jest (both repos).

## Global Constraints

- **Two repos:** extension at `/Users/rich/Code/saveit-extension`, backend at `/Users/rich/Code/saveit-backend`. Use absolute paths when crossing repos. Bash state does not persist between tool calls — chain commands when changing directories.
- **GCP project:** `bookmarking-477502`, region `us-central1`, Firestore database `(default)`. Vector Search index endpoint `1829724115.us-central1-903859773555.vdb.vertexai.goog`, endpoint id `2765836892833316864`, deployed index id `saveit_classification_v2`, index `projects/bookmarking-477502/locations/us-central1/indexes/6284639139576938496` (from `scripts/deploy-enrich-function.sh:59-62`).
- **Backend conventions:** Cloud Functions Gen 2, nodejs20, `@google-cloud/functions-framework` ^4. `shared/` and `contracts/` are copied into each function dir at deploy time (deploy scripts do this); source imports them via `getSharedPath(...)`. Tests are co-located `*.test.js` files, Jest, pure functions tested without a live Firestore/Vector Search.
- **Extension conventions:** ES modules, native ESM loaded via `<script type="module">`. Manifest V3. Tests in `tests/unit/` (Jest). `just test` runs them.
- **Slack request verification:** HMAC-SHA256 of `v0:timestamp:body` with the signing secret; reject if timestamp older than 5 minutes (300s). Algorithm per https://api.slack.com/authentication/verifying-requests-from-slack — do not short-circuit on timestamp-only.
- **Slack response:** must ack within 3s with HTTP 200; real result POSTed to `payload.response_url` (30-minute validity). All responses `response_type: 'ephemeral'`.
- **Vector Search restrict semantics:** a datapoint matches iff every query restrict's allow-list overlaps the datapoint's tokens for that namespace. Bucket 2 queries `private:['false']` — missing token = excluded (under-inclusion is the safe failure direction).
- **Wire field names (exact):** Firestore `things` doc fields `private` (bool, default false), `company_domain` (string|null, derived from email). Vector Search namespaces `company_domain`, `private` (token values `'true'`/`'false'`).
- **No user impersonation:** `saveit-slack` runs as the default Compute service account with Firestore + Vector Search read access only. No session-token minting.
- **Local quality bar (extension):** `just check` passes before wrapping up.
- **Local quality bar (backend):** `cd /Users/rich/Code/saveit-backend/cloud-function && pnpm test` passes (and `cloud-function-enrich` if touched).

---

## File Structure

### Backend (`saveit-backend`)

| File | Responsibility | Create/Modify |
|---|---|---|
| `shared/company-domain.js` | Pure helper `deriveCompanyDomain(email)` → lowercased email domain or null. New canonical home; replaces the duplicated logic in `cloud-function/firestore-projects.js`. | Create |
| `shared/company-domain.test.js` | Unit tests for `deriveCompanyDomain`. | Create |
| `shared/build-classification-restricts.js` | Pure helpers `buildClassificationRestricts` + `buildClassificationDatapoint` — single source of truth for the Vector Search restricts object shape. Consumed by enrich (Task 6), PATCH handler (Task 7), and backfill (Task 9). | Create |
| `shared/build-classification-restricts.test.js` | Unit tests for both helpers. | Create |
| `shared/vector-search-client.js` | Extend `queryClassifications` to accept `companyDomain` + `includePrivate` (bucket-2 path) in addition to `userId` (bucket-1 path). | Modify (`:53-106`) |
| `shared/vector-search-client.test.js` | Tests for both restrict paths. | Create (if absent) or extend |
| `cloud-function/firestore-projects.js` | Replace local `getUserCompanyDomain` with import from `shared/company-domain.js` (keep a thin re-export for backwards compat). | Modify (`:9-15`) |
| `cloud-function/firestore-update.js` | Allow `private` and `company_domain` through `updateThingFields`. | Modify |
| `cloud-function/index.js` | `handlePatchPage` accepts `private`; on `private` change, re-upsert that thing's datapoints with the new token. | Modify (`:715-769`) |
| `cloud-function/firestore-patch-private.test.js` | Unit test for the new datapoint re-upsert step. | Create |
| `cloud-function-enrich/enrichment-core.js` | Both upsert sites (`:535-555`, `:615-635`) add `company_domain` + `private:'false'` to the restricts object. | Modify |
| `cloud-function-enrich/enrichment-core.test.js` | Assert new restricts in the upsert payload. | Extend |
| `contracts/firestore-things-schema.js` | Document `private` + `company_domain` in the example doc and validation. | Modify (`:286-321`) |
| `scripts/migrate-add-org-fields.js` | Phase A backfill: stream `things`, write `private:false` + `company_domain`. Idempotent. Modeled on `migrate-add-pinned-field.js`. | Create |
| `scripts/backfill-org-search-vectors.js` | Phase B backfill: stream `thing_classifications`, rebuild datapoints with new restricts, stream-upsert via `upsertClassificationVectors`. Idempotent, dry-run mode. | Create |
| `cloud-function-slack/index.js` | HTTP entry point `slackCommand(req, res)`. | Create |
| `cloud-function-slack/slack-signature.js` | Pure: `verifySlackSignature({body, timestamp, signature, signingSecret})` → bool. | Create |
| `cloud-function-slack/slack-signature.test.js` | HMAC verify tests (valid/invalid/stale/missing). | Create |
| `cloud-function-slack/slack-response.js` | Pure: `buildSearchResponseBlocks({query, bucket1, bucket2, companyDomain})` → Slack blocks array. Plus `buildAckBody(query)`, error-message builders. | Create |
| `cloud-function-slack/slack-response.test.js` | Block formatting tests (both buckets, empty bucket 2, both empty, attribution). | Create |
| `cloud-function-slack/slack-search.js` | Orchestrator: `runSlackSearch({slackUserId, query, responseUrl, deps})` — resolves email → uid → domain, runs both bucket queries, hydrates, POSTs to `responseUrl`. | Create |
| `cloud-function-slack/slack-search.test.js` | Tests with stubbed deps covering the full matrix + error paths. | Create |
| `cloud-function-slack/package.json` | Deps: `@google-cloud/functions-framework`, `@google-cloud/firestore`, `@google-cloud/aiplatform`, `firebase-admin`, Jest. Mirrors `cloud-function-enrich/package.json`. | Create |
| `scripts/deploy-slack-function.sh` | Deploys `saveit-slack`: gen2, `--trigger-http`, `--allow-unauthenticated`, secrets `SLACK_SIGNING_SECRET`, `SLACK_BOT_TOKEN`. Modeled on `deploy-enrich-function.sh`. | Create |

### Extension (`saveit-extension`)

| File | Responsibility | Create/Modify |
|---|---|---|
| `src/validators.js` | Add `private: z.boolean().optional().default(false)` to `PageSchema`. | Modify (`:35-76`) |
| `src/api-pages-page-actions.js` | `updatePage` already passes `updates` straight through — no change needed, but verify `private` is accepted. | Verify only |
| `src/newtab.js` | Add "Hide from organisation" toggle to the page card / edit affordance. | Modify |

---

## Phase 1: Backend foundations (shared helpers + schema)

### Task 1: `deriveCompanyDomain` shared helper

**Files:**
- Create: `/Users/rich/Code/saveit-backend/shared/company-domain.js`
- Test: `/Users/rich/Code/saveit-backend/shared/company-domain.test.js`

**Interfaces:**
- Produces: `deriveCompanyDomain(email: string | null | undefined): string | null` — lowercased substring after the last `@`, or null if no `@`.

- [ ] **Step 1: Write the failing test**

```js
// shared/company-domain.test.js
const { describe, it, expect } = require('@jest/globals');
const { deriveCompanyDomain } = require('./company-domain');

describe('deriveCompanyDomain', () => {
  it('lowercases the domain after @', () => {
    expect(deriveCompanyDomain('Jane@AirTeam.com.au')).toBe('airteam.com.au');
  });

  it('returns null when email has no @', () => {
    expect(deriveCompanyDomain('notanemail')).toBeNull();
  });

  it('returns null for null/undefined input', () => {
    expect(deriveCompanyDomain(null)).toBeNull();
    expect(deriveCompanyDomain(undefined)).toBeNull();
  });

  it('handles emails with multiple @ by taking the last segment', () => {
    // Defensive; real emails never have multiple @, but be explicit.
    expect(deriveCompanyDomain('a@b@example.com')).toBe('example.com');
  });

  it('returns empty-string domain for trailing @', () => {
    expect(deriveCompanyDomain('user@')).toBe('');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd /Users/rich/Code/saveit-backend/shared && npx jest company-domain.test.js`
Expected: FAIL — `Cannot find module './company-domain'`.

- [ ] **Step 3: Write minimal implementation**

```js
// shared/company-domain.js
/**
 * Derive the company domain from a user email.
 *
 * The email domain is the only org-like boundary in SaveIt today — it backs
 * both company-project visibility and (newly) org-scoped search. Centralising
 * the derivation here means the main API, the enrich worker, the backfills,
 * and the Slack function all agree on the rule.
 *
 * @param {string|null|undefined} email
 * @returns {string|null} lowercased domain after the last '@', or null
 */
function deriveCompanyDomain(email) {
  if (typeof email !== 'string' || !email.includes('@')) return null;
  return email.slice(email.lastIndexOf('@') + 1).toLowerCase();
}

module.exports = { deriveCompanyDomain };
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd /Users/rich/Code/saveit-backend/shared && npx jest company-domain.test.js`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
cd /Users/rich/Code/saveit-backend
git add shared/company-domain.js shared/company-domain.test.js
git commit -m "feat(shared): add deriveCompanyDomain helper"
```

---

### Task 2: Re-point `getUserCompanyDomain` at the shared helper

**Files:**
- Modify: `/Users/rich/Code/saveit-backend/cloud-function/firestore-projects.js:9-15`

**Interfaces:**
- Consumes: `deriveCompanyDomain` from Task 1.
- Produces: unchanged `getUserCompanyDomain(email)` signature (thin re-export so existing callers don't break).

- [ ] **Step 1: Read the current implementation**

Run: `cd /Users/rich/Code/saveit-backend && sed -n '1,20p' cloud-function/firestore-projects.js`
Confirm the existing `getUserCompanyDomain` shape so the re-export matches.

- [ ] **Step 2: Replace the local implementation with a re-export**

In `cloud-function/firestore-projects.js`, replace the body of `getUserCompanyDomain` (the existing 6-line impl at lines 9-15) with a delegation:

```js
const { deriveCompanyDomain } = require('../shared/company-domain');

// Preserved for backwards compat with existing callers in this function dir.
// New code should import deriveCompanyDomain from shared/ directly.
function getUserCompanyDomain(email) {
  return deriveCompanyDomain(email);
}
```

Leave all other code in the file untouched. Do not change the function's call sites.

- [ ] **Step 3: Run the existing project tests to verify nothing broke**

Run: `cd /Users/rich/Code/saveit-backend/cloud-function && pnpm test`
Expected: PASS — all existing tests green (behaviour unchanged).

- [ ] **Step 4: Commit**

```bash
cd /Users/rich/Code/saveit-backend
git add cloud-function/firestore-projects.js
git commit -m "refactor(projects): delegate getUserCompanyDomain to shared helper"
```

---

### Task 3: Document `private` + `company_domain` in the things schema contract

**Files:**
- Modify: `/Users/rich/Code/saveit-backend/contracts/firestore-things-schema.js:286-321`

**Interfaces:** none (documentation + validation only).

- [ ] **Step 1: Add the two fields to `EXAMPLE_DOCUMENT`**

In `contracts/firestore-things-schema.js`, inside `EXAMPLE_DOCUMENT` (lines 286-321), add `private` and `company_domain` near the existing `deleted`/`pinned` fields:

```js
  deleted: false,
  deleted_at: null,
  pinned: false,
  // User opt-out from org-wide search (Slack /links bucket 2). Default false
  // = visible to org-mates. Toggled via the extension card affordance.
  private: false,
  // Lowercased email domain. Denormalised from user_email so the privacy-toggle
  // write path can re-upsert Vector Search datapoints without re-deriving.
  // Null only for legacy docs written before this field existed.
  company_domain: 'example.com',
  user_notes: 'Great resource for learning about neural networks',
```

- [ ] **Step 2: Add the fields to `validateThing` if it enumerates fields**

Inspect `validateThing` (around line 328 in the same file). If it whitelists allowed fields, add `private` (boolean) and `company_domain` (string|null). If it only checks presence/types of existing fields, add two new optional checks:

```js
  if (thing.private !== undefined && typeof thing.private !== 'boolean') {
    errors.push('private must be a boolean');
  }
  if (thing.company_domain !== undefined && thing.company_domain !== null && typeof thing.company_domain !== 'string') {
    errors.push('company_domain must be a string or null');
  }
```

- [ ] **Step 3: Run the contract validation script**

Run: `cd /Users/rich/Code/saveit-backend && ./contracts/validate-schemas.sh`
Expected: PASS (no schema errors).

- [ ] **Step 4: Commit**

```bash
cd /Users/rich/Code/saveit-backend
git add contracts/firestore-things-schema.js
git commit -m "docs(contracts): add private + company_domain to things schema"
```

---

## Phase 2: Vector Search client (additive restrict namespaces)

### Task 4: Extend `queryClassifications` with bucket-2 path

**Files:**
- Modify: `/Users/rich/Code/saveit-backend/shared/vector-search-client.js:53-106`
- Test: `/Users/rich/Code/saveit-backend/shared/vector-search-client.test.js` (create if absent)

**Interfaces:**
- Produces: extended signature
  ```ts
  queryClassifications({
    queryVector: number[],
    userId?: string,            // bucket 1 — required if companyDomain absent
    companyDomain?: string,     // bucket 2 — required if userId absent
    includePrivate?: boolean,   // bucket 2 only; default false → restrict to private:'false'
    limit?: number
  })
  ```
  Exactly one of `userId` / `companyDomain` must be supplied.

- [ ] **Step 1: Write the failing test**

Create `shared/vector-search-client.test.js`. The MatchServiceClient is mocked so no live call is made.

```js
// shared/vector-search-client.test.js
const { describe, it, expect, beforeEach } = require('@jest/globals');
const { _resetClientForTesting } = require('./vector-search-client');

// We test the restrict-building by monkey-patching the module's getMatchClient
// to return a fake client that records the request and returns canned neighbors.
describe('queryClassifications restricts', () => {
  let capturedRequest = null;
  let mod;

  beforeEach(() => {
    jest.resetModules();
    _resetClientForTesting();
    mod = require('./vector-search-client');
    // Patch the lazy getMatchClient by setting the module-level singleton.
    // We do this by calling queryClassifications with config set.
    process.env.VECTOR_SEARCH_ENDPOINT = 'test.vdb.vertexai.goog';
  });

  it('bucket 1 path: restricts on user_id + deleted only', async () => {
    const fakeClient = {
      indexEndpointPath: () => 'projects/p/locations/l/indexEndpoints/e',
      findNeighbors: async (req) => {
        capturedRequest = req;
        return [{ nearestNeighbors: [{ neighbors: [] }] }];
      }
    };
    // Inject the fake client via the module's internal getter.
    // vector-search-client.js calls getMatchClient() lazily; we force it by
    // overriding config check then re-implementing the client getter through
    // the module's exported internals is not possible. Instead we re-require
    // with a stub for @google-cloud/aiplatform.
    jest.doMock('@google-cloud/aiplatform', () => ({
      MatchServiceClient: function () { return fakeClient; }
    }));
    _resetClientForTesting();
    mod = require('./vector-search-client');

    await mod.queryClassifications({ queryVector: [0.1, 0.2], userId: 'u123', limit: 5 });

    const restricts = capturedRequest.queries[0].datapoint.restricts;
    const namespaces = restricts.map(r => r.namespace).sort();
    expect(namespaces).toEqual(['deleted', 'user_id']);
    const userIdRestrict = restricts.find(r => r.namespace === 'user_id');
    expect(userIdRestrict.allowList).toEqual(['u123']);
  });

  it('bucket 2 path: restricts on company_domain + deleted + private', async () => {
    const fakeClient = {
      indexEndpointPath: () => 'p/l/e',
      findNeighbors: async (req) => { capturedRequest = req; return [{ nearestNeighbors: [{ neighbors: [] }] }]; }
    };
    jest.doMock('@google-cloud/aiplatform', () => ({
      MatchServiceClient: function () { return fakeClient; }
    }));
    _resetClientForTesting();
    mod = require('./vector-search-client');

    await mod.queryClassifications({
      queryVector: [0.1, 0.2],
      companyDomain: 'airteam.com.au',
      includePrivate: false,
      limit: 5
    });

    const restricts = capturedRequest.queries[0].datapoint.restricts;
    const namespaces = restricts.map(r => r.namespace).sort();
    expect(namespaces).toEqual(['company_domain', 'deleted', 'private']);
    expect(restricts.find(r => r.namespace === 'company_domain').allowList).toEqual(['airteam.com.au']);
    expect(restricts.find(r => r.namespace === 'private').allowList).toEqual(['false']);
  });

  it('bucket 2 with includePrivate=true omits the private restrict', async () => {
    const fakeClient = {
      indexEndpointPath: () => 'p/l/e',
      findNeighbors: async (req) => { capturedRequest = req; return [{ nearestNeighbors: [{ neighbors: [] }] }]; }
    };
    jest.doMock('@google-cloud/aiplatform', () => ({
      MatchServiceClient: function () { return fakeClient; }
    }));
    _resetClientForTesting();
    mod = require('./vector-search-client');

    await mod.queryClassifications({
      queryVector: [0.1, 0.2],
      companyDomain: 'airteam.com.au',
      includePrivate: true,
      limit: 5
    });

    const namespaces = capturedRequest.queries[0].datapoint.restricts.map(r => r.namespace);
    expect(namespaces).not.toContain('private');
  });

  it('throws when neither userId nor companyDomain supplied', async () => {
    jest.doMock('@google-cloud/aiplatform', () => ({
      MatchServiceClient: function () { return { indexEndpointPath: () => 'x', findNeighbors: async () => [{}] }; }
    }));
    _resetClientForTesting();
    mod = require('./vector-search-client');
    await expect(mod.queryClassifications({ queryVector: [0.1] })).rejects.toThrow(/userId.*companyDomain|required/i);
  });

  it('throws when both userId and companyDomain supplied', async () => {
    jest.doMock('@google-cloud/aiplatform', () => ({
      MatchServiceClient: function () { return { indexEndpointPath: () => 'x', findNeighbors: async () => [{}] }; }
    }));
    _resetClientForTesting();
    mod = require('./vector-search-client');
    await expect(mod.queryClassifications({
      queryVector: [0.1], userId: 'u', companyDomain: 'd'
    })).rejects.toThrow(/mutually exclusive|only one/i);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd /Users/rich/Code/saveit-backend/shared && npx jest vector-search-client.test.js`
Expected: FAIL — bucket-2 test fails because the current implementation always restricts on `user_id` only.

- [ ] **Step 3: Extend `queryClassifications`**

In `shared/vector-search-client.js`, replace the existing `queryClassifications` function (lines 53-106) with the extended version. The validation, restrict building, and existing return shape all change:

```js
/**
 * Query the classification index for nearest neighbors of a vector.
 *
 * Two mutually exclusive scoping modes:
 *   - Bucket 1 (own pages): pass `userId`. Restricts on user_id + deleted.
 *     Unchanged behaviour — preserves the per-user isolation invariant.
 *   - Bucket 2 (org pages): pass `companyDomain`. Restricts on company_domain
 *     + deleted + (unless includePrivate) private:'false'. Used by the Slack
 *     /links org-mates bucket.
 *
 * @param {Object} params
 * @param {number[]} params.queryVector - 768-dim embedding to search with
 * @param {string} [params.userId] - Firebase UID (bucket 1). Required if companyDomain absent.
 * @param {string} [params.companyDomain] - lowercased email domain (bucket 2). Required if userId absent.
 * @param {boolean} [params.includePrivate=false] - bucket 2 only; if false, restricts to private:'false'.
 * @param {number} [params.limit] - Max neighbors (default from config)
 */
async function queryClassifications({ queryVector, userId, companyDomain, includePrivate = false, limit }) {
  if (!queryVector) {
    throw new Error('queryVector is required for vector search');
  }
  if (!userId && !companyDomain) {
    throw new Error('queryClassifications requires either userId or companyDomain');
  }
  if (userId && companyDomain) {
    throw new Error('queryClassifications: userId and companyDomain are mutually exclusive');
  }

  const client = getMatchClient();

  // Restricts live on the query datapoint itself. A stored datapoint matches
  // only if, for every query restrict, its allow_list for that namespace
  // overlaps the query's allow_list.
  const restricts = [{ namespace: 'deleted', allowList: ['false'] }];
  if (userId) {
    // Bucket 1 — per-user isolation, unchanged.
    restricts.push({ namespace: 'user_id', allowList: [String(userId)] });
  } else {
    // Bucket 2 — org-scoped. private:'false' excludes opt-out pages; under-
    // inclusion on missing tokens is the safe failure direction.
    restricts.push({ namespace: 'company_domain', allowList: [String(companyDomain)] });
    if (!includePrivate) {
      restricts.push({ namespace: 'private', allowList: ['false'] });
    }
  }

  const request = {
    indexEndpoint: client.indexEndpointPath(
      config.vectorSearch.project_id,
      config.vectorSearch.location,
      config.vectorSearch.endpoint_id
    ),
    deployedIndexId: config.vectorSearch.deployed_index_id,
    queries: [{
      datapoint: {
        featureVector: queryVector,
        restricts
      },
      neighborCount: limit || config.vectorSearch.default_limit
    }],
    returnFullDatapoint: true
  };

  const [response] = await client.findNeighbors(request);

  const neighbors = response.nearestNeighbors?.[0]?.neighbors || [];

  return neighbors.map(n => {
    const neighborId = n.datapoint?.datapointId;
    const restricts = {};
    for (const r of (n.datapoint?.restricts || [])) {
      restricts[r.namespace] = r.allowList?.[0];
    }
    const distance = n.distance ?? 0;
    return {
      datapoint_id: neighborId,
      distance,
      similarity: distanceToSimilarity(distance),
      thing_id: restricts.thing_id,
      classification_label: restricts.classification_label,
      classification_type: restricts.classification_type
    };
  });
}
```

Note: the `restricts` variable name is reused (outer for the request, inner for parsing the neighbor); rename the inner to `neighborRestricts` for clarity if the linter complains about shadowing.

- [ ] **Step 4: Run test to verify it passes**

Run: `cd /Users/rich/Code/saveit-backend/shared && npx jest vector-search-client.test.js`
Expected: PASS (5 tests).

- [ ] **Step 5: Verify existing callers still compile and their tests pass**

Run: `cd /Users/rich/Code/saveit-backend/cloud-function && pnpm test && cd ../cloud-function-enrich && pnpm test`
Expected: PASS — `searchByContentFirestore`, `getSimilarThings`, `searchByTagFirestore` pass `userId`, so they take the unchanged bucket-1 path.

- [ ] **Step 6: Commit**

```bash
cd /Users/rich/Code/saveit-backend
git add shared/vector-search-client.js shared/vector-search-client.test.js
git commit -m "feat(vector-search): add bucket-2 company_domain + private restrict path"
```

---

## Phase 3: Enrichment writer (forward writes)

### Task 5: Shared classification-restricts helper

**Rationale:** Tasks 5 (enrich), 7 (PATCH handler), and 9 (backfill) all build the same Vector Search restricts object for a classification datapoint. Without a helper, the same object literal is triplicated; the reviewer rubric treats verbatim duplication of a logic block as an Important defect. Extract once, consume everywhere.

**Files:**
- Create: `/Users/rich/Code/saveit-backend/shared/build-classification-restricts.js`
- Test: `/Users/rich/Code/saveit-backend/shared/build-classification-restricts.test.js`

**Interfaces:**
- Consumes: `deriveCompanyDomain` from Task 1.
- Produces:
  ```ts
  buildClassificationRestricts({
    userId: string,
    userEmail: string|null|undefined,
    thingId: string,
    classification: { type: string, label: string },
    isPrivate?: boolean   // default false
  }) → {
    user_id: string,
    deleted: 'false',
    private: 'true'|'false',
    company_domain: string|null,
    thing_id: string,
    classification_label: string,
    classification_type: string
  }
  ```
  Also exports a sibling `buildClassificationDatapoint(...)` that wraps restricts + embedding + id into the full upsert payload shape — the three call sites all build `{id, embedding, restricts}` so this removes the last duplication too.

- [ ] **Step 1: Write the failing test**

```js
// shared/build-classification-restricts.test.js
const { describe, it, expect } = require('@jest/globals');
const {
  buildClassificationRestricts,
  buildClassificationDatapoint
} = require('./build-classification-restricts');

describe('buildClassificationRestricts', () => {
  const classification = { type: 'topic', label: 'Krill' };

  it('builds the full restricts object with private:false default', () => {
    const r = buildClassificationRestricts({
      userId: 'u1',
      userEmail: 'jane@airteam.com.au',
      thingId: 'thing_abc',
      classification
    });
    expect(r).toEqual({
      user_id: 'u1',
      deleted: 'false',
      private: 'false',
      company_domain: 'airteam.com.au',
      thing_id: 'thing_abc',
      classification_label: 'Krill',
      classification_type: 'topic'
    });
  });

  it('private:true sets the token to "true"', () => {
    const r = buildClassificationRestricts({
      userId: 'u1', userEmail: 'a@b.com', thingId: 't', classification, isPrivate: true
    });
    expect(r.private).toBe('true');
  });

  it('null userEmail yields null company_domain (no throw)', () => {
    const r = buildClassificationRestricts({
      userId: 'u1', userEmail: null, thingId: 't', classification
    });
    expect(r.company_domain).toBeNull();
  });
});

describe('buildClassificationDatapoint', () => {
  it('composes id, embedding, and restricts', () => {
    const dp = buildClassificationDatapoint({
      userId: 'u1',
      userEmail: 'jane@airteam.com.au',
      thingId: 'thing_abc',
      classification: { type: 'topic', label: 'Krill', embedding: [0.1, 0.2] },
      index: 0
    });
    expect(dp.id).toBe('thing_abc_topic_0');
    expect(dp.embedding).toEqual([0.1, 0.2]);
    expect(dp.restricts.user_id).toBe('u1');
    expect(dp.restricts.company_domain).toBe('airteam.com.au');
    expect(dp.restricts.classification_label).toBe('Krill');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd /Users/rich/Code/saveit-backend/shared && npx jest build-classification-restricts.test.js`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

```js
// shared/build-classification-restricts.js
const { deriveCompanyDomain } = require('./company-domain');

/**
 * Build the Vector Search restricts object for a single classification
 * datapoint.
 *
 * Single source of truth for the restrict shape — consumed by:
 *   - the enrich worker (forward writes)
 *   - the PATCH / private-toggle write path (re-upsert on privacy change)
 *   - the one-shot org-search backfill
 *
 * `deleted` is always 'false' here: a soft-deleted thing's datapoints are
 * stale by design (filtered out at query time via the deleted:'false' query
 * restrict); we never upsert a deleted:'true' datapoint.
 */
function buildClassificationRestricts({
  userId,
  userEmail,
  thingId,
  classification,
  isPrivate = false
}) {
  return {
    user_id: String(userId),
    deleted: 'false',
    private: isPrivate ? 'true' : 'false',
    company_domain: deriveCompanyDomain(userEmail),
    thing_id: String(thingId),
    classification_label: classification.label,
    classification_type: classification.type
  };
}

/**
 * Build the full datapoint payload ({id, embedding, restricts}) for upsert.
 * `index` is the classification's position in the thing's classifications
 * array — datapoint ids are `{thingId}_{type}_{index}` to match the existing
 * id convention in enrichment-core.js.
 */
function buildClassificationDatapoint({
  userId,
  userEmail,
  thingId,
  classification,
  index,
  isPrivate = false
}) {
  return {
    id: `${thingId}_${classification.type}_${index}`,
    embedding: classification.embedding,
    restricts: buildClassificationRestricts({
      userId, userEmail, thingId, classification, isPrivate
    })
  };
}

module.exports = { buildClassificationRestricts, buildClassificationDatapoint };
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd /Users/rich/Code/saveit-backend/shared && npx jest build-classification-restricts.test.js`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
cd /Users/rich/Code/saveit-backend
git add shared/build-classification-restricts.js shared/build-classification-restricts.test.js
git commit -m "feat(shared): buildClassificationRestricts + Datapoint helpers"
```

---

### Task 6: Add `company_domain` + `private` to enrich upsert restricts

There are **two** identical upsert sites in `enrichment-core.js` (source='client' at `:535-555`, source='jina' at `:615-635`). Both build the same restricts object; both must be updated to consume the shared helper from Task 5 — eliminating what would otherwise be duplicated logic.

**Files:**
- Modify: `/Users/rich/Code/saveit-backend/cloud-function-enrich/enrichment-core.js:535-555` and `:615-635`
- Test: `/Users/rich/Code/saveit-backend/cloud-function-enrich/enrichment-core.test.js`

**Interfaces:**
- Consumes: `buildClassificationDatapoint` from Task 5.
- Produces: every new datapoint upserted by the enrich worker carries `company_domain` and `private:'false'` restricts (via the helper).

- [ ] **Step 1: Read the existing test file to find the upsert-mocking pattern**

Run: `cd /Users/rich/Code/saveit-backend/cloud-function-enrich && grep -n "upsertClassificationVectors\|jest.doMock\|jest.mock\|getSharedPath" enrichment-core.test.js`
Identify how the existing tests mock `shared/vector-search-client.js` (likely via `jest.doMock` with `getSharedPath('vector-search-client.js')` resolution, since the production code requires it lazily inside the function body). Note the exact mock setup and the fixture/event-builder used to invoke `enrichPage` (or whatever the function-under-test is called in this file).

- [ ] **Step 2: Write the failing test**

Append to `cloud-function-enrich/enrichment-core.test.js` using the mocking pattern found in Step 1. The assertion contract is fixed; the setup mirrors the local idiom:

```js
// Append to enrichment-core.test.js. Use the SAME imports, fixture builder,
// and getSharedPath-based mock pattern the existing tests in this file use.
// The contract below is what matters; the setup is dictated by what Step 1
// revealed about how this file mocks the vector client.
describe('vector search upsert restricts (org-search tokens)', () => {
  it('includes company_domain + private:false on every datapoint', async () => {
    // 1. Mock upsertClassificationVectors using the pattern from Step 1.
    //    Capture its argument so we can assert on the restricts.
    const captured = jest.fn().mockResolvedValue(undefined);
    // e.g. jest.doMock(getSharedPath('vector-search-client.js'), () => ({
    //   upsertClassificationVectors: captured
    // }));
    // (Adapt the jest.doMock target to match exactly what the existing tests use.)

    // 2. Invoke the enrichment function under test with a fixture event
    //    whose user_email is 'Jane@AirTeam.com.au' and at least one
    //    classification with an embedding. Use the existing fixture builder
    //    in this file (Step 1 will have identified it).
    await runEnrichment({ /* mirror the existing happy-path fixture */ });

    // 3. Assert the captured payload.
    expect(captured).toHaveBeenCalledTimes(1);
    const datapoints = captured.mock.calls[0][0];
    expect(datapoints.length).toBeGreaterThan(0);
    for (const dp of datapoints) {
      expect(dp.restricts.company_domain).toBe('airteam.com.au');
      expect(dp.restricts.private).toBe('false');
      // Unchanged restricts preserved:
      expect(dp.restricts.user_id).toBe('u1');
      expect(dp.restricts.deleted).toBe('false');
    }
  });
});
```

The implementer's job in this step: (a) wire the `jest.doMock` target to match the existing pattern, (b) drive the enrichment with the same fixture builder the surrounding tests use, populated with `user_id: 'u1'`, `user_email: 'Jane@AirTeam.com.au'`, and one classification with an embedding. The four assertions per datapoint are the fixed contract.

- [ ] **Step 3: Run test to verify it fails**

Run: `cd /Users/rich/Code/saveit-backend/cloud-function-enrich && pnpm test`
Expected: FAIL — `company_domain` undefined in the restricts.

- [ ] **Step 4: Update both upsert sites to consume the helper**

In `cloud-function-enrich/enrichment-core.js`, add a require for the helper at the top of the file alongside the existing shared requires:

```js
const { buildClassificationDatapoint } = require(getSharedPath('build-classification-restricts.js'));
```

Then at **both** upsert sites (`:535-555` and `:615-635`), replace the inline `.map()` that builds `{id, embedding, restricts: {...}}` with a call to the helper. The existing block at each site:

```js
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
```

becomes:

```js
        await upsertClassificationVectors(
          thing.classifications.map((c, i) => buildClassificationDatapoint({
            userId: thing.user_id,
            userEmail: thing.user_email,
            thingId: thing.id,
            classification: c,
            index: i
            // isPrivate defaults to false — enrich always writes public datapoints
          }))
        );
```

Both sites are byte-identical; update both to call the helper. This removes the duplication and guarantees the three call sites (enrich, PATCH, backfill) produce the same restrict shape.

- [ ] **Step 5: Run test to verify it passes**

Run: `cd /Users/rich/Code/saveit-backend/cloud-function-enrich && pnpm test`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
cd /Users/rich/Code/saveit-backend
git add cloud-function-enrich/enrichment-core.js cloud-function-enrich/enrichment-core.test.js
git commit -m "feat(enrich): add company_domain + private restricts to vector upserts"
```

---

## Phase 4: Privacy toggle write path (PATCH handler)

### Task 7: Accept `private` in PATCH and re-upsert datapoints

**Files:**
- Modify: `/Users/rich/Code/saveit-backend/cloud-function/index.js:715-769`
- Modify: `/Users/rich/Code/saveit-backend/cloud-function/firestore-update.js` (allow `private`)
- Test: `/Users/rich/Code/saveit-backend/cloud-function/firestore-patch-private.test.js`

**Interfaces:**
- Consumes: `buildClassificationDatapoint` (Task 5), `upsertClassificationVectors` (existing), the Firestore `thing_classifications` collection (existing).
- Produces: `PATCH /` with `{id, private: boolean}` updates the `things.private` field and re-upserts that thing's `thing_classifications` datapoints with the new `private` token.

- [ ] **Step 1: Inspect `firestore-update.js` to see how it whitelists fields**

Run: `cd /Users/rich/Code/saveit-backend && grep -n "private\|pinned\|updateThingFields\|ALLOWED\|whitelist" cloud-function/firestore-update.js`
Determine whether `updateThingFields` whitelists allowed keys or passes them through. Record the exact mechanism for the next step.

- [ ] **Step 2: Allow `private` through `updateThingFields`**

In `cloud-function/firestore-update.js`, add `private` to whatever whitelist/allow-list mechanism Step 1 revealed. If it's an explicit `if (key in ALLOWED)` check, add `'private'` to the `ALLOWED` array. If it passes through the `updates` object directly to `docRef.update`, no change is needed here. Do not add `company_domain` — that field is derived, never user-editable.

- [ ] **Step 3: Write the failing test for the re-upsert helper**

Create `cloud-function/firestore-patch-private.test.js`. This tests the thin wrapper that maps the PATCH inputs into helper calls.

```js
// cloud-function/firestore-patch-private.test.js
const { describe, it, expect } = require('@jest/globals');
const { buildPrivateToggleDatapoints } = require('./firestore-patch-private');

describe('buildPrivateToggleDatapoints', () => {
  const classifications = [
    { type: 'topic', label: 'X', embedding: [0.1, 0.2] },
    { type: 'domain', label: 'Y', embedding: [0.3, 0.4] }
  ];

  it('rebuilds datapoints with private=true reflected in the token', () => {
    const datapoints = buildPrivateToggleDatapoints({
      thingId: 'thing_abc',
      userId: 'u1',
      userEmail: 'jane@airteam.com.au',
      classifications,
      isPrivate: true
    });

    expect(datapoints).toHaveLength(2);
    datapoints.forEach((dp, i) => {
      expect(dp.id).toBe(`thing_abc_${classifications[i].type}_${i}`);
      expect(dp.embedding).toEqual(classifications[i].embedding);
      expect(dp.restricts.user_id).toBe('u1');
      expect(dp.restricts.deleted).toBe('false');
      expect(dp.restricts.private).toBe('true');
      expect(dp.restricts.company_domain).toBe('airteam.com.au');
      expect(dp.restricts.thing_id).toBe('thing_abc');
      expect(dp.restricts.classification_label).toBe(classifications[i].label);
      expect(dp.restricts.classification_type).toBe(classifications[i].type);
    });
  });

  it('returns [] when classifications is empty', () => {
    expect(buildPrivateToggleDatapoints({
      thingId: 'x', userId: 'u', userEmail: 'a@b.com', classifications: [], isPrivate: false
    })).toEqual([]);
  });
});
```

- [ ] **Step 4: Run test to verify it fails**

Run: `cd /Users/rich/Code/saveit-backend/cloud-function && npx jest firestore-patch-private.test.js`
Expected: FAIL — module not found.

- [ ] **Step 5: Create the thin wrapper helper**

Create `cloud-function/firestore-patch-private.js`. This is intentionally thin — it delegates restricts building to the shared helper (Task 5) so the PATCH path cannot drift from enrich/backfill:

```js
const { buildClassificationDatapoint } = require('../shared/build-classification-restricts');

/**
 * Rebuild the Vector Search datapoint payload for a thing's classifications
 * when its `private` flag is toggled. Delegates to the shared helper so the
 * PATCH path produces the same restrict shape as enrich and the backfill.
 *
 * Pure: produces the payload only. The caller is responsible for calling
 * upsertClassificationVectors(datapoints) and for non-fatal error wrapping.
 *
 * @param {Object} params
 * @param {string} params.thingId
 * @param {string} params.userId
 * @param {string} params.userEmail
 * @param {Array<{type:string,label:string,embedding:number[]}>} params.classifications
 * @param {boolean} params.isPrivate
 * @returns {Array<{id:string,embedding:number[],restricts:Object}>}
 */
function buildPrivateToggleDatapoints({ thingId, userId, userEmail, classifications, isPrivate }) {
  return (classifications || []).map((c, i) => buildClassificationDatapoint({
    userId,
    userEmail,
    thingId,
    classification: c,
    index: i,
    isPrivate
  }));
}

module.exports = { buildPrivateToggleDatapoints };
```

- [ ] **Step 6: Run test to verify it passes**

Run: `cd /Users/rich/Code/saveit-backend/cloud-function && npx jest firestore-patch-private.test.js`
Expected: PASS (2 tests).

- [ ] **Step 7: Wire the helper into `handlePatchPage`**

In `cloud-function/index.js`, modify `handlePatchPage` (lines 715-769):

1. Add `private` to the destructured body (line 717-724):
   ```js
   const {
     id,
     user_notes,
     manual_tags,
     title,
     description,
     ai_summary_brief,
     private
   } = req.body;
   ```

2. Add `private` to the `updates` object after the existing field checks (after line 747):
   ```js
   if (private !== undefined) {
     if (typeof private !== 'boolean') {
       sendErrorResponse(res, 400, 'private must be boolean', { code: 'INVALID_PRIVATE' });
       return;
     }
     updates.private = private;
   }
   ```

3. After the successful `updateThingFields` call (line 751), if `private` was in the patch, re-upsert the datapoints. Insert before `res.status(200).json(result);`:
   ```js
   if (private !== undefined) {
     try {
       const { getThingClassifications } = require('./firestore-queries');
       const { buildPrivateToggleDatapoints } = require('./firestore-patch-private');
       const { upsertClassificationVectors } = require('../shared/vector-search-client');
       const classifications = await getThingClassifications(id);
       if (classifications.length) {
         const datapoints = buildPrivateToggleDatapoints({
           thingId: id,
           userId: user.user_id,
           userEmail: user.email,
           classifications,
           isPrivate: private
         });
         await upsertClassificationVectors(datapoints);
       }
     } catch (error) {
       // Non-fatal: a stale index entry means bucket-2 search shows the old
       // private state until next enrichment. Log and continue.
       logger.warn('Vector Search re-upsert on private toggle failed (non-fatal)', {
         thing_id: id, error: error.message
       });
     }
   }
   ```

   **Note:** if `getThingClassifications` does not already exist in `firestore-queries.js`, the implementer must add a thin reader: `async function getThingClassifications(thingId) { const snap = await firestore.collection('thing_classifications').doc(thingId).get(); return snap.exists ? snap.data().classifications || [] : []; }` — verify against the actual `thing_classifications` doc shape first by reading `cloud-function/firestore-search.js` where the collection is queried.

- [ ] **Step 8: Run the cloud-function test suite**

Run: `cd /Users/rich/Code/saveit-backend/cloud-function && pnpm test`
Expected: PASS — all existing tests plus the new `firestore-patch-private.test.js`.

- [ ] **Step 9: Commit**

```bash
cd /Users/rich/Code/saveit-backend
git add cloud-function/index.js cloud-function/firestore-update.js cloud-function/firestore-patch-private.js cloud-function/firestore-patch-private.test.js
git commit -m "feat(api): PATCH private flag re-upserts vector datapoints"
```

---

## Phase 5: One-shot backfills

### Task 8: Phase A backfill — add `private` + `company_domain` to existing `things` docs

**Files:**
- Create: `/Users/rich/Code/saveit-backend/scripts/migrate-add-org-fields.js`

**Interfaces:** none (run-once script, modelled on `migrate-add-pinned-field.js`).

- [ ] **Step 1: Write the script**

Create `scripts/migrate-add-org-fields.js`. Modeled line-for-line on `migrate-add-pinned-field.js` (which the implementer should read first), but writing two fields and skipping docs that already have both:

```js
/**
 * Migration: Add private + company_domain fields to existing things.
 *
 * PROBLEM: Slack /links bucket 2 needs these fields on every doc. Existing
 * docs predate them.
 *
 * SOLUTION: Backfill all things with private:false + company_domain derived
 * from user_email. Idempotent.
 *
 * Usage: cd cloud-function && node ../scripts/migrate-add-org-fields.js
 */

const admin = require('firebase-admin');
const path = require('path');

const configPath = path.join(__dirname, '..', 'shared', 'config.js');
const { PROJECT_ID } = require(configPath);
const { deriveCompanyDomain } = require(path.join(__dirname, '..', 'shared', 'company-domain.js'));

if (!admin.apps.length) {
  admin.initializeApp({ projectId: PROJECT_ID });
}
const firestore = admin.firestore();

async function migrateOrgFields() {
  console.log('Starting migration: Add private + company_domain to existing things');

  let totalProcessed = 0;
  let totalUpdated = 0;
  let totalSkipped = 0;

  const snapshot = await firestore.collection('things').get();
  console.log(`Found ${snapshot.size} total documents`);

  const batchSize = 500;
  let batch = firestore.batch();
  let batchCount = 0;

  for (const doc of snapshot.docs) {
    totalProcessed++;
    const data = doc.data();

    const hasPrivate = Object.prototype.hasOwnProperty.call(data, 'private');
    const hasDomain = Object.prototype.hasOwnProperty.call(data, 'company_domain');
    if (hasPrivate && hasDomain) {
      totalSkipped++;
      if (totalProcessed % 100 === 0) {
        console.log(`Progress: ${totalProcessed}/${snapshot.size} (${totalUpdated} updated, ${totalSkipped} skipped)`);
      }
      continue;
    }

    const updates = {};
    if (!hasPrivate) updates.private = false;
    if (!hasDomain) updates.company_domain = deriveCompanyDomain(data.user_email);

    batch.update(doc.ref, updates);
    batchCount++;
    totalUpdated++;

    if (batchCount >= batchSize) {
      console.log(`Committing batch of ${batchCount} updates...`);
      await batch.commit();
      batch = firestore.batch();
      batchCount = 0;
    }

    if (totalProcessed % 100 === 0) {
      console.log(`Progress: ${totalProcessed}/${snapshot.size} (${totalUpdated} updated, ${totalSkipped} skipped)`);
    }
  }

  if (batchCount > 0) {
    console.log(`Committing final batch of ${batchCount} updates...`);
    await batch.commit();
  }

  console.log('\n✅ Migration complete!');
  console.log(`Total processed: ${totalProcessed}`);
  console.log(`Total updated: ${totalUpdated}`);
  console.log(`Total skipped (already had both fields): ${totalSkipped}`);
}

migrateOrgFields()
  .then(() => { console.log('Exiting...'); process.exit(0); })
  .catch((error) => { console.error('Fatal error:', error); process.exit(1); });
```

- [ ] **Step 2: Verify it parses**

Run: `cd /Users/rich/Code/saveit-backend && node --check scripts/migrate-add-org-fields.js`
Expected: no output (success).

- [ ] **Step 3: Commit (the script is run later in the deploy phase, not now)**

```bash
cd /Users/rich/Code/saveit-backend
git add scripts/migrate-add-org-fields.js
git commit -m "feat(scripts): backfill private + company_domain on things docs"
```

---

### Task 9: Phase B backfill — re-upsert Vector Search datapoints with new restricts

**Files:**
- Create: `/Users/rich/Code/saveit-backend/scripts/backfill-org-search-vectors.js`

**Interfaces:**
- Consumes: `buildClassificationDatapoint` from Task 5, `upsertClassificationVectors` from `shared/vector-search-client.js`.

- [ ] **Step 1: Read the existing vector export script for the Firestore read pattern**

Run: `cd /Users/rich/Code/saveit-backend && sed -n '1,60p' scripts/export-vectors-to-index.js`
Confirm the shape of a `thing_classifications` doc and how embeddings are stored. The new script reads the same collection.

- [ ] **Step 2: Write the backfill script**

Create `scripts/backfill-org-search-vectors.js`. It reads `thing_classifications`, rebuilds the datapoints via the shared helper from Task 5, and stream-upserts in batches. Dry-run mode prints counts and a sample without writing.

```js
#!/usr/bin/env node
/**
 * Backfill: re-upsert every Vector Search datapoint with company_domain +
 * private restrict tokens, so Slack /links bucket 2 has full coverage on
 * day one.
 *
 * Reads thing_classifications docs, looks up the parent thing's user_email
 * (for company_domain), and stream-upserts in batches of 100.
 *
 * Idempotent: upserts overwrite by datapoint id. Safe to re-run.
 *
 * Usage:
 *   DRY_RUN=1 node scripts/backfill-org-search-vectors.js   # count + sample only
 *   node scripts/backfill-org-search-vectors.js             # actually upsert
 */

const admin = require('firebase-admin');
const path = require('path');

const configPath = path.join(__dirname, '..', 'shared', 'config.js');
const { PROJECT_ID } = require(configPath);
const { buildClassificationDatapoint } = require(path.join(__dirname, '..', 'shared', 'build-classification-restricts.js'));
const { upsertClassificationVectors } = require(path.join(__dirname, '..', 'shared', 'vector-search-client.js'));

const DRY_RUN = !!process.env.DRY_RUN;
const BATCH_SIZE = 100;

if (!admin.apps.length) {
  admin.initializeApp({ projectId: PROJECT_ID });
}
const firestore = admin.firestore();

async function backfill() {
  console.log(`Backfilling Vector Search org-search tokens (DRY_RUN=${DRY_RUN})`);

  // Build a lookup of thing_id → { user_id, user_email } so we can derive
  // company_domain without a per-classification Firestore read.
  console.log('Loading things index...');
  const thingsSnap = await firestore.collection('things').get();
  const thingsById = new Map();
  for (const doc of thingsSnap.docs) {
    const d = doc.data();
    thingsById.set(doc.id, { user_id: d.user_id, user_email: d.user_email });
  }
  console.log(`Loaded ${thingsById.size} things`);

  const classSnap = await firestore.collection('thing_classifications').get();
  console.log(`Found ${classSnap.size} thing_classifications docs`);

  let totalDatapoints = 0;
  let totalSkipped = 0;
  let pending = [];

  const flush = async () => {
    if (pending.length === 0) return;
    if (DRY_RUN) {
      console.log(`[DRY_RUN] would upsert ${pending.length} datapoints. Sample:`, JSON.stringify(pending[0]).slice(0, 300));
    } else {
      await upsertClassificationVectors(pending);
      console.log(`Upserted batch of ${pending.length}`);
    }
    totalDatapoints += pending.length;
    pending = [];
  };

  for (const doc of classSnap.docs) {
    const data = doc.data();
    const thingId = data.thing_id || doc.id;
    const thing = thingsById.get(thingId);
    if (!thing || !thing.user_email) {
      totalSkipped++;
      continue;
    }

    // Each thing_classifications doc carries the per-classification embedding.
    // Re-read the field layout from export-vectors-to-index.js if this doesn't
    // match — the script's first step is to confirm the actual doc shape.
    const entries = Array.isArray(data.classifications) ? data.classifications : [];
    entries.forEach((c, i) => {
      if (!c.embedding || !Array.isArray(c.embedding)) return;
      // Single source of truth for the restrict shape — same helper enrich
      // and the PATCH handler use. isPrivate defaults to false (existing docs
      // were saved before the private flag existed; day-one-flip decision).
      pending.push(buildClassificationDatapoint({
        userId: thing.user_id,
        userEmail: thing.user_email,
        thingId,
        classification: c,
        index: i
      }));
    });

    if (pending.length >= BATCH_SIZE) {
      await flush();
    }
  }
  await flush();

  console.log(`\n✅ Backfill complete!`);
  console.log(`Total datapoints ${DRY_RUN ? 'that would be ' : ''}upserted: ${totalDatapoints}`);
  console.log(`Skipped (missing thing or email): ${totalSkipped}`);
}

backfill()
  .then(() => { console.log('Exiting...'); process.exit(0); })
  .catch((err) => { console.error('Fatal error:', err); process.exit(1); });
```

**Note on doc shape:** the implementer MUST verify the `thing_classifications` doc shape (`data.classifications` array vs flat fields) by reading the existing `scripts/export-vectors-to-index.js` and `cloud-function/firestore-search.js` before finalising the field paths above. The helper call is fixed; the read paths may need adjusting to match the actual schema.

- [ ] **Step 3: Verify it parses**

Run: `cd /Users/rich/Code/saveit-backend && node --check scripts/backfill-org-search-vectors.js`
Expected: no output (success).

- [ ] **Step 4: Commit**

```bash
cd /Users/rich/Code/saveit-backend
git add scripts/backfill-org-search-vectors.js
git commit -m "feat(scripts): backfill org-search tokens on vector index"
```

---

## Phase 6: `saveit-slack` Cloud Function

### Task 10: Slack signature verification

**Files:**
- Create: `/Users/rich/Code/saveit-backend/cloud-function-slack/slack-signature.js`
- Test: `/Users/rich/Code/saveit-backend/cloud-function-slack/slack-signature.test.js`

**Interfaces:**
- Produces:
  - `verifySlackSignature({body, timestamp, signature, signingSecret}) → boolean`
  - `isFreshTimestamp(timestampSeconds, now=Date.now()) → boolean` (reject >5 min old)

- [ ] **Step 1: Write the failing test**

```js
// cloud-function-slack/slack-signature.test.js
const { describe, it, expect } = require('@jest/globals');
const crypto = require('crypto');
const { verifySlackSignature, isFreshTimestamp } = require('./slack-signature');

const SECRET = '8f742231b10e8888abcd99yyyzzz3880';

function sign(timestamp, body, secret) {
  const base = `v0:${timestamp}:${body}`;
  return 'v0=' + crypto.createHmac('sha256', secret).update(base).digest('hex');
}

describe('verifySlackSignature', () => {
  const body = 'token=xyz&team=T&user_id=U1&text=hello';
  const timestamp = Math.floor(Date.now() / 1000).toString();

  it('accepts a valid signature', () => {
    const signature = sign(timestamp, body, SECRET);
    expect(verifySlackSignature({ body, timestamp, signature, signingSecret: SECRET })).toBe(true);
  });

  it('rejects a tampered body', () => {
    const signature = sign(timestamp, body, SECRET);
    expect(verifySlackSignature({ body: body + 'tampered', timestamp, signature, signingSecret: SECRET })).toBe(false);
  });

  it('rejects the wrong secret', () => {
    const signature = sign(timestamp, body, 'wrong-secret');
    expect(verifySlackSignature({ body, timestamp, signature, signingSecret: SECRET })).toBe(false);
  });

  it('rejects a signature without the v0= prefix', () => {
    const signature = sign(timestamp, body, SECRET).slice(3); // strip v0=
    expect(verifySlackSignature({ body, timestamp, signature, signingSecret: SECRET })).toBe(false);
  });
});

describe('isFreshTimestamp', () => {
  const now = Date.parse('2026-07-17T12:00:00Z');

  it('accepts a timestamp 100 seconds ago', () => {
    const ts = Math.floor((now - 100_000) / 1000).toString();
    expect(isFreshTimestamp(ts, now)).toBe(true);
  });

  it('rejects a timestamp 10 minutes ago', () => {
    const ts = Math.floor((now - 600_000) / 1000).toString();
    expect(isFreshTimestamp(ts, now)).toBe(false);
  });

  it('rejects a far-future timestamp (clock skew defence)', () => {
    const ts = Math.floor((now + 600_000) / 1000).toString();
    expect(isFreshTimestamp(ts, now)).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd /Users/rich/Code/saveit-backend/cloud-function-slack && npx jest slack-signature.test.js`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

```js
// cloud-function-slack/slack-signature.js
const crypto = require('crypto');

const FRESHNESS_WINDOW_SECONDS = 300; // 5 minutes, per Slack guidance

/**
 * Verify an incoming Slack request signature.
 *
 * Algorithm: https://api.slack.dev/authentication/verifying-requests-from-slack
 * base = `v0:${timestamp}:${body}`; signature = `v0=` + HMAC-SHA256(secret, base) hex.
 *
 * Use timingSafeEqual to avoid leaking secret info via timing side-channel.
 */
function verifySlackSignature({ body, timestamp, signature, signingSecret }) {
  if (!signature || !signature.startsWith('v0=')) return false;
  const base = `v0:${timestamp}:${body}`;
  const expected = 'v0=' + crypto.createHmac('sha256', signingSecret).update(base).digest('hex');
  if (signature.length !== expected.length) return false;
  return crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected));
}

/**
 * Reject requests older (or far newer) than the freshness window — replay defence.
 * @param {string} timestampSeconds  unix seconds from X-Slack-Request-Timestamp
 * @param {number} [now]             ms since epoch; default Date.now()
 */
function isFreshTimestamp(timestampSeconds, now = Date.now()) {
  const ts = Number(timestampSeconds);
  if (!Number.isFinite(ts)) return false;
  const ageSeconds = Math.abs(now / 1000 - ts);
  return ageSeconds <= FRESHNESS_WINDOW_SECONDS;
}

module.exports = { verifySlackSignature, isFreshTimestamp };
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd /Users/rich/Code/saveit-backend/cloud-function-slack && npx jest slack-signature.test.js`
Expected: PASS (7 tests).

- [ ] **Step 5: Commit**

```bash
cd /Users/rich/Code/saveit-backend
git add cloud-function-slack/slack-signature.js cloud-function-slack/slack-signature.test.js
git commit -m "feat(slack): verify Slack request signatures"
```

---

### Task 11: Slack response block builder

**Files:**
- Create: `/Users/rich/Code/saveit-backend/cloud-function-slack/slack-response.js`
- Test: `/Users/rich/Code/saveit-backend/cloud-function-slack/slack-response.test.js`

**Interfaces:**
- Consumes: hydrated thing shapes
  ```ts
  type Hit = {
    title: string|null,
    url: string|null,
    ai_summary_brief: string|null,
    saved_at: string|null,           // ISO
    user_email: string|null          // bucket 2 only — for attribution
  }
  ```
- Produces:
  - `buildAckBody(query) → {text, response_type}` — the immediate 200 body.
  - `buildSearchResponseBlocks({query, bucket1, bucket2, companyDomain}) → object` — Slack `blocks` payload for the deferred POST.
  - `buildErrorMessage(text) → object` — single-section error block.

- [ ] **Step 1: Write the failing test**

```js
// cloud-function-slack/slack-response.test.js
const { describe, it, expect } = require('@jest/globals');
const {
  buildAckBody,
  buildSearchResponseBlocks,
  buildErrorMessage
} = require('./slack-response');

describe('buildAckBody', () => {
  it('is ephemeral with a searching message', () => {
    const body = buildAckBody('british antarctic survey');
    expect(body.response_type).toBe('ephemeral');
    expect(body.text).toMatch(/Searching.*british antarctic survey/i);
  });
});

describe('buildSearchResponseBlocks', () => {
  const bucket1 = [
    { title: 'BAS field season', url: 'https://bas.ac.uk/1', ai_summary_brief: 'Ops update.', saved_at: '2026-07-15T10:00:00Z', user_email: null }
  ];
  const bucket2 = [
    { title: 'Krill quotas', url: 'https://bas.ac.uk/krill', ai_summary_brief: 'CCAMLR limits.', saved_at: '2026-07-14T10:00:00Z', user_email: 'jane@airteam.com.au' }
  ];

  it('returns an ephemeral payload with two bucket sections', () => {
    const result = buildSearchResponseBlocks({
      query: 'antarctic', bucket1, bucket2, companyDomain: 'airteam.com.au'
    });
    expect(result.response_type).toBe('ephemeral');
    const text = JSON.stringify(result.blocks);
    expect(text).toMatch(/Your saved pages/);
    expect(text).toMatch(/From others at airteam\.com\.au/);
  });

  it('title links to source url and summary appears below it', () => {
    const result = buildSearchResponseBlocks({
      query: 'x', bucket1, bucket2: [], companyDomain: 'd'
    });
    const blocks = result.blocks;
    // Find the section containing the bucket-1 hit
    const joined = JSON.stringify(blocks);
    expect(joined).toContain('https://bas.ac.uk/1');
    expect(joined).toContain('Ops update.');
    expect(joined).toContain('BAS field season');
  });

  it('omits the bucket-2 section when bucket2 is empty', () => {
    const result = buildSearchResponseBlocks({
      query: 'x', bucket1, bucket2: [], companyDomain: 'd'
    });
    const text = JSON.stringify(result.blocks);
    expect(text).not.toMatch(/From others at/);
  });

  it('shows only the local-part of the saver email in bucket 2', () => {
    const result = buildSearchResponseBlocks({
      query: 'x', bucket1: [], bucket2, companyDomain: 'airteam.com.au'
    });
    const text = JSON.stringify(result.blocks);
    expect(text).toContain('jane@');
    expect(text).not.toContain('jane@airteam.com.au');
  });

  it('caps each bucket (bucket1=3, bucket2=5)', () => {
    const many1 = Array.from({ length: 10 }, (_, i) => ({ title: `t${i}`, url: `https://x/${i}`, ai_summary_brief: 's', saved_at: null, user_email: null }));
    const many2 = Array.from({ length: 10 }, (_, i) => ({ title: `t${i}`, url: `https://y/${i}`, ai_summary_brief: 's', saved_at: null, user_email: `u${i}@d.com` }));
    const result = buildSearchResponseBlocks({ query: 'x', bucket1: many1, bucket2: many2, companyDomain: 'd' });
    const text = JSON.stringify(result.blocks);
    // Count link occurrences by URL prefix
    const xCount = (text.match(/https:\/\/x\//g) || []).length;
    const yCount = (text.match(/https:\/\/y\//g) || []).length;
    expect(xCount).toBe(3);
    expect(yCount).toBe(5);
  });

  it('builds a both-empty message', () => {
    const result = buildSearchResponseBlocks({ query: 'nothing', bucket1: [], bucket2: [], companyDomain: 'd' });
    const text = JSON.stringify(result.blocks);
    expect(text).toMatch(/No saves matched/i);
  });
});

describe('buildErrorMessage', () => {
  it('returns an ephemeral payload with the text', () => {
    const result = buildErrorMessage('No SaveIt account for you@x.com');
    expect(result.response_type).toBe('ephemeral');
    expect(JSON.stringify(result.blocks)).toContain('No SaveIt account for you@x.com');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd /Users/rich/Code/saveit-backend/cloud-function-slack && npx jest slack-response.test.js`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

```js
// cloud-function-slack/slack-response.js
const BUCKET_1_CAP = 3;
const BUCKET_2_CAP = 5;

function escapeMrkdwn(s) {
  // Slack mrkdwn: escape *, _, `, <, >. Keep links constructed via the URL
  // syntax explicit rather than escaping — we build those ourselves.
  return String(s ?? '').replace(/[*_`<>]/g, m => `\\${m}`);
}

function localPart(email) {
  if (typeof email !== 'string') return 'someone';
  const at = email.indexOf('@');
  return at > 0 ? email.slice(0, at + 1) : email; // "jane@" — credit without full address
}

function titleLink(hit) {
  const title = hit.title || hit.url || '(untitled)';
  if (!hit.url) return `*${escapeMrkdwn(title)}*`;
  return `<${hit.url}|*${escapeMrkdwn(title)}*>`;
}

function hitLine(hit, { withAttribution }) {
  const summary = hit.ai_summary_brief ? `  ${escapeMrkdwn(hit.ai_summary_brief)}` : '';
  const attribution = withAttribution && hit.user_email ? ` · saved by ${escapeMrkdwn(localPart(hit.user_email))}` : '';
  return `• ${titleLink(hit)}${summary}${attribution}`;
}

function section(title, hits, cap, opts = {}) {
  if (!hits.length) return null;
  const shown = hits.slice(0, cap);
  const lines = shown.map(h => hitLine(h, opts));
  const header = `*${title} (${hits.length})*`;
  return {
    type: 'section',
    text: { type: 'mrkdwn', text: [header, ...lines].join('\n') }
  };
}

function buildAckBody(query) {
  return {
    response_type: 'ephemeral',
    text: `🔍 Searching '${query}'…`
  };
}

function buildSearchResponseBlocks({ query, bucket1, bucket2, companyDomain }) {
  const blocks = [];

  blocks.push({
    type: 'header',
    text: { type: 'plain_text', text: `🔍 ${query}` }
  });

  const s1 = section('Your saved pages', bucket1 || [], BUCKET_1_CAP, { withAttribution: false });
  const s2 = section(`From others at ${companyDomain}`, bucket2 || [], BUCKET_2_CAP, { withAttribution: true });

  if (s1) blocks.push(s1);
  if (s2) blocks.push(s2);

  if (!s1 && !s2) {
    return {
      response_type: 'ephemeral',
      blocks: [{
        type: 'section',
        text: { type: 'mrkdwn', text: `No saves matched *${escapeMrkdwn(query)}*.` }
      }]
    };
  }

  blocks.push({
    type: 'context',
    elements: [{ type: 'mrkdwn', text: '_Only visible to you · Org-mates can hide saves with "Hide from organisation"_' }]
  });

  return { response_type: 'ephemeral', blocks };
}

function buildErrorMessage(text) {
  return {
    response_type: 'ephemeral',
    blocks: [{ type: 'section', text: { type: 'mrkdwn', text } }]
  };
}

module.exports = { buildAckBody, buildSearchResponseBlocks, buildErrorMessage };
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd /Users/rich/Code/saveit-backend/cloud-function-slack && npx jest slack-response.test.js`
Expected: PASS (all tests).

- [ ] **Step 5: Commit**

```bash
cd /Users/rich/Code/saveit-backend
git add cloud-function-slack/slack-response.js cloud-function-slack/slack-response.test.js
git commit -m "feat(slack): build ephemeral search response blocks"
```

---

### Task 12: Slack search orchestrator

**Files:**
- Create: `/Users/rich/Code/saveit-backend/cloud-function-slack/slack-search.js`
- Test: `/Users/rich/Code/saveit-backend/cloud-function-slack/slack-search.test.js`

**Interfaces:**
- Consumes (all injected via `deps` for testability):
  - `fetchSlackEmail(slackUserId) → string|null`
  - `lookupFirebaseUser(email) → {uid, email}|null`
  - `searchOwnPages({uid, queryVector, limit}) → Hit[]`
  - `searchOrgPages({companyDomain, queryVector, limit}) → Hit[]`
  - `generateEmbedding(query) → number[]`
  - `postToResponseUrl(url, payload) → void`
  - `buildSearchResponseBlocks`, `buildErrorMessage` from Task 11.
- Produces: `runSlackSearch({slackUserId, query, responseUrl, deps}) → Promise<void>` — orchestrates and POSTs.

- [ ] **Step 1: Write the failing test**

```js
// cloud-function-slack/slack-search.test.js
const { describe, it, expect } = require('@jest/globals');
const { runSlackSearch } = require('./slack-search');

const baseDeps = (overrides = {}) => ({
  fetchSlackEmail: async () => 'jane@airteam.com.au',
  lookupFirebaseUser: async () => ({ uid: 'u1', email: 'jane@airteam.com.au' }),
  generateEmbedding: async () => [0.1, 0.2],
  searchOwnPages: async () => [{ title: 'Own hit', url: 'https://o/1', ai_summary_brief: 's', saved_at: null, user_email: null }],
  searchOrgPages: async () => [{ title: 'Org hit', url: 'https://x/1', ai_summary_brief: 's', saved_at: null, user_email: 'mike@airteam.com.au' }],
  postToResponseUrl: jest.fn(),
  ...overrides
});

describe('runSlackSearch', () => {
  it('happy path: posts a two-bucket response', async () => {
    const deps = baseDeps();
    await runSlackSearch({ slackUserId: 'S1', query: 'krill', responseUrl: 'https://slack/x', deps });
    expect(deps.postToResponseUrl).toHaveBeenCalledTimes(1);
    const payload = deps.postToResponseUrl.mock.calls[0][1];
    const text = JSON.stringify(payload);
    expect(text).toMatch(/Own hit/);
    expect(text).toMatch(/Org hit/);
    expect(text).toMatch(/From others at airteam\.com\.au/);
  });

  it('no email in Slack profile → friendly error, no searches', async () => {
    const deps = baseDeps({
      fetchSlackEmail: async () => null,
      searchOwnPages: jest.fn(),
      searchOrgPages: jest.fn()
    });
    await runSlackSearch({ slackUserId: 'S1', query: 'x', responseUrl: 'https://slack/x', deps });
    expect(deps.searchOwnPages).not.toHaveBeenCalled();
    expect(deps.searchOrgPages).not.toHaveBeenCalled();
    const payload = deps.postToResponseUrl.mock.calls[0][1];
    expect(JSON.stringify(payload)).toMatch(/email.*Slack profile/i);
  });

  it('email not in Firebase → friendly install error', async () => {
    const deps = baseDeps({
      lookupFirebaseUser: async () => null,
      searchOwnPages: jest.fn(),
      searchOrgPages: jest.fn()
    });
    await runSlackSearch({ slackUserId: 'S1', query: 'x', responseUrl: 'https://slack/x', deps });
    const payload = deps.postToResponseUrl.mock.calls[0][1];
    expect(JSON.stringify(payload)).toMatch(/No SaveIt account/i);
  });

  it('search failure → friendly snag message, re-throw logged', async () => {
    const deps = baseDeps({
      searchOwnPages: async () => { throw new Error('vector down'); }
    });
    await expect(runSlackSearch({
      slackUserId: 'S1', query: 'x', responseUrl: 'https://slack/x', deps
    })).rejects.toThrow('vector down');
    const payload = deps.postToResponseUrl.mock.calls[0][1];
    expect(JSON.stringify(payload)).toMatch(/hit a snag/i);
  });

  it('both buckets empty → no-saves message', async () => {
    const deps = baseDeps({
      searchOwnPages: async () => [],
      searchOrgPages: async () => []
    });
    await runSlackSearch({ slackUserId: 'S1', query: 'nothing', responseUrl: 'https://slack/x', deps });
    const payload = deps.postToResponseUrl.mock.calls[0][1];
    expect(JSON.stringify(payload)).toMatch(/No saves matched/i);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd /Users/rich/Code/saveit-backend/cloud-function-slack && npx jest slack-search.test.js`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

```js
// cloud-function-slack/slack-search.js
const { buildSearchResponseBlocks, buildErrorMessage } = require('./slack-response');
const { deriveCompanyDomain } = require('../shared/company-domain');

const BUCKET_1_LIMIT = 10;   // fetch a few extra; cap applied in block builder
const BUCKET_2_LIMIT = 15;

/**
 * Run the two-bucket Slack search and POST the result to responseUrl.
 *
 * All I/O is injected via `deps` so the orchestration is fully unit-testable.
 * Errors are surfaced to Slack as ephemeral messages; unrecoverable errors
 * (search backend down) are re-thrown after the user-facing message is sent
 * so the caller can log to Sentry.
 */
async function runSlackSearch({ slackUserId, query, responseUrl, deps }) {
  const { fetchSlackEmail, lookupFirebaseUser, generateEmbedding,
          searchOwnPages, searchOrgPages, postToResponseUrl } = deps;

  // 1. Resolve identity
  const email = await fetchSlackEmail(slackUserId);
  if (!email) {
    await postToResponseUrl(responseUrl, buildErrorMessage('Add an email to your Slack profile and try again.'));
    return;
  }

  const user = await lookupFirebaseUser(email);
  if (!user) {
    await postToResponseUrl(responseUrl, buildErrorMessage(
      `No SaveIt account for ${email} — install the extension at saveit.app to start saving.`
    ));
    return;
  }

  const companyDomain = deriveCompanyDomain(user.email);

  // 2. Embed query once; reuse for both buckets
  let queryVector;
  try {
    queryVector = await generateEmbedding(query);
  } catch (e) {
    await postToResponseUrl(responseUrl, buildErrorMessage('Search hit a snag — try again in a moment.'));
    throw e;
  }

  // 3. Run both bucket searches in parallel. If either fails, surface the
  // snag message and re-throw so the caller logs to Sentry.
  let bucket1, bucket2;
  try {
    [bucket1, bucket2] = await Promise.all([
      searchOwnPages({ uid: user.uid, queryVector, limit: BUCKET_1_LIMIT }),
      companyDomain
        ? searchOrgPages({ companyDomain, queryVector, limit: BUCKET_2_LIMIT })
        : Promise.resolve([])
    ]);
  } catch (e) {
    await postToResponseUrl(responseUrl, buildErrorMessage('Search hit a snag — try again in a moment.'));
    throw e;
  }

  // 4. Build and POST the result
  const payload = buildSearchResponseBlocks({ query, bucket1, bucket2, companyDomain });
  await postToResponseUrl(responseUrl, payload);
}

module.exports = { runSlackSearch, BUCKET_1_LIMIT, BUCKET_2_LIMIT };
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd /Users/rich/Code/saveit-backend/cloud-function-slack && npx jest slack-search.test.js`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
cd /Users/rich/Code/saveit-backend
git add cloud-function-slack/slack-search.js cloud-function-slack/slack-search.test.js
git commit -m "feat(slack): two-bucket search orchestrator"
```

---

### Task 13: HTTP entry point + production dep wiring

**Files:**
- Create: `/Users/rich/Code/saveit-backend/cloud-function-slack/index.js`
- Create: `/Users/rich/Code/saveit-backend/cloud-function-slack/package.json`
- Create: `/Users/rich/Code/saveit-backend/scripts/deploy-slack-function.sh`

**Interfaces:**
- Produces: `slackCommand(req, res)` — the Cloud Function entry point. Gen2 HTTP.

- [ ] **Step 1: Write the HTTP entry point**

Create `cloud-function-slack/index.js`:

```js
// cloud-function-slack/index.js
const functionsFramework = require('@google-cloud/functions-framework');
const admin = require('firebase-admin');
const { verifySlackSignature, isFreshTimestamp } = require('./slack-signature');
const { buildAckBody, buildErrorMessage } = require('./slack-response');
const { runSlackSearch } = require('./slack-search');
const { queryClassifications } = require('../shared/vector-search-client');
const { generateEmbedding } = require('../shared/embedding-utils');
const logger = require('../shared/logger');

const SLACK_SIGNING_SECRET = process.env.SLACK_SIGNING_SECRET;
const SLACK_BOT_TOKEN = process.env.SLACK_BOT_TOKEN;

if (!admin.apps.length) {
  admin.initializeApp();
}
const auth = admin.auth();
const firestore = admin.firestore();

functionsFramework.http('slackCommand', async (req, res) => {
  // Slack sends application/x-www-form-urlencoded; the raw body is needed for
  // signature verification. The Functions Framework exposes req.rawBody.
  const timestamp = req.headers['x-slack-request-timestamp'];
  const signature = req.headers['x-slack-signature'];
  const rawBody = req.rawBody ? req.rawBody.toString('utf8') : '';

  if (!SLACK_SIGNING_SECRET) {
    logger.error('SLACK_SIGNING_SECRET not configured');
    res.status(500).send('');
    return;
  }
  if (!verifySlackSignature({ body: rawBody, timestamp, signature, signingSecret: SLACK_SIGNING_SECRET })
      || !isFreshTimestamp(timestamp)) {
    res.status(401).send('');
    return;
  }

  const query = (req.body?.text || '').trim();
  const slackUserId = req.body?.user_id;
  const responseUrl = req.body?.response_url;

  if (!query) {
    res.status(200).json(buildErrorMessage(
      'Search for what? Try `/links british antarctic survey`'
    ));
    return;
  }

  // Immediate ack so Slack doesn't time out.
  res.status(200).json(buildAckBody(query));

  // Fire-and-forget: the function instance outlives the HTTP return.
  runSlackSearch({
    slackUserId,
    query,
    responseUrl,
    deps: makeProductionDeps()
  }).catch((err) => {
    logger.error('Slack search failed', { error: err.message, stack: err.stack });
  });
});

/**
 * Build the production deps for runSlackSearch. Lives here (not in slack-search.js)
 * so the orchestrator stays pure and unit-testable.
 */
function makeProductionDeps() {
  return {
    async fetchSlackEmail(slackUserId) {
      const r = await fetch(`https://slack.com/api/users.info?user=${encodeURIComponent(slackUserId)}`, {
        headers: { Authorization: `Bearer ${SLACK_BOT_TOKEN}` }
      });
      const j = await r.json();
      return j?.ok ? (j.user?.profile?.email || null) : null;
    },

    async lookupFirebaseUser(email) {
      try {
        const u = await auth.getUserByEmail(email);
        return { uid: u.uid, email: u.email };
      } catch (e) {
        // auth/user-not-found throws; treat as null
        return null;
      }
    },

    generateEmbedding,

    async searchOwnPages({ uid, queryVector, limit }) {
      const neighbors = await queryClassifications({ queryVector, userId: uid, limit });
      return hydrate(neighbors.map(n => n.thing_id), { withOwnerEmail: false });
    },

    async searchOrgPages({ companyDomain, queryVector, limit }) {
      const neighbors = await queryClassifications({ queryVector, companyDomain, includePrivate: false, limit });
      return hydrate(neighbors.map(n => n.thing_id), { withOwnerEmail: true });
    },

    async postToResponseUrl(url, payload) {
      await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
    }
  };
}

/**
 * Hydrate thing_ids into the Hit shape. withOwnerEmail controls whether the
 * returned hit carries user_email (bucket 2 only — for attribution).
 */
async function hydrate(thingIds, { withOwnerEmail }) {
  if (!thingIds.length) return [];
  const snaps = await Promise.all(
    thingIds.map(id => firestore.collection('things').doc(id).get())
  );
  return snaps
    .filter(s => s.exists)
    .map(s => {
      const d = s.data();
      if (d.deleted) return null;
      return {
        title: d.title || null,
        url: d.url || null,
        ai_summary_brief: d.ai_summary_brief || null,
        saved_at: d.saved_at || null,
        user_email: withOwnerEmail ? (d.user_email || null) : null
      };
    })
    .filter(Boolean);
}
```

- [ ] **Step 2: Write `package.json` mirroring `cloud-function-enrich/package.json`**

Read `cloud-function-enrich/package.json` first to copy its exact structure, then create `cloud-function-slack/package.json` with the same shape but only the deps this function needs:

```json
{
  "name": "saveit-slack",
  "version": "1.0.0",
  "private": true,
  "main": "index.js",
  "scripts": {
    "start": "functions-framework --target=slackCommand",
    "test": "jest"
  },
  "dependencies": {
    "@google-cloud/functions-framework": "^3.4.0",
    "@google-cloud/firestore": "^7.11.0",
    "firebase-admin": "^12.7.0"
  },
  "devDependencies": {
    "jest": "^29.7.0"
  }
}
```

Match the version numbers in `cloud-function-enrich/package.json` exactly — do not invent versions.

- [ ] **Step 3: Write the deploy script**

Create `scripts/deploy-slack-function.sh`, modelled on `deploy-enrich-function.sh`:

```bash
#!/bin/bash

# Deploy the saveit-slack Cloud Function (Slack /links slash command).
#
# Usage:
#   ./scripts/deploy-slack-function.sh

set -e

PROJECT_ID="${PROJECT_ID:-bookmarking-477502}"
REGION="us-central1"

echo "🚀 Deploying saveit-slack to project: $PROJECT_ID..."

COMMIT_HASH=$(git rev-parse --short HEAD)
echo "Deploying version: $COMMIT_HASH"

# Copy shared + contracts into the function dir (mirrors the enrich deploy pattern).
echo "Copying shared utilities and contracts..."
rm -rf cloud-function-slack/shared cloud-function-slack/contracts
cp -r shared cloud-function-slack/
cp -r contracts cloud-function-slack/

echo "Regenerating lockfile..."
cd cloud-function-slack
pnpm install --lockfile-only
cd ..

echo "📦 Deploying saveit-slack..."
gcloud functions deploy saveit-slack \
  --gen2 \
  --runtime=nodejs20 \
  --region=$REGION \
  --source=./cloud-function-slack \
  --entry-point=slackCommand \
  --trigger-http \
  --allow-unauthenticated \
  --memory=256MB \
  --timeout=60s \
  --update-env-vars SENTRY_RELEASE=$COMMIT_HASH \
  --update-env-vars VECTOR_SEARCH_INDEX=projects/bookmarking-477502/locations/us-central1/indexes/6284639139576938496 \
  --update-env-vars VECTOR_SEARCH_ENDPOINT=1829724115.us-central1-903859773555.vdb.vertexai.goog \
  --update-env-vars VECTOR_SEARCH_ENDPOINT_ID=2765836892833316864 \
  --update-env-vars VECTOR_SEARCH_DEPLOYED_INDEX_ID=saveit_classification_v2 \
  --update-secrets SLACK_SIGNING_SECRET=slack-signing-secret:latest \
  --update-secrets SLACK_BOT_TOKEN=slack-bot-token:latest \
  --update-labels commit=$COMMIT_HASH \
  --project=$PROJECT_ID

# Clean up copied directories after deployment
rm -rf cloud-function-slack/shared cloud-function-slack/contracts

echo ""
echo "✅ saveit-slack deployed!"
echo ""
echo "Configure your Slack app's slash command request URL to:"
echo "  https://saveit-slack-${PROJECT_ID//bookmarking-/}-uc.a.run.app/slack/commands"
```

- [ ] **Step 4: Verify the entry point parses and unit tests still pass**

Run: `cd /Users/rich/Code/saveit-backend/cloud-function-slack && node --check index.js && npx jest`
Expected: all prior Task 10-12 tests still PASS; `node --check` succeeds.

- [ ] **Step 5: Make the deploy script executable and commit**

```bash
cd /Users/rich/Code/saveit-backend
chmod +x scripts/deploy-slack-function.sh
git add cloud-function-slack/ scripts/deploy-slack-function.sh
git commit -m "feat(slack): HTTP entry point, package.json, deploy script"
```

---

## Phase 7: Extension privacy toggle

### Task 14: Accept `private` in the extension validators and API

**Files:**
- Modify: `/Users/rich/Code/saveit-extension/src/validators.js:35-76`
- Verify: `/Users/rich/Code/saveit-extension/src/api-pages-page-actions.js`

**Interfaces:** none new — `updatePage` already passes `updates` straight through.

- [ ] **Step 1: Add `private` to `PageSchema`**

In `src/validators.js`, inside `PageSchema` (lines 35-76), add the field near `pinned`:

```js
  deleted: z.boolean().optional().default(false),
  deleted_at: z.iso.datetime().optional(),
  pinned: z.boolean().optional().default(false),
  // User opt-out from org-wide search (Slack /links bucket 2). Default false.
  private: z.boolean().optional().default(false),
  updated_at: z.iso.datetime().optional(),
```

- [ ] **Step 2: Verify `updatePage` passes it through**

Run: `grep -n "body.*JSON.stringify" /Users/rich/Code/saveit-extension/src/api-pages-page-actions.js`
Confirm line 42 spreads `...updates` into the body. Since `private` would be inside `updates`, no code change needed.

- [ ] **Step 3: Run the extension test suite**

Run: `cd /Users/rich/Code/saveit-extension && just test`
Expected: PASS — no regressions.

- [ ] **Step 4: Commit**

```bash
cd /Users/rich/Code/saveit-extension
git add src/validators.js
git commit -m "feat(extension): accept private flag on page schema"
```

---

### Task 15: "Hide from organisation" toggle in the page card

**Files:**
- Modify: `/Users/rich/Code/saveit-extension/src/newtab.js`

**Interfaces:** consumes `API.updatePage(id, { private: boolean })` (Task 14 / existing).

- [ ] **Step 1: Locate the existing card affordances**

Run: `grep -n "pin\|pinPage\|togglePin\|card-actions\|page-actions\|context-menu" /Users/rich/Code/saveit-extension/src/newtab.js | head -30`
Identify where the pin button or card action menu is rendered. The privacy toggle will be a sibling affordance using the same pattern (button or menu item).

- [ ] **Step 2: Write a failing unit test for the toggle handler**

Because the card UI in `newtab.js` is large and UI-coupled, test the **handler function** that the click event calls, not the DOM rendering. Add a small extracted function (or extract one) `togglePagePrivacy(api, page)` that calls `api.updatePage(page.id, { private: !page.private })` and returns the updated page.

Create or extend `tests/unit/page-privacy-toggle.test.js`:

```js
import { describe, it, expect, vi } from 'jest';
import { togglePagePrivacy } from '../../src/newtab-privacy.js';

describe('togglePagePrivacy', () => {
  it('flips private false→true and calls updatePage', async () => {
    const api = { updatePage: vi.fn().mockResolvedValue({ id: 'p1', private: true }) };
    const result = await togglePagePrivacy(api, { id: 'p1', private: false });
    expect(api.updatePage).toHaveBeenCalledWith('p1', { private: true });
    expect(result.private).toBe(true);
  });

  it('flips private true→false', async () => {
    const api = { updatePage: vi.fn().mockResolvedValue({ id: 'p1', private: false }) };
    const result = await togglePagePrivacy(api, { id: 'p1', private: true });
    expect(api.updatePage).toHaveBeenCalledWith('p1', { private: false });
    expect(result.private).toBe(false);
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `cd /Users/rich/Code/saveit-extension && npx jest tests/unit/page-privacy-toggle.test.js`
Expected: FAIL — module not found.

- [ ] **Step 4: Create the extracted handler module**

Create `src/newtab-privacy.js`:

```js
/**
 * Toggle a saved page's org-search visibility.
 *
 * `private` governs ONLY whether the page appears in Slack /links bucket 2
 * (org-mates' results). It never affects the owner's own bucket 1 or any
 * other surface — the owner always sees their own private pages.
 *
 * Extracted from newtab.js so the handler is unit-testable without DOM setup.
 */
export async function togglePagePrivacy(api, page) {
  const next = !page.private;
  return api.updatePage(page.id, { private: next });
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `cd /Users/rich/Code/saveit-extension && npx jest tests/unit/page-privacy-toggle.test.js`
Expected: PASS.

- [ ] **Step 6: Wire the toggle into the page card UI**

In `src/newtab.js`, find the card-action rendering identified in Step 1. Add a sibling affordance (button or menu item) that:
- Has the accessible label "Hide from organisation" (or "Show in organisation" when already hidden).
- Reflects `page.private` in its initial state.
- On click, calls `togglePagePrivacy(API, page)` then updates the card state from the returned page.

The exact insertion point depends on the existing card structure — read the surrounding code and match its event-binding idiom (likely a `data-action="privacy"` attribute and a delegated click handler, mirroring how pin works). Use the same toast / optimistic-update pattern the existing card actions use.

If the card code is opaque, the minimum viable wiring is: add a button in the card template with `data-action="toggle-privacy"`, then in the existing delegated click handler add a case:

```js
case 'toggle-privacy': {
  const page = /* resolve the page for this card the same way pin does */;
  const updated = await togglePagePrivacy(API, page);
  // Update the card's button label + page state per the existing pattern
  applyPageUpdateToCard(cardEl, updated);
  break;
}
```

- [ ] **Step 7: Run the full extension check**

Run: `cd /Users/rich/Code/saveit-extension && just check`
Expected: PASS — tests, lint, validate, build all green.

- [ ] **Step 8: Commit**

```bash
cd /Users/rich/Code/saveit-extension
git add src/newtab.js src/newtab-privacy.js tests/unit/page-privacy-toggle.test.js
git commit -m "feat(extension): per-page Hide from organisation toggle"
```

---

## Phase 8: Deploy & verify

### Task 16: Run backfills against production

**Files:** none (operations only)

⚠️ This task touches production data. Run during a low-traffic window. Both backfills are idempotent.

- [ ] **Step 1: Phase A — Firestore things backfill (dry check first)**

Run: `cd /Users/rich/Code/saveit-backend/cloud-function && node ../scripts/migrate-add-org-fields.js`
Expected: console output reports total docs, updated count, skipped count. Re-running should report `total updated: 0`, `total skipped: <all>` (idempotency check).

- [ ] **Step 2: Phase B — Vector Search datapoint backfill (DRY_RUN first)**

Run: `cd /Users/rich/Code/saveit-backend/cloud-function && DRY_RUN=1 node ../scripts/backfill-org-search-vectors.js`
Expected: console reports how many datapoints would be upserted and shows a sample. Confirm the sample's restricts include `company_domain` + `private:'false'`.

- [ ] **Step 3: Phase B — live run**

Run: `cd /Users/rich/Code/saveit-backend/cloud-function && node ../scripts/backfill-org-search-vectors.js`
Expected: console reports successful batch upserts; final count matches the dry-run count.

- [ ] **Step 4: Smoke-test bucket 2 with a known domain**

Write a one-off check (or extend `scripts/validate-vector-search.js` if it fits) that runs a single `queryClassifications` call with `companyDomain: 'airteam.com.au'` and a broad query, asserting it returns >0 results. Run it.

Expected: non-zero results, confirming the backfill populated the new restricts and bucket-2 queries resolve.

---

### Task 17: Deploy `saveit-slack` and configure the Slack app

**Files:** none (operations + Slack admin console)

- [ ] **Step 1: Create Slack secrets in Secret Manager**

```bash
echo -n "<signing-secret-from-slack-app-config>" | \
  gcloud secrets create slack-signing-secret --data-file=- --replication-policy=automatic --project=bookmarking-477502
echo -n "<bot-token-xoxb>" | \
  gcloud secrets create slack-bot-token --data-file=- --replication-policy=automatic --project=bookmarking-477502
```

Grant the `saveit-slack` runtime service account access (the deploy command's service account needs `roles/secretmanager.secretAccessor`).

- [ ] **Step 2: Deploy the function**

Run: `cd /Users/rich/Code/saveit-backend && ./scripts/deploy-slack-function.sh`
Expected: deploy succeeds, prints the function URL.

- [ ] **Step 3: Configure the Slack app (api.slack.com → your app)**

- Slash commands → create `/links` → request URL = the deployed function URL (printed in Step 2).
- OAuth & Permissions → add bot token scopes: `commands`, `users:read.email`.
- Install to workspace → capture the signing secret and bot token (these went into Secret Manager in Step 1).

- [ ] **Step 4: End-to-end test from Slack**

In the workspace, type `/links british antarctic survey` (or a query known to have hits).
Expected:
- Immediate ephemeral "🔍 Searching…" ack.
- Within a few seconds, the two-bucket result message appears (ephemeral).
- A page marked "Hide from organisation" via the extension toggle does NOT appear in bucket 2.

---

### Task 18: Update `AGENTS.md` backend overview

**Files:**
- Modify: `/Users/rich/Code/saveit-extension/AGENTS.md`

- [ ] **Step 1: Add `saveit-slack` to the function table**

In the "Backend overview" table, add a row:

```markdown
| `saveit-slack` | `cloud-function-slack/` | HTTP: Slack `/links` slash command (signature-verified, deferred `response_url` response) |
```

- [ ] **Step 2: Note the deploy target in the known-debt section**

In the "Backend deployment has too many moving parts" debt item, increment the count (6 → 7 Cloud Functions, 4 → 5 dirs) and note that `just deploy-all` now covers 3 of 7 functions (still omits both realtime + slack). Leave the "candidate for a future architecture pass" framing intact.

- [ ] **Step 3: Add host-permissions note IF the extension needs to call Slack**

The extension does NOT call Slack directly (the Slack → function path is inbound only), so `manifest.json` host_permissions is unchanged. Do not modify the manifest.

- [ ] **Step 4: Commit**

```bash
cd /Users/rich/Code/saveit-extension
git add AGENTS.md
git commit -m "docs(agents): add saveit-slack to backend overview"
```

---

## Self-review notes

**Spec coverage:** Each spec section maps to a task — decisions table (Tasks 1-18 implement every locked decision); architecture flow (Task 12 + 13); Vector Search change (Task 4); privacy-filter strict choice (Task 4 bucket-2 restricts); restricts helper (Task 5); data model (Tasks 3, 6, 7); backfill (Tasks 8, 9, 16); saveit-slack components (Tasks 10-13, 17); Slack response format (Task 11); error handling matrix (Tasks 11, 12); extension toggle (Tasks 14, 15); deployment sequencing (Tasks 16, 17); testing (every task includes tests).

**Type consistency:** `deriveCompanyDomain` (Task 1) is imported unchanged in Tasks 2, 5, 6, 8. `buildClassificationDatapoint` (Task 5) is consumed by Tasks 6 (enrich), 7 (PATCH), 9 (backfill) — the single source of truth for restricts shape. `queryClassifications` signature (Task 4) is consumed by Tasks 9 (backfill via upsert — separate function), 12 (via deps), 13 (production). `Hit` shape (`title, url, ai_summary_brief, saved_at, user_email`) is consistent across Tasks 11, 12, 13. `buildSearchResponseBlocks` / `buildErrorMessage` (Task 11) consumed by Tasks 12 and 13. Restrict token values `'true'`/`'false'` consistent everywhere.

**Open implementation risks flagged inline:** (a) `thing_classifications` doc shape in Task 9 — implementer must verify field paths against `export-vectors-to-index.js`. (b) `getThingClassifications` in Task 7 — may need adding to `firestore-queries.js`. (c) `updateThingFields` whitelist mechanism in Task 7 Step 1. (d) The exact card UI wiring in Task 15 Step 6 depends on the existing `newtab.js` structure; the handler is fully specified but the DOM binding follows local idiom.
