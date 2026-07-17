# Slack `/links` Command — Design

**Date:** 2026-07-17
**Status:** Approved (pending spec review)
**Repos:** `saveit-extension` (extension UI for the privacy toggle), `saveit-backend` (new Cloud Function, data model, Vector Search reindex, backfill)

## Problem

Slack is the dominant organisation-wide communication tool, but a Slack user has no way to find what their colleagues have already saved in SaveIt. When someone asks "has anyone seen a good piece on British Antarctic Survey?", the answer exists in the org's collective SaveIt saves but is unreachable from Slack.

Today there is also no way for a colleague's saves to appear in *any* search, even the user's own — every read path (Firestore list, Vector Search) is hard-scoped to a single `user_id`. The only cross-user visibility that exists is via membership in a `visibility: 'company'` project, and that requires someone to have explicitly curated the page into a shared project.

## Goal

A Slack slash command `/links <query>` that returns semantic-search results in two clearly-labeled buckets, visible only to the caller:

1. **Your saved pages** — matches from the caller's own saves (unchanged isolation).
2. **From others at `<company_domain>`** — matches from org-mates' saves that are not marked private.

The feature leverages the existing email-domain-derived "organisation" concept (the same one that backs company projects) so there is no new tenancy model to build.

## Decisions (locked during brainstorming)

| Decision | Choice | Rationale |
|---|---|---|
| Org search scope | Shared + non-private | More useful than shared-only; gives users an explicit opt-out rather than implicit (project membership) |
| Identity link | Auto-match Slack user → SaveIt user by profile email | Zero onboarding friction; reuses Firebase `getUserByEmail` |
| Slack handler home | New 7th Cloud Function (`saveit-slack`, dir `cloud-function-slack/`) | Clean separation; own secrets, scaling, signature-verify lifecycle; does not muddy the main API's Bearer-token contract |
| Reindex strategy | One-shot backfill of all existing `thing_classifications` datapoints | Full bucket-2 coverage on day one; no "slowly improves over months" UX |
| Privacy rollout | Existing saves flip to org-visible on day one, no announcement | Maximises feature value; `private` flag gives an honest per-page opt-out for users who want it |
| Per-page `private` toggle UI | Shipped in the extension alongside the backend | Users need the opt-out the moment their saves become org-visible; honest default |
| Result links | Title links to source URL; summary shown inline as list items | No new web surface required; keeps scope honest and matches "smallest solution" |
| Slack response delivery | Deferred via `response_url` (immediate 200 ack) | Robust against Slack's 3-second timeout; gives a "Searching…" UX |

## Architecture

### End-to-end flow

```
Slack user types /links british antarctic survey
  → Slack POSTs to saveit-slack /slack/commands
  → saveit-slack:
       1. Verify Slack signing secret (HMAC v0). Reject if invalid or timestamp stale (>5 min).
       2. Immediately return HTTP 200 with an ephemeral "Searching 'british antarctic survey'…" message.
       3. Fire-and-forget Promise (function instance outlives the HTTP return):
            a. Slack users.info(slack_user_id) → profile.email   [requires users:read.email scope]
            b. Firebase Admin getUserByEmail(email) → { uid, email }
            c. company_domain = email.split('@')[1].toLowerCase()
            d. Bucket 1: queryClassifications(restricts: { user_id: uid, deleted: 'false' })
            e. Bucket 2: queryClassifications(restricts: { company_domain, deleted: 'false', private: 'false' })
            f. Hydrate thingIds → things docs (title, url, ai_summary_brief, saved_at, user_email)
            g. Format Slack blocks (two sections, ephemeral)
            h. POST blocks to payload.response_url
  → Slack renders the result ephemeral to the caller
```

**Why deferred-ack:** the work spans Slack API (~150ms), Firebase `getUserByEmail` (~100ms), embedding generation (~400ms), Vector Search (~50ms each bucket), and Firestore hydration (~150ms). Total ~900ms typically fits the 3s window, but the deferred pattern is the documented robust approach and gives a "Searching…" UX rather than a Slack timeout on a slow cold start.

**Why no user impersonation:** the Slack function runs with a GCP service account that has Firestore + Vector Search read access. It does **not** mint a SaveIt session token for the caller. Bucket scoping is enforced entirely via Vector Search restricts (for the user_id bucket, the restrict *is* the auth — the Slack signature verified the caller, and the email→uid lookup is the only trust transfer). This matches the existing security invariant at `shared/vector-search-client.js:13-16` — restricts, not caller identity, enforce isolation.

### Vector Search change (additive)

Today a query datapoint carries restricts `{ user_id, deleted }` (`shared/vector-search-client.js:74-77`). The index matches a stored datapoint iff every query restrict's allow-list overlaps the datapoint's tokens for that namespace.

For bucket 2 we add two new namespaces:

```js
// Bucket 1 (my pages) — unchanged
restricts: [
  { namespace: 'user_id', allowList: [uid] },
  { namespace: 'deleted', allowList: ['false'] }
]

// Bucket 2 (org pages) — new; swaps user_id for company_domain + private
restricts: [
  { namespace: 'company_domain', allowList: [domain] },
  { namespace: 'deleted', allowList: ['false'] },
  { namespace: 'private', allowList: ['false'] }
]
```

**Why this is safe for existing isolation:** bucket 1 keeps the `user_id` restrict unchanged. Bucket 2 deliberately uses a weaker restrict (`company_domain`) — that is the entire point. The `private` namespace makes the opt-out enforceable at the index level, not as a post-filter.

### Privacy-filter choice: strict (index-side)

Vector Search restricts are allow-list intersection. A datapoint upserted before the backfill, or one whose upsert silently failed, would not carry the `private` token and therefore **would not match** a `private:['false']` query.

We choose **strict** — query `private:['false']` — so missing tokens cause **under-inclusion**, never over-inclusion. This matches AGENTS.md principle #8 ("Invalidate narrowly, recover broadly") and the "no fallback that hides data drift" rule. The backfill guarantees every existing datapoint carries all three tokens; forward writes add them at enrichment time.

The lenient alternative (no `private` restrict in the index; filter in Firestore after hydration) would risk over-inclusion if a user toggled `private` but the datapoint wasn't re-upserted — a privacy violation, the wrong failure direction.

## Data model changes

Three new pieces. Two fields on the `things` doc; one index configuration change.

| Field | Where | Type | Default | Purpose |
|---|---|---|---|---|
| `private` | `things` doc | bool | `false` | User opt-out: if `true`, page never appears in anyone's bucket 2 |
| `company_domain` | `things` doc | string \| null | derived from `user_email` | Lets the privacy-toggle write path re-upsert datapoints without re-deriving; candidate Firestore composite index for admin queries |
| `company_domain`, `private` | Vector Search datapoint restricts | token | `'false'` / derived | Lets bucket 2 query the index in one call |

**Why store `company_domain` on the doc:** when a user toggles `private` in the extension, the backend handler must re-upsert that thing's `thing_classifications` datapoints with the new `private` token. It needs `company_domain` to write a well-formed datapoint. Putting it on the doc keeps the write path self-contained.

**What does NOT change:**
- Bucket 1 (`user_id` restrict) is untouched. The user's own private pages still appear in their own bucket 1 — `private` governs only org visibility, never self-visibility.
- Existing per-user isolation is unchanged.
- The extension's existing `searchContent` / `getSimilarByThingId` calls keep working as-is.

## Backend components (`saveit-backend`)

### 1. New function: `saveit-slack`

Source dir `cloud-function-slack/`, deploy script `scripts/deploy-slack.sh`. Single HTTP entry, one route: `POST /slack/commands`.

**Secrets:** `SLACK_SIGNING_SECRET`, `SLACK_BOT_TOKEN` (xoxb-). Stored via `gcloud functions deploy --set-secrets`.

**Service account:** runs as the default Compute service account with Firestore read access on the `saveit` project. No user impersonation.

**Responsibilities:**
- Verify Slack signature (HMAC-SHA256 of `v0:timestamp:body` with the signing secret; reject if timestamp older than 5 minutes — replay defence).
- Immediate 200 ack with `"Searching '<q>'…"` ephemeral message body.
- Async: Slack `users.info` → email → Firebase `getUserByEmail` → company_domain → two Vector Search calls → Firestore hydrate → format → POST to `response_url`.

**Why a 7th function, not a route on `saveit`:** the main API authenticates via `Authorization: Bearer <session-token>`; Slack authenticates via HMAC signature. Mixing those auth models in one function risks a future bug where a misconfigured middleware lets a Slack-shaped request through the Bearer path (or vice versa). Isolation is cheap and the AGENTS.md "explicit versioning, no hidden behavior changes across boundaries" rule applies. The trade-off — worsening the documented deploy-script sprawl — is real but accepted; see Open issues.

### 2. Shared helpers (reused, not duplicated)

The Slack function imports from `shared/`:
- `shared/firebase-auth.js` — `getAuth().getUserByEmail(email)` for the email→uid lookup.
- `shared/vector-search-client.js` — `queryClassifications` (extend signature to accept either `userId` or `companyDomain`+`includePrivate`).
- `shared/embedding-utils.js` — `generateEmbedding(query)` for the query embedding.

`shared/` is copied into the function dir by `deploy-slack.sh`, mirroring the existing deploy scripts' pattern (per AGENTS.md "Backend deployment has too many moving parts" — we follow the existing pattern rather than introduce a new one).

### 3. Vector Search client extension

`shared/vector-search-client.js` `queryClassifications` gains optional parameters:

```js
async function queryClassifications({
  queryVector,
  userId,           // bucket 1 path (unchanged)
  companyDomain,    // bucket 2 path (new — mutually exclusive with userId)
  includePrivate,   // bucket 2 path (new; default false → restrict to private:'false')
  limit
})
```

Either `userId` (bucket 1, no change) or `companyDomain` (bucket 2, new) must be supplied. The restrict list is built from whichever path is active. Existing callers (`searchByContentFirestore`, `getSimilarThings`, `searchByTagFirestore`) are unchanged — they pass `userId`.

### 4. Enrichment writer — forward writes

`cloud-function-enrich/firestore-writers.js` (the datapoint upsert site) and `cloud-function-enrich/enrichment-core.js` (where the restrict object is built) add `company_domain` and `private:false` to every datapoint. The `company_domain` is derived from the thing's `user_email` via the existing `getUserCompanyDomain` helper in `cloud-function/firestore-projects.js:9-15` (move it to `shared/` so both the main API and enrich can import it — currently duplicated in spirit).

### 5. Privacy-toggle write path

When a user marks a page private in the extension:

1. `PATCH /` with `{ id, private: true }` → existing `handlePatchPage` (`cloud-function/index.js:715`) handles the field update on the `things` doc.
2. New step in `handlePatchPage`: when `private` is in the patch, re-upsert that thing's `thing_classifications` datapoints with the `private` token set to the new value (`'true'` when hidden, `'false'` when un-hidden). This requires reading the thing's existing classifications (already loaded in the handler) and rebuilding the restricts — mirrors the enrichment write path.
3. Toggling back to `false` re-upserts with `private:'false'`, which re-includes the datapoint in bucket-2 query results on the next search.

This is the only new trigger on the existing write paths. The index-level `private` token is the single source of truth for bucket-2 inclusion — there is no Firestore-side post-filter that could disagree with it.

This is the only new trigger on the existing write paths. No other writes (save, enrich, project membership) need changes — they all go through the enrichment writer, which already adds the tokens going forward.

### 6. Backfill — one-shot migration

New script: `scripts/backfill-org-search-tokens.sh` (or `.js`, following house style). Two phases:

**Phase A — Firestore `things` docs:**
- Stream all `things` where `private` is missing (i.e. all existing docs) and write `private: false` + `company_domain: <derived from user_email>`. Batched writes.
- Idempotent: re-running on a doc that already has both fields is a no-op.

**Phase B — Vector Search index:**
- For every `thing_classifications` doc, rebuild the datapoint with the new restricts (`company_domain`, `private:'false'` in addition to `user_id`, `deleted`, `thing_id`, etc.).
- Stream-upserted via `upsertClassificationVectors` in batches of ~100 (the existing upsert path).
- Idempotent: upserts overwrite by datapoint id.

**Verification:** a dry-run mode that counts docs to be touched and samples a few datapoints before/after. Followed by `scripts/check-deployed-versions.sh`-style smoke check that runs a known bucket-2 query and asserts non-empty results for a test domain.

**Order:** Phase A must complete before Phase B (Phase B reads `company_domain` from the doc). Both must complete before `saveit-slack` is deployed to production.

### 7. Firestore index

A composite index may be needed for future admin queries (`where company_domain == X …`), but bucket 2 itself does not need a Firestore index — it goes through Vector Search. Defer the composite index until an admin surface needs it; do not add speculatively.

## Extension components (`saveit-extension`)

### Per-page "Hide from organisation" toggle

Added to the saved-page card / edit affordance. Bound to a new `private` field on the page object.

**Surfaces touched:**
- `src/newtab.js` — card UI (toggle button or menu item). Label: "Hide from organisation search". State reflects `page.private`.
- `src/api-pages.js` (or whichever mixin owns `updatePage`) — `PATCH` payload includes `private` when toggled.
- `src/validators.js` — accept `private: boolean` on the page object (it already accepts `visibility`-like fields; follow the same pattern).

**What does NOT change:**
- Bucket 1 / own-page search — the user sees their own private pages in their own search results.
- Existing card affordances (pin, project membership, edit). The new toggle is additive.

## Slack response format

Two-section ephemeral message. Title links to the source URL; summary shown inline below. Each result is a list item.

```
🔍 *British Antarctic Survey*

*Your saved pages (3)*
• <https://bas.ac.uk/field-season-2026|*BAS summer field season 2026*>
  Annual operations update from Rothera research station.
• <https://…|*Antarctic ice sheet modelling*>
  New projections for Thwaites glacier withdrawal.

*From others at airteam.com.au (5)*
• <https://bas.ac.uk/krill|*Antarctic krill fishery quotas*>
  CCAMLR catch limits for the 2026 season. · saved by jane@
• <https://nature.com/ice-cores|*Ice core climate records*>
  800,000-year temperature reconstruction from Dome C. · saved by mike@

_Only visible to you · Org-mates can hide saves with "Hide from organisation"_
```

**Caps:** bucket 1 top 3, bucket 2 top 5. Keeps the message well under Slack's ~50-block limit.

**Attribution:** bucket-2 results show the local-part of the saver's email (`jane@`). This gives credit and tells the caller who to ask, without exposing the full address in the Slack message payload.

**Ephemeral:** `response_type: 'ephemeral'`. Mandatory — bucket 2 can contain colleagues' pages that must not broadcast to the channel.

## Error handling

Every cell returns an ephemeral Slack message via `response_url` (or, for the signature check, an HTTP 401). Never a raw 500 to Slack.

| Condition | Response |
|---|---|
| Bad Slack signature / stale timestamp (>5 min) | HTTP 401, no Slack message |
| Empty query (`/links` with no text) | Ephemeral: `"Search for what? Try \`/links british antarctic survey\`"` |
| Slack user has no email in profile | Ephemeral: `"Add an email to your Slack profile and try again."` |
| `users.info` API failure | Ephemeral: `"Couldn't read your Slack profile. Try again in a moment."` |
| Email not found in Firebase | Ephemeral: `"No SaveIt account for you@… — install the extension at saveit.app to start saving."` |
| Both buckets empty | Ephemeral: `"No saves matched '<q>'."` + a one-line tip |
| Bucket 2 empty (bucket 1 non-empty) | Bucket 2 section omitted; no "0 results" noise |
| Vector Search / Firestore failure | Ephemeral: `"Search hit a snag — try again in a moment."` + Sentry event |
| `response_url` POST fails | Logged to Sentry; user sees the "Searching…" message and nothing more. Acceptable for ephemeral search; no retry. |

## Deployment & sequencing

**Slack app config (manual, one-time):**
- Create Slack app at api.slack.com.
- Slash command: `/links`, request URL = the `saveit-slack` Cloud Function URL.
- Bot token scopes: `commands`, `users:read.email`.
- Install to the target workspace(s); record signing secret + bot token.

**Backend deploy order:**
1. Add `private` and `company_domain` to `things` schema + enrich writer (forwards-compatible — old docs simply lack the fields).
2. Extend `queryClassifications` to accept the bucket-2 parameters.
3. Run Phase A backfill (Firestore `things`).
4. Run Phase B backfill (Vector Search datapoints).
5. Verify bucket-2 query returns non-empty for a test domain.
6. Deploy `saveit-slack`.
7. Add the extension toggle.
8. Enable the Slack app in the workspace.

**Staging:** the extension has a staging path; the backend does not (AGENTS.md known-debt #4). For this feature, test the backfill and `saveit-slack` against a staging Firebase project + a separate staging Slack workspace if feasible. If a staging backend project is not available, the dry-run mode in the backfill script is the primary safety net.

## Testing

| Layer | Tests |
|---|---|
| Unit — `saveit-slack` | Slack signature verification (valid, invalid, stale timestamp, replay); query parsing; response block formatting (both buckets, bucket-2-empty, both-empty, attribution rendering); empty-query rejection |
| Unit — `queryClassifications` extension | Bucket 1 path unchanged; bucket 2 path issues correct restricts; `includePrivate` flag honoured; rejects call missing both `userId` and `companyDomain` |
| Unit — privacy toggle | `handlePatchPage` with `private:true` updates doc and re-upserts datapoints; toggle back to `false` re-upserts correctly |
| Unit — enrich writer | New datapoints carry `company_domain` + `private:false`; existing restricts unchanged |
| Integration — backfill | Dry-run counts match; sample datapoints before/after carry the new tokens; idempotency on second run |
| E2E — Slack happy path | `/links <q>` against staging workspace → both buckets populated → ephemeral in channel |
| E2E — privacy | Mark a page private in extension → bucket 2 no longer returns it → toggle back → it returns |
| E2E — no SaveIt account | `/links` from a Slack user whose email isn't in Firebase → friendly ephemeral |

## Security review

- **Slack signature verification** is the only thing protecting the endpoint. Use the documented `v0` HMAC algorithm verbatim; never short-circuit on timestamp-only checks.
- **Replay window** of 5 minutes (Slack's recommendation). Reject older.
- **No user impersonation.** The Slack function's service account has Firestore + Vector Search *read* access only — it cannot write `things`, cannot mint session tokens, cannot call the main API as a user.
- **Bucket 2 visibility is enforced at the Vector Search index**, not as a post-filter. A misconfigured Firestore read cannot leak a private page through bucket 2 — the index never returns it. (Bucket 1 has no privacy filter because the user owns those pages.)
- **Email exposure in Slack messages** is limited to the local-part (`jane@` not `jane.doe@airteam.com.au`). Full emails never appear in Slack payloads.
- **Ephemeral responses** — bucket 2 results are never posted to the channel.
- **`users:read.email` scope** is the most sensitive Slack permission requested; document it clearly in the app's OAuth screen so workspace admins understand why.

## Open issues / known debt

- **Deploy-script sprawl worsens.** This adds a 5th source dir and 7th function to a backend already flagged in AGENTS.md as having too many moving parts. `just deploy-all` will need a new target. Accepted as the cost of clean isolation; do not paper over it with a route on `saveit`.
- **No staging backend.** Testing the backfill against prod data is the highest-risk step. The dry-run mode and idempotency are the mitigation, but a real staging project would be materially safer. Not in scope to fix here.
- **`getUserCompanyDomain` lives in `cloud-function/firestore-projects.js`** but the enrich worker and the new Slack function both need it. Move to `shared/` as part of this work (small refactor, follows the "DRY auth responsibilities" debt note).
- **Day-one flip.** Existing saves become org-searchable immediately on launch. There is intentionally no announcement — the `private` toggle is available from launch for users who want to opt individual pages out, but we are not pre-warning the user base. This is a deliberate product call; revisit if it generates support tickets.
- **Two companies sharing an email domain** (rare but possible — e.g. two firms on a shared `gmail.com` domain) would see each other's bucket-2 results. This is inherited behaviour from the company-project model, not introduced here, but worth noting in the heads-up for consumer-domain users.

## Out of scope

- Save-to-SaveIt-from-Slack command (separate feature).
- Slack notifications when an org-mate saves something matching a watched query.
- A SaveIt web detail page (results link to source URLs only).
- Multi-workspace routing beyond email domain.
- Changes to bucket 1 / existing search quality.
- Realtime push into Slack.
- A Slack app directory listing / OAuth install flow UI (admin installs manually).
