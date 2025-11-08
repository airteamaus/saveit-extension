# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with the SaveIt browser extension.

## Repository Structure

**SaveIt is split into two repositories:**

1. **saveit-extension/** (this repo - PUBLIC)
   - Firefox browser extension
   - Dashboard UI (newtab override)
   - GitHub Actions for automatic XPI releases
   - Public documentation

2. **saveit-backend/** (sibling repo - PRIVATE)
   - Cloud Functions (save & enrichment endpoints)
   - BigQuery schema validation contracts
   - Deployment and migration scripts
   - Backend documentation

**Directory structure:**

```
Code/
├── saveit-extension/      # This repo (PUBLIC)
│   ├── manifest.json      # Extension metadata and permissions
│   ├── background.js      # Save button logic & OAuth
│   ├── newtab.html        # Dashboard HTML structure
│   ├── newtab.js          # Dashboard controller (search, filter, delete)
│   ├── newtab.css         # Dashboard styles
│   ├── api.js             # API abstraction layer (auto-detects mode)
│   ├── components.js      # UI component builders (cards, empty states)
│   ├── config.js          # Cloud Function URL & OAuth client ID
│   ├── mock-data.js       # Test data for standalone mode
│   ├── icon.png           # Extension icon (48x48px)
│   ├── CLAUDE.md          # This file
│   ├── README.md          # User-facing documentation
│   ├── DASHBOARD-README.md # Dashboard development guide
│   ├── package.json       # npm dependencies (web-ext only)
│   ├── build-and-sign.sh  # Manual build script
│   ├── install-dev.sh     # Install in Firefox Developer Edition
│   ├── run-extension.sh   # Launch with web-ext run
│   └── .github/workflows/
│       └── release.yml    # Automated XPI build & release
│
└── saveit-backend/        # Sibling repo (PRIVATE)
    ├── cloud-function/    # Save & GET endpoints
    ├── cloud-function-enrich/ # Enrichment pipeline
    ├── contracts/         # BigQuery schema validation
    └── scripts/           # Deployment and migration scripts
```

## Working with Multiple Repositories

**IMPORTANT:** SaveIt is split into TWO repositories in the same parent directory:

1. **saveit-extension/** (this repo - PUBLIC)
   - Location: `/Users/rich/Code/saveit-extension`
   - Contains: Browser extension code, dashboard UI, GitHub Actions
   - Git repo: Separate `.git` directory

2. **saveit-backend/** (sibling repo - PRIVATE)
   - Location: `/Users/rich/Code/saveit-backend`
   - Contains: Cloud Functions, BigQuery schemas, deployment scripts
   - Git repo: Separate `.git` directory

**Working across repositories:**

1. **Use absolute paths when crossing repos:**
   ```bash
   # Good - explicit paths
   cd /Users/rich/Code/saveit-backend && ./scripts/deploy-function.sh

   # Bad - relative paths can be confusing
   cd ../saveit-backend && ./scripts/deploy-function.sh
   ```

2. **The Bash tool resets working directory after each command:**
   - Each Bash call starts in the original working directory
   - Chain commands with `&&` if they must run in sequence
   - Always verify which repo you're working in

3. **Repository-specific files:**
   - Extension: `manifest.json`, `newtab.html`, `background.js`, `config.js`
   - Backend: `cloud-function/`, `contracts/`, `scripts/`, `.env`

4. **Before creating or moving files between repos:**
   - Explain what you're doing and why
   - Ask for confirmation if it affects project structure
   - Verify changes in the correct repository

## Documentation Guidelines

**Write clearly and simply:**
- Use plain language, avoid jargon when possible
- Be direct and factual
- **NO superlatives** - Avoid words like "amazing", "perfect", "incredible", "best"
- **NO bragging** - State what exists, not how great it is
- **Everything is a work in progress** - Nothing is ever "finished" or "complete"

**DO NOT create:**
- Session summaries or daily progress reports
- Timestamp-specific status files
- Metrics that change daily
- Anything that's outdated the moment it's written

**DO update:**
- README.md - User-facing installation and usage guide
- DASHBOARD-README.md - Dashboard development guide
- CLAUDE.md - Commands, architecture, current state

## Project Overview

SaveIt is a Firefox browser extension that saves web pages to Google BigQuery with an intelligent dashboard for rediscovery.

**This repository (saveit-extension) contains:**
1. **Browser Extension**: One-click save + New Tab dashboard with search/filter
2. **GitHub Actions** (`.github/workflows/release.yml`): Auto-build and sign XPI on release tags
3. **Public documentation**: Installation and usage guides
4. **Extension code**: `manifest.json`, `background.js`, `newtab.html`, `api.js`, `components.js`

**Backend repository (saveit-backend) contains:**
1. **Cloud Functions**: Serverless Node.js backend with ELT pipeline
2. **BigQuery schemas**: Table definitions and validation
3. **Deployment scripts**: Infrastructure setup and deployment

**Key architecture decision**: ELT pipeline with raw event log → async enrichment → enriched snapshots. Raw data is append-only, enriched data is materialized views. Credentials never stored in browser.

**Current state:**
- ✅ Dashboard UI complete and functional with mock data
- ✅ ELT architecture fully implemented (backend)
- ✅ Save endpoint writes to save_events table (backend)
- ✅ Enrichment function working (backend)
- ✅ GitHub Actions workflow for automated releases
- ⚠️ Dashboard not connected to things table yet (shows mock data)
- ⚠️ Cloud Scheduler not setup (manual enrichment trigger)

## Common Commands

### Development

```bash
# Install dependencies
npm install

# Load extension in Firefox for testing
./install-dev.sh   # Installs in Firefox Developer Edition

# Or manually load:
# 1. Open Firefox
# 2. Go to about:debugging
# 3. Click "This Firefox"
# 4. Click "Load Temporary Add-on"
# 5. Select manifest.json

# Run with web-ext (auto-reload on file changes)
./run-extension.sh

# Or directly:
npx web-ext run --firefox-profile=../saveit-backend/firefox-dev-profile
```

### Standalone Dashboard Development

**Fastest iteration (no extension reload needed):**
```bash
# 1. Open standalone dashboard in browser
open newtab.html

# 2. Edit newtab.css, components.js, or newtab.js
# 3. Refresh browser (Cmd+R)
# 4. See changes instantly!
```

**When to load as extension:**
- Testing OAuth flow
- Testing real BigQuery data (after GET endpoint implemented)
- Testing extension-specific features (storage, notifications)

### Building and Signing

```bash
# Manual build and sign (requires AMO_JWT credentials in environment)
./build-and-sign.sh

# Or directly:
npx web-ext sign \
  --source-dir=. \
  --channel=unlisted \
  --api-key="$AMO_JWT_ISSUER" \
  --api-secret="$AMO_JWT_SECRET"
```

### Releasing a New Version

```bash
# 1. Update version in manifest.json
# 2. Commit changes
git add manifest.json
git commit -m "Bump version to x.y.z"

# 3. Create and push tag (triggers GitHub Action)
git tag v0.5.1
git push origin main --tags

# GitHub Actions will automatically:
# - Install dependencies
# - Build and sign extension with Mozilla (using AMO_JWT secrets)
# - Create GitHub Release with signed XPI
# - Update updates.json for auto-updates
```

**GitHub Secrets Required:**
- `AMO_JWT_ISSUER`: Mozilla Add-ons JWT Issuer (from addons.mozilla.org)
- `AMO_JWT_SECRET`: Mozilla Add-ons JWT Secret (from addons.mozilla.org)
- `GITHUB_TOKEN`: Automatically provided by GitHub Actions

## Architecture

### Two-Mode Dashboard

The dashboard (`newtab.html`) operates in **two modes automatically**:

1. **Standalone Mode** (`file://` protocol):
   - Loads `mock-data.js` (12 sample pages)
   - Perfect for UI development without backend
   - Detected by `api.js` checking `typeof browser !== 'undefined'`

2. **Extension Mode** (`moz-extension://` protocol):
   - Calls Cloud Function endpoints
   - Currently shows mock data from Cloud Function
   - Falls back to default user if not authenticated
   - Mode indicator in footer shows current mode

**Critical files:**
- `api.js`: API abstraction layer that auto-detects mode
- `components.js`: Pure UI builders (cards, empty states, etc.)
- `newtab.js`: Dashboard controller (search, filter, delete logic)
- `mock-data.js`: Test data (only used in standalone mode)

**Flow:**
```
User opens new tab
  → newtab.html loads
  → api.js detects mode (standalone vs extension)
  → newtab.js calls API.getSavedPages()
  → If standalone: Returns MOCK_DATA
  → If extension: Fetches from Cloud Function
  → components.js renders cards
```

### Save Flow (background.js)

```
User clicks toolbar icon
  → browser.browserAction.onClicked fires
  → getUserInfo() checks browser.storage.local cache
  → If not cached:
      → Launch OAuth flow (browser.identity.launchWebAuthFlow)
      → Get access token from Google
      → Fetch user info (email, name) from googleapis.com/oauth2/v2/userinfo
      → Cache in browser.storage.local
  → Prepare pageData (url, title, timestamp, user_email, user_name)
  → POST to Cloud Function
  → Show notification on success/failure
```

**Important:** User info cached permanently after first OAuth. Clear with `browser.storage.local.clear()`.

### Component Pattern

Components are **pure UI builders** - no business logic:
```javascript
// components.js
Components.savedPageCard(page) {
  // Returns DOM element
  // Handles: escaping, truncation, date formatting
  // Does NOT: fetch data, handle clicks
}

// newtab.js (controller)
const card = Components.savedPageCard(page);
container.appendChild(card);
// Controller handles click events via event delegation
```

## Configuration

**Extension config** (`config.js`):
```javascript
cloudFunctionUrl: 'https://saveit-xxx-uc.a.run.app'
oauthClientId: 'xxx.apps.googleusercontent.com'
```

**OAuth redirect URI:** Must be configured in Google Cloud Console:
- Pattern: `https://<EXTENSION_ID>.extensions.allizom.org/`
- Extension ID: `saveit@airteam.com.au` (from `manifest.json`)

## Permissions

- `activeTab` - Read current page URL/title
- `notifications` - Show save confirmations
- `identity` - OAuth authentication
- `storage` - Cache user info
- `https://*.cloudfunctions.net/*` - Cloud Function access (old)
- `https://*.run.app/*` - Cloud Function access (new)
- `https://www.googleapis.com/oauth2/*` - Google OAuth
- `<all_urls>` - Required for activeTab to work

## Important Notes

- **No build process**: Extension uses vanilla JS, no transpilation or bundling
- **No npm dependencies in extension**: Only browser APIs (Web Extensions API)
- **Zero-config standalone mode**: Just open newtab.html in any browser
- **Client-side filtering**: Search/filter happens in browser for instant feedback
- **Auto-updates enabled**: Extension checks `updates.json` for new versions

## Development Status

**Completed:**
- ✅ Dashboard UI (cards, search, filter, sort, responsive)
- ✅ Standalone mode with 12 mock pages
- ✅ Extension manifest with newtab override
- ✅ Component-based architecture
- ✅ Save flow with OAuth caching
- ✅ GitHub Actions workflow for automated releases

**Next Steps:**
1. Connect dashboard to backend (read from things table)
2. Implement DELETE functionality (soft delete in things)
3. Implement PATCH functionality (update user_notes, manual_tags)
4. Add error handling for failed saves
5. Improve loading states and empty states

**Phase 2 (Post-MVP):**
- Enhanced metadata display (og:image thumbnails, reading time)
- AI enrichment display (summaries, Dewey Decimal tags)
- Semantic search with embeddings
- Team/sharing features

## Security

- Extension OAuth scopes: `openid email profile` (minimal)
- User can revoke OAuth access via Google Account settings
- No API keys stored in extension
- Cloud Function URL obscurity provides basic security
- No sensitive data stored locally except user email/name
