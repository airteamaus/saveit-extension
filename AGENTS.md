# AGENTS.md

SaveIt is a browser extension for saving and enriching bookmarks. The main repo is `saveit-extension/`; the private backend lives in `/Users/rich/Code/saveit-backend/`.

## Project snapshot

- **Stack:** Firefox/Chrome extension, Cloud Functions, BigQuery, Firestore
- **Key flow:** save in extension -> Cloud Function -> BigQuery -> async enrichment -> Firestore
- **Main directories:** `src/`, `tests/`, `scripts/`, `docs/`
- **Related docs:** `README.md`, `docs/README.md`, `docs/DASHBOARD-README.md`

## Working style

- Prefer small, safe changes that match existing patterns.
- For broad features or behavior changes, align on approach before editing.
- It is fine to implement immediately for clear bug fixes, explicit implementation requests, or already-approved work.
- Do not create planning or session-summary markdown files in the repo unless explicitly requested.
- Before moving files between `saveit-extension` and `saveit-backend`, explain the change and get confirmation.

## Implementation philosophy

- **Keep it simple.** Prefer the smallest solution that fully solves the problem.
- **Do not overbuild.** Add abstractions and dependencies only when they remove real complexity or risk.
- **Prefer browser and platform APIs** over extra libraries when practical.
- **Use explicit versioning for breaking API changes.** Avoid hidden behavior changes across extension/backend boundaries.

### Examples

- ✅ Discuss major feature direction before changing multiple surfaces.
- ✅ Reuse an existing store/helper instead of duplicating list-sync logic.
- ✅ Fix a clearly broken bug directly and add coverage for it.
- ❌ Add fallback logic that hides API drift or incomplete data.
- ❌ Introduce a new dependency for a small helper the platform already provides.
- ❌ Change extension/backend contracts implicitly.

## Architecture notes

### Modes

| Mode | Protocol | Data source | Use case |
|---|---|---|---|
| Standalone | `file://` | Mock data | UI development |
| Extension | `moz-extension://` or `chrome-extension://` | Cloud Functions | Real data and auth flows |

Mode detection is handled in `src/api.js`. The config layer (`src/config.js`) detects dev/staging/production from the manifest version and protocol.

### Backend overview

The backend (`/Users/rich/Code/saveit-backend/`) is **7 Cloud Functions across 5 source dirs**, each with its own deploy script. This is a known friction point — see the architecture-improvement notes below.

| Function | Source dir | Role |
|---|---|---|
| `saveit` | `cloud-function/` | HTTP API: save, bulk-import, read, delete, projects, auth |
| `saveit-enrich` (controller) | `cloud-function-enrich/` | Finds unenriched events, creates Cloud Tasks |
| `saveit-enrich-worker` | `cloud-function-enrich/` | Processes one event: fetch content, AI classify, write Firestore doc |
| `saveit-realtime` | `cloud-function-realtime/` | SSE stream: fans Firestore changes to connected clients |
| `saveit-realtime-trigger-things` | `cloud-function-realtime-trigger/` | Firestore onWrite → emits realtime event docs |
| `saveit-realtime-trigger-projects` | `cloud-function-realtime-trigger/` | Firestore onWrite → emits realtime event docs |
| `saveit-slack` | `cloud-function-slack/` | HTTP: Slack `/links` slash command (signature-verified, deferred `response_url` response) |

Key pipeline: `extension save → saveit (BigQuery save_events) → enrich controller (Cloud Tasks) → worker (fetch + AI) → Firestore things doc → realtime trigger → SSE → extension`.

### Local development setup

The author runs the extension for local development in **Brave** (Chromium), loaded as an **unpacked extension in dev mode**. Load the **repo root** (where `manifest.json` lives), not `src/` — there is no manifest inside `src/`, so pointing the unpacked loader at `src/` will not load. The `just run` / `just run-chrome` targets and the Firefox dev profile are available but are not the primary dev path.

**Reloading the extension does not reliably reload the background service worker.** The extension page (newtab) picks up `src/` changes on the next extension reload because it loads modules directly, but the SW runs `src/bundles/background-bundle.js` and may keep the old bundle in memory until MV3 idle-recycle (~30s) tears it down. When iterating on `background.js`, rebuild bundles (`just build-bundles`) and either wait for SW recycle or explicitly restart the SW (chrome://extensions → "service worker" link → stop) before re-testing. Symptom of stale SW state: a fix to the save/realtime path appears to work in one repro and fail in the next, with no code change between them.

### Important surfaces

- `src/newtab.js` - main new-tab UI, favorites, saved pages drawer
- `src/project-manager.js` - project navigation and membership editing
- `src/api.js` / `src/api-pages.js` - API layer (facade composed from `applyX(API)` mixins)
- `src/api-core.js` - core API runtime: auth, transport delegation, per-surface cache routing
- `src/api-transport.js` - single authenticated `fetch` shared by the facade and the background SW (URL/params/Bearer/error/rotation in one place)
- `src/cache-manager.js` - browser storage cache (one instance per surface)
- `src/cache-keys.js` - per-surface cache prefixes (`savedPages_cache`, `projects_cache`, `domains_cache`) and one-time key migrations
- `src/warm-cache-list-store.js` - local-first paginated list syncing
- `src/projects-store.js` - `WarmCacheListStore` subclass for projects (routes its warm cache through the projects surface)
- `src/realtime-client.js` - single SSE connection per open new-tab page (idempotent `connect()`, no auto-reconnect; bfcache restore reconnects via `pageshow`)
- `src/background.js` - toolbar save and auth integration (composes `api-transport.js`; its own `CacheManager` instance for the toolbar's projects warm cache)
- `src/data-sync-centre.js` - consolidated Import / Export / Browser-sync modal
- `src/bookmark-import.js` / `src/bookmark-export.js` - pure CSV/HTML/JSON parsers and serializers
- `src/bookmark-mirror.js` - server-to-browser bookmark sync (reconcile, removeMirror)

### Per-surface cache architecture

The facade lazily constructs **three `CacheManager` instances**, one per data surface, each with its own storage prefix so a mutation on one surface invalidates narrowly without dropping the others:

| Surface | CacheManager getter | Prefix | Methods |
|---|---|---|---|
| Saved pages | `API.cacheManager` | `savedPages_cache` | `getCachedPages` / `setCachedPages` / `invalidateCache` / `getCachedPagesState` |
| Projects | `API.projectsCacheManager` | `projects_cache` | `getProjectsCachedPages` / `setProjectsCachedPages` / `invalidateProjectsCache` / `getProjectsCachedPagesState` |
| Domains | `API.domainsCacheManager` | `domains_cache` | `getDomainsCachedPages` / `setDomainsCachedPages` / `invalidateDomainsCache` / `getDomainsCachedPagesState` |

Mutation invalidation is scoped to the surfaces a write can actually change: `createProject`/`updateProject` invalidate only projects; `deletePage`/`updatePage` invalidate saved-pages + domains (classification/title shifts affect domain counts); `pinPage` invalidates only saved-pages; `addPageToProject`/`removePageFromProject` invalidate both projects and saved-pages (membership vs `project_ids`). `API.invalidateAllCaches()` exists for the user-facing "reload from server" affordance. The background SW (which doesn't load the facade) uses the storage-direct helpers in `saved-pages-cache.js`.

The toolbar save + realtime enrichment relay paths use `markToolbarSaveCachesStale` (sets `timestamp: 0`, keeps `response.pages`), **not** `invalidateToolbarSaveCaches` (which hard-removes the keys). Hard-removing destroyed the warm cache whenever a save happened with no newtab open to observe it — the next newtab's `hydrate` then fell to the network path and wrote back only the 50-page initial batch (lazy stores don't refill past `initialFetchLimit` without scroll). Marking stale lets the next read paint the full cached list instantly via `allowExpired: true` and reconcile in the background. The hard-remove helpers (`invalidateSavedPagesCacheStorage` / `invalidateDomainsCacheStorage`) stay available for callers that genuinely need to drop the data — sign-out, `forceReload`, and imports.

The cached-read flow (`API._getCachedOrFreshList`) is shared across all three surfaces. The cache-scope builders (`_buildListCacheScope`, `buildProjectsCacheScope`, `buildDomainsCacheScope`) are intentionally separate — each surface has its own query dimensions (lists carry sort/cursor/projectId; projects carry includeArchived; domains carry none), so forcing them through one builder would add parameters most surfaces ignore.

### Realtime lifecycle

One SSE stream per open new-tab page. `RealtimeClient.connect()` is idempotent (a second call while a stream is open is a no-op, so a bfcache `pageshow` reconnect can't orphan the existing `AbortController`). There is **no mid-stream token refresh** and **no auto-reconnect** — a dropped stream toasts once and the user refreshes to re-establish. The newtab page registers persistent `pagehide`/`pageshow` listeners (not `once`) so a bfcache restore reconnects the stream and a second navigation away still tears it down.

### Two-repo note

Use absolute paths when crossing repos. Bash state does not persist between tool calls, so chain commands when changing directories.

Example:

```bash
cd /Users/rich/Code/saveit-backend && ./scripts/deploy-function.sh
```

## Caching and API redux

1. Server is authoritative.
2. Fast first paint, full eventual data.
3. Partial cache is not success.
4. Counts come from collection totals, not visible slices.
5. Freshness checks must not block completeness.
6. Cache keys match query shape.
7. Prefer additive compatibility at API boundaries.
8. Invalidate narrowly, recover broadly.
9. Local-first UX, network-backed correctness.
10. Test failure modes, not just the happy path.

## Code quality standards

- Keep modules reasonably small; refactor files that grow too large.
- Return or surface errors with context; do not swallow failures.
- Comments should explain **why**, not restate **what**.
- Fix code or track work explicitly; do not leave vague TODO promises in implementation code.
- Preserve behavior unless the task explicitly changes it.
- Reuse shared helpers and stores before adding new ones.

### Comment examples

```js
// Good: explains why
// Cache user info to avoid forcing OAuth on every save

// Bad: explains what
// Set the user email
```

## Testing standards

- Add or update tests for bug fixes, business-logic changes, new functions, and API contract changes.
- Prefer focused unit tests first; use E2E for real workflow coverage.
- Validate the actual failure mode, not just a nearby happy path.
- Local quality bar: tests, lint, validate, and build should pass before wrapping up.

### Test layout

| Path | Purpose |
|---|---|
| `tests/unit/` | fast, isolated logic tests |
| `tests/e2e/` | browser workflow tests |

## Tool reference

### Development

| Task | Command |
|---|---|
| List tasks | `just` |
| Standalone preview | `just preview` |
| Run in Firefox | `just run` |
| Run in Chrome | `just run-chrome` |
| Persistent Firefox install | `just install` |
| Install dependencies | `just install-deps` |

### Build and quality

| Task | Command |
|---|---|
| Build Firefox package | `just build` |
| Build Chrome package | `just build-chrome` |
| Build both | `just build-all` |
| Build bundles | `just build-bundles` |
| Clean artifacts | `just clean` |
| Run tests | `just test` |
| Watch tests | `just test-watch` |
| Coverage | `just test-coverage` |
| E2E headless | `just test-e2e` |
| E2E UI | `just test-e2e-ui` |
| Test bundle build | `just test-build` |
| Test CSP | `just test-csp` |
| Lint | `just lint` |
| Lint and fix | `just lint-fix` |
| ESLint only | `just lint-js` |
| CSS lint | `just lint-css` |
| CSS lint and fix | `just lint-css-fix` |
| Format all files | `just format` |
| Check formatting | `just format-check` |
| Validate manifest | `just validate` |
| Full local check | `just check` |
| CI simulation | `just ci-check` |

### Release and maintenance

| Task | Command |
|---|---|
| Pre-deploy checks | `just pre-deploy` |
| Deploy staging | `just deploy-staging` |
| Deploy production | `just deploy-prod` |
| Bump version and tag | `just bump [patch\|minor\|major]` |
| Setup git hooks | `just setup-hooks` |
| Clear Firefox cache | `just clear-cache` |
| Generate changelog | `just changelog` |
| Release notes | `just release-notes VERSION` |

## Build and release notes

- Bundles are built with `scripts/bundle.js`.
- Generated bundles in `src/bundles/` are build artifacts and are not committed.
- For extension testing, `just run` is the most reliable path because Firefox caching can hide local changes.
- Use `just bump` for releases so version files and tags stay aligned.

## Documentation guidance

- Write plainly and factually.
- Avoid marketing language and status claims like "finished" or "perfect."
- Update user-facing docs when behavior or setup changes.

## Prompt and command creation

- State the goal, constraints, and expected output explicitly.
- Include verification requirements for risky changes.
- Prefer concrete acceptance criteria over vague requests.
- When writing commands, make them safe, reproducible, and scoped to the right repo.

## Security and config

- Keep OAuth scopes minimal.
- Do not commit secrets or embed private credentials in the extension.
- Treat client-side storage and cache as convenience layers, not security boundaries.
- `manifest.json` `host_permissions` must list **every** Cloud Run origin the extension calls. The realtime SSE service (`saveit-realtime`) runs on a separate subdomain from the main API — both must be listed or the browser silently blocks the fetch. Adding a new backend service means adding its origin here.

## Known architectural debt

These friction points caused real debugging time during the Data & sync overhaul. They are candidates for a future architecture improvement pass:

1. **Backend deployment has too many moving parts.** 7 Cloud Functions, 5 deploy scripts, and `just deploy-all` only covers 3 of the 7 functions (it omits both realtime services and Slack). The realtime and Slack deploys have no justfile target at all and must be run by hand. Each script copies `shared/` and `contracts/` into its function dir by hand, and two scripts additionally copy handler files from `cloud-function/` — an implicit cross-dir dependency.

2. **Ingestion pipeline has confusing branching.** Two writers of `save_events` (save vs bulk-import) duplicate the trigger logic. Duplicate detection runs at two levels (worker `thingExists` vs core `checkDuplicateThing`) with different semantics around soft-deleted docs — the worker gate can short-circuit before the core's undelete logic runs. `source` dispatch is a binary `if (client) else (jina)` with no validation.

3. **Auth responsibilities are not DRY.** `shared/auth-helpers.js` has three near-identical authenticate functions (`authenticateWithToken`, `authenticateControllerRequest`, `authenticateWorkerRequest`) that differ only in which header they accept. The `paths.js` bootstrap is manually duplicated across 3 directories.

4. **No staging environment for the backend.** Every backend deploy goes straight to the production project. The extension has a real staging path; the backend does not.

5. **Post-deploy verification is partial.** Only the enrich functions have a smoke test. The main API, realtime SSE, and Firestore triggers have no automated post-deploy check.

6. **Version-drift detection covers half the fleet.** `check-deployed-versions.sh` only reports 3 of 7 functions.

