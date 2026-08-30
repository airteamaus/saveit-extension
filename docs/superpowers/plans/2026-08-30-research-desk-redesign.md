# Research Desk Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Re-skin and recompose the SaveIt extension UI under the approved "Research Desk" direction (spec: `docs/superpowers/specs/2026-08-30-research-desk-redesign-design.md`).

**Architecture:** Plain-CSS token rewrite in `src/shared-ui.css` (`light-dark()`, no build step), bundled variable fonts, then a render-layer-only recomposition of the newtab ("Reading Room" layout) plus dropdown/pills project navigation. Store/API/SW layers untouched.

**Tech Stack:** Vanilla JS modules, plain CSS + stylelint, Vitest, Playwright, web-ext.

## Global Constraints

- Tokens and contrast ratios are exactly the values in spec §4 — do not improvise colors. Dark rust is `#e46f5d`.
- One shadow token (`--shadow-dialog`), used only by modals and toasts. Everything else separates by hairline.
- Fonts: bundled latin-subset variable woff2 in `src/fonts/`, `font-display: swap`, no remote fetches (MV3 CSP). Never Inter, never system-ui as identity.
- Mono metadata text uses `--color-ink-soft`; `--color-ink-faint` only for placeholders/disabled/decoration.
- BEM kebab class names, stylelint + prettier must pass (`npm run lint:css && npm run format:check`).
- Every task ends green: `npm test` (or the task's scoped vitest run) + lint.
- Render-layer only: no changes to `src/api*.js`, stores, `src/background.js`, or backend contracts.
- Do NOT run release steps (`just bump`, `upload-chrome*`, store submission). Stop after Task 13.
- Work on branch `feat/research-desk-redesign`; one commit per task.

---

## Phase 1 — Foundations

### Task 1: Bundle the variable fonts

**Files:**
- Create: `scripts/sync-fonts.sh`
- Create: `src/fonts/*.woff2` (committed)
- Modify: `package.json` (devDependencies + `sync-fonts` script)
- Modify: `src/shared-ui.css` (add `@font-face` + font stacks, above the `:root` block)
- Modify: `src/newtab.html` (preloads in `<head>`)

**Interfaces:**
- Produces: font families `"Newsreader Variable"`, `"Source Sans 3 Variable"`, `"JetBrains Mono Variable"` and CSS vars `--font-display`, `--font-sans`, `--font-mono` for every later task.

- [ ] **Step 1: Install packages**

```bash
npm install --save-dev @fontsource-variable/newsreader @fontsource-variable/source-sans-3 @fontsource-variable/jetbrains-mono
```

- [ ] **Step 2: Create `scripts/sync-fonts.sh`**

```bash
#!/bin/bash
# Copy latin-subset variable woff2 files from @fontsource-variable packages
# into src/fonts/. The files are committed so the unpacked-extension dev flow
# needs no build step; MV3 CSP forbids fetching fonts remotely.
set -euo pipefail
cd "$(dirname "$0")/.."
mkdir -p src/fonts
copy() { cp "node_modules/@fontsource-variable/$1/files/$2" "src/fonts/$2"; }
copy newsreader newsreader-latin-wght-normal.woff2
copy newsreader newsreader-latin-wght-italic.woff2
copy source-sans-3 source-sans-3-latin-wght-normal.woff2
copy source-sans-3 source-sans-3-latin-wght-italic.woff2
copy jetbrains-mono jetbrains-mono-latin-wght-normal.woff2
ls -l src/fonts/
```

`chmod +x scripts/sync-fonts.sh`, add `"sync-fonts": "bash scripts/sync-fonts.sh"` to `package.json` scripts, run `npm run sync-fonts`. Expected: 5 files in `src/fonts/`.

- [ ] **Step 3: Add `@font-face` + stacks to `src/shared-ui.css`** (top of file, before `:root`; replace the old `--font-sans`/`--font-mono` lines inside `:root` in the same edit)

```css
@font-face {
  font-family: "Newsreader Variable";
  src: url("fonts/newsreader-latin-wght-normal.woff2") format("woff2");
  font-weight: 100 900;
  font-style: normal;
  font-display: swap;
}

@font-face {
  font-family: "Newsreader Variable";
  src: url("fonts/newsreader-latin-wght-italic.woff2") format("woff2");
  font-weight: 100 900;
  font-style: italic;
  font-display: swap;
}

@font-face {
  font-family: "Source Sans 3 Variable";
  src: url("fonts/source-sans-3-latin-wght-normal.woff2") format("woff2");
  font-weight: 100 900;
  font-style: normal;
  font-display: swap;
}

@font-face {
  font-family: "Source Sans 3 Variable";
  src: url("fonts/source-sans-3-latin-wght-italic.woff2") format("woff2");
  font-weight: 100 900;
  font-style: italic;
  font-display: swap;
}

@font-face {
  font-family: "JetBrains Mono Variable";
  src: url("fonts/jetbrains-mono-latin-wght-normal.woff2") format("woff2");
  font-weight: 100 900;
  font-style: normal;
  font-display: swap;
}
```

Inside `:root`, replace the two font lines with:

```css
  --font-display: "Newsreader Variable", Georgia, "Times New Roman", serif;
  --font-sans: "Source Sans 3 Variable", -apple-system, system-ui, sans-serif;
  --font-mono: "JetBrains Mono Variable", ui-monospace, "SF Mono", Menlo, monospace;
```

- [ ] **Step 4: Preload the UI font on the newtab** — in `src/newtab.html` `<head>`, after the icon link:

```html
  <link rel="preload" href="fonts/source-sans-3-latin-wght-normal.woff2" as="font" type="font/woff2" crossorigin>
```

- [ ] **Step 5: Verify + commit**

```bash
npm run lint:css && npm run format && bash scripts/test-csp.sh && npm test
git add scripts/sync-fonts.sh src/fonts package.json package-lock.json src/shared-ui.css src/newtab.html
git commit -m "feat(desk): bundle Research Desk variable fonts locally"
```

### Task 2: Rewrite the token block + global craft rules

**Files:**
- Modify: `src/shared-ui.css:1-64` (the `:root` block) and the trailing `button:focus-visible…` rule (line ~526-532)

**Interfaces:**
- Produces: every token in spec §4. Later tasks consume only these names.

- [ ] **Step 1: Replace the whole `:root` block** with (keep `html[data-theme…]` rules below it untouched):

```css
:root {
  color-scheme: light dark;

  /* Research Desk — light / dark (espresso) companion. Contrast ratios in
     DESIGN.md; mono metadata must use ink-soft, ink-faint is decorative-only. */
  --color-paper: light-dark(#faf6ee, #241f1a);
  --color-paper-raised: light-dark(#fffbf2, #2d2822);
  --color-ink: light-dark(#292524, #ece5d8);
  --color-ink-soft: light-dark(#57534e, #b8ad9c);
  --color-ink-faint: light-dark(#79716c, #9a8e7b);
  --color-line: light-dark(#e7decd, #3a332b);
  --color-line-strong: light-dark(#d8ccb4, #4a4238);
  --color-accent: light-dark(#b45309, #d97706);
  --color-on-accent: light-dark(#ffffff, #1f1b16);
  --color-accent-ink: light-dark(#92400e, #e8a33d);
  --color-accent-wash: light-dark(#f9eddc, #382d1d);
  --color-rust: light-dark(#b3261e, #e46f5d);

  --spacing-xs: 4px;
  --spacing-sm: 8px;
  --spacing-md: 16px;
  --spacing-lg: 24px;
  --spacing-xl: 32px;

  --radius-sm: 4px;
  --radius-md: 8px;
  --radius-lg: 12px;
  --radius-full: 999px;
  --radius-circle: 50%;

  /* The one shadow: interrupting surfaces only (modals, toasts). */
  --shadow-dialog: light-dark(
    0 24px 60px -18px rgb(41 37 36 / 0.35),
    0 24px 60px -18px rgb(0 0 0 / 0.6)
  );

  /* Type scale — t-shirt sizing, one step ≈ 1–2px. */
  --font-size-2xs: 0.625rem; /* 10px */
  --font-size-xs: 0.6875rem; /* 11px */
  --font-size-sm: 0.75rem; /* 12px */
  --font-size-md: 0.8125rem; /* 13px */
  --font-size-lg: 0.875rem; /* 14px */
  --font-size-xl: 0.9375rem; /* 15px */
  --font-size-2xl: 1rem; /* 16px */
  --font-size-3xl: 1.125rem; /* 18px */
  --font-size-4xl: 1.1875rem; /* 19px */
  --font-size-5xl: 1.25rem; /* 20px */
  --font-size-6xl: 1.5rem; /* 24px */
  --font-size-7xl: 1.75rem; /* 28px */

  --search-focus-shadow: 0 0 0 3px light-dark(rgb(180 83 9 / 0.18), rgb(217 119 6 / 0.25));
}
```

Note: `--radius-xl`/`--radius-2xl`, `--shadow-sm/md/lg`, `--notes-*`, `--meta-*`, `--color-primary*`, `--color-secondary`, `--color-shared`, `--color-danger*`, `--color-forest`, `--color-bg/surface/border/text*` are all removed. Consumers are remapped in Task 3.

- [ ] **Step 2: Add global craft rules** — append to `src/shared-ui.css` (and delete the old trailing `button:focus-visible…` rule, which this supersedes):

```css
::selection {
  background: light-dark(#f3e3c8, #4a3a1f);
}

:root {
  caret-color: var(--color-accent);
}

:focus-visible {
  outline: 2px solid var(--color-accent);
  outline-offset: 2px;
}

html {
  scrollbar-color: var(--color-line-strong) transparent;
}

@media (prefers-reduced-motion: reduce) {
  *,
  *::before,
  *::after {
    animation-duration: 0.01ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: 0.01ms !important;
  }
}
```

- [ ] **Step 3: Verify + commit** — `npm run lint:css` passes (it will warn about removed vars being undefined — that is Task 3's input, so instead run `node -e "console.log('tokens staged')"` if lint fails on var references) — no: **lint must pass before commit.** Do Task 2 and Task 3 in one sitting if needed; commit separately only if lint is green. Realistic order: implement Task 3's sweep, then commit Task 2+3 together as two commits only if each is green.

```bash
npm run lint:css
git add src/shared-ui.css
git commit -m "feat(desk): Research Desk tokens, selection/focus/scrollbar craft rules"
```

### Task 3: Sweep old token consumers

**Files:**
- Modify: `src/shared-ui.css`, `src/newtab.css`, `src/toolbar-popup.css`, `src/project-manager-renderer.js` (inline `var(--color-primary)` / `var(--color-shared)` dot colors)

**Interfaces:**
- Consumes: Task 2 token names.
- Produces: a CSS corpus where `grep -n "color-primary\|color-secondary\|color-shared\|color-danger\|color-forest\|notes-\|meta-bg\|meta-text\|color-bg\|color-surface\|color-border\|color-text\|shadow-sm\|shadow-md\|shadow-lg\|radius-xl\|radius-2xl" src/*.css` returns nothing.

- [ ] **Step 1: Mechanical remap** across the three CSS files, per the spec §4 mapping:

| Old | New |
|---|---|
| `var(--color-primary)` | `var(--color-accent)` |
| `var(--color-primary-hover)` | `var(--color-accent-ink)` (hover on filled) or drop the rule if redundant |
| `var(--color-bg)` | `var(--color-paper)` |
| `var(--color-surface)` | `var(--color-paper-raised)` |
| `var(--color-border)` | `var(--color-line)` |
| `var(--color-text)` | `var(--color-ink)` |
| `var(--color-text-light)` | `var(--color-ink-soft)` |
| `var(--color-text-lighter)` | `var(--color-ink-faint)` |
| `var(--color-danger)`, `var(--color-danger-hover)` | `var(--color-rust)` |
| `var(--color-shared)` | `var(--color-accent-ink)` |
| `var(--notes-bg)` / `var(--notes-border)` / `var(--notes-text)` | `var(--color-accent-wash)` / `var(--color-line-strong)` / `var(--color-accent-ink)` |
| `var(--meta-bg)` / `var(--meta-text)` | `var(--color-paper-raised)` / `var(--color-ink-soft)` |
| `var(--shadow-sm)`, `var(--shadow-md)` | remove the `box-shadow` declaration (hairline design) |
| `var(--shadow-lg)` | `var(--shadow-dialog)` (dropdowns/dialogs only) |
| `var(--radius-xl)`, `var(--radius-2xl)` (dialog radii) | `var(--radius-lg)` |
| `white` as text on accent fills (`.sign-in-btn`, `.user-avatar`, `.theme-option-icon.active`) | `var(--color-on-accent)` |
| `color: white` on `.user-avatar` bg | keep `bg: var(--color-accent)`, text `var(--color-on-accent)` |

`sed` is fine for the unambiguous rows, then hand-fix the judgment rows. Also in `src/project-manager-renderer.js`: `createSectionLabel(..., 'var(--color-primary)')` → `'var(--color-accent)'` and `'var(--color-shared)'` → `'var(--color-accent-ink)'` (3 call sites each — section dots).

- [ ] **Step 2: Body/base rules** — in `src/shared-ui.css` set `body { background: var(--color-paper); color: var(--color-ink); }` and give `.logo` `font-family: var(--font-display); color: var(--color-ink)`. Buttons that were `background: var(--color-primary)` get `background: var(--color-accent); color: var(--color-on-accent);`.

- [ ] **Step 3: Verify + commit**

```bash
grep -rn "color-primary\|color-secondary\|color-shared\|color-danger\|color-forest\|notes-bg\|notes-border\|notes-text\|meta-bg\|meta-text\|--color-bg\|--color-surface\|--color-border\|--color-text\|shadow-sm\|shadow-md\|shadow-lg\|radius-xl\|radius-2xl" src/*.css src/*.js; echo "exit: $?"
# Expected: no output, exit 1
npm run lint:css && npm run format && npm test
git add -A src/ && git commit -m "feat(desk): remap all surfaces to Research Desk tokens"
```

### Task 4: DESIGN.md + visual-system pointer

**Files:**
- Create: `DESIGN.md` (repo root)
- Modify: `docs/visual-system.md` (replace content with a pointer)

- [ ] **Step 1: Write `DESIGN.md`** — one page mirroring studio's: title `# DESIGN.md — SaveIt ("Research Desk" direction)`, line `> Approved by Rich 2026-08-30 (redesign spec: docs/superpowers/specs/2026-08-30-research-desk-redesign-design.md). Warm editorial: saved pages are documents, the new tab is a good desk — cream paper, warm ink, amber for actions, rust for deny. The page loads fast; the interface stays composed.` Then sections: **Palette** (both theme tables with the measured ratios, copied verbatim from spec §4), **Type** (families, roles, scale, bundling note + `npm run sync-fonts`), **Surfaces & rhythm** (720px column, 8px rhythm, radius 8/12/full, one shadow rule), **Component language** (index row, launch chip, buttons, modal standard, toasts), **Accessibility floor** (ratios above; focus-visible rings; targets ≥24px, 40px in dialogs; `ink-soft` for mono metadata, faint decorative-only; reduced-motion honored).

- [ ] **Step 2: Replace `docs/visual-system.md` content** with:

```markdown
# Visual system

Superseded 2026-08-30 by [DESIGN.md](../DESIGN.md) — the "Research Desk" direction is the single source of truth for tokens, type, component language, and the accessibility floor.
```

- [ ] **Step 3: Commit**

```bash
git add DESIGN.md docs/visual-system.md
git commit -m "docs: DESIGN.md — Research Desk direction; visual-system.md now a pointer"
```

---

## Phase 2 — Newtab recomposition

### Task 5: The Reading Room shell (HTML + CSS)

**Files:**
- Modify: `src/newtab.html` (whole `<body>` above the dialogs)
- Modify: `src/newtab.css` (replace the page-shell/header/sidebar-positioning sections; sidebar row styles stay — they're restyled in Task 9)

**Interfaces:**
- Consumes: Task 2/3 tokens.
- Produces: DOM ids `desk-dateline`, `desk-launch-strip`, `project-pills`, `desk-index-header`, `desk-index-title`, `desk-sort`; the search form keeps ids `saved-pages-search-form` / `saved-pages-search-input` / `saved-pages-search-clear-btn`; `project-sidebar` remains the nav container (now a dropdown panel); `saved-pages-sidebar-toggle-btn` remains the trigger (now a "Projects ▾" text button).

- [ ] **Step 1: Replace the `<main>`…`</main>` block in `src/newtab.html`** with:

```html
  <main id="saved-pages-page" class="desk-page" aria-label="Saved pages">
    <div class="desk-utility-row">
      <div class="desk-utility-left">
        <button
          id="saved-pages-sidebar-toggle-btn"
          class="projects-menu-trigger"
          type="button"
          aria-label="Toggle projects menu"
          aria-expanded="false"
          aria-controls="project-sidebar"
          title="Toggle projects menu"
        >
          Projects
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
            <polyline points="6 9 12 15 18 9"></polyline>
          </svg>
        </button>
        <button id="desk-data-sync-link" class="desk-utility-link" type="button">Data &amp; sync</button>
      </div>
      <div class="desk-utility-right">
        <button id="hero-sign-in-btn" class="sign-in-btn hidden">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4"></path>
            <polyline points="10 17 15 12 10 7"></polyline>
            <line x1="15" y1="12" x2="3" y2="12"></line>
          </svg>
          Sign in
        </button>
        <div id="hero-user-menu" class="user-menu hidden">
          <!-- keep the existing avatar button + dropdown markup verbatim:
               hero-user-avatar-btn, hero-user-dropdown, hero-theme-toggle-container,
               hero-data-sync-btn, hero-refresh-btn, hero-sharing-btn, hero-user-email,
               hero-sign-out-btn -->
        </div>
      </div>
    </div>

    <header class="desk-masthead">
      <a href="newtab.html" class="desk-masthead-wordmark">SaveIt</a>
      <p id="desk-dateline" class="desk-dateline"></p>
      <div class="desk-rule-double" aria-hidden="true"></div>
    </header>

    <form id="saved-pages-search-form" class="search-form desk-search-hero" role="search">
      <span class="search-icon" aria-hidden="true">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <circle cx="11" cy="11" r="8"></circle>
          <path d="m21 21-4.35-4.35"></path>
        </svg>
      </span>
      <input
        type="text"
        id="saved-pages-search-input"
        class="search-input desk-search-input"
        placeholder="Search your desk…"
        autocomplete="off"
        autofocus
      >
      <button id="saved-pages-search-clear-btn" class="clear-search hidden" type="button" title="Clear search">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
          <line x1="18" y1="6" x2="6" y2="18"></line>
          <line x1="6" y1="6" x2="18" y2="18"></line>
        </svg>
      </button>
      <button id="desk-search-find-btn" class="desk-search-find" type="submit">Find</button>
    </form>

    <div id="desk-launch-strip" class="launch-strip" aria-label="Pinned pages"></div>

    <nav id="project-pills" class="project-pills" aria-label="Projects"></nav>

    <section class="desk-index">
      <div id="desk-index-header" class="desk-index-header">
        <h2 id="desk-index-title" class="desk-index-title">Recently saved</h2>
        <label class="desk-sort-label">
          <span class="desk-sort-label-text">Sort</span>
          <select id="desk-sort" class="desk-sort">
            <option value="newest" selected>Newest</option>
            <option value="oldest">Oldest</option>
          </select>
        </label>
      </div>
      <div id="saved-pages-results" class="desk-index-results" aria-live="polite"></div>
    </section>

    <div id="saved-pages-sidebar-backdrop" class="projects-menu-backdrop hidden" aria-hidden="true"></div>
    <aside id="project-sidebar" class="projects-menu-panel" aria-label="Projects"></aside>
  </main>
```

Keep footer, the three dialog pairs, toast region, and the script tags exactly as they are.

- [ ] **Step 2: Add the shell CSS to `src/newtab.css`** (top of file, replacing the old `.saved-pages-page*` shell rules; delete rules for `.saved-pages-page-header`, `.saved-pages-page-body`, `.saved-pages-page-content`, `.saved-pages-page-sidebar`, `.saved-pages-sidebar-toggle`, `.saved-pages-sidebar-backdrop`):

```css
/* ── Reading Room shell ─────────────────────────────────────────── */

.desk-page {
  width: 100%;
  max-width: 760px;
  margin: 0 auto;
  padding: 20px 20px 48px;
  display: flex;
  flex-direction: column;
  gap: 14px;
  flex: 1;
}

.desk-utility-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 12px;
  min-height: 32px;
}

.desk-utility-left,
.desk-utility-right {
  display: flex;
  align-items: center;
  gap: 14px;
}

.projects-menu-trigger {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 4px 2px;
  background: none;
  border: none;
  font-family: var(--font-mono);
  font-size: var(--font-size-xs);
  color: var(--color-accent-ink);
  cursor: pointer;
}

.projects-menu-trigger:hover {
  text-decoration: underline;
  text-underline-offset: 3px;
}

.desk-utility-link {
  padding: 4px 2px;
  background: none;
  border: none;
  font-family: var(--font-mono);
  font-size: var(--font-size-xs);
  color: var(--color-ink-soft);
  cursor: pointer;
}

.desk-utility-link:hover {
  color: var(--color-ink);
  text-decoration: underline;
  text-underline-offset: 3px;
}

.desk-masthead {
  text-align: center;
  padding-top: 6px;
}

.desk-masthead-wordmark {
  font-family: var(--font-display);
  font-size: var(--font-size-7xl);
  font-weight: 500;
  letter-spacing: 0.01em;
  color: var(--color-ink);
  text-decoration: none;
}

.desk-dateline {
  margin-top: 6px;
  font-family: var(--font-mono);
  font-size: var(--font-size-xs);
  color: var(--color-ink-soft);
}

.desk-rule-double {
  margin-top: 12px;
  border-top: 2px solid var(--color-ink);
}

.desk-rule-double::after {
  content: "";
  display: block;
  margin-top: 2px;
  border-top: 1px solid var(--color-ink);
}

.desk-search-hero {
  display: flex;
  align-items: center;
  gap: 10px;
  max-width: 640px;
  width: 100%;
  margin: 4px auto 0;
  background: var(--color-paper-raised);
  border: 1px solid var(--color-line-strong);
  border-radius: var(--radius-md);
  padding: 6px 6px 6px 14px;
}

.desk-search-hero .search-icon {
  position: static;
  transform: none;
  color: var(--color-ink-faint);
}

.desk-search-input {
  padding: 8px 4px;
  border: none;
  background: transparent;
  font-family: var(--font-display);
  font-size: var(--font-size-2xl);
}

.desk-search-input:focus {
  box-shadow: none;
}

.desk-search-input::placeholder {
  font-style: italic;
  color: var(--color-ink-faint);
}

.desk-search-find {
  padding: 8px 16px;
  background: var(--color-accent);
  color: var(--color-on-accent);
  border: none;
  border-radius: var(--radius-md);
  font-weight: 600;
  font-size: var(--font-size-md);
  cursor: pointer;
}

.desk-search-find:hover {
  background: var(--color-accent-ink);
}

.launch-strip {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  justify-content: center;
}

.project-pills {
  display: flex;
  flex-wrap: wrap;
  gap: 7px;
  justify-content: center;
}

.desk-index {
  margin-top: 10px;
}

.desk-index-header {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  gap: 12px;
  padding-bottom: 6px;
}

.desk-index-title {
  font-family: var(--font-mono);
  font-size: var(--font-size-xs);
  font-weight: 500;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  color: var(--color-ink-soft);
}

.desk-sort-label {
  display: inline-flex;
  align-items: baseline;
  gap: 6px;
  font-family: var(--font-mono);
  font-size: var(--font-size-xs);
  color: var(--color-ink-soft);
}

.desk-sort {
  border: none;
  background: none;
  font-family: var(--font-mono);
  font-size: var(--font-size-xs);
  color: var(--color-accent-ink);
  cursor: pointer;
}

.desk-sort option {
  color: var(--color-ink);
  background: var(--color-paper-raised);
}

/* Projects dropdown panel (reuses the .project-nav row markup). */
.projects-menu-panel {
  position: absolute;
  top: 54px;
  left: 20px;
  width: 300px;
  max-height: min(70vh, 560px);
  overflow-y: auto;
  background: var(--color-paper-raised);
  border: 1px solid var(--color-line-strong);
  border-radius: var(--radius-md);
  box-shadow: var(--shadow-dialog);
  padding: 10px;
  z-index: 900;
}

.projects-menu-panel.hidden {
  display: none;
}

.projects-menu-backdrop {
  position: fixed;
  inset: 0;
  z-index: 890;
}

.desk-breadcrumb {
  display: flex;
  align-items: baseline;
  gap: 8px;
}

.desk-breadcrumb-back {
  padding: 2px 0;
  background: none;
  border: none;
  font-family: var(--font-mono);
  font-size: var(--font-size-xs);
  color: var(--color-accent-ink);
  cursor: pointer;
}

.desk-breadcrumb-back:hover {
  text-decoration: underline;
  text-underline-offset: 3px;
}

.desk-breadcrumb-title {
  font-family: var(--font-mono);
  font-size: var(--font-size-xs);
  letter-spacing: 0.14em;
  text-transform: uppercase;
  color: var(--color-ink-soft);
}

@media (max-width: 700px) {
  .desk-page {
    padding: 14px 14px 40px;
  }

  .desk-masthead-wordmark {
    font-size: var(--font-size-6xl);
  }

  .desk-search-hero {
    max-width: none;
  }
}
```

Also delete the old `.project-sidebar` fixed-width column rules (the panel rules above replace them; `.project-nav*` row rules remain and get dropdown-density tweaks in Task 9).

- [ ] **Step 3: Wire the trigger text/state.** In `src/newtab.js` / `src/newtab-app.js` / `src/project-manager-ui.js`, the existing toggle wiring (search for `saved-pages-sidebar-toggle-btn`) keeps working — the button is still the same id and the panel is still `#project-sidebar`; the old `≤700px`-only logic can now apply at all widths (hamburger was mobile-only: find the media-condition in the controller and remove it so the toggle works everywhere; keep `aria-expanded` sync). Remove any references to deleted nodes (`saved-pages-page-header`, `saved-pages-page-body`, `.saved-pages-page-logo`).

- [ ] **Step 4: Update structure-asserting tests** — `tests/unit/newtab.test.js` (13 hits on old classes), `tests/unit/sidebar-overlay.test.js`, `tests/unit/project-manager-ui.test.js` (2), `tests/unit/project-manager.test.js` (6). Apply the mapping:

| Old selector | New selector |
|---|---|
| `.saved-pages-page` | `.desk-page` (id `saved-pages-page` unchanged) |
| `.saved-pages-sidebar-toggle` | `.projects-menu-trigger` |
| `.saved-pages-sidebar-backdrop` | `.projects-menu-backdrop` |
| `.project-sidebar.saved-pages-page-sidebar` | `.projects-menu-panel` |
| `.saved-pages-page-search` / `-input` | `.desk-search-hero` / `.desk-search-input` |
| `logo-hero` / `.saved-pages-page-logo` | `.desk-masthead-wordmark` |

Delete `tests/unit/sidebar-overlay.test.js` if it only covers the removed mobile-overlay mechanics; if it covers open/close generally, update selectors instead.

- [ ] **Step 5: Verify + commit**

```bash
npm test && npm run lint && npm run lint:css && bash scripts/test-csp.sh
git add -A src/ tests/ && git commit -m "feat(desk): Reading Room shell — masthead, search hero, dropdown nav container"
```

### Task 6: Index rows replace cards

**Files:**
- Modify: `src/newtab-drawer-renderer.js` (`renderDrawerCardMarkup` body → row markup)
- Modify: `src/newtab.css` (replace the `.saved-pages-drawer-card*` block, ~lines 212+, with `.index-row*` styles)
- Test: `tests/unit/newtab-drawer-renderer.test.js`, `tests/unit/newtab-drawer-events.test.js`, `tests/unit/newtab.test.js`

**Interfaces:**
- Keeps: `data-action` names (`edit`, `pin`, `toggle-privacy`, `projects`, `delete`, `remove-project`, `cancel-edit`), `data-id`, `data-page-id`, `data-url`/`role="link"`/`tabindex="0"`, the edit form markup, the `getDrawerCardElement` lookup.
- Produces: `.index-row` class family; all delegated events keep working because attributes are unchanged.

- [ ] **Step 1: Rewrite `renderDrawerCardMarkup` return value** (keep every computed variable above it; only the template changes):

```js
  return `
    <article class="index-row" data-page-id="${escapeHtml(page.id || '')}"${navigationAttrs}>
      <div class="index-row-main">
        <h3 class="index-row-title">${escapeHtml(page.title || domain || 'Untitled')}</h3>
        <span class="index-row-date">${escapeHtml(page.created_at ? new Date(page.created_at).toLocaleDateString(undefined, { day: 'numeric', month: 'short' }) : '')}</span>
        <div class="index-row-actions">
          ${isEditing ? '' : editButtonHtml}
          <button
            class="index-row-action index-row-pin-btn ${page.pinned ? 'is-active' : ''}"
            type="button"
            data-action="pin"
            data-id="${escapeHtml(page.id)}"
            title="${actionBusyTitle || (page.pinned ? 'Unpin page' : 'Pin page')}"
            aria-label="${actionBusyTitle || (page.pinned ? 'Unpin page' : 'Pin page')}"
            ${actionDisabledAttr}
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true">
              <path d="M12 17v5"></path>
              <path d="M8 3h8l-1 5 3 3v2H6v-2l3-3-1-5z"></path>
            </svg>
          </button>
          ${isEditing ? '' : privacyButtonHtml}
          ${projectsButtonHtml}
          <button
            class="index-row-action index-row-delete-btn"
            type="button"
            data-action="delete"
            data-id="${escapeHtml(page.id)}"
            title="Delete page"
            aria-label="Delete page"
            ${isEditing ? 'disabled' : ''}
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true">
              <path d="M3 6h18"></path>
              <path d="M8 6V4h8v2"></path>
              <path d="M19 6l-1 14H6L5 6"></path>
              <path d="M10 11v6"></path>
              <path d="M14 11v6"></path>
            </svg>
          </button>
        </div>
      </div>
      ${isEditing
        ? editFormHtml
        : (summary ? `<p class="index-row-summary">${escapeHtml(truncateText(summary))}</p>` : '')}
      ${projectPillsHtml}
      <div class="index-row-footer">
        <div class="index-row-meta">
          ${domain ? `<img class="index-row-favicon" src="${getFaviconUrlForDomain(domain)}" alt="" width="14" height="14">` : ''}
          ${meta.length ? meta.join('<span class="index-row-meta-sep">·</span>') : ''}
        </div>
        ${tagsHtml ? `<div class="index-row-tags">${tagsHtml}</div>` : ''}
      </div>
    </article>
  `;
```

In the same file, rename the inner button classes (`saved-pages-drawer-action-btn saved-pages-drawer-edit-btn` → `index-row-action index-row-edit-btn`, same for privacy/projects), `saved-pages-drawer-card-projects` → `index-row-projects`, the edit-form classes keep their names (`.saved-pages-drawer-edit-form*` — restyle in CSS, no rename needed), and `getDrawerCardElement`'s `querySelectorAll('.saved-pages-drawer-card')` → `'.index-row'`.

- [ ] **Step 2: Row CSS** — replace the card block in `src/newtab.css`:

```css
/* ── Index rows (table-of-contents, not boxes) ──────────────────── */

.index-row {
  padding: 13px 2px;
  border-bottom: 1px solid var(--color-line);
  cursor: pointer;
}

.index-row-main {
  display: flex;
  align-items: baseline;
  gap: 12px;
}

.index-row-title {
  font-family: var(--font-display);
  font-size: var(--font-size-2xl);
  font-weight: 500;
  line-height: 1.4;
  color: var(--color-ink);
  flex: 1;
  min-width: 0;
  overflow-wrap: anywhere;
}

.index-row-date {
  flex: none;
  font-family: var(--font-mono);
  font-size: var(--font-size-xs);
  color: var(--color-ink-soft);
  transition: opacity 0.15s;
}

.index-row-actions {
  display: flex;
  gap: 2px;
  flex: none;
  opacity: 0;
  transition: opacity 0.15s;
}

.index-row:hover .index-row-actions,
.index-row:focus-within .index-row-actions {
  opacity: 1;
}

.index-row:hover .index-row-date,
.index-row:focus-within .index-row-date {
  opacity: 0;
}

.index-row-action {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  padding: 0;
  background: none;
  border: none;
  border-radius: var(--radius-sm);
  color: var(--color-ink-soft);
  cursor: pointer;
}

.index-row-action svg {
  width: 15px;
  height: 15px;
}

.index-row-action:hover {
  background: var(--color-accent-wash);
  color: var(--color-accent-ink);
}

.index-row-action.is-active {
  color: var(--color-accent-ink);
}

.index-row-delete-btn:hover {
  background: light-dark(#fbe9e7, #3a2420);
  color: var(--color-rust);
}

.index-row-summary {
  margin-top: 4px;
  font-size: var(--font-size-md);
  line-height: 1.55;
  color: var(--color-ink-soft);
  max-width: 68ch;
}

.index-row-projects {
  display: flex;
  gap: 6px;
  margin-top: 7px;
  flex-wrap: wrap;
}

.index-row-footer {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-top: 7px;
  flex-wrap: wrap;
}

.index-row-meta {
  display: inline-flex;
  align-items: center;
  gap: 7px;
  font-family: var(--font-mono);
  font-size: var(--font-size-xs);
  color: var(--color-ink-soft);
}

.index-row-favicon {
  border-radius: 3px;
}

.index-row-meta-sep {
  color: var(--color-ink-faint);
}

.index-row-tags {
  display: flex;
  gap: 5px;
  flex-wrap: wrap;
}
```

Restyle the existing `.saved-pages-drawer-card-tags .page-tag`-family rules (whatever `renderPageTags` emits — check `src/newtab-shared.js`) to mono pills: `font-family: var(--font-mono); font-size: var(--font-size-2xs); color: var(--color-accent-ink); background: var(--color-accent-wash); border-radius: var(--radius-full); padding: 1px 8px;` and rename their card-scoped selectors to `.index-row-tags`.

- [ ] **Step 3: Update tests** — in `newtab-drawer-renderer.test.js`, `newtab-drawer-events.test.js`, `newtab.test.js` apply:

| Old | New |
|---|---|
| `.saved-pages-drawer-card` | `.index-row` |
| `.saved-pages-drawer-card-title` | `.index-row-title` |
| `.saved-pages-drawer-card-summary` | `.index-row-summary` |
| `.saved-pages-drawer-card-favicon` | `.index-row-favicon` |
| `.saved-pages-drawer-card-actions` | `.index-row-actions` |
| `.saved-pages-drawer-action-btn` | `.index-row-action` |
| `.saved-pages-drawer-card-meta` | `.index-row-meta` |

- [ ] **Step 4: Verify + commit**

```bash
npx vitest run tests/unit/newtab-drawer-renderer.test.js tests/unit/newtab-drawer-events.test.js tests/unit/newtab.test.js
npm test && npm run lint:css
git add -A src/ tests/ && git commit -m "feat(desk): saved-page cards become table-of-contents index rows"
```

### Task 7: Launch strip (pinned chips with rename)

**Files:**
- Modify: `src/newtab-drawer-renderer.js` (`renderHomePinnedCardMarkup` → chip markup; `renderPinnedShelf` → `renderLaunchStrip` targeting `#desk-launch-strip`)
- Modify: `src/newtab-drawer-ui.js` (rename call sites, pass the strip container)
- Modify: `src/newtab-drawer-events.js` (chip rename delegation)
- Modify: `src/newtab.css` (delete `.saved-pages-pinned-shelf*`/`.saved-pages-home-pinned*`, add `.launch-chip*`)
- Test: renderer/events test files

**Interfaces:**
- Produces: `renderLaunchStrip(pages)` / `clearLaunchStrip()` (renamed exports on `createDrawerRenderer`'s return object); chip markup uses `data-action="pin"` (existing unpin path) and `data-action="chip-rename"` + `data-id`; rename input `.launch-chip-rename-input`.
- Consumes: the drawer's update handler — the same `handleDrawerUpdate(id, { title, ai_summary_brief })` the edit form uses (`src/newtab-drawer-data.js:547`).

- [ ] **Step 1: Chip markup** — replace `renderHomePinnedCardMarkup`:

```js
// Launch chip for the pinned strip. Pinned pages are usually utilities
// (Gmail, Calendar, Jira): the chip is a launcher, so it shows favicon +
// full user-retitled label — never truncated (DESIGN.md "launch strip").
// Unpin reuses the drawer pin button contract (data-action="pin") so the
// existing delegation handles it with no new wiring.
export function renderLaunchChipMarkup(page) {
  const domain = getPageDomain(page);
  const url = page.url || '';
  const navigationAttrs = url
    ? ` data-url="${escapeHtml(url)}" role="link" tabindex="0"`
    : '';
  const faviconHtml = domain
    ? `<img class="launch-chip-favicon" src="${getFaviconUrlForDomain(domain)}" alt="" width="14" height="14">`
    : '';

  return `
    <article class="launch-chip" data-page-id="${escapeHtml(page.id || '')}"${navigationAttrs}>
      ${faviconHtml}
      <span class="launch-chip-label">${escapeHtml(page.title || domain || 'Untitled')}</span>
      <button
        class="launch-chip-action"
        type="button"
        data-action="chip-rename"
        data-id="${escapeHtml(page.id)}"
        title="Rename"
        aria-label="Rename ${escapeHtml(page.title || 'pinned page')}"
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true">
          <path d="M12 20h9"></path>
          <path d="M16.5 3.5a2.12 2.12 0 1 1 3 3L7 19l-4 1 1-4 12.5-12.5z"></path>
        </svg>
      </button>
      <button
        class="launch-chip-action"
        type="button"
        data-action="pin"
        data-id="${escapeHtml(page.id)}"
        title="Unpin"
        aria-label="Unpin ${escapeHtml(page.title || 'pinned page')}"
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true">
          <line x1="18" y1="6" x2="6" y2="18"></line>
          <line x1="6" y1="6" x2="18" y2="18"></line>
        </svg>
      </button>
    </article>
  `;
}
```

- [ ] **Step 2: Renderer plumbing** — in `createDrawerRenderer`: add a `launchStripContainer` param (wired in `newtab-drawer-ui.js` to `document.getElementById('desk-launch-strip')`); rename `renderPinnedShelf` → `renderLaunchStrip` and `clearPinnedShelf` → `clearLaunchStrip` (return object + all 6 call sites in `newtab-drawer-ui.js:93-143`). The strip no longer lives in `resultsContainer` — write directly:

```js
  function renderLaunchStrip(pinnedPages = []) {
    if (!launchStripContainer) {
      return;
    }
    if (!pinnedPages.length) {
      launchStripContainer.replaceChildren();
      return;
    }
    launchStripContainer.replaceChildren(
      ...pinnedPages.map(page => createElementFromHtml(renderLaunchChipMarkup(page), documentObj))
    );
  }

  function clearLaunchStrip() {
    launchStripContainer?.replaceChildren();
  }
```

Remove the now-dead `createHomePinnedCardElement`, slot plumbing, and `ensureSection('pinned')` usage. Update `newtab-home.js` if it references the shelf by class.

- [ ] **Step 3: Chip CSS** in `src/newtab.css` (replacing the pinned-shelf block):

```css
/* ── Launch strip ───────────────────────────────────────────────── */

.launch-chip {
  display: inline-flex;
  align-items: center;
  gap: 7px;
  max-width: 260px;
  padding: 5px 8px 5px 11px;
  background: var(--color-paper-raised);
  border: 1px solid var(--color-line);
  border-radius: var(--radius-md);
  cursor: pointer;
}

.launch-chip:hover {
  border-color: var(--color-line-strong);
}

.launch-chip-favicon {
  border-radius: 3px;
  flex: none;
}

.launch-chip-label {
  font-size: var(--font-size-sm);
  font-weight: 600;
  color: var(--color-ink);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: clip; /* no ellipsis — labels are user-retitled, never truncated */
}

.launch-chip-action {
  display: none;
  align-items: center;
  justify-content: center;
  width: 20px;
  height: 20px;
  padding: 0;
  flex: none;
  background: none;
  border: none;
  border-radius: var(--radius-sm);
  color: var(--color-ink-soft);
  cursor: pointer;
}

.launch-chip-action svg {
  width: 12px;
  height: 12px;
}

.launch-chip:hover .launch-chip-action,
.launch-chip:focus-within .launch-chip-action {
  display: inline-flex;
}

.launch-chip-action:hover {
  background: var(--color-accent-wash);
  color: var(--color-accent-ink);
}

.launch-chip-rename-input {
  width: 150px;
  padding: 1px 4px;
  border: none;
  border-bottom: 1px solid var(--color-accent);
  background: transparent;
  font-family: var(--font-sans);
  font-size: var(--font-size-sm);
  font-weight: 600;
  color: var(--color-ink);
}
```

Note: `overflow: hidden` + `text-overflow: clip` caps runaway labels at 260px without an ellipsis; the fix for a long label is retitling (spec §3).

- [ ] **Step 4: Rename delegation** in `src/newtab-drawer-events.js` (inside the existing delegated click handler, alongside the `pin`/`edit` branches; the events layer already receives the data-layer handlers — thread `updatePage: handleDrawerUpdate` through whatever handler object it gets from `newtab-drawer-data.js`):

```js
  if (target.closest('[data-action="chip-rename"]')) {
    const button = target.closest('[data-action="chip-rename"]');
    const chip = button.closest('.launch-chip');
    const pageId = button.dataset.id;
    const label = chip.querySelector('.launch-chip-label');
    if (!chip || !label) {
      return;
    }
    const input = document.createElement('input');
    input.className = 'launch-chip-rename-input';
    input.type = 'text';
    input.value = label.textContent.trim();
    input.setAttribute('aria-label', 'Rename pinned page');
    label.replaceWith(input);
    input.focus();
    input.select();
    const commit = async () => {
      const next = input.value.trim();
      if (!next || next === label.dataset.original) {
        restore();
        return;
      }
      // Reuses the edit form's update path (title + carried summary) so
      // rename hits the same API, cache, and realtime refresh as editing.
      await handlers.updatePage(pageId, { title: next, ai_summary_brief: undefined });
      // strip re-renders from state after the update resolves
    };
    const restore = () => {
      input.replaceWith(label);
    };
    input.addEventListener('keydown', event => {
      if (event.key === 'Enter') {
        event.preventDefault();
        commit();
      } else if (event.key === 'Escape') {
        event.preventDefault();
        restore();
      }
    });
    input.addEventListener('blur', restore, { once: true });
    return;
  }
```

`handlers.updatePage` must map to `handleDrawerUpdate` (newtab-drawer-data.js:547); it already merges `updates.ai_summary_brief || ''` — for chips pass only the title by extending `handleDrawerUpdate` to treat `ai_summary_brief === undefined` as "keep existing": change line 561 to `const nextAiSummaryBrief = updates.ai_summary_brief === undefined ? (page.ai_summary_brief || '') : updates.ai_summary_brief.trim();`. The edit form always sends both fields, so its behavior is unchanged.

- [ ] **Step 5: Update tests** — replace `.saved-pages-home-pinned-card`/`.saved-pages-pinned-shelf` assertions with `.launch-chip`/`.launch-strip` equivalents; add one test: clicking `chip-rename`, typing, Enter calls `handlers.updatePage` with `{ title: 'New name', ai_summary_brief: undefined }`.

```bash
npx vitest run tests/unit/newtab-drawer-renderer.test.js tests/unit/newtab-drawer-events.test.js
npm test && npm run lint:css
git add -A src/ tests/ && git commit -m "feat(desk): pinned shelf becomes the launch strip with chip rename"
```

### Task 8: Dateline, sort control, keyboard shortcuts

**Files:**
- Modify: `src/newtab-home.js` or `src/newtab-app.js` (dateline), `src/newtab.js` (shortcuts), `src/newtab-drawer-ui.js` (sort wiring)
- Test: `tests/unit/newtab-home.test.js`, `tests/unit/newtab.test.js`

**Interfaces:**
- Produces: `formatDeskDateline(date, pageCount)` → `"Sunday, 30 August · 1,284 pages on your desk"`; `#desk-sort` change → store sort option; `/` focuses `#saved-pages-search-input`; Escape in the input clears it.

- [ ] **Step 1: Dateline util + wiring** (export from `src/newtab-shared.js`):

```js
export function formatDeskDateline(date, pageCount) {
  const datePart = new Intl.DateTimeFormat(undefined, {
    weekday: 'long',
    day: 'numeric',
    month: 'long'
  }).format(date);
  const countPart = typeof pageCount === 'number' && pageCount > 0
    ? `${pageCount.toLocaleString()} page${pageCount === 1 ? '' : 's'} on your desk`
    : 'your desk is clear';
  return `${datePart} · ${countPart}`;
}
```

Call it wherever the drawer chrome re-renders (the `renderChrome` path in `newtab-drawer-ui.js`), writing `textContent` into `#desk-dateline` with `dashboard.allPages.length`; a signed-out state writes just the date part. Test: `formatDeskDateline(new Date('2026-08-30'), 1284)` matches `/Sunday, 30 August · 1,284 pages on your desk/`.

- [ ] **Step 2: Sort control** — `#desk-sort` change handler in `newtab-drawer-ui.js`: call the store method that accepts `updateOptions.sort` (`src/warm-cache-list-store.js:892` — locate the public method that forwards there; if it is `store.sync({ sort })` or similar, use exactly that). Persist choice in `localStorage['desk-index-sort']` and initialize the select on load. Newest/oldest only — the store supports no title sort.

- [ ] **Step 3: Keyboard shortcuts** in `src/newtab.js` init:

```js
document.addEventListener('keydown', event => {
  if (event.key === '/' && !event.ctrlKey && !event.metaKey && !event.altKey) {
    const active = document.activeElement;
    const tag = active?.tagName?.toLowerCase();
    if (tag === 'input' || tag === 'textarea' || tag === 'select' || active?.isContentEditable) {
      return;
    }
    event.preventDefault();
    document.getElementById('saved-pages-search-input')?.focus();
  }
});
```

Escape-clear already exists via the clear button; add `input.addEventListener('keydown', e => { if (e.key === 'Escape' && input.value) { /* existing clear handler */ } })` wired to the same function the clear button uses.

- [ ] **Step 4: Tests + commit**

```bash
npm test && npm run lint
git add -A src/ tests/ && git commit -m "feat(desk): dateline, index sort control, / and Esc search shortcuts"
```

---

## Phase 3 — Navigation & modals

### Task 9: Projects dropdown, pills, breadcrumb

**Files:**
- Modify: `src/project-manager-renderer.js` (add `renderProjectPills`, `renderBreadcrumb`, archived rows; keep `renderProjectSidebar` as the panel body)
- Modify: `src/newtab.css` (`.project-nav*` density tweaks inside the panel; pill styles)
- Modify: `src/project-manager-controller.js` / `newtab.js` (render pills/breadcrumb wherever `renderProjectSidebar` is invoked; `desk-data-sync-link` click → open data-sync dialog, same as `hero-data-sync-btn`)
- Test: `tests/unit/project-manager-renderer.test.js`, `tests/unit/project-manager.test.js`, `tests/unit/project-manager-ui.test.js`

**Interfaces:**
- Produces: `renderProjectPills(container, { dashboard, getSelectedProject })` — pills: `All pages`, the 4 most recently updated active projects (`updated_at` desc, fallback name sort) with counts, a `+N more` pill (only when overflow) that dispatches a click on `#saved-pages-sidebar-toggle-btn`, and `+ New`; pill buttons carry `data-project-id` (`''` = all) and `.is-active`. `renderBreadcrumb(container, { dashboard, selectedLabel, count })` — back button `data-action="breadcrumb-back"` + `# label — N pages`.

- [ ] **Step 1: Pills + breadcrumb renderers** — add to `src/project-manager-renderer.js`:

```js
// Pills row: All pages + the 4 most recently active projects + overflow.
// The dropdown (renderProjectSidebar) is always the complete list, so the
// row is a convenience surface, not the source of truth.
export function renderProjectPills(container, { dashboard, documentObj = container?.ownerDocument || document }) {
  if (!container) {
    return;
  }
  const selectedProjectId = dashboard.selectedProjectId || '';
  const activeProjects = (dashboard.projects || [])
    .filter(project => !project.archived)
    .sort((a, b) => (b.updated_at || '').localeCompare(a.updated_at || '') || a.name.localeCompare(b.name));
  const visible = activeProjects.slice(0, 4);
  const overflow = activeProjects.length - visible.length;

  const makePill = (projectId, label, isActive) => {
    const pill = createElement(documentObj, 'button', {
      className: `project-pill-tab${isActive ? ' is-active' : ''}`,
      text: label,
      attributes: { type: 'button', 'data-project-id': projectId }
    });
    return pill;
  };

  container.replaceChildren(
    makePill('', 'All pages', !selectedProjectId && dashboard.selectedDomainId === null && selectedProjectId !== 'pinned')
  );
  visible.forEach(project => {
    container.append(makePill(project.id, `${project.name} · ${project.page_count || 0}`, project.id === selectedProjectId));
  });
  if (overflow > 0) {
    const more = createElement(documentObj, 'button', {
      className: 'project-pill-tab project-pill-more',
      text: `+${overflow} more`,
      attributes: { type: 'button', 'data-action': 'open-projects-menu' }
    });
    container.append(more);
  }
  const create = createElement(documentObj, 'button', {
    className: 'project-pill-new',
    text: '+ New',
    attributes: { type: 'button', 'data-action': 'create-project' }
  });
  container.append(create);
}

export function renderBreadcrumb(container, { label, count }, documentObj = container?.ownerDocument || document) {
  if (!container) {
    return;
  }
  const back = createElement(documentObj, 'button', {
    className: 'desk-breadcrumb-back',
    text: '‹ Back to all',
    attributes: { type: 'button', 'data-action': 'breadcrumb-back' }
  });
  const title = createElement(documentObj, 'span', {
    className: 'desk-breadcrumb-title',
    text: `# ${label} — ${typeof count === 'number' ? `${count} page${count === 1 ? '' : 's'}` : ''}`
  });
  container.replaceChildren(back, title);
}
```

Delegation (in the controller/events layer that already routes `data-project-id` clicks): `project-pill-tab` clicks reuse the existing sidebar row selection handler; `open-projects-menu` clicks `#saved-pages-sidebar-toggle-btn`; `create-project` triggers the existing create flow (the sidebar create button's handler); `breadcrumb-back` clears the selected scope (the existing "All pages" selection).

- [ ] **Step 2: Archived section in the dropdown** — in `renderProjectSidebar`, after the shared-with-me block, add:

```js
  const archivedProjects = (dashboard.projects || [])
    .filter(project => project.archived)
    .sort((a, b) => a.name.localeCompare(b.name));
  if (archivedProjects.length) {
    nav.append(createSectionLabel(documentObj, 'Archived', 'var(--color-ink-faint)'));
    archivedProjects.forEach(project => {
      nav.append(createSidebarRow(documentObj, {
        projectId: project.id,
        name: project.name,
        count: project.page_count || 0,
        isActive: project.id === dashboard.selectedProjectId
      }));
    });
  }
```

No per-row actions on archived rows (no unarchive API exists — do not invent one).

- [ ] **Step 3: Panel density + pill CSS** — in `src/newtab.css` tighten `.project-nav-row` paddings for dropdown density (`padding: 5px 8px`), selected row: `background: var(--color-accent-wash); border-left: 2px solid var(--color-accent); ` on `.project-nav-item.is-active`; add:

```css
.project-pill-tab {
  padding: 3px 11px;
  background: none;
  border: 1px solid var(--color-line);
  border-radius: var(--radius-full);
  font-family: var(--font-mono);
  font-size: var(--font-size-2xs);
  color: var(--color-ink-soft);
  cursor: pointer;
}

.project-pill-tab:hover {
  border-color: var(--color-line-strong);
  color: var(--color-ink);
}

.project-pill-tab.is-active {
  background: var(--color-accent-wash);
  border-color: var(--color-line-strong);
  color: var(--color-accent-ink);
}

.project-pill-more {
  border-style: dashed;
}

.project-pill-new {
  padding: 3px 6px;
  background: none;
  border: none;
  font-family: var(--font-mono);
  font-size: var(--font-size-2xs);
  color: var(--color-accent-ink);
  cursor: pointer;
}

.project-pill-new:hover {
  text-decoration: underline;
  text-underline-offset: 3px;
}
```

- [ ] **Step 4: Wire render calls + `desk-data-sync-link`** — wherever `renderProjectSidebar` is invoked (controller), also call `renderProjectPills(document.getElementById('project-pills'), { dashboard })`, and swap `#desk-index-title` content: when a scope is active, render `renderBreadcrumb` into `#desk-index-header` (replacing title + sort? No — breadcrumb replaces only the title element; keep sort). `desk-data-sync-link` gets the same listener as `hero-data-sync-btn`.

- [ ] **Step 5: Tests + commit** — update the 3 project-manager test files for pills/breadcrumb/archived; add: pills render max 4 + `+N more`; archived section lists archived with no action buttons.

```bash
npx vitest run tests/unit/project-manager-renderer.test.js tests/unit/project-manager.test.js tests/unit/project-manager-ui.test.js
npm test && npm run lint
git add -A src/ tests/ && git commit -m "feat(desk): projects dropdown with archived section, pills row, breadcrumb"
```

### Task 10: Modal standard

**Files:**
- Modify: `src/newtab.css` (`.project-editor-dialog`, `.project-editor-backdrop`, `.project-editor-eyebrow`, `.project-editor-title`, `.project-editor-close`)
- Modify: `src/project-manager-renderer.js`, `src/sharing-centre.js`, `src/data-sync-centre.js` (kicker text/class only, if needed)

- [ ] **Step 1: Modal CSS**:

```css
.project-editor-backdrop {
  position: fixed;
  inset: 0;
  background: light-dark(rgb(41 37 36 / 0.3), rgb(0 0 0 / 0.55));
  z-index: 1000;
}

.project-editor-dialog {
  position: fixed;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  width: min(560px, calc(100vw - 32px));
  max-height: min(80vh, 720px);
  overflow-y: auto;
  background: var(--color-paper-raised);
  border: 1px solid var(--color-line-strong);
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-dialog);
  padding: var(--spacing-lg);
  z-index: 1001;
}

.project-editor-eyebrow {
  font-family: var(--font-mono);
  font-size: var(--font-size-xs);
  letter-spacing: 0.14em;
  text-transform: uppercase;
  color: var(--color-ink-soft);
}

.project-editor-title {
  font-family: var(--font-display);
  font-size: 22px;
  font-weight: 500;
  color: var(--color-ink);
}

.project-editor-close {
  padding: 4px 10px;
  background: none;
  border: 1px solid var(--color-line-strong);
  border-radius: var(--radius-md);
  color: var(--color-ink-soft);
  font-size: var(--font-size-md);
  cursor: pointer;
}

.project-editor-close:hover {
  color: var(--color-ink);
}
```

Adjust sharing-centre/data-sync kickers to the same mono-uppercase pattern (class `project-editor-eyebrow` reused; keep their existing title ids for `aria-labelledby`).

- [ ] **Step 2: Verify + commit**

```bash
npm test && npm run lint:css && npm run format
git add -A src/ && git commit -m "feat(desk): modal standard — raised paper, one shadow, kicker + serif title"
```

---

## Phase 4 — Popup, toasts, sweep

### Task 11: Toolbar popup

**Files:**
- Modify: `src/toolbar-popup.html` (eyebrow text → `SaveIt`)
- Modify: `src/toolbar-popup.css` (restyle; tokens already remapped by Task 3)
- Test: `tests/unit/toolbar-popup.test.js` (only if it asserts changed text)

- [ ] **Step 1: HTML** — `<p class="toolbar-popup-eyebrow">Newtab</p>` → `<p class="toolbar-popup-eyebrow">SaveIt</p>`.

- [ ] **Step 2: CSS restyle** — key rules:

```css
.toolbar-popup-shell {
  min-width: 320px;
  max-width: 380px;
  background: var(--color-paper);
  color: var(--color-ink);
  padding: 18px;
}

.toolbar-popup-eyebrow {
  font-family: var(--font-mono);
  font-size: var(--font-size-2xs);
  letter-spacing: 0.14em;
  text-transform: uppercase;
  color: var(--color-ink-soft);
}

.toolbar-popup-title {
  font-family: var(--font-display);
  font-size: var(--font-size-4xl);
  font-weight: 500;
  color: var(--color-ink);
}

.toolbar-popup-save-btn {
  width: 100%;
  min-height: 40px;
  background: var(--color-accent);
  color: var(--color-on-accent);
  border: none;
  border-radius: var(--radius-md);
  font-weight: 600;
  cursor: pointer;
}

.toolbar-popup-save-btn:hover {
  background: var(--color-accent-ink);
}
```

Project quick-list rows: hairline-separated (`border-bottom: 1px solid var(--color-line)`), sans 13px, hover `background: var(--color-accent-wash)`. Keep the existing layout structure and ids.

- [ ] **Step 3: Verify + commit**

```bash
npm test && npm run lint:css
git add -A src/ tests/ && git commit -m "feat(desk): toolbar popup on Research Desk tokens"
```

### Task 12: Toasts

**Files:**
- Modify: `src/newtab.css` (`.toast-region`, `.toast*`)

- [ ] **Step 1: Restyle** — toast pill: `background: var(--color-paper-raised); border: 1px solid var(--color-line-strong); border-radius: var(--radius-full); box-shadow: var(--shadow-dialog); font-family: var(--font-sans); font-size: var(--font-size-md); color: var(--color-ink);` with the existing type-keyed accent becoming a 3px left inner border: success `var(--color-accent)`, warning `var(--color-accent-ink)`, error `var(--color-rust)` (keep the existing class hooks — only values change). Slide-in animation stays, already reduced-motion-guarded.

- [ ] **Step 2: Verify + commit**

```bash
npm test && npm run lint:css
git add src/newtab.css && git commit -m "feat(desk): toasts on the interrupt shadow + hairline language"
```

### Task 13: Sweep, docs, full verification

**Files:**
- Modify: `README.md` / `docs/README.md` only if they describe the old layout (check; likely no change needed)
- Modify: reworked renderers — add intent comments tying each to a DESIGN.md rule (studio habit), one line at the top of `renderIndexRowMarkup`, `renderLaunchChipMarkup`, `renderProjectPills`, `renderProjectSidebar`, `renderBreadcrumb`

- [ ] **Step 1: Dead CSS sweep** — `npx stylelint src/**/*.css` plus manual scan of `src/newtab.css` for orphaned rules (`.saved-pages-drawer-card*`, `.saved-pages-home-pinned*`, `.saved-pages-pinned-shelf*`, `.saved-pages-page-*` leftovers). Delete them; grep the class names in `src/` to confirm zero JS references first.

- [ ] **Step 2: Full local gate**

```bash
just check        # lint + lint:css + format:check + validate + test
bash scripts/test-csp.sh
just test-e2e     # headless Playwright
just build-all    # both packages build
```

Expected: all green. If e2e asserts old selectors, update them with the mapping tables from Tasks 5–7.

- [ ] **Step 3: Manual visual check** — load the unpacked extension in Brave (repo root), verify: masthead + dateline, search `/` shortcut, launch strip with rename, pills + dropdown + archived, breadcrumb on scope select, index rows with hover actions, all three modals, toasts (trigger a save), toolbar popup, light/dark/auto toggle. Fix what's off, commit fixes.

- [ ] **Step 4: Finish** — merge `feat/research-desk-redesign` into `main` (`git checkout main && git merge --no-ff feat/research-desk-redesign`), delete the branch, push origin. **STOP — do not run `just bump`, `upload-chrome*`, or any store submission.**

---

## Self-review notes (resolved during planning)

- Spec §3 "sort control" satisfied by the store's existing newest/oldest (`warm-cache-list-store.js:892`); no title sort — store doesn't support it and inventing client sort would fight the cursor pipeline.
- Sidebar's Pinned scope and Domains ("By Category") sections are preserved in the dropdown (spec's non-goals: lose nothing).
- Chip rename reuses `handleDrawerUpdate` with an `ai_summary_brief === undefined` passthrough so the edit form's contract is unchanged.
- `sidebar-overlay.test.js` deleted only if it solely covers removed overlay mechanics; otherwise updated.
