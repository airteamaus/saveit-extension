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
| Extension | `moz-extension://` | Cloud Functions | Real data and auth flows |

Mode detection is handled in `src/api.js`.

### Important surfaces

- `src/newtab.js` - main new-tab UI, favorites, saved pages drawer
- `src/project-manager.js` - project navigation and membership editing
- `src/search-results.js` - semantic search page
- `src/api.js` / `src/api-pages.js` - API layer
- `src/cache-manager.js` - browser storage cache
- `src/warm-cache-list-store.js` - local-first paginated list syncing
- `src/background.js` - toolbar save and auth integration

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
| Build Firebase bundles | `just build-firebase` |
| Watch Firebase bundles | `just watch-firebase` |
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
| Validate manifest | `just validate` |
| Full local check | `just check` |
| CI simulation | `just ci-check` |

### Release and maintenance

| Task | Command |
|---|---|
| Pre-deploy checks | `just pre-deploy` |
| Deploy staging | `just deploy-staging VERSION` |
| Deploy production | `just deploy-prod` |
| Bump version and tag | `just bump [patch\|minor\|major]` |
| Setup git hooks | `just setup-hooks` |
| Clear Firefox cache | `just clear-cache` |
| Generate changelog | `just changelog` |
| Release notes | `just release-notes VERSION` |

## Build and release notes

- Bundles are built with `scripts/bundle-firebase.js`.
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
