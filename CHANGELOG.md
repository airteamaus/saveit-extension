# Changelog

All notable changes to the SaveIt extension will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.4.3] - 2025-11-22

No notable changes.

## [1.4.2] - 2025-11-22

No notable changes.

## [1.4.1] - 2025-11-22

No notable changes.

## [1.4.0] - 2025-11-21

No notable changes.

## [1.3.7] - 2025-11-21

No notable changes.

## [1.3.6] - 2025-11-21

### 🐛 Bug Fixes

- add debug output to backend cleanup step (e61f25b)

## [1.3.5] - 2025-11-21

No notable changes.

## [1.3.4] - 2025-11-21

No notable changes.

## [1.3.3] - 2025-11-21

### 🐛 Bug Fixes

- use glob patterns to properly exclude backend files from validation (37d1ec6)
- use .web-ext-ignore instead of command-line ignore flags (20de54f)

## [1.3.2] - 2025-11-21

### ✨ Features

- integrate similar pages and clickable navigation in knowledge graph (187046b)
- **build:** enable source maps and fix CI bundle generation (399d274)
- add Sentry error tracking to browser extension (ebae714)
- **nav:** add knowledge graph button to newtab header (c2b27ed)
- **graph:** add knowledge graph page with HUD and node info panel (5caf776)
- **build:** add graph-viz bundling for extension (b94f5f9)
- **tags:** show full hierarchical context when clicking any tag (213ad7d)
- **tags:** enable tag clicks in search results and show hierarchical child tags (865898b)
- **chrome:** add Chrome Web Store upload automation (31518fc)
- **onboarding:** add welcome state for first-time users (d405619)
- **validators:** accept composite thing IDs for duplicate prevention (bf25f30)
- add badge feedback and clickable logo (45ad871)
- **release:** add automated release notes generation from conventional commits (0163310)
- **ui:** swap metadata and delete button positions (05a9ed6)
- improve About dialog with thoughtful messaging (c425a34)
- remove top-level 'All' breadcrumb from navigation (7ddde66)
- add infinite scroll for saved pages dashboard (16c9f5b)
- add account picker on sign-in and build date display (ba2cbbe)
- make breadcrumbs clickable and fix husky hooks (d449d78)
- add tag bar component with breadcrumb navigation (fced774)
- **ci:** add Chrome extension build to release workflow (017fdfd)
- **chrome:** add persistent extension ID for OAuth (8433d67)
- **manifest:** add hybrid manifest support for Chrome and Firefox (a4c04e2)
- **build:** bundle background.js with polyfill for Chrome service worker (4cc61b3)
- **build:** add Chrome build tasks to justfile (e1d8f7b)
- **build:** add Chrome 120 target to Firebase bundles (865d49b)
- **extension:** add webextension-polyfill to build (0a91e8f)
- **deps:** add webextension-polyfill for Chrome support (e5cd1fa)
- implement Firebase Authentication with local bundles (0f7c100)
- add clear-cache command to help with Firefox caching issues (a75e80d)
- **dashboard:** add version number and fix logged-out state (419de34)
- **auth:** add sign-in button and user profile indicator (59bd863)
- **auth:** migrate to Firebase Authentication with manifest v3 (616fddf)
- **dashboard:** change title tag to 'new tab' (9568aa3)
- **ui:** replace sort dropdown with theme toggle (d229d6a)
- **performance:** add client-side caching for instant dashboard loads (94d9fd3)
- **notifications:** improve error handling with user-friendly messages (9826e14)
- **discovery:** add semantic tag discovery with click-to-explore (0e7ebf3)
- **ui:** display multi-level classification tags with visual hierarchy (3c0f49d)
- **dashboard:** improve delete UX and expand search (4a86749)
- **api:** update to method-based routing and add delete support (70f7c97)
- **tooling:** add pre-push hook to prevent version tag mismatches (b85ac5c)
- **mock:** add AI-enriched fields to mock data (fc8aa5a)
- replace large thumbnails with favicons next to titles (b515d1c)
- add automatic update support (a0057a8)

### 🐛 Bug Fixes

- exclude backend repo and build artifacts from web-ext validation (8cba3d6)
- remove pkill command from E2E test script to prevent CI/CD exit code 143 (33334dd)
- exclude non-extension code from web-ext lint (d4f49a0)
- use webfactory/ssh-agent for SSH key handling (0a59718)
- correct saveit-backend checkout path for CI workspace (abcb9a7)
- include ForceGraph3D in bundle (669ac84)
- include Viewfinder in main bundle to avoid duplicate Three.js (63bdbf4)
- bundle Three.js for extension CSP compliance (f3e708f)
- improve logged-out state handling and sign-in UX (7037329)
- clean up console.log spam in newtab and add favicon (6d18a39)
- auto-kill stale Playwright processes before E2E tests (ebfb300)
- reduce Playwright workers to 2 to eliminate E2E test race condition (c16e352)
- resolve E2E test timeout in parallel execution (ddd0be6)
- resolve E2E test failures for stats display and tag toggle (035a224)
- **dashboard:** preserve total page count in cache and pagination (a24b831)
- **tags:** restore tag bar click handling (28c90ec)
- **manifest:** add cross-browser background script support and fix CSP violations (49395fc)
- restore original Chrome extension key for stable local dev ID (11ecae7)
- **dashboard:** add resilience and remove duplicate logging (c284337)
- **dashboard:** also prevent refreshInBackground when no user signed in (5499e65)
- **dashboard:** prevent loadPages when no user signed in (fd469bb)
- **dashboard:** show welcome screen when no user signed in (294ba7b)
- **manifest:** migrate to full Manifest V3 cross-browser support (fd5518a)
- **dashboard:** call updateStats() in render() method (d8d5775)
- **dashboard:** preserve scroll sentinel in all innerHTML paths (1e527e3)
- **dashboard:** preserve scroll sentinel when updating content (b76ad23)
- **brave:** add Chrome API support in dashboard sign-in handler (3d9b4b5)
- **brave:** support Brave/Chrome API in Firebase and config initialization (f9f4391)
- **chrome:** support Chrome API before polyfill loads (4a4b627)
- **security:** isolate browser cache by user_id to prevent data leakage (35c1e40)
- **ui:** unify discovery and home page layouts, improve metadata visibility (92dcdf2)
- **ci:** fetch full git history for release notes generation (000df26)
- **auth:** resolve authentication persistence bug requiring repeated sign-ins (800aa6e)
- **e2e:** resolve duplicate #back-to-main ID selector ambiguity (1119b31)
- **e2e:** use Components.discoveryResults() to render discovery header (7a46230)
- **e2e:** use page.click() instead of locator().click() for better event propagation (7f9f38b)
- **e2e:** resolve 4 failing E2E tests (e50907c)
- **e2e:** replace browser optional chaining with typeof check (638ac5c)
- resolve E2E test failures in headless mode (bc83d41)
- **ci:** enable headless mode for E2E tests in CI (6ff3a6d)
- **ci:** build bundles before validation (2886966)
- remove unused eslint-disable directive (544caed)
- skip pre-push hook checks in CI environment (8ab4074)
- ensure Firebase bundles are built before bundling background.js (6ea35c4)
- update dependencies to resolve security vulnerabilities (20e18ee)
- add package-lock.json to version control for CI/CD (423c440)
- mark unused parameter with underscore prefix (f60e4c7)
- **dashboard:** add polyfill to newtab.html for Chrome compatibility (e849144)
- update API response schema for new pagination format (a146738)
- match backend searchByTag response format in mock data (1e509e8)
- enable sign-in button and auto-refresh dashboard after auth (758ae95)
- build Firebase bundles in release workflow (091f6da)
- clarify config.js is ES6 module only (9cb7dad)
- **cache:** add automatic cache-busting for HTML/CSS/JS files (a282990)
- **lint:** resolve web-ext lint warnings for AMO submission (e684dca)
- **discovery:** extract thing_data from match objects for rendering (3e203b0)
- **dashboard:** remove border and background from delete button (3956d4a)
- **ci:** checkout main branch before updating updates.json (79a3dcc)
- **ui:** change logo color from white to primary blue (8d248aa)
- **dashboard:** improve metadata alignment when no tags present (82c4a3a)
- **mock-data:** flatten ai_enriched_at to match BigQuery API schema (61b7933)

### ⚡ Performance

- remove unused webServer from E2E test config (832e705)

### ♻️ Refactoring

- improve tag system and similarity search accuracy (5bebbff)
- consolidate tag extraction and similarity result methods (d2f11af)
- consolidate browser API detection in config.js (e61ee3b)
- consolidate mock search logic with shared utilities (77f375f)
- consolidate fetch-with-auth pattern in api.js (8299f99)
- consolidate error handling in api.js (9741296)
- extract helper methods from large functions (5dc7cde)
- extract page loader manager from newtab.js (-83 lines) (e598414)
- extract event and auth managers from newtab.js (-206 lines) (a20a761)
- extract cache, notification, and stats managers (1fe529d)
- extract managers from newtab.js (-256 lines) (62df550)
- extract AuthUIManager from newtab.js (f787aaa)
- extract ScrollManager from newtab.js (6812c25)
- extract SearchManager from newtab.js (dfaa24f)
- extract TagManager from newtab.js (2852f3f)
- **css:** use rem units for accessibility and user font size preferences (48854a9)
- **css:** modernize theme system with light-dark() and system-ui (5d7bbcf)
- **dashboard:** simplify init flow and fix race conditions (ad5f66c)
- **dashboard:** implement similarity-based tag filtering with single code path (6d89ce6)
- replace flowery About text with factual technical explanation (448fcc1)
- **dashboard:** remove duplicate inlined CSS, use external stylesheet (36f08ca)
- **dashboard:** remove unused category filter feature (b2beb1f)
- **dashboard:** standardize metadata separator rendering (f66c49b)
- **dashboard:** remove legacy 'formerly card' CSS comments (2376135)
- **css:** remove duplicate legacy card-* classes (585b943)
- **dashboard:** make savedPageCard return HTML string (3814d11)
- **dashboard:** improve row layout with inline favicon and aligned metadata (068cc7c)
- **dashboard:** sync inlined CSS with row-based layout (38009ce)
- **dashboard:** implement row click interactions (8542b0d)
- **dashboard:** convert card component to row layout (86e966c)
- **dashboard:** replace grid cards with row-based list layout (43fbfaa)
- reduce extension complexity and improve code quality (8b9230d)
- remove obvious comments and promissory comment (3577fac)

### 📚 Documentation

- update CLAUDE.md with comprehensive tool reference (41a6338)
- finalize newtab.js refactor plan and update architecture docs (4ed4452)
- update documentation for v0.99.99 and cross-browser support (62b8569)
- add new tab page design exploration memo (31c062b)
- add comprehensive testing instructions and beta warnings (52f55bb)
- update cache-busting recommendations (b45f722)
- **refactor:** add comprehensive inline documentation (717961a)
- document version management workflow and git hooks (db22607)
- add dashboard row layout testing checklist (ab9df90)
- reorganize and condense CLAUDE.md, track in git (4d54845)

### ✅ Tests

- remove deprecated dewey_primary_label test cases (50a83c3)
- **discovery:** add manual test page for semantic search mock (2239f51)
- **components:** add unit tests for utility functions (751d465)

### 🔧 Build System

- **deps-dev:** bump js-yaml from 4.1.0 to 4.1.1 (49bd4d4)

### 👷 CI/CD

- add deploy key for saveit-backend graph-viz build (dfda0e2)


---

*Showing last 10 versions. Use `--full-history` to see all releases.*
