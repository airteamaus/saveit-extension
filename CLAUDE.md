# CLAUDE.md

SaveIt - Browser extension with async AI enrichment for bookmarks

**Stack**: Browser Extension (Firefox/Chrome), Cloud Functions, BigQuery, Firestore
**Repos**: `saveit-extension/` (this - public), `saveit-backend/` (sibling - private)
**Key flow**: User saves → Extension → Cloud Function → BigQuery → Cloud Tasks → Firestore

## Repository Structure

**Directories:**
- `src/` - Extension source (HTML, JS, CSS, assets)
- `scripts/` - Build and release scripts
- `docs/` - User-facing documentation
- `.github/workflows/` - Automated XPI build & release

**Related:** [docs/README.md](docs/README.md), [Backend CLAUDE.md](../saveit-backend/CLAUDE.md)

## Implementation Workflow

**CRITICAL: Never write code without explicit approval of the approach.**

1. **User requests feature** → Research options, document alternatives with trade-offs
2. **Present plan** → Show approach, provide pseudocode examples
3. **Wait for approval** → User says "ok, implement that" or "go ahead"
4. **Then implement** → Code, test in standalone mode, test as extension, update docs

### Warning Signs You're Moving Too Fast

- ❌ You see a TODO in code and immediately implement it
- ❌ User says "we need X" and you start coding X without discussing approach
- ❌ You're editing implementation files before discussing the approach

### Exceptions (OK to code without asking)

- Bug fixes that are clearly broken behavior
- User explicitly says "implement X" or "write the code for X"
- Continuing work on an already-approved implementation
- Small refactorings that don't change behavior

## Architectural Principles

**Backwards Compatibility:**
- ✗ No deprecated fields, dual schemas, or fallback logic
- ✓ Extension version matches backend API version
- ✓ Use explicit API versioning (`/v1/`, `/v2/`) for breaking changes
- ✓ Coordinated deployment: Backend deploys `/v2/` → Extension updates → Remove `/v1/`

**Design:**
- **KISS & YAGNI** - Simplest solution, implement only what's needed
- **Single Responsibility** - Each component has one purpose
- **Open-Closed** - Extend via composition, not modification
- **Dependency Inversion** - Depend on abstractions

**Dependencies:**
- Add only if they remove significant code or eliminate defect classes
- Must be widely used, actively maintained, permissively licensed
- Prefer browser APIs over external libraries

## Code Style

**Module Size:** <500 lines (MUST refactor >750)
**Error Handling:** Return errors over silent failures, provide context, never swallow errors

**Comments:** Explain WHY, not WHAT
```javascript
✓ // User info cached permanently to avoid OAuth popup on every save
✗ // Set the user email
✗ // TODO: Implement AI enrichment in Phase 2
```

**Fix code now or track in issue—don't leave TODO promises.**

## Documentation Guidelines

- Plain language, direct, factual
- ✗ NO superlatives ("amazing", "perfect", "incredible")
- ✗ NO bragging - state facts, not how great it is
- ✗ NO "finished" - everything is work in progress
- ✗ DO NOT create session summaries, timestamp-specific files, daily metrics
- ✓ DO update `README.md`, `docs/README.md`, `docs/DASHBOARD-README.md`, `CLAUDE.md`

## Working with Multiple Repositories

SaveIt uses TWO repos in `/Users/rich/Code/`: `saveit-extension/` (public), `saveit-backend/` (private)

**Use absolute paths when crossing repos:**
```bash
cd /Users/rich/Code/saveit-backend && ./scripts/deploy-function.sh
```

**Bash tool resets working directory after each command** - Chain with `&&` for sequential ops

**Before creating/moving files between repos:** Explain and ask for confirmation

## Architecture Overview

**Two-Mode Dashboard:**

| Mode | Protocol | Data Source | Use Case |
|------|----------|-------------|----------|
| Standalone | `file://` | Mock data | UI development |
| Extension | `moz-extension://` | Cloud Functions | Real data testing |

Mode auto-detected by `src/api.js` checking `typeof browser !== 'undefined'`

**Architecture Layers:**

*UI Layer (presentation):*
- `src/components.js` - Pure UI builders
- `src/newtab.js` - Main dashboard controller
- `src/graph.js` / `graph.html` - 3D knowledge graph (Three.js + GraphViz)

*Manager Layer (business logic):*
- `src/tag-manager.js` - Tag hierarchy & classification
- `src/search-manager.js` - Search & filtering
- `src/scroll-manager.js` - Infinite scroll & pagination
- `src/page-loader-manager.js` - Data fetching & loading states
- `src/event-manager.js` - Event coordination
- `src/stats-manager.js` - Statistics display
- `src/notification-manager.js` - Toast notifications
- `src/auth-ui.js` - Authentication UI

*Data Layer (API & storage):*
- `src/api.js` - API abstraction (mode auto-detection)
- `src/cache-manager.js` - Browser storage (user-isolated)
- `src/mock-data.js` - Test data (standalone mode only)
- `src/background.js` - Service worker (toolbar saves, OAuth)

**Key Flows:**

*Toolbar Save:*
1. User clicks toolbar → `background.js` → `browser.browserAction.onClicked`
2. Get cached user or trigger OAuth popup
3. POST to Cloud Function `/save`
4. Show success/error notification

*Dashboard Load:*
1. `newtab.js` checks auth state
2. `page-loader-manager.js` fetches via `api.js`
3. Managers render cards, tags, stats
4. Infinite scroll loads more on demand

*Graph Visualization:*
1. `graph.js` fetches from `/graph-data` API
2. GraphViz renders 3D force-directed graph (Three.js)
3. HUD panel shows node details + similar pages
4. Viewfinder minimap for navigation

**OAuth caching:** Permanent after first auth. Clear: `browser.storage.local.clear()`

See [backend docs/VISION.md](../saveit-backend/docs/VISION.md) for full architecture.

## Testing & Quality Assurance

**CRITICAL: Always write and run tests before committing!**

### Test Commands

See Tool Reference below for complete command listing.

### When to Write Tests

**ALWAYS test when:**
1. Fixing a bug (test fails before fix, passes after)
2. Adding new functions/components
3. Changing business logic
4. Modifying API contracts

**Coverage minimums:** Lines 70%, Functions 70%, Branches 65% (CI enforced)

### Test Structure

| Path | Type | Coverage |
|------|------|----------|
| `tests/unit/api.test.js` | Fast, isolated functions | 12 tests |
| `tests/unit/components.test.js` | Component rendering | 15 tests |
| `tests/integration/dashboard.test.js` | Multi-component flows | 13 tests |
| `tests/e2e/standalone.spec.js` | Real browser workflows | 10 scenarios |

### Schema Validation

```javascript
import { validatePages, validateSearchResponse } from './validators.js';

const pages = await API.getSavedPages();
const validPages = validatePages(pages);  // Filters invalid entries
```

Catches backend schema changes immediately.

### Git Hooks

**Pre-commit:** ESLint, web-ext lint, unit tests, warns on console.log
**Pre-push:** Version validation (tags match manifest.json), quick tests
**Bypass:** `git commit --no-verify` (use sparingly)

### CI/CD Pipeline

GitHub Actions (every PR/push): Lint → Tests with coverage → Build → E2E → Security audit
**Must pass before merge.**

### Environment Config

Auto-detects from extension version:

| Environment | Version Format | Backend URL | Error Reporting | Debug |
|-------------|----------------|-------------|-----------------|-------|
| Development | `file://` or localhost | Mock data | Disabled | On |
| Staging | `v0.14.0-beta.1` | `saveit-staging-xxx.run.app` | Slack | On |
| Production | `v0.14.0` | `saveit-xxx-uc.a.run.app` | Monitoring | Off |

**Deploy to staging:** `just deploy-staging 0.14.0` → Test 24-48h → `just bump minor && git push --tags`

**Docs:** `docs/TESTING.md`, `docs/QA-INFRASTRUCTURE.md`, `QA-SETUP-COMPLETE.md`

## Tool Reference

| Task | Command | Notes |
|------|---------|-------|
| **Development** |
| Show all tasks | `just` | Lists available commands |
| Preview standalone | `just preview` | Opens newtab.html in browser |
| Run in Firefox | `just run` | Auto-reload enabled (recommended) |
| Run in Chrome | `just run-chrome` | Chrome testing |
| Install in Firefox | `just install` | Persistent installation |
| Install dependencies | `just install-deps` | npm install + setup |
| **Building** |
| Build all bundles | `just build` | Firebase + graph-viz bundles |
| Build Firebase only | `just build-firebase` | Firebase SDK bundles |
| Build extension (Firefox) | `just build` | Requires AMO_JWT |
| Build extension (Chrome) | `just build-chrome` | Universal build |
| Build both browsers | `just build-all` | Firefox + Chrome |
| Watch Firebase bundles | `just watch-firebase` | Auto-rebuild on changes |
| Clean artifacts | `just clean` | Remove build outputs |
| **Testing** |
| Unit + integration | `just test` | <1s, coverage enforced |
| Watch mode | `just test-watch` | Auto-rerun on changes |
| Coverage report | `just test-coverage` | 70% minimum |
| E2E (headless) | `just test-e2e` | Firefox, ~30s |
| E2E (UI mode) | `just test-e2e-ui` | Interactive debugging |
| Test bundle build | `just test-build` | Verify Firebase bundles |
| Test CSP compliance | `just test-csp` | Check HTML for violations |
| **Quality Checks** |
| All checks | `just check` | lint + test + build + validate |
| CI simulation | `just ci-check` | Local GitHub Actions check |
| Lint extension | `just lint` | web-ext lint |
| Lint + fix | `just lint-fix` | Auto-fix issues |
| Lint JavaScript | `just lint-js` | ESLint only |
| Validate manifest | `just validate` | Check manifest.json |
| **Deployment** |
| Pre-deploy checklist | `just pre-deploy` | Comprehensive checks |
| Deploy to staging | `just deploy-staging VERSION` | Beta release |
| Deploy to prod | `just deploy-prod` | Promote staging |
| Bump version | `just bump [patch\|minor\|major]` | Update + tag |
| Setup git hooks | `just setup-hooks` | Install husky hooks |
| Clear Firefox cache | `just clear-cache` | Requires Firefox closed |
| **Documentation** |
| Generate changelog | `just changelog` | From conventional commits |
| Release notes | `just release-notes VERSION` | For specific version |

## Build Process

**Bundle generation:** Extension uses esbuild to bundle dependencies for browser compatibility.

**Bundles created** (in `src/bundles/`, gitignored):
1. `firebase-background.js` - Firebase SDK for service worker (101KB)
2. `firebase-dashboard.js` - Firebase SDK for dashboard (100KB)
3. `background-bundle.js` - Background script with polyfill (186KB)
4. `sentry-init.js` - Sentry error tracking (70KB, prod only)
5. `graph-viz.js` - Graph visualization library (1.5MB, includes Viewfinder + Three.js)
6. `browser-polyfill.min.js` - WebExtension API polyfill (10KB, copied from node_modules)
7. `*.js.map` - Source maps for debugging (~10MB total)

**Build commands:**
```bash
npm run build                    # Build all bundles + package extension
npm run build:graph              # Build graph-viz bundle only
node scripts/bundle-firebase.js  # Build Firebase bundles only
node scripts/bundle-graph.js     # Build graph-viz bundle only
```

**Build scripts:**
- `scripts/bundle-firebase.js` - Bundles Firebase SDK (esbuild, target: Firefox 115+, Chrome 120+)
- `scripts/bundle-graph.js` - Bundles graph-viz from `../saveit-backend/graph-viz/src/`

**Build configuration:**
- Tool: esbuild v0.27.0
- Source maps: Enabled (for debugging)
- Minify: Yes
- Tree shaking: Yes
- Format: ESM

**IMPORTANT:** Bundles are NOT committed to git (excluded via .gitignore). CI/CD builds them automatically.

**Development:**
```bash
# Fastest iteration (standalone mode)
just preview                    # Or: open src/newtab.html
# Edit src/newtab.css, src/newtab.js, src/components.js
# Refresh browser (Cmd+R)

# Extension mode (for OAuth, real data testing)
just run                        # RECOMMENDED - no caching issues
just install                    # Or: ./scripts/install-dev.sh

# Manual load: Firefox → about:debugging → "This Firefox" → "Load Temporary Add-on" → Select manifest.json
```

**Cache-Busting:**
Firefox caches extension files aggressively.
- **Recommended:** `just run` (web-ext loads from disk, auto-reloads)
- **Regular profile:** `just clear-cache` after closing Firefox, reload in about:debugging
- **Note:** Version bumps help but may not clear cache immediately

**Releasing:**
```bash
# IMPORTANT: Always use 'just bump' - never manual tags!

just setup-hooks                # First time: install git hooks

# Bump version (updates manifest.json, commits, creates tag):
just bump patch                 # 0.9.0 → 0.9.1 (bug fixes)
just bump minor                 # 0.9.0 → 0.10.0 (features)
just bump major                 # 0.9.0 → 1.0.0 (breaking)

git push origin main --tags     # Pre-push hook validates version

# GitHub Actions: Build → Sign with Mozilla → Create Release → Update updates.json
```

**Version Management:**
- Pre-push hook blocks tags that don't match manifest.json
- Always use `just bump [patch|minor|major]`
- Hook installed with `just setup-hooks` (required per machine)

## Configuration

**Extension config** (`src/config.js`):
```javascript
cloudFunctionUrl: 'https://saveit-xxx-uc.a.run.app'
oauthClientId: 'xxx.apps.googleusercontent.com'
```

**OAuth redirect URIs** (must match Google Cloud Console):
- Firefox: `https://<EXTENSION_ID>.extensions.allizom.org/` (ID: `saveit@airteam.com.au`)
- Chrome (Store): `https://emiieedcdenibjicjfoekllgakpgekdk.chromiumapp.org/`
- Chrome (Unpacked): `https://<generated-id>.chromiumapp.org/` (varies)

**Permissions:** `activeTab`, `notifications`, `identity`, `storage`, `https://*.run.app/*`, `https://www.googleapis.com/*`

**Features:**
- Knowledge graph: `src/graph.html` (3D visualization, Neo4j-powered)
- Error tracking: Sentry (production only, auto-configured from environment)

**Cross-Browser Manifest:**
- `manifest.json` includes both `service_worker` (Chrome) and `scripts` (Firefox)
- Chrome uses `service_worker`, warns about `scripts` (harmless)
- Firefox uses `scripts`, ignores `service_worker`
- Single manifest for both browsers

## Important Notes

- Firebase SDK bundled via esbuild (`scripts/bundle-firebase.js`)
- webextension-polyfill for cross-browser compatibility
- Zero-config standalone mode: open `src/newtab.html` (uses mock data)
- Client-side filtering for instant feedback
- Auto-updates via `updates.json`

## Security

- OAuth scopes: `openid email profile` (minimal)
- No API keys in extension
- Cloud Function URL obscurity provides basic security
- Local storage: user email/name only (revocable via Google Account)

## See Also

- [README.md](README.md) - Quick start
- [docs/README.md](docs/README.md) - Installation & usage
- [docs/DASHBOARD-README.md](docs/DASHBOARD-README.md) - Dashboard development
- Backend: `/Users/rich/Code/saveit-backend/`
