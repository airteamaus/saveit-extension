# Changelog

All notable changes to the SaveIt extension will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased] - TBD

### 🐛 Bug Fixes

- **sidebar:** bind synchronous current user so ownership resolves (1a65934)

## [1.20.4] - 2026-07-09

### ✨ Features

- **ui:** remove card summary line-clamp; cap at 290 chars (4b520d0)

## [1.20.3] - 2026-07-09

### ✨ Features

- **layout:** keep sidebar to 700px, hamburger below, more summary lines (75cb3fc)
- **ui:** lengthen card summary to fill two lines (47611eb)
- **cache:** optimistic tile + smart poll for post-save visibility (02ce890)
- **save:** capture page content at save time, send source=client (06299d2)
- **capture:** add scripting injector + scripting permission (b8a63d8)
- **capture:** add Readability-based page-capture pure module (0fe8d42)

### 🐛 Bug Fixes

- **ui:** give sidebar overlay an opaque background (96dfb1f)
- **ui:** trim 1px line-clamp overflow; raise summary cap to 360 (b48c666)

### ♻️ Refactoring

- **capture:** switch injector to files-based bundle with real Readability (112f41c)

### 📚 Documentation

- client-side page capture implementation plan (b701619)
- correct content-storage mechanism in capture design (a60e32e)
- drop hard-coded page count from capture design (2273ae3)
- client-side page capture design spec (7a8a6ce)

## [1.20.2] - 2026-07-09

### 🐛 Bug Fixes

- **mirror:** populate empty category and shared project folders (#25) (bc2370d)

## [1.20.1] - 2026-07-09

### 🐛 Bug Fixes

- **telemetry:** capture genuine page-surface errors to Sentry (#24) (bf70d27)

## [1.20.0] - 2026-07-09

### ✨ Features

- **auth:** replace Firebase client SDK with backend session tokens (#23) (d3fe427)

### 🐛 Bug Fixes

- **release:** checkout main in updates-json job; backfill v1.19.3 (#20) (44196ce)

## [1.19.3] - 2026-07-08

### 👷 CI/CD

- **e2e:** install chromium and skip headed-only warming tests in CI (#18) (508dabe)
- **release:** make every store-publish job idempotent (#17) (5b63f9d)

## [1.19.2] - 2026-07-08

No notable changes.

## [1.19.1] - 2026-07-08

### 🐛 Bug Fixes

- **newtab:** hide the project sidebar while signed out (9c51831)
- **newtab:** harden bootstrap against cold-start session loss (ed9b624)

### ♻️ Refactoring

- **auth:** centralise the first-auth-state race (f0b5092)

## [1.19.0] - 2026-07-07

### ✨ Features

- **mirror:** organise bookmarks by project and domain, sub-bucket large folders (9b7e6b4)

### 🐛 Bug Fixes

- **mirror:** create SaveIt/ under a writable container, not the immovable root (0f78e60)

## [1.18.6] - 2026-07-07

### ✨ Features

- **ui:** Enter-to-save in page editor; route action failures through toast (d820c11)
- **mirror:** rename to 'Sync browser', icon-as-state, toast feedback (41c8ff7)
- **sharing:** add Sharing centre, ownership-based sidebar, real cache refresh (df82bd9)
- **cache:** add head-based list freshness sync (7cd548c)
- add pinnedFirst parameter to control pinned item sorting (1683350)
- add background refresh option to profile menu (4321d7b)
- add theme toggle to search-results page (65ad6e8)
- move theme toggle into user profile dropdown menu (b058728)
- enable hybrid search by default (05728b7)
- add pin feature UI and API integration (9a698d4)
- use full resolution Unsplash images for better quality (d5a121d)
- filter Unsplash backgrounds to exclude people and animals (d693818)
- add header with logo and user menu to graph page (18dede3)
- improve semantic search and add user avatars (0f8e603)
- add semantic search results page (bbaf4e1)
- polish minimal new tab layout and styling (7b0abc1)
- add stats counter to minimal new tab (9e73c5f)
- add favorites row to minimal new tab (5a3b3a4)
- add Unsplash background to minimal new tab (37ee3a1)
- add minimal search-forward new tab (730f992)
- **graph:** update focus button to use toggleFocus (a6c96bc)
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

- **mirror:** create SaveIt/ under a writable container, not the immovable root (ffeb6a7)
- **mirror:** send saved-pages params as query string, not GET body (e57f8c8)
- **sidebar:** separate shared and private projects into a three-way split (fecbeb9)
- **sync:** align freshness anchor with list ordering (dc6e681)
- **cache:** keep warm cache active after idle (daf801c)
- **ui:** make collection cards fully clickable (31a4652)
- address web-ext linting warnings (5204993)
- sync theme changes across tabs and respond to OS preference (621a743)
- add data-theme CSS rules for manual theme override (aaa8021)
- use monitor icon for auto theme to differentiate from light (7e21deb)
- auth header bug and update pin icon to pushpin (5162cb0)
- align favicon with first line of title in search results (10a3ad8)
- wait for auth before search and lower threshold to 0.65 (76886c0)
- add debug output to backend cleanup step (e61f25b)
- use glob patterns to properly exclude backend files from validation (37d1ec6)
- use .web-ext-ignore instead of command-line ignore flags (20de54f)
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

- reduce Unsplash image cache from 24h to 3h (1b20002)
- remove unused webServer from E2E test config (832e705)

### ♻️ Refactoring

- improve footer layout with grid-based alignment (c7f594f)
- switch favicon provider from Google to DuckDuckGo (d2453c3)
- consolidate card metadata into single row with inline tags (aa720f2)
- **test:** reduce test complexity and improve maintainability (a8e945d)
- upgrade Zod v3 to v4 with full API modernization (697fa70)
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

### 📝 Other Improvements

- Cancel duplicate release runs per tag via concurrency group (73e0407)
- Add bookmark mirror: sync saved pages to browser bookmarks (782aaa1)
- Fix warming bar stuck at 100% on warm-cache post-login path (3ee43f2)
- Single render authority: eliminate the warming/cards flicker via warmUpInProgress (8f672e8)
- Fix logout->login leaving empty drawer: reload when no renderable pages (33082ac)
- Fix session-restore warming flash: SavedPagesStore must forward lazy (5a238bd)
- Fix warming handoff: bind completion timer to window, not module scope (3bae894)
- Fix warming UI stuck at 100%: handoff must not gate on hasInitialized (555adb7)
- Fix warming UI regression on session restore + stack layout vertically (94e598c)
- Align standalone E2E comment with the post-fix activation model (3bc7424)
- Fix critical bug: warming bar now renders per-batch, not just at completion (11019d5)
- Correct Blocker 1 mechanism in standalone E2E comment (dfb129d)
- Document why post-login warming flow is not E2E-covered (272e699)
- Cover the cold-load warming branch at unit level (6469d10)
- Show warming bar (not bare dog) on the cold post-login load (b98fe01)
- Fix renderWarmingState wiring + harden warming state machine (ac6ca77)
- Drive post-login warming UI from the saved-pages subscriber (9f14bf7)
- Flip saved-pages store to non-lazy on sign-in (1555eb1)
- Add warming pane + progress bar styles (1c13a0a)
- Lock in renderWarmingState guarantees: ARIA + clamping (0d5e1de)
- Add renderWarmingState: dog + determinate progress bar (f2e7fe5)
- Cover loadMore-throw reset path; tighten prefetch comments (8ffead1)
- Add setLazy + self-resetting prefetch for post-login warm-up (b470e05)
- Add implementation plan: post-login cache warming with progress (cf0c6c6)
- Add spec: post-login cache warming with progress (fec94ca)
- Lazy-render the All-pages view and fetch the rest on scroll (#15) (1133653)
- Fix card summary edit reverting to unchanged content (#14) (1ec6d08)
- Lower semantic search limit 50 → 20 to cut Firestore hydration cost (e13727b)
- Send search_type 'vector' instead of 'hybrid' (ad796d3)
- Add Sentry span around semantic search + surface backend timings (d263165)
- Fix release/upload workflows to use pnpm; relax vite spec (41c98b1)
- Fix home view persisting after clicking "All pages"; stabilize hover E2E test (1759b91)
- Update dependencies to clear all 17 Dependabot vulnerabilities (6e2d7c4)
- Fix three release tooling bugs found during v1.14.0 (fe4e69f)
- Add sparse home view; warm the empty/loading/sign-in copy (1923102)
- Remove dormant favorites carousel UI; warm the loading/error state copy (4f69c6f)
- Bring toolbar popup into brand parity with shared token system (0bd2b94)
- Rework visual foundation: quiet materiality, warm palette, token sweep (fa18deb)
- Fix domain click loading all pages: scope source in applyDrawerFilters (4117539)
- Use warm cache for domain pages; sort domains alphabetically (4d62903)
- Fix standalone domains mock to use classification categories (1ce3d3e)
- Add Domains section to the sidebar with server-side domain scoping (v1.13.0) (95516bd)
- Load the drawer after auth resolves, not before (5b81a74)
- Add Refresh saved pages to the avatar menu; reload drawer after import (1ac25fc)
- Move Import bookmarks into the avatar dropdown menu (aeb1713)
- Add bookmark import from the browser (ea1630b)
- Move page content up toward the header (dd37bcc)
- Give cards a half-em vertical margin above and below (cdfaf17)
- Refine sidebar, cards, and create-project affordance (04672c7)
- Change primary color from blue to sage grey-green (eb2d073)
- Show the digging dog while project pages load instead of a premature empty state (5b62152)
- Refresh new-tab UI, add CSS tooling, and refine search flow (1893db4)
- Make the UI more subtle: remove fills and static borders (09185f4)
- Animate the loading illustration: wagging tail and flying dirt (57a0a9e)
- Enlarge loading illustration and vertically centre it (0ebc0e2)
- Inline the loading SVG so currentColor inherits the theme (59bbece)
- Use theme-aware SVG for search loading and fix it not showing (587ef5f)
- Show search loading state with animation and scope card lookups (49f8cd6)
- Render semantic search inline in newtab (0bf567b)
- Update default-selection E2E test for All pages (ed8eee3)
- Tidy sidebar layout and make All pages the default (cb8eea4)
- Tidy newtab CSS tokens (7527434)
- Refine project navigation and tag search (8ef4b81)
- Fix npm vite override (5222d35)
- Tighten newtab layout density (54e1315)
- Clean up docs and tooling (ac1ef35)
- Render project manager with DOM nodes (7f444e7)
- Model warm cache states explicitly (fc9a5ff)
- Split saved-pages API modules (6f65b1f)
- Replace implicit API runtime wiring (e34315f)
- Fix newtab local-first feed scopes (2647212)
- Fix newtab pinned feed state (77705d1)
- Tighten newtab header layout (cee2b80)
- Fix cache manager script loading (35b3001)
- Load projects locally before network (6537e9b)
- Fix release publishing workflow (86b7880)
- Fix newtab project counts (f512865)
- Improve newtab loading lifecycle (fae366d)
- Fix release updates workflow (b0aab23)
- Refactor newtab saved pages layout (dfd724a)
- commit remaining local changes (27e6fd7)
- fix standalone newtab bootstrap (701c348)
- harden dom render helper (60da2aa)
- harden favorites rendering (d30e900)
- harden search results rendering (e36fb03)
- harden renderer html updates (893bf14)
- refactor drawer runtime (ff51774)
- refactor drawer sync observers (336753f)
- refactor drawer sync lifecycle (cdcbdd6)
- refactor drawer coordination (489c40c)
- refactor newtab app coordination (338f538)
- refactor newtab app factory (047eef4)
- refactor project manager controller (ec747e2)
- refactor project manager ui (0ff1f01)
- refactor newtab page wiring (f1978ba)
- refactor project manager actions (7e4bbb4)
- refactor project manager renderer (7a03dd0)
- refactor project manager state (4cbe51e)
- refactor newtab drawer barrel (9c50d71)
- refactor newtab drawer ui (b21c0f6)
- refactor newtab drawer shell (caaff3a)
- refactor newtab drawer state (2f96f12)
- refactor newtab drawer view (e052b03)
- refactor newtab drawer data (eafb2dd)
- refactor newtab drawer sync (91fad11)
- refactor newtab drawer events (75d732c)
- refactor newtab drawer rendering (3179915)
- Simplify toolbar project saving (59e5dbd)
- Refine saved pages drawer workflow (c3f70db)
- Harden dependency graph (5613e02)
- Move Unsplash key to runtime config (e7ce5f5)
- Unify page mutation invalidation (46bc011)
- Cache search results per session (84cc346)
- Move drawer onto cache core (dd68116)
- Move favorites onto cache core (53e4241)
- Extract warm cache list core (97a6714)
- Warm cache the saved pages drawer (a7556ee)
- Preserve full favorites warm cache (b36cc47)
- Restore cache-first new tab startup (7310182)
- Polish project drawer sidebar (f08c3f8)
- Prefetch full favorites store (4eb41a1)
- Build Firebase bundles before tests (761a55c)
- Cache projects and drawer refreshes (13fd7d8)
- Refactor favorites into local store (7a410f9)
- Fix Chrome publish workflow install (4750d8e)
- Approve required pnpm build scripts (7b7028f)
- Use public Firebase web-extension exports (8950da8)
- Match drawer search to list payload (464f973)
- Treat saved item totals as optional (ec09764)
- Load drawer projects in parallel (3970c2d)
- Stabilize saved pages and trim initial loads (11b5be8)
- Rename saved pages surfaces (4d4a833)
- Purge dead dashboard modules (124e7a6)
- Remove obsolete dashboard checklist (e2873a5)
- Update standalone docs and tests (eee62cd)
- Remove legacy database surface (52196fb)
- Move project collections to newtab drawer (1d57ca0)
- Document and test project workflows (b864955)
- Scope dashboard projects correctly (3e243a0)
- Build project dashboard UI (4f0a6a2)
- Add project data layer (203ba6f)
- Align Chrome package with Store ID (a7cffbc)
- Add safe auth telemetry for Sentry (a297c1f)
- Fix Chrome Web Store packaging (146e329)
- Add privacy link to new tab footer (7eda5a6)
- Fix background auth startup (f474c79)
- Refine favorites hover preview (9624d63)
- Fix native drawer regressions (4334567)
- Refine native saved pages drawer (5182f38)
- Refactor shared extension UI styles (0388385)
- Refactor API helpers and upgrade Actions Node (9458cf5)
- Speed up homepage favorites loading (5b0f3dc)
- Add responsive homepage favorites pager (c41e121)
- Bypass hooks in release updates commit (731692d)
- Fix release workflows and e2e expectations (103260d)
- Fold dashboard into drawer and remove graph (a8371f4)
- Unify dashboard entrypoints (f562e9e)
- (chore): upgraded outdated (c17fe43)
- simplify card tags to link style with top classification only (0302bea)
- modernize newtab page with flat black background and simplified tag hierarchy (ee269c5)
- update link text from "Open full dashboard" to "Open database" (0526f0f)
- align dashboard with search page design system (a16a932)
- align dashboard interactions with design system (76c5990)
- align dark mode surface colors with design system (7579591)
- Change from opening in new tabs to same tab (42af0ec)
- remove dead code and unused files (471b5c4)
- Revert "fix: restore original Chrome extension key for stable local dev ID" (bed4695)
- add logging to track discovery mode flow in E2E tests (9686067)
- Remove tagline from footer (a3a9ed5)
- Improve Chrome release workflow with clearer labeling and instructions (58580dc)
- Update README.md (775534c)
- Add comprehensive QA infrastructure and code quality improvements (a547b4a)
- Add detailed logging for debugging data flow (6adcab5)
- Revert "fix(cache): add automatic cache-busting for HTML/CSS/JS files" (5645140)
- 0.7.3 (5969a00)
- **dashboard:** add base styling for delete button in light mode (782af27)
- **dashboard:** add dark mode styling for delete button (5f3c390)
- **dashboard:** increase row-footer spacing from 4px to 4pt (a169dd5)
- **dashboard:** add 4px spacing above/below row-footer (053ffba)
- **dashboard:** remove padding around search results (73b5fbd)
- **dashboard:** use neutral gray dark mode instead of blue-tinted (e11056f)
- Remove docs/CLAUDE.md (moved to root) (5edac1e)
- Add dark mode support to dashboard (085d035)
- Reorganize extension repository structure (5e95326)
- gitignore (e22ed7c)
- Fix Mozilla validation issues for v0.5.3 (1cec304)

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

- improve coverage from 22% to 33% with 90 new tests (84c893b)
- add newtab-minimal tests and adjust coverage thresholds (3a3ce5a)
- improve coverage from 17.5% to 29.14% (67% increase) (ebf0758)
- improve coverage from 0.72% to 17.5% (24x increase) (f124db3)
- remove deprecated dewey_primary_label test cases (50a83c3)
- **discovery:** add manual test page for semantic search mock (2239f51)
- **components:** add unit tests for utility functions (751d465)

### 🔧 Build System

- **deps-dev:** bump js-yaml from 4.1.0 to 4.1.1 (49bd4d4)

### 👷 CI/CD

- **release:** publish to Chrome Web Store on every tag release (c3735cd)
- add deploy key for saveit-backend graph-viz build (dfda0e2)


---

*Showing last 10 versions. Use `--full-history` to see all releases.*
