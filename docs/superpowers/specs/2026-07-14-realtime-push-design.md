# Realtime Push for Shared Projects — Design

**Date:** 2026-07-14
**Status:** Approved (pending spec review)
**Repos:** `saveit-extension` (client), `saveit-backend` (server)

## Problem

When a member of a shared project saves a page, other members do not see it until they manually re-open the project view. The extension has no realtime channel — freshness is re-checked only when a project is opened/switched, and `storage.onChanged` invalidation is per-browser-profile (cannot cross users). See the debugging investigation that motivated this: Laura's saved page was present and correct in Firestore but invisible to Richard and Nick until re-fetch.

The client's enrichment poll (`startEnrichmentPoll` in `src/background.js`) is also a polling workaround for an inherently push-shaped problem: it refetches the newest 10 pages every 8–20s for ~95s to detect when async enrichment completes.

## Goal

Members see a newly-saved project page within seconds, while viewing the project, without manual refresh. Built as a clean event system usable by all client surfaces (open project drawer, dashboard, favorites, projects sidebar). Must support multiple concurrent users at scale — this is why polling was rejected.

## Decisions (locked during brainstorming)

| Decision | Choice | Rationale |
|---|---|---|
| Latency target | Seconds (true push) | Requires a persistent streaming connection |
| Transport | SSE over HTTP | Reuses opaque session token + existing host permissions; no new client deps; self-contained in backend |
| Cross-instance fan-out channel | Firestore as the bus (server-side `onSnapshot`) | Reuses existing `@google-cloud/firestore` dep; no new GCP products |
| Scope of first iteration | All user surfaces, clean event system | One connection covers every surface via a typed bus |
| Event types | `project_page_changed`, `page_updated`, `project_metadata_changed` | Covers cross-user gap; favorites/pin local changes stay on `storage.onChanged` |
| Emission mechanism | Firestore trigger on `things`/`projects` | Zero changes to existing write sites; catches enrich-worker writes automatically |
| Enrichment fan-out | `enriched` events ping project members + saver | Members see enrichment complete in realtime; replaces the client poll |
| SSE timeout | 15 minutes → toast "Refresh to pick up changes" | Simpler than silent reconnect; user stays in control |
| SSE auth | `fetch()` + `Authorization` header | Keeps token out of URLs/logs; matches rest of API |
| SSE deployment | Separate `saveit-realtime` function, `--concurrency=100`, one `onSnapshot` per instance | Isolates long-lived streams from the HTTP API; listener count = instance count, not user count |

## Architecture

### End-to-end flow

```
Member A saves a page to project P
  → (existing) BigQuery save_events + Cloud Tasks → enrich worker writes things doc
  → realtime-trigger: Firestore onWrite on things/{id}
       computes event {type, change, pageId, projectId, scopeKeys}
       writes event doc to realtime_events (TTL: 10 min)
  → saveit-realtime instance: one onSnapshot on realtime_events fires
       iterates in-memory client registry {clientId → {scopeKeys, res}}
       writes SSE frame only to matching clients
  → Member B's RealtimeClient receives the frame
       dispatches to RealtimeEventBus
       bus routes to the relevant store/surface
       store runs its existing refreshInitial() (HEAD + incremental sync, skipCache)
       → Member B sees Member A's page
```

### Key principle

The stream carries **"something changed, go fetch" signals, not page data.** Surfaces react by running their existing refresh/incremental-sync logic. This keeps the realtime path thin and reuses the fetch code that already handles pagination, caching, and reconciliation.

## Backend components (`saveit-backend`)

### 1. `realtime-trigger` — Firestore background function

A new, separately-deployed Cloud Function with Firestore trigger bindings (not HTTP):

```
things/{pageId}     .onWrite  →  computeThingsEvent(before, after)
projects/{projectId} .onWrite →  computeProjectsEvent(before, after)
```

**Responsibility:** inspect before/after, compute event docs per the event taxonomy, write them to `realtime_events`. Stateless — does not know who is listening.

**Why separate from `saveit`:** the main function is `--trigger-http`; Firestore triggers are a different invocation source. Isolation also prevents a trigger bug from affecting the HTTP API.

**Idempotency:** a single `things` write can touch multiple field groups (e.g. enrichment + `project_ids` in the duplicate-save path at `firestore-writers.js:417`). The trigger may emit multiple event docs from one write — each is a distinct semantic event. The client dedups by re-fetching (idempotent GET), so duplicate "go fetch" pings are harmless.

**Cost guard:** Firestore triggers fire on every write. Existing write sites are all user-initiated (save, edit, pin, delete, add-to-project) or enrichment-completion (one per save) — not high-frequency. Well within Firestore trigger quotas.

### 2. `saveit-realtime` — SSE function (separate deployment)

A new, separately-deployed HTTP Cloud Function tuned for long-lived SSE. **Not** a route on the main `saveit` function — isolation is required for scale (see "Why separate" below).

**Route:** `GET /events/stream`

**Authentication:** existing `withAuth` middleware — the opaque session token, via `Authorization: Bearer <token>` header (the client uses `fetch()`, not native `EventSource`, so headers are settable).

**Per-instance architecture (the scale design):**
- Each instance maintains **one** server-side `onSnapshot` on `realtime_events`.
- Each instance maintains an in-memory **client registry**: `Map<clientId, { scopeKeys: Set<string>, res }>` where `clientId` is a UUID generated per connection.
- On client connect: resolve the user, fetch their accessible project ids (owner or company-domain access), compute `scopeKeys = ['user:<uid>', 'project:<p1>', ...]`, register the client. If this is the first client on the instance, open the `onSnapshot`.
- On `onSnapshot` firing (new event doc): iterate the registry, write an SSE frame only to clients whose `scopeKeys` intersect the event's `scopeKeys`. Cheap set-intersection per client, not a Firestore read.
- On client disconnect (`req` close): remove from registry. If the registry is now empty, tear down the `onSnapshot` to shed listener cost when idle. The listener is reopened when the next client connects. This lifecycle (open on first connect, close on last disconnect) keeps listener count proportional to active instances, never to idle ones.

**Scaling math:** for 1,000 concurrent users at `--concurrency=100`, that's ~10 instances, each holding 1 Firestore listener (not 1,000). Event fan-out is O(instances) Firestore listener firings + O(users) in-memory checks per event.

**SSE framing:**
```
event: project_page_changed
data: {"type":"project_page_changed","change":"added","pageId":"uid_hash","projectId":"project-abc","scopeKeys":["project:project-abc","user:uid123"]}

```
Heartbeat every 30s: `: keepalive\n\n` (prevents proxy/load-balancer idle timeouts, detects dead connections).

**Function timeout:** 15 minutes. When the connection severs at timeout, the client shows a toast: "Refresh to pick up changes" (no auto-reconnect). The user's next page interaction or refresh re-establishes the stream.

**`scopeKeys` query note:** the instance `onSnapshot` does **not** filter by user — it receives all recent events and filters in-memory per client. This avoids per-user Firestore queries and keeps listener count at one per instance.

**Why separate from the main `saveit` function:** the main function deploys at default concurrency (1 for Gen 2). A 15-minute SSE connection would pin an entire instance, starving the regular HTTP API (save, get, projects) under concurrent realtime load. A separate function with `--concurrency=100` isolates long-lived streams and lets each instance serve many of them.

### 3. `realtime_events` Firestore collection

Small event docs, TTL-auto-deleted.

**Document schema:**
```js
{
  type: 'project_page_changed' | 'page_updated' | 'project_metadata_changed',
  change: 'added' | 'removed' | 'updated' | 'enriched' | 'deleted',
  pageId: 'uid_hash' | null,
  projectId: 'project-...' | null,
  // Flat primitive-string routing keys derived from scopes — indexable via array-contains-any
  scopeKeys: ['project:project-abc', 'user:uid123'],
  emittedAt: Firestore Timestamp,
  expireAt: Firestore Timestamp   // TTL: emittedAt + 10 min
}
```

- **TTL policy** on `expireAt` via `gcloud firestore fields ttl update` — auto-deletes expired docs, no scheduled cleanup function. 10 min is generous: a client disconnected >10 min has missed events and will do a full refresh on reconnect anyway.
- Created on first event write; no setup script beyond the TTL policy.

## Event taxonomy

The trigger computes these from the `things`/`projects` before/after docs.

### `things` writes

| Before → after | `type` | `change` | `scopeKeys` |
|---|---|---|---|
| New doc (`before` absent), `project_ids` non-empty | `project_page_changed` | `added` | `project:<id>` for each in `project_ids` + `user:<after.user_id>` |
| New doc (`before` absent), `project_ids` empty | `page_updated` | `added` | `user:<after.user_id>` |
| `project_ids` grew | `project_page_changed` | `added` | `project:<id>` for added ids + `user:<user_id>` |
| `project_ids` shrank | `project_page_changed` | `removed` | `project:<id>` for removed ids + `user:<user_id>` |
| Enrichment fields changed (`ai_summary_brief`, `classifications`, `primary_classification_label`, `ai_enriched_at`) | `page_updated` | `enriched` | `project:<id>` for each in `project_ids` + `user:<user_id>` |
| `pinned` / `title` / `description` / `user_notes` / `manual_tags` changed | `page_updated` | `updated` | `user:<user_id>` only (personal edits, not shared) |
| `deleted` flipped to `true` | `page_updated` | `deleted` | `project:<id>` for each in `project_ids` + `user:<user_id>` |
| `after` absent (hard delete — defensive; never happens today) | `project_page_changed` | `removed` | `project:<id>` for each in `before.project_ids` |

### `projects` writes

| Before → after | `type` | `change` | `scopeKeys` |
|---|---|---|---|
| New doc | `project_metadata_changed` | `added` | `project:<doc.id>` |
| `name`/`archived`/`visibility`/`company_domain` changed | `project_metadata_changed` | `updated` | `project:<doc.id>` |

### Key decisions in the model

- **`enriched` pings project members too.** When Laura's page in project P gets its tags, Richard (viewing P) gets pinged and his project store re-fetches — the enriched doc replaces the stub. This also **replaces the client's enrichment poll entirely**: the saver gets a `user:<uid>`-scoped `enriched` event, which triggers the same cache-invalidation + optimistic-tile-clear that `startEnrichmentPoll`'s `onFound` does today. The poll is removed.
- **Personal edits (`pinned`, `title`, `manual_tags`, `user_notes`) are user-scoped only.** These don't fan out to project members — they're the saver's own view customizations.
- **`scopeKeys` is a flat primitive-string array** so the in-memory client-registry intersection is a cheap `Set.has` check per event, and so `array-contains-any` remains available if ever needed for a direct query path.

### Enrichment note

AI summaries (`ai_summary_brief`) are still written by the enrichment worker and rendered as the primary card summary (`newtab-drawer-renderer.js:27`); classification tags (`classifications`) are also written and heavily used in the UI. Both come from one LLM call gated by `ENABLE_AI_ENRICHMENT`. Mozilla Readability replaced Jina as the *content-acquisition* method, not the AI. This feature does not change that — it only makes enrichment completion push-driven instead of poll-driven.

## Client components (`saveit-extension`)

### 4. `RealtimeClient` (`src/realtime-client.js`)

Owns the single SSE connection for one open new-tab page. Responsibilities: connect, parse SSE frames, route typed events to the bus, handle the 15-min timeout → toast.

**Transport:** `fetch()` with `Authorization: Bearer <sessionToken>` header (not native `EventSource`, which can't set headers). Hand-rolled SSE line parsing (~40 lines): read the `ReadableStream`, buffer by `\n\n`, split each frame into `event:` and `data:` lines.

**Connection lifecycle:**
1. On newtab page start (after auth resolves), `RealtimeClient.connect()` opens the stream via `fetch()`.
2. Parse SSE frames; for each, call `bus.dispatch(event)`.
3. Heartbeat comments (`: keepalive`) are ignored.
4. On stream close / error (the 15-min timeout severs it): call `toast.show('Refresh to pick up changes')` once, do **not** reconnect. Set an internal `disconnected` flag so we don't toast repeatedly.
5. On `pagehide` / `visibilitychange` to hidden → `disconnect()` (abort the fetch). The next newtab open starts fresh.

**Auth coupling:** reads the session token and API base URL from the existing API layer (`src/api.js` / `src/background-auth.js`), same `getAuthenticatedSession()` path the background script uses.

### 5. `RealtimeEventBus` (`src/realtime-event-bus.js`)

A tiny pub/sub mapping event types → subscriber callbacks. Decouples transport from reaction.

```js
class RealtimeEventBus {
  subscribe(eventType, handler) { ... }   // returns unsubscribe
  dispatch(event) {                        // { type, change, pageId, projectId, scopeKeys }
    this.handlers[event.type]?.forEach(h => h(event));
  }
}
```

### Subscribers and their reactions

Each subscriber runs its surface's **existing** logic — no new fetch code.

| Event | Subscriber | Reaction |
|---|---|---|
| `project_page_changed` (projectId matches open project) | open project's `WarmCacheListStore` | `refreshInitial()` — re-runs HEAD + incremental sync, surfaces the new/removed page |
| `project_page_changed` (projectId doesn't match open project) | projects sidebar | mark project "has updates" (badge/dot) — deferred fetch on open |
| `page_updated` / `enriched` (scope = current user) | dashboard `SavedPagesStore` + favorites store | `refreshInitial()` — replaces the enrichment-poll. Also clears the optimistic pending-save tile if `pageId` matches (replaces `startEnrichmentPoll`'s `onFound`). |
| `page_updated` / `enriched` (scope = a project the user is viewing) | open project store | `refreshInitial()` |
| `page_updated` / `deleted` | affected stores | `refreshInitial()` (the GET excludes the deleted doc) |
| `project_metadata_changed` | projects sidebar / `ProjectsStore` | `refreshInitial()` on the projects list |

### Wiring into the newtab lifecycle

In `newtab-page.js` / `newtab-app.js`, after auth resolves and the toast region is created:

```
newtab-page.start()
  → resolve auth
  → create toast region (existing)
  → create RealtimeEventBus
  → register subscribers (project store, dashboard store, projects sidebar, pending-save clearer)
  → create RealtimeClient({ apiUrl, getToken, bus, notify: toast.show })
  → client.connect()
```

Disconnect on `pagehide` / `visibilitychange` to hidden.

**The MV3 service worker is not involved.** The stream is held by the newtab page (a content page, not the SW), so the SW's 30s teardown doesn't affect it. When the newtab tab is foregrounded, the stream is active; when closed, it's gone. This sidesteps the biggest MV3 constraint.

### What this does NOT change

- The existing `storage.onChanged` cache-invalidation path stays — it handles the user's *own* local writes. Realtime handles *cross-user* changes.
- The existing HEAD freshness check + incremental sync stays — it's the reaction function realtime triggers. Realtime just calls it sooner.
- No new client dependencies. `fetch` + `ReadableStream` are browser APIs. No Firebase SDK.

## Edge cases and error handling

1. **Events arriving during an ongoing refresh.** Two `enriched` events fire close together; the subscriber calls `refreshInitial()` twice. The `WarmCacheListStore` already guards against concurrent refreshes via `requestId` (`warm-cache-list-store.js:211-225` `reset()`), so the second call's stale `requestId` is ignored. The bus additionally skips a dispatch if a refresh for the same scope is already in-flight (dedup guard).
2. **Event for a project the user can no longer access** (removed/archived mid-stream). The `onSnapshot` query is based on projects at connect time. If access changes, the user may receive an event for a lost-access project. The reaction is a `refreshInitial()` GET that returns 404 → the store's existing error handling shows nothing. Harmless and rare.
3. **Stream fails to connect** (network error, auth expired). Show the toast once: "Refresh to pick up changes." Don't retry — same as the timeout case.
4. **`onSnapshot` server-side error** (Firestore outage). The SSE handler catches, sends a final SSE error event, closes the stream. Client toasts + stops.
5. **Malformed SSE frame.** Client logs and skips; never crashes the stream.

## Testing

**Backend unit tests:** `computeThingsEvent` / `computeProjectsEvent` — pure functions taking before/after docs, returning event docs. Test every row of the event taxonomy table. These are the highest-value tests; the trigger logic is the trickiest part.

**Backend integration test:** write a `things` doc, assert a `realtime_events` doc appears with correct `scopeKeys`. (Requires Firestore emulator.)

**SSE handler test:** assert auth, assert the client registry is populated, assert heartbeat, assert disconnect removes from registry and tears down the listener when empty.

**Client unit tests:** `RealtimeEventBus` dispatch routing; `RealtimeClient` SSE frame parsing (feed raw byte chunks, assert parsed events); timeout → toast called once; no reconnect.

**Client E2E:** with a mock SSE source, assert that a `project_page_changed` event triggers `refreshInitial` on the matching store. This replaces the manual cross-user repro from the original bug.

## Out of scope

- No load testing of concurrent SSE connections (first iteration; project is small-scale).
- No metrics/dashboard for event throughput (can add later if needed).
- No auto-reconnect with gap-backfill (the toast + manual refresh is the chosen UX).
- Personal edits (`pinned`, `title`, `manual_tags`) remain user-scoped only; pinning *within* a project is a future consideration.
