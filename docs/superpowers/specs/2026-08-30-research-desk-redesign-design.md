# SaveIt × "Research Desk" — extension redesign design spec

- **Date:** 2026-08-30
- **Status:** Approved in brainstorming session (composition validated visually in both themes)
- **Provenance:** Design direction adopted literally from Axil Studio (`/Users/rich/Code/agent/DESIGN.md`, approved 2026-08-27). This spec is the SaveIt equivalent of studio's direction + M0 composition work.

## 1. Context and motivation

The extension's UI works but reads as an app dashboard: header, left sidebar, boxed cards. The redesign adopts the "Research Desk" direction — warm editorial, the saved pages are documents and the new tab is a good desk — and recomposes the start page around it ("The Reading Room"). Same process as studio: named direction, one-page DESIGN.md with measured contrast ratios, one token file, intent comments tying components to rules, WCAG 2.2 AA as a floor.

## 2. Approved direction

**"Research Desk"** — warm editorial. Cream paper surfaces, warm ink, one amber accent for actions, rust reserved for destructive. Solid colors only; hairline borders instead of boxes-within-boxes; elevation declared once (a single shadow token for interrupting surfaces). Newsreader (serif display), Source Sans 3 (UI), JetBrains Mono (metadata). Banned defaults honored: no zinc/neutral grays, no Inter, no gradients, no glassmorphism, no emoji chrome.

Two SaveIt-specific adaptations, both approved:

1. **Dark companion theme** (studio is light-only): espresso paper, cream ink, lifted amber. The extension's existing light/dark/auto toggle keeps working.
2. **AA metadata rule**: mono metadata text uses `ink-soft`, not `ink-faint`. Studio's faint clears AA only at ≥14px semibold; our 10–11px mono meta never qualifies. `ink-faint` is reserved for placeholders, disabled states, and decoration.

## 3. Composition — "The Reading Room"

Centered single column. Content zones constrain to `max-width: 720px` (search field 640px), centered. Top to bottom:

1. **Utility row** (slim): left — `Projects ▾` (dropdown), `Data & sync` link. Right — theme toggle (existing 3-state auto/light/dark), avatar (or Sign in button when signed out).
2. **Masthead**: SaveIt wordmark in Newsreader (~28px); mono dateline `Sunday, 30 August · 1,284 pages on your desk`; newspaper double rule (2px + 1px ink).
3. **Search hero**: serif input (`Search your desk…`) + amber `Find` button. `/` focuses search, `Esc` clears. Search results and semantic matches replace the index below under a results header (`N results for "…"`); semantic section keeps its distinct sub-header.
4. **Launch strip** (pinned pages): wrapping row of chips — favicon + full label, raised bg, hairline border. Labels come from the page title, are user-retitled via the existing inline-edit/`updatePage` path, and are **never truncated** — chips grow, the row wraps. 12–24 pins is the design density. Hover/focus reveals rename · unpin · open actions. Alphabetical order (existing behavior).
5. **Project pills row**: mono lowercase pills — `All pages` (selected: wash bg + accent-ink text) + the 4 most recently active projects with counts (`field notes · 12`) + a `+N more` pill (when there are more) that opens the `Projects ▾` dropdown + `+ New`. The dropdown always lists every project, organized with an Archived section.
6. **The index** (`RECENTLY SAVED` label + `Sort: Newest ▾` mono control): table-of-contents rows, not cards. Row anatomy: serif title + mono date (right); summary line in soft sans below; favicon + domain + tag pills beneath. Hairline separators between rows.
7. **Footer**: existing minimal privacy + version line.

**States:** selecting a project pill swaps the index header for a breadcrumb (`# field notes — 12 pages ‹ Back to all`). Signed-out: launch strip and index collapse to a sign-in invitation. Post-login warming and semantic-search loading keep the dog illustration (currentColor strokes re-theme free) + progress bar. Empty index: invitation copy in the studio voice ("Pages you save appear here.").

**Responsive (≤700px):** the column is already the layout — spacing tightens, the utility row collapses into the existing hamburger pattern (Projects menu + Data & sync inside), masthead scales down. The current sidebar→overlay logic is deleted outright.

**Projects ▾ dropdown** replaces the sidebar as the full project surface: all projects with counts, per-row edit/share/archive actions (existing actions, replacing sidebar hover actions), Archived section, `+ New project`. Project CRUD flows and the project editor modal are functionally unchanged.

## 4. Design tokens

Plain CSS custom properties in `src/shared-ui.css` `:root`, using `light-dark()` exactly as today (browser floor unchanged: Firefox 120+ / Chrome 123+). Studio vocabulary replaces the current names; old names map once during implementation and are removed.

### Light

| Token | Value | Role | Measured contrast |
|---|---|---|---|
| `--color-paper` | `#faf6ee` | page background | — |
| `--color-paper-raised` | `#fffbf2` | chips, inputs, modals | — |
| `--color-ink` | `#292524` | primary text | 14.07:1 on paper · 14.69:1 on raised |
| `--color-ink-soft` | `#57534e` | secondary text, **all mono metadata** | 7.08:1 on paper · 7.39:1 on raised |
| `--color-ink-faint` | `#79716c` | placeholders, disabled, decoration only | 4.44:1 — decorative use only |
| `--color-line` | `#e7decd` | hairlines, separators | non-text |
| `--color-line-strong` | `#d8ccb4` | emphasized/hover borders | non-text |
| `--color-accent` | `#b45309` | fills, focus rings | 5.02:1 vs `on-accent`; ring 4.66:1 on paper |
| `--color-on-accent` | `#ffffff` | text on amber fills | — |
| `--color-accent-ink` | `#92400e` | accent-colored text, links | 6.58:1 on paper · 6.14:1 on wash |
| `--color-accent-wash` | `#f9eddc` | selected states, tags | — |
| `--color-rust` | `#b3261e` | destructive only | 6.06:1 on paper |

### Dark (derived companion)

| Token | Value | Role | Measured contrast |
|---|---|---|---|
| `--color-paper` | `#241f1a` | page background | — |
| `--color-paper-raised` | `#2d2822` | chips, inputs, modals | — |
| `--color-ink` | `#ece5d8` | primary text | 13.04:1 on paper · 11.66:1 on raised |
| `--color-ink-soft` | `#b8ad9c` | secondary text, metadata | 7.38:1 on paper · 6.60:1 on raised |
| `--color-ink-faint` | `#9a8e7b` | placeholders, disabled, decoration only | 5.08:1 — decorative use only |
| `--color-line` | `#3a332b` | hairlines | non-text |
| `--color-line-strong` | `#4a4238` | emphasized borders | non-text |
| `--color-accent` | `#d97706` | fills, focus rings | 5.37:1 vs `on-accent`; ring 5.13:1 on paper |
| `--color-on-accent` | `#1f1b16` | text on amber — flips to espresso | — |
| `--color-accent-ink` | `#e8a33d` | accent text, links | 7.57:1 on paper · 6.24:1 on wash |
| `--color-accent-wash` | `#382d1d` | selected states, tags | — |
| `--color-rust` | `#e46f5d` | destructive only | 5.23:1 on paper · 4.68:1 on raised |

Dark rust is `#e46f5d`, not the `#e0574a` shown in the mockup: the mockup value measures 4.38:1 on dark paper, under the 4.5:1 AA bar. Spec-time correction.

### Rules

- **One shadow token**: `--shadow-dialog` (studio's exact value), used only by interrupting surfaces — modals and toasts. Everything else separates by hairline.
- **Selection**: `::selection` wash-family (`#f3e3c8` light / `#4a3a1f` dark).
- **Dropped palettes**: shared-green (`#16a34a`) and notes-amber (`--notes-*`). Sharing badges move to wash + accent-ink; warnings move to accent-ink / rust. One amber, one rust, nothing else.
- **Old → new mapping** (mechanical, applied in phase 1): `primary`→`accent`, `bg`→`paper`, `surface`→`paper-raised`, `text`→`ink`, `text-light`→`ink-soft`, `text-lighter`→`ink-faint`, `border`→`line`, `danger`→`rust`.
- **Spacing/radius scales stay**; usage standardizes: 8px radius on cards/chips/buttons/inputs, 12px on dialogs, full radius on pills.
- **Non-text contrast (WCAG 1.4.11)**: hairline borders are not the sole identifier of any interactive control — chips, pills, inputs, and buttons carry text/content contrast well above 3:1 — and every interactive element gets a 2px accent focus ring (≥4.6:1 both themes) on `:focus-visible`.

## 5. Typography

- **Fonts**: Newsreader Variable (display), Source Sans 3 Variable (UI), JetBrains Mono Variable (metadata) — latin-subset woff2 files in `src/fonts/`, **committed to the repo** so the unpacked-extension dev flow needs no build step. Origin documented in DESIGN.md (`@fontsource-variable/*`); `@font-face` declarations in `shared-ui.css` with `font-display: swap`; `Source Sans 3` preloaded on the newtab. No remote font fetches — MV3 CSP forbids them.
- **Roles**: serif = masthead, index row titles, search input, modal/empty-state headings. Sans = controls, summaries, chips, buttons. Mono = domains, dates, counts, kickers (11px, uppercase, `letter-spacing: .14em`).
- **Scale**: body 15px/1.6 sans · index titles ~16px serif · masthead ~28px serif · modal titles 22px serif · meta 11px mono.
- **Package cost**: ~350–450KB total; exact numbers recorded in DESIGN.md at implementation.

## 6. Component language

- **Index row** (replaces the card): hairline-separated row per §3. Hover/focus slides the date out and the action icons in — pin, projects, edit, delete (all existing actions, existing handlers). Row is focusable; Enter opens.
- **Launch chip**: raised bg, hairline border, favicon + full label, hover → `line-strong` + reveals rename/unpin. Rename = existing title-edit path.
- **Buttons**: primary = filled `accent` with `on-accent` text, 8px radius, sans semibold, min-height 40px in dialogs (32px compact). Secondary = quiet outline (`line-strong` border, `ink-soft` text, hover to `ink`). Text links = `accent-ink`.
- **Modal standard** (the existing shell promoted): `paper-raised` bg, 12px radius, `--shadow-dialog`, mono uppercase kicker + serif 22px title. Applied to project editor, sharing centre, data & sync centre.
- **Toasts**: pill, raised bg, hairline + `--shadow-dialog`, accent/rust keyed by type.
- **Icons**: existing inline stroke SVGs, restroke weight to 1.5px, `currentColor`.
- **Global craft** (studio parity): `:focus-visible { outline: 2px solid var(--color-accent); outline-offset: 2px; }`, warm scrollbars, `caret-color: accent`, full `prefers-reduced-motion` honoring.

## 7. Surfaces and scope

**In scope:** newtab (full recomposition), toolbar popup (re-token + restyle: mono kicker `SAVE THIS PAGE`, serif page title, amber Save, hairline project quick-add rows — structure unchanged), all three modals, avatar/auth menu, toasts, empty/loading/warming states, footer.

**Out of scope (explicit non-goals):** backend contracts, cache/API/store/SW layers (`background.js` untouched), drag-to-reorder pins, favorites-grid revival, options page, changes to modal flows' functionality.

## 8. Implementation architecture

Render-layer only: CSS files, `newtab.html` structure, and the renderer modules that produce markup (`newtab-drawer-renderer.js`, `project-manager-renderer.js` + their view/action siblings as needed). Drawer state/sync modules, stores, and the API facade are untouched — class names are the JS↔CSS contract and change in one pass per renderer.

Phases, each ending shippable with `just check` green:

1. **Foundations** — token block rewrite, bundled fonts + `@font-face`, `DESIGN.md`, global craft rules. Existing layout re-skinned in place.
2. **Newtab recomposition** — new `newtab.html` structure (utility row, masthead, search hero, strip, pills, index container), cards→index rows, pinned shelf→launch strip, renderer markup updates, sidebar removed.
3. **Navigation & modals** — Projects dropdown + pills + breadcrumb replace sidebar navigation; modal standard applied to all three centres.
4. **Popup, toasts, sweep** — toolbar popup, toasts, `/` shortcut, a11y pass (focus order, pointer targets ≥24px minimum per WCAG 2.2 2.5.8 with 40px in dialogs/search, verified contrast), test updates.

## 9. Testing and verification

- Unit tests updated where they assert card/shelf/sidebar markup (renderer tests); state/store tests must pass untouched — a guard that the boundary held.
- E2E: newtab renders, search flow, project pill filter + breadcrumb, chip rename, each modal opens.
- `test-csp` green (local fonts only). stylelint + prettier clean (existing configs; BEM kebab naming kept).
- Contrast ratios measured and recorded in DESIGN.md (numbers in §4 are the source of truth; recomputed if any value changes).
- Manual matrix: light/dark/auto × signed-in/out, plus the SW-recycle caveat from AGENTS.md is irrelevant here (no background changes).

## 10. Documentation and process artifacts

- **`DESIGN.md` at repo root** (phase 1), mirroring studio's one-pager: named direction + approval date, palette tables with measured ratios, type rules, component language, motion, a11y floor. `docs/visual-system.md` is superseded — replaced by a short pointer to DESIGN.md.
- Every reworked renderer opens with an intent comment tying it to a DESIGN.md rule (studio habit).
- UX copy follows studio's plain-language pattern: honest failure ("Save failed — the service did not answer" style), real scope on destructive actions, empty states as invitations, no JSON/tool names in UI.

## 11. Risks and mitigations

| Risk | Mitigation |
|---|---|
| Renderer rewrites are the bulk (drawer 24KB, project 17.8KB) | Phases 2/3 separated; state modules untouched; unit suites guard the boundary |
| Users lose sidebar spatial memory | Accepted — full rethinking chosen; projects remain one click away (utility row) |
| ~400KB font addition | Latin subsets only, `font-display: swap`, single preload; package limits far above |
| `ink-faint` misuse sneaks into text | DESIGN.md rule + design-qa pass checks meta text resolves to `ink-soft` |
| Dropped green/notes palettes break overlooked consumers | Phase-1 mapping sweep greps all consumers of removed tokens before deletion |

## 12. Decision log

- 2026-08-30 — Research Desk adopted literally (branding scope). *Rich*
- 2026-08-30 — Dark companion derived, not dropped. *Rich*
- 2026-08-30 — All three fonts bundled locally. *Rich*
- 2026-08-30 — Full layout rethinking, direction-led (no fixed goal). *Rich*
- 2026-08-30 — Concept A "Reading Room" + launch strip; full labels, user-retitles, no truncation; 12–24 pin density. *Rich*
- 2026-08-30 — Dark rust corrected `#e0574a` → `#e46f5d` for AA (4.38 → 5.23 on paper). *spec-time*
- 2026-08-30 — Mono metadata uses `ink-soft`; `ink-faint` decorative-only (AA deviation from studio). *spec-time*
