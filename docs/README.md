# SaveIt Browser Extension

Cross-browser extension (Firefox + Chromium) for saving pages to the backend via Cloud Function. User-facing name: **Buckley's Bookmarks**.

## Project collections

The new tab includes project collections so saved pages can be grouped without changing the default chronological feed.

- Create projects from the new-tab sidebar
- Add a saved page to one or more projects from the page card
- Toggle a project between private and company-shared from the new tab
- Archive projects when they are no longer active

## Files

- `manifest.json` - Extension metadata and permissions (manifest v3)
- `src/config.js` - Environment-detected configuration (Cloud Function URL, OAuth client ID, error reporting). Values are baked in per environment; contributors do not edit this for local dev.
- `src/background.js` - Service worker: toolbar save, message handling, bookmark mirror, alarms
- `src/toolbar-popup.js` - Toolbar popup UI
- `src/newtab.js` / `src/newtab.html` - New-tab override page
- `src/icon-{16,32,48,128}.png` - Extension icons (per-density)

## Setup

The extension ships with environment-aware config (`src/config.js` detects dev/staging/production automatically), so there are no secrets to fill in. To load it locally:

1. Load in Firefox: `about:debugging` → Load Temporary Add-on → Select `manifest.json`
2. Or load unpacked in Chrome/Brave dev mode (see `AGENTS.md` → "Local development setup")

## How it works

1. User clicks the toolbar button, which opens the popup
2. First time: Google OAuth via `identity.launchWebAuthFlow`; the backend issues a session token stored under `saveit_session` in `browser.storage.local`
3. Extension POSTs the captured page data to the Cloud Function (Bearer session token)
4. Cloud Function writes to BigQuery; async enrichment follows
5. User sees a success notification and badge feedback

## Data & sync

Import, export, and browser-bookmark sync live in one modal (avatar menu → "Data & sync"):

- **Import** — bring bookmarks in from this browser, a Raindrop CSV, a browser bookmarks HTML file, or a Buckley's JSON backup. File parsing is in `src/bookmark-import.js` (pure); the bulk-import API carries notes/tags/created date through `client_payload` for full-fidelity imports.
- **Export** — download all saved pages as CSV (Raindrop-compatible), JSON (full backup), or HTML (browser-importable). Serialization is in `src/bookmark-export.js` (pure); export pages through the existing `getSavedPages` read, so no backend endpoint is needed.
- **Browser sync** — a one-way, continuous rendering of saved pages into a `Buckley's/` folder in the browser's native bookmarks (`src/bookmark-mirror.js`). Turning it off removes the folder and clears mirror state.

## Development

### Debug

Browser Console: `Cmd+Shift+J`. Service worker logs via its own DevTools (`about:debugging` → Inspect).

### View session

```javascript
browser.storage.local.get(['saveit_session'])
```

### Logout

```javascript
logout()
```

## Permissions

- `activeTab` - Read current page URL/title
- `scripting` - Inject page-capture script
- `bookmarks` - Bookmark mirror
- `alarms` - Periodic mirror reconcile
- `notifications` - Save confirmations
- `identity` - Google OAuth via `launchWebAuthFlow`
- `storage` - Cache and session token
- Network access to the Cloud Function origins (host permissions)

## Dependencies

Runtime deps are bundled at build time (esbuild): `webextension-polyfill`, Sentry, and Readability (for page capture). Run `just build-bundles` (or `npm run build`) to produce `src/bundles/*.js` before loading the extension.
