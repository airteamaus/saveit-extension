# Scroll Mode Header Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** While the index is scrolled, the fixed header retires mid-browse dead weight — masthead and utility row collapse to zero, the search hero slims to a 40px pill — reclaiming ~190px of vertical space.

**Architecture:** One `is-scroll-mode` class toggled on `.desk-page` by the existing scroll listeners in `newtab-drawer-events.js` (generalizing the shipped strip-collapse function), with hysteresis (enter ≥96px, exit ≤32px). All visual change is CSS in `newtab.css`; no element is re-parented, duplicated, or unmounted.

**Tech Stack:** Plain CSS custom-property design system (`shared-ui.css` tokens), vanilla ES modules, Vitest + happy-dom for unit tests, Playwright Firefox (file:// standalone mode) for visual verification.

**Spec:** `docs/superpowers/specs/2026-08-31-scroll-mode-header-design.md` (approved 2026-08-31). Branch: `feat/scroll-mode-header` (already active, spec committed as `cba6109`).

## Global Constraints

- Enter scroll mode at `scrollTop >= 96`, exit at `scrollTop <= 32` (constants `SCROLL_MODE_ENTER_PX` / `SCROLL_MODE_EXIT_PX` beside the existing `LAUNCH_STRIP_COLLAPSE_SCROLL_PX = 48`).
- The strip's own `is-collapsed` behavior and 48px threshold are untouched — existing tests must keep passing unmodified.
- Search hero keeps a **40px** pointer target in scroll mode (DESIGN.md a11y floor: "40px in dialogs and the search hero").
- Transition duration 0.18s ease everywhere (matches the shipped strip animation).
- `prefers-reduced-motion: reduce` → instant state swaps, no transitions.
- Collapsed blocks must leave the tab order: `visibility: hidden`, not just `max-height: 0`.
- `overflow: hidden` on the collapsing blocks ONLY in scroll-mode rules — the resting utility row contains the account dropdown (`position: absolute`, `shared-ui.css:342`), which base `overflow: hidden` would clip.
- Type sizes via tokens (`--font-size-*`) only; colors via `:root` tokens only; no raw hex.
- UI copy never says "SaveIt" — the product name is Newtab.
- No new dependencies. No extension/backend contract changes.
- Use pnpm if installing anything (npm install breaks on this repo's node_modules layout).

---

### Task 1: Scroll-mode state toggle (TDD)

**Files:**
- Modify: `tests/unit/newtab-drawer-events.test.js` (harness at lines 10-27; new describe after line 381)
- Modify: `src/newtab-drawer-events.js:535-569`

**Interfaces:**
- Consumes: `initSavedPagesDrawerEvents({ launchStrip, savedPagesDrawerResults, windowObj, ... })` — existing signature, unchanged. The page container is resolved as `launchStrip.closest('.desk-page')` (strip is a child of `main.desk-page` in `newtab.html:13,111`), so no new parameter and no call-site changes anywhere.
- Produces: `.desk-page` carries `is-scroll-mode` while scrolled; internal function renamed `updateHeaderScrollState(scroller)` (replaces `updateLaunchStripCollapse`; module-private, nothing else imports it).

- [ ] **Step 1: Wrap the test harness in the page container**

In `tests/unit/newtab-drawer-events.test.js`, replace the `document.body.innerHTML` assignment inside `buildHarness()` (lines 11-27) with:

```js
  document.body.innerHTML = `
    <main class="desk-page">
      <form id="search-form"><input id="search-input"></form>
      <div id="results">
        <div class="saved-pages-drawer-card" data-url="https://example.com">
          <form class="saved-pages-drawer-edit-form" data-page-id="page-1">
            <input class="saved-pages-drawer-edit-input" name="title" type="text" value="My page">
            <textarea class="saved-pages-drawer-edit-textarea" name="ai_summary_brief">summary</textarea>
            <button class="saved-pages-drawer-edit-save" type="submit">Save</button>
            <button class="saved-pages-drawer-edit-cancel" type="button" data-action="cancel-edit">Cancel</button>
          </form>
        </div>
      </div>
      <aside id="sidebar"></aside>
      <div id="strip"></div>
    </main>
    <div id="editor-backdrop" class="hidden"></div>
    <div id="editor-dialog" class="hidden"></div>
  `;
```

(This mirrors the real DOM: the strip lives inside `.desk-page`, so `closest()` resolves.)

- [ ] **Step 2: Write the failing tests**

Append after the closing `});` of the `launch strip scroll collapse` describe (line 381):

```js
describe('header scroll mode', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  // Same happy-dom workaround as the strip suite: drive scrollTop directly.
  function scrollResultsTo(value) {
    const results = document.getElementById('results');
    Object.defineProperty(results, 'scrollTop', { value, configurable: true });
    results.dispatchEvent(new Event('scroll'));
  }

  function pageEl() {
    return document.querySelector('.desk-page');
  }

  it('enters scroll mode at 96px but not at 95px', () => {
    buildHarness();
    scrollResultsTo(95);
    expect(pageEl().classList.contains('is-scroll-mode')).toBe(false);

    scrollResultsTo(96);
    expect(pageEl().classList.contains('is-scroll-mode')).toBe(true);
  });

  it('holds scroll mode through the hysteresis band and exits at 32px', () => {
    buildHarness();
    scrollResultsTo(120);
    expect(pageEl().classList.contains('is-scroll-mode')).toBe(true);

    scrollResultsTo(33);
    expect(pageEl().classList.contains('is-scroll-mode')).toBe(true);

    scrollResultsTo(32);
    expect(pageEl().classList.contains('is-scroll-mode')).toBe(false);
  });

  it('stays resting for small scrolls even though the strip collapses', () => {
    buildHarness();
    scrollResultsTo(60);
    expect(document.getElementById('strip').classList.contains('is-collapsed')).toBe(true);
    expect(pageEl().classList.contains('is-scroll-mode')).toBe(false);
  });

  it('reveals in stages on the way up: strip first, then the header', () => {
    buildHarness();
    scrollResultsTo(120);
    scrollResultsTo(40);
    expect(document.getElementById('strip').classList.contains('is-collapsed')).toBe(false);
    expect(pageEl().classList.contains('is-scroll-mode')).toBe(true);

    scrollResultsTo(32);
    expect(pageEl().classList.contains('is-scroll-mode')).toBe(false);
  });

  it('also works when the window is the scroller (narrow layout fallback)', () => {
    buildHarness();
    const scrollingElement = document.scrollingElement || document.documentElement;
    Object.defineProperty(scrollingElement, 'scrollTop', { value: 200, configurable: true });
    window.dispatchEvent(new Event('scroll'));
    expect(pageEl().classList.contains('is-scroll-mode')).toBe(true);
  });
});
```

- [ ] **Step 3: Run the tests to verify they fail**

Run: `npx vitest run tests/unit/newtab-drawer-events.test.js`
Expected: FAIL — the four `is-scroll-mode` assertions fail (`contains('is-scroll-mode')` is false everywhere); the existing `launch strip scroll collapse` suite still PASSES.

- [ ] **Step 4: Implement the toggle**

In `src/newtab-drawer-events.js`, replace the block at lines 535-544 (the comment + `LAUNCH_STRIP_COLLAPSE_SCROLL_PX` + `updateLaunchStripCollapse`) with:

```js
  // Scroll-state header choreography, driven by whichever element scrolls
  // (the results container in the wide layout, the page in narrow layouts):
  // - The pinned strip collapses to favicon-only launchers — wrapped label
  //   chips cost too much vertical space mid-browse. Collapsed chips keep
  //   their pointer target and title tooltip; management returns at the top.
  // - Scroll mode additionally retires the masthead and utility row and
  //   slims the search hero (spec:
  //   docs/superpowers/specs/2026-08-31-scroll-mode-header-design.md).
  //   A header this large jittering at a single threshold would be visible,
  //   so it enters deep (96px) and exits near the top (32px).
  const LAUNCH_STRIP_COLLAPSE_SCROLL_PX = 48;
  const SCROLL_MODE_ENTER_PX = 96;
  const SCROLL_MODE_EXIT_PX = 32;
  const pageEl = launchStrip?.closest('.desk-page') || null;
  let scrollModeActive = false;
  function updateHeaderScrollState(scroller) {
    const scrollTop = scroller?.scrollTop ?? 0;
    launchStrip?.classList?.toggle('is-collapsed', scrollTop > LAUNCH_STRIP_COLLAPSE_SCROLL_PX);
    const next = scrollModeActive
      ? scrollTop > SCROLL_MODE_EXIT_PX
      : scrollTop >= SCROLL_MODE_ENTER_PX;
    if (next !== scrollModeActive) {
      scrollModeActive = next;
      pageEl?.classList?.toggle('is-scroll-mode', scrollModeActive);
    }
  }
```

Then rename the three call sites: `updateLaunchStripCollapse(...)` → `updateHeaderScrollState(...)` at line 549 (results listener), line 562 (window listener), and line 569 (initial call).

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npx vitest run tests/unit/newtab-drawer-events.test.js`
Expected: PASS — all suites, old and new.

- [ ] **Step 6: Commit**

```bash
git add src/newtab-drawer-events.js tests/unit/newtab-drawer-events.test.js
git commit -m "feat(desk): toggle is-scroll-mode on the page container with 96/32px hysteresis"
```

(Pre-commit runs eslint + stylelint + prettier + web-ext; the 6 web-ext warnings are pre-existing and expected.)

---

### Task 2: Scroll-mode CSS + icon-only Find markup

**Files:**
- Modify: `src/newtab.html:108` (Find button)
- Modify: `src/newtab.css` (insert a block after the `.desk-search-find:hover` rule at line ~214; extend the `prefers-reduced-motion` block at lines 1340-1356)
- Modify: `docs/superpowers/specs/2026-08-31-scroll-mode-header-design.md` (§6 scope line — the icon-only Find needs real markup)

**Interfaces:**
- Consumes: `.desk-page.is-scroll-mode` (Task 1).
- Produces: the visual scroll mode. Resting state stays pixel-identical (the only resting-state additions are inert: transition declarations, `max-height` ceilings with headroom, `min-height: 40px` on a hero that is naturally ~56px).

- [ ] **Step 1: Update the Find button markup**

In `src/newtab.html`, replace line 108:

```html
      <button id="desk-search-find-btn" class="desk-search-find" type="submit">Find</button>
```

with:

```html
      <button id="desk-search-find-btn" class="desk-search-find" type="submit" aria-label="Find" title="Find">
        <svg class="desk-search-find-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
          <polyline points="9 10 4 15 9 20"></polyline>
          <path d="M20 4v7a4 4 0 0 1-4 4H4"></path>
        </svg>
        <span class="desk-search-find-label">Find</span>
      </button>
```

(Return-arrow / corner-down-left glyph — carriage-return semantics for "submit". The label becomes a span so the scroll-mode swap is markup-driven, not a CSS font glyph.)

- [ ] **Step 2: Insert the scroll-mode CSS block**

In `src/newtab.css`, immediately after the `.desk-search-find:hover { ... }` rule (line ~214, before the `/* ── Launch strip + project pills ── */` comment), insert:

```css
/* ── Scroll mode ────────────────────────────────────────────────── */
/* While the index is scrolled the header retires what mid-browse never
   needs (spec: 2026-08-31-scroll-mode-header-design.md): the masthead's
   identity work is done, the utility row's tools are one scroll flick
   away, and the search hero slims to a 40px pill (DESIGN.md a11y floor).
   Toggled as is-scroll-mode on .desk-page by updateHeaderScrollState
   (newtab-drawer-events.js). Resting styles above stay untouched. */

.desk-page {
  transition: gap 0.18s ease;
}

/* Collapse scaffolding: ceilings carry ~30% headroom over resting heights
   (~90px masthead, 32px utility) so text-scale changes never clip. The
   padding/min-height join the transition because max-height 0 alone leaves
   them occupying space. overflow:hidden lives ONLY in the scroll-mode
   rules below — the resting utility row contains the account dropdown
   (position:absolute), which base overflow would clip. */
.desk-masthead,
.desk-utility-row {
  opacity: 1;
  visibility: visible;
  transition:
    max-height 0.18s ease,
    min-height 0.18s ease,
    padding-top 0.18s ease,
    margin-bottom 0.18s ease,
    opacity 0.18s ease,
    visibility 0s linear 0s;
}

.desk-masthead {
  max-height: 120px;
}

.desk-utility-row {
  max-height: 48px;
}

/* Each collapsed block negates the 8px scroll-mode gap below it with a
   matching negative margin — flex gap still surrounds zero-height
   children, so without this ~16px of phantom space would linger where
   the masthead was. */
.desk-page.is-scroll-mode {
  gap: 8px;
}

.desk-page.is-scroll-mode .desk-masthead,
.desk-page.is-scroll-mode .desk-utility-row {
  max-height: 0;
  min-height: 0;
  padding-top: 0;
  margin-bottom: -8px;
  overflow: hidden;
  opacity: 0;
  /* Hidden content must leave the tab order and hit-testing, not just
     clip. visibility flips at the END of the collapse (delayed transition
     below) and instantly on the way back up (resting transition above). */
  visibility: hidden;
  transition:
    max-height 0.18s ease,
    min-height 0.18s ease,
    padding-top 0.18s ease,
    margin-bottom 0.18s ease,
    opacity 0.18s ease,
    visibility 0s linear 0.18s;
}

/* The search hero stays — finding a save is the top mid-browse task —
   but as a slim pill. min-height is the 40px hero target floor from
   DESIGN.md; resting height (~56px) already clears it. */
.desk-search-hero {
  min-height: 40px;
  transition: padding 0.18s ease;
}

.desk-search-input {
  transition:
    font-size 0.18s ease,
    padding 0.18s ease;
}

.desk-page.is-scroll-mode .desk-search-hero {
  padding: 3px 4px 3px 10px;
}

.desk-page.is-scroll-mode .desk-search-input {
  padding: 6px 4px;
  font-size: var(--font-size-sm);
}

/* Find collapses to the return-arrow icon; the width/padding transition
   rides the same 180ms as the rest of the mode change. */
.desk-search-find {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  transition:
    width 0.18s ease,
    padding 0.18s ease;
}

.desk-search-find-icon {
  display: none;
}

.desk-page.is-scroll-mode .desk-search-find {
  width: 40px;
  padding: 8px 0;
}

.desk-page.is-scroll-mode .desk-search-find-icon {
  display: block;
}

.desk-page.is-scroll-mode .desk-search-find-label {
  display: none;
}
```

- [ ] **Step 3: Extend the reduced-motion block**

In `src/newtab.css`, inside `@media (prefers-reduced-motion: reduce)` (lines 1340-1356), append before its closing brace:

```css
  .desk-page,
  .desk-masthead,
  .desk-utility-row,
  .desk-search-hero,
  .desk-search-input,
  .desk-search-find {
    transition: none;
  }
```

- [ ] **Step 4: Amend the spec's scope line**

In `docs/superpowers/specs/2026-08-31-scroll-mode-header-design.md` §6, replace:

```markdown
No HTML changes, no new dependencies, no extension/backend contract involvement.
```

with:

```markdown
`src/newtab.html` — the Find button gains a return-arrow icon and a label span (the icon-only scroll-mode state needs real markup, not a CSS font glyph). No new dependencies, no extension/backend contract involvement.
```

- [ ] **Step 5: Lint and format-check the touched files**

Run: `npx stylelint src/newtab.css && npx prettier --check src/newtab.css src/newtab.html`
Expected: both pass clean (prettier may reflow the inserted block — if `--check` fails, run `npx prettier --write src/newtab.css src/newtab.html` and re-check).

- [ ] **Step 6: Commit**

```bash
git add src/newtab.css src/newtab.html docs/superpowers/specs/2026-08-31-scroll-mode-header-design.md
git commit -m "feat(desk): scroll-mode header collapse - masthead/utility to zero, slim search pill, icon-only Find"
```

---

### Task 3: DESIGN.md note, full quality bar, visual verification

**Files:**
- Modify: `DESIGN.md` (one line under "Surfaces & rhythm")

**Interfaces:**
- Consumes: Tasks 1-2 complete.
- Produces: documented behavior; verified states.

- [ ] **Step 1: Add the scroll-mode line to DESIGN.md**

In `DESIGN.md` under "## Surfaces & rhythm", after the "8px spacing rhythm..." bullet, add:

```markdown
- **Scroll mode**: once the index is scrolled ~96px, the header retires mid-browse dead weight — masthead and utility row collapse to zero, the search hero slims to its 40px pill with an icon-only Find; back within 32px of the top the full header returns (spec: `docs/superpowers/specs/2026-08-31-scroll-mode-header-design.md`).
```

- [ ] **Step 2: Full unit suite**

Run: `npm test`
Expected: PASS (the `warming-flow` e2e failure on main is pre-existing and not part of this suite).

- [ ] **Step 3: Full local check**

Run: `just check`
Expected: PASS (tests, lint, validate, build). The 6 web-ext warnings are pre-existing.

- [ ] **Step 4: Visual verification (standalone, Firefox, file://)**

Standalone mock mode is detected by the `file://` protocol (`src/config.js:30`) and Firefox allows ES modules on `file://`. Write `/tmp/scroll-mode-check.mjs` (kept out of the repo):

```js
import { firefox } from '/Users/rich/Code/saveit-extension/node_modules/@playwright/test/index.mjs';

const browser = await firefox.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
await page.goto('file:///Users/rich/Code/saveit-extension/src/newtab.html');
await page.waitForSelector('#saved-pages-results .index-row', { timeout: 10000 });
await page.screenshot({ path: '/tmp/scroll-mode-resting.png', fullPage: false });

const results = page.locator('#saved-pages-results');
await results.evaluate((el) => {
  el.scrollTop = 300;
  el.dispatchEvent(new Event('scroll'));
});
await page.waitForTimeout(400); // settle the 180ms transitions
await page.screenshot({ path: '/tmp/scroll-mode-scrolled.png', fullPage: false });

const modeOn = await page.evaluate(() =>
  document.querySelector('.desk-page').classList.contains('is-scroll-mode')
);
const mastheadZero = await page.evaluate(() => {
  const el = document.querySelector('.desk-masthead');
  const r = el.getBoundingClientRect();
  return r.height === 0;
});
const heroHeight = await page.evaluate(() =>
  Math.round(document.querySelector('.desk-search-hero').getBoundingClientRect().height)
);
console.log({ modeOn, mastheadZero, heroHeight });
if (!modeOn || !mastheadZero) throw new Error('scroll mode did not engage');

await results.evaluate((el) => {
  el.scrollTop = 0;
  el.dispatchEvent(new Event('scroll'));
});
await page.waitForTimeout(400);
const modeOff = await page.evaluate(() =>
  !document.querySelector('.desk-page').classList.contains('is-scroll-mode')
);
await page.screenshot({ path: '/tmp/scroll-mode-top.png', fullPage: false });
if (!modeOff) throw new Error('scroll mode did not release at the top');

// Reduced motion: state changes still apply, instantly.
const rm = await browser.newContext({ viewport: { width: 1440, height: 900 }, reducedMotion: 'reduce' });
const rmPage = await rm.newPage();
await rmPage.goto('file:///Users/rich/Code/saveit-extension/src/newtab.html');
await rmPage.waitForSelector('#saved-pages-results .index-row', { timeout: 10000 });
await rmPage.locator('#saved-pages-results').evaluate((el) => {
  el.scrollTop = 300;
  el.dispatchEvent(new Event('scroll'));
});
const rmOn = await rmPage.evaluate(() =>
  document.querySelector('.desk-page').classList.contains('is-scroll-mode')
);
if (!rmOn) throw new Error('scroll mode failed under reduced motion');

await browser.close();
console.log('scroll-mode visual verification OK');
```

Run: `node /tmp/scroll-mode-check.mjs`
Expected: `scroll-mode visual verification OK`, `modeOn: true`, `mastheadZero: true`, `heroHeight` ≈ 40. Inspect the three screenshots: resting matches today's design; scrolled shows no masthead/utility row, slim pill, favicon strip, pills, index header; top shows the full header back. If `.index-row` is not the row selector, inspect `#saved-pages-results` children for the actual row class and adjust the two `waitForSelector` calls only.

- [ ] **Step 5: Commit**

```bash
git add DESIGN.md
git commit -m "docs(design): note scroll mode in DESIGN.md"
```

---

## Self-Review (completed during planning)

- **Spec coverage:** hysteresis thresholds (Task 1), masthead/utility collapse + visibility + gap negation + search pill + icon-only Find (Task 2), 40px floor (Task 2 CSS + Task 3 assertion), reduced-motion (Tasks 2-3), both scroller paths (Task 1 test 5), independence from strip threshold (Task 1 test 3), staged reveal (Task 1 test 4), spec §6 scope amendment (Task 2 Step 4), DESIGN.md doc update (Task 3 Step 1), quality bar (Task 3 Steps 2-3), visual verification (Task 3 Step 4). Header pixel estimates are design-time approximations; Task 3 asserts the structural outcomes (masthead 0px, hero ≈40px) rather than the total.
- **Placeholder scan:** no TBDs; every code step is complete.
- **Consistency:** `updateHeaderScrollState` name used in Task 1 code and Task 2 CSS comment; `is-scroll-mode` used throughout; thresholds 96/32/48 consistent with the spec and tests.
