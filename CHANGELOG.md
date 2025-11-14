# Changelog

All notable changes to the SaveIt extension will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.16.9] - 2025-11-14

### 🐛 Bug Fixes

- **brave:** add Chrome API support in dashboard sign-in handler (4f16061)
- **brave:** support Brave/Chrome API in Firebase and config initialization (f9f4391)

## [0.16.8] - 2025-11-14

### 🐛 Bug Fixes

- **brave:** support Brave/Chrome API in Firebase and config initialization (392eca0)
- **chrome:** support Chrome API before polyfill loads (4a4b627)

## [0.16.7] - 2025-11-14

### 🐛 Bug Fixes

- **chrome:** support Chrome API before polyfill loads (ecb04b3)
- **security:** isolate browser cache by user_id to prevent data leakage (35c1e40)
- **ui:** unify discovery and home page layouts, improve metadata visibility (92dcdf2)

## [0.16.6] - 2025-11-14

### 🐛 Bug Fixes

- **security:** isolate browser cache by user_id to prevent data leakage (64bfb04)
- **ui:** unify discovery and home page layouts, improve metadata visibility (5e246b6)
- **ci:** fetch full git history for release notes generation (000df26)

## [0.16.5] - 2025-11-14

### ✨ Features

- **release:** add automated release notes generation from conventional commits (0163310)

### 🐛 Bug Fixes

- **ci:** fetch full git history for release notes generation (d934ef7)
- **auth:** resolve authentication persistence bug requiring repeated sign-ins (800aa6e)

## [0.16.4] - 2025-11-14

### ✨ Features

- **release:** add automated release notes generation from conventional commits (61d9b30)

### 🐛 Bug Fixes

- **auth:** resolve authentication persistence bug requiring repeated sign-ins (ddec1a3)

## [0.16.3] - 2025-11-13

### 🐛 Bug Fixes

- **e2e:** resolve duplicate #back-to-main ID selector ambiguity (1119b31)
- **e2e:** use Components.discoveryResults() to render discovery header (7a46230)
- **e2e:** use page.click() instead of locator().click() for better event propagation (7f9f38b)
- **e2e:** resolve 4 failing E2E tests (e50907c)
- **e2e:** replace browser optional chaining with typeof check (638ac5c)
- resolve E2E test failures in headless mode (bc83d41)
- **ci:** enable headless mode for E2E tests in CI (6ff3a6d)

## [0.16.2] - 2025-11-13

### ✨ Features

- **ui:** swap metadata and delete button positions (05a9ed6)
- improve About dialog with thoughtful messaging (c425a34)

### 🐛 Bug Fixes

- **ci:** build bundles before validation (2886966)

### ♻️ Refactoring

- replace flowery About text with factual technical explanation (448fcc1)

### 📚 Documentation

- add new tab page design exploration memo (31c062b)

## [0.16.1] - 2025-11-12

### ✨ Features

- remove top-level 'All' breadcrumb from navigation (7ddde66)

## [0.16.0] - 2025-11-12

### ✨ Features

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

### ♻️ Refactoring

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

- add comprehensive testing instructions and beta warnings (52f55bb)
- update cache-busting recommendations (b45f722)
- **refactor:** add comprehensive inline documentation (717961a)
- document version management workflow and git hooks (db22607)
- add dashboard row layout testing checklist (ab9df90)
- reorganize and condense CLAUDE.md, track in git (4d54845)

### ✅ Tests

- **discovery:** add manual test page for semantic search mock (2239f51)
- **components:** add unit tests for utility functions (751d465)


---

*Showing last 10 versions. Use `--full-history` to see all releases.*
