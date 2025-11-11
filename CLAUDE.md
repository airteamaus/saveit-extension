# CLAUDE.md

Guidance for Claude Code when working with this repository.

## Repository Structure

SaveIt is split into two repositories in `/Users/rich/Code/`:

- **saveit-extension/** (this repo - PUBLIC) - Browser extension, dashboard UI, GitHub Actions
- **saveit-backend/** (sibling repo - PRIVATE) - Cloud Functions, BigQuery schemas, deployment scripts

Key directories:
- `src/` - Extension source code (HTML, JS, CSS, assets)
- `scripts/` - Build and release scripts
- `docs/` - User-facing documentation
- `.github/workflows/` - Automated XPI build & release

See also: [docs/README.md](docs/README.md), [Backend CLAUDE.md](../saveit-backend/CLAUDE.md)

## Implementation Workflow

**CRITICAL: Never write code without explicit approval of the approach.**

1. **User requests a feature** → Research options, document alternatives with trade-offs
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

**No backwards compatibility or legacy shims.** Preserve external APIs; break them only with explicit, tested migrations.

**KISS & YAGNI:**
- Start with the simplest solution that works
- Implement only what's currently needed
- Avoid over-engineering and speculative features

**SOLID:**
- **Single Responsibility** - Each component has one clear purpose
- **Open-Closed** - Extend via composition, not modification
- **Dependency Inversion** - Depend on abstractions, not concrete implementations

**Dependencies:**
- Add only if they remove significant code or eliminate known defect classes
- Must be widely used, actively maintained, and permissively licensed
- Prefer browser APIs over external libraries

## Code Style

**Module Size:**
- Files should be <500 lines
- Files >750 lines MUST be refactored

**Error Handling:**
- Prefer returning errors over silent failures
- Provide actionable error context
- Never swallow errors without logging

**Comments:**

Explain WHY, not WHAT. Comments that restate obvious code add cognitive load.

✅ Good (explain reasoning):
```javascript
// User info cached permanently to avoid OAuth popup on every save
// Extension ID must match OAuth redirect URI in Google Cloud Console
// Mode detection fails in standalone if browser API not available
```

❌ Bad (restate obvious):
```javascript
// Set the user email
// Call the API
// Return the result
```

❌ Never promise future work in comments:
```javascript
// TODO: Implement AI enrichment in Phase 2
// This will be replaced when we refactor the dashboard
// Temporary workaround until we implement proper caching
```

**If code needs improvement, either fix it now or track it in an issue/doc—don't leave promises in comments.**

## Documentation Guidelines

**Writing Style:**
- Use plain language, be direct and factual
- **NO superlatives** - Avoid "amazing", "perfect", "incredible", "best"
- **NO bragging** - State what exists, not how great it is
- **Nothing is ever "finished"** - Everything is a work in progress

**DO NOT create:**
- Session summaries or daily progress reports
- Timestamp-specific status files
- Metrics that change daily
- Anything outdated the moment it's written

**DO update:**
- `README.md` - Quick start guide
- `docs/README.md` - User-facing installation and usage guide
- `docs/DASHBOARD-README.md` - Dashboard development guide
- `CLAUDE.md` - Commands, architecture, current state

## Working with Multiple Repositories

SaveIt uses TWO separate git repositories in the same parent directory.

**Use absolute paths when crossing repos:**
```bash
# Good - explicit paths
cd /Users/rich/Code/saveit-backend && ./scripts/deploy-function.sh

# Bad - relative paths can be confusing
cd ../saveit-backend && ./scripts/deploy-function.sh
```

**The Bash tool resets working directory after each command:**
- Each Bash call starts in the original working directory
- Chain commands with `&&` if they must run in sequence
- Always verify which repo you're working in

**Repository-specific files:**
- Extension: `src/`, `manifest.json`, `docs/`, `justfile`
- Backend: `cloud-function/`, `contracts/`, `scripts/`, `.env`, `justfile`

**Before creating or moving files between repos:**
- Explain what you're doing and why
- Ask for confirmation if it affects project structure
- Verify changes in the correct repository

## Architecture Overview

**Two-Mode Dashboard:**
1. **Standalone Mode** (`file://` protocol) - Loads mock data, perfect for UI development
2. **Extension Mode** (`moz-extension://` protocol) - Calls Cloud Function endpoints

Mode is auto-detected by `src/api.js` checking `typeof browser !== 'undefined'`

**Component Pattern:**
- `src/components.js` - Pure UI builders (no business logic)
- `src/newtab.js` - Controller (handles search, filter, delete logic)
- `src/api.js` - API abstraction layer (auto-detects mode)
- `src/mock-data.js` - Test data (standalone mode only)

**Save Flow:**
1. User clicks toolbar icon → `browser.browserAction.onClicked` fires
2. Get user info from cache or OAuth flow
3. POST pageData to Cloud Function
4. Show notification on success/failure

**OAuth caching:** User info cached permanently after first auth. Clear with `browser.storage.local.clear()`.

See backend's [docs/VISION.md](../saveit-backend/docs/VISION.md) for detailed architecture.

## Testing & Quality Assurance

**CRITICAL: This project has comprehensive QA infrastructure. Always write and run tests!**

### Quick Testing Commands

```bash
# Run tests (ALWAYS do this before committing)
just test               # Unit + integration tests (fast, <1s)
just test-watch         # Watch mode - auto-reruns on changes
just test-coverage      # Coverage report (70% minimum enforced)
just test-e2e           # End-to-end tests in Firefox (~30s)
just test-e2e-ui        # E2E tests in interactive UI mode

# Quality checks
just check              # All checks: lint + test + build + validate
just ci-check           # Simulate GitHub Actions locally
just pre-deploy         # Full pre-deployment checklist (use before releases)
```

### When to Write Tests

**ALWAYS write tests when:**
1. Fixing a bug (test should fail before fix, pass after)
2. Adding new functions or components
3. Changing business logic
4. Modifying API contracts

**Test Coverage Requirements:**
- Lines: 70% minimum
- Functions: 70% minimum
- Branches: 65% minimum
- **CI will fail** if coverage drops below thresholds

### Test Structure

```
tests/
├── unit/               # Fast, isolated function tests
│   ├── api.test.js     # API module (12 tests)
│   └── components.test.js  # Components module (15 tests)
├── integration/        # Components working together
│   └── dashboard.test.js   # Dashboard flows (13 tests)
└── e2e/               # Full user workflows in real browser
    └── standalone.spec.js  # 10 scenarios covering core features
```

### Schema Validation

**Use Zod validators for all API responses:**

```javascript
import { validatePages, validateSearchResponse } from './validators.js';

// Validate API response (filters out invalid entries)
const pages = await API.getSavedPages();
const validPages = validatePages(pages);  // Removes malformed data

// Throws on invalid schema
const searchResults = validateSearchResponse(data);
```

**Why:** Catches backend schema changes immediately, prevents runtime errors from malformed data.

### Error Reporting

**Use structured error reporting:**

```javascript
import { reportError } from './error-reporter.js';

try {
  await riskyOperation();
} catch (error) {
  reportError(error, {
    context: 'user_action',
    user: getCurrentUser(),
    action: 'save_page'
  });
  showUserFriendlyMessage(error);
}
```

**Environments:**
- Development: Logs to console only
- Staging (beta versions): Sends to Slack/error tracker
- Production: Sends to monitoring service (ready for Sentry integration)

### Git Hooks (Automatic Quality Gates)

**Pre-commit:** (runs automatically on `git commit`)
- ✓ ESLint + web-ext lint
- ✓ Unit + integration tests
- ⚠️ Warns about console.log statements

**Pre-push:** (runs automatically on `git push`)
- ✓ Version validation (tags must match manifest.json)
- ✓ Quick test suite

**Bypass (NOT recommended):**
```bash
git commit --no-verify  # Skip hooks (use sparingly!)
```

### CI/CD Pipeline

**GitHub Actions runs on every PR/push:**
1. Lint & validate manifests
2. Unit + integration tests with coverage
3. Build verification
4. E2E tests in Firefox
5. Security audit (npm audit)

**Status:** Must pass before merging to main

### Environment-Specific Configuration

Config auto-detects environment from extension version:

```javascript
// Development (file:// protocol or localhost)
- Uses mock data
- Debug logging enabled
- Error reporting disabled

// Staging (version contains 'beta', e.g., v0.14.0-beta.1)
- Real backend: https://saveit-staging-xxx.run.app
- Error reporting to Slack
- Debug logging enabled

// Production (normal releases, e.g., v0.14.0)
- Real backend: https://saveit-xxx-uc.a.run.app
- Error reporting to monitoring service
- Debug logging disabled
```

**Deploy to staging:**
```bash
just deploy-staging 0.14.0  # Creates v0.14.0-beta.1
# Test for 24-48 hours with real backend
# If stable, promote to production:
just bump minor
git push origin main --tags
```

### Documentation

- **Full testing guide:** `docs/TESTING.md`
- **QA infrastructure:** `docs/QA-INFRASTRUCTURE.md`
- **Quick start:** `QA-SETUP-COMPLETE.md`

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
just run                        # Or: ./scripts/run-extension.sh (RECOMMENDED - no caching issues)
just install                    # Or: ./scripts/install-dev.sh

# Manual load:
# 1. Open Firefox → about:debugging
# 2. Click "This Firefox" → "Load Temporary Add-on"
# 3. Select manifest.json
```

**Cache-Busting:**
Firefox aggressively caches extension files even after reinstall. Solutions:
- **Recommended**: Use `just run` for active development (web-ext loads files directly from disk, auto-reloads on changes)
- **When using regular Firefox profile**: Run `just clear-cache` after closing Firefox, then reload extension in about:debugging
- **Note**: Version bumps (`just bump patch`) help but may not always clear cache immediately

**Releasing:**
```bash
# IMPORTANT: Always use 'just bump' - never manually create version tags!

# First time setup (installs git pre-push hook):
just setup-hooks                # Validates tags match manifest.json

# Bump version (updates manifest.json, commits, creates tag):
just bump patch                 # 0.9.0 → 0.9.1 (bug fixes)
just bump minor                 # 0.9.0 → 0.10.0 (new features)
just bump major                 # 0.9.0 → 1.0.0 (breaking changes)

# Push to trigger release:
git push origin main --tags     # Pre-push hook validates version matches

# GitHub Actions will:
# - Build and sign extension with Mozilla (using AMO_JWT secrets)
# - Create GitHub Release with signed XPI
# - Update updates.json for auto-updates
```

**Version Management:**
- Pre-push hook prevents pushing tags that don't match manifest.json version
- Always use `just bump [patch|minor|major]` instead of manual `git tag`
- Hook installed with `just setup-hooks` (required on new machine/clone)
- Hook blocks push with helpful error message if versions mismatch

## Configuration

**Extension config** (`src/config.js`):
```javascript
cloudFunctionUrl: 'https://saveit-xxx-uc.a.run.app'
oauthClientId: 'xxx.apps.googleusercontent.com'
```

**OAuth redirect URI:** Must match in Google Cloud Console:
- Pattern: `https://<EXTENSION_ID>.extensions.allizom.org/`
- Extension ID: `saveit@airteam.com.au` (from `manifest.json`)

**Permissions:**
- `activeTab` - Read current page URL/title
- `notifications` - Show save confirmations
- `identity` - OAuth authentication
- `storage` - Cache user info
- `https://*.run.app/*` - Cloud Function access
- `https://www.googleapis.com/oauth2/*` - Google OAuth

## Important Notes

- **No build process** - Extension uses vanilla JS, no transpilation or bundling
- **No npm dependencies** - Only browser APIs (Web Extensions API)
- **Zero-config standalone mode** - Just open `src/newtab.html` in any browser
- **Client-side filtering** - Search/filter happens in browser for instant feedback
- **Auto-updates enabled** - Extension checks `updates.json` for new versions

## Security

- OAuth scopes: `openid email profile` (minimal)
- User can revoke OAuth access via Google Account settings
- No API keys stored in extension
- Cloud Function URL obscurity provides basic security
- No sensitive data stored locally except user email/name

## See Also

- [README.md](README.md) - Quick start guide
- [docs/README.md](docs/README.md) - User-facing installation and usage
- [docs/DASHBOARD-README.md](docs/DASHBOARD-README.md) - Dashboard development
- Backend repo: `/Users/rich/Code/saveit-backend/`
