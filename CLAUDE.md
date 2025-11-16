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

**Component Pattern:**
- `src/components.js` - Pure UI builders (no business logic)
- `src/newtab.js` - Controller (search, filter, delete logic)
- `src/api.js` - API abstraction (auto-detects mode)
- `src/mock-data.js` - Test data (standalone only)

**Save Flow:**
1. User clicks toolbar → `browser.browserAction.onClicked`
2. Get user info from cache or OAuth
3. POST to Cloud Function
4. Show notification

**OAuth caching:** Permanent after first auth. Clear: `browser.storage.local.clear()`

See [backend docs/VISION.md](../saveit-backend/docs/VISION.md) for full architecture.

## Testing & Quality Assurance

**CRITICAL: Always write and run tests before committing!**

### Quick Commands

```bash
just test               # Unit + integration (<1s)
just test-watch         # Auto-rerun on changes
just test-coverage      # 70% minimum enforced
just test-e2e           # E2E in Firefox (~30s)
just check              # All checks: lint + test + build + validate
just ci-check           # Simulate GitHub Actions
just pre-deploy         # Full pre-deployment checklist
```

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

### Error Reporting

```javascript
import { reportError } from './error-reporter.js';

try {
  await riskyOperation();
} catch (error) {
  reportError(error, { context: 'user_action', action: 'save_page' });
  showUserFriendlyMessage(error);
}
```

**Environments:** Development (console only), Staging (Slack), Production (monitoring)

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

## Quick Reference

**Task runner:**
```bash
just                # Show all tasks
just preview        # Open standalone dashboard
just run            # Run in Firefox with auto-reload
just install        # Install persistently in Firefox
just lint           # Lint extension
just test           # Run unit + integration tests
just check          # Run all checks (lint + test + validate + build)
just pre-deploy     # Full pre-deployment checklist
just bump patch     # Bump version and create git tag
```

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
