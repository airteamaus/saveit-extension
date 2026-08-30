# DESIGN.md — Newtab ("Research Desk" direction)

> Approved by Rich 2026-08-30 (redesign spec: `docs/superpowers/specs/2026-08-30-research-desk-redesign-design.md`). Warm editorial: saved pages are documents, the new tab is a good desk — cream paper, warm ink, amber for actions, rust for deny. The page loads fast; the interface stays composed.

Mode: **Return** — people come back to find something they saved. Scanability, calm, and speed outrank expression. Adopted literally from Axil Studio's direction (`/Users/rich/Code/agent/DESIGN.md`); the espresso dark companion is Newtab-specific. ("SaveIt" is the product's pre-rebrand name — never use it in the UI.)

## Palette

One amber accent, rust for destructive, nothing else. Solid colors only — no gradients, no glassmorphism. All values via the `:root` tokens in `src/shared-ui.css` (`light-dark()`); never hard-code hex in components.

### Light

| Token | Value | Role | Contrast |
|---|---|---|---|
| `--color-paper` | `#faf6ee` | page background | — |
| `--color-paper-raised` | `#fffbf2` | chips, inputs, modals | — |
| `--color-ink` | `#292524` | primary text | 14.07:1 on paper · 14.69:1 on raised |
| `--color-ink-soft` | `#57534e` | secondary text, **all mono metadata** | 7.08:1 on paper · 7.39:1 on raised |
| `--color-ink-faint` | `#79716c` | placeholders, disabled, decoration only | 4.44:1 — decorative use only |
| `--color-line` | `#e7decd` | hairlines, separators | non-text |
| `--color-line-strong` | `#d8ccb4` | emphasized/hover borders | non-text |
| `--color-accent` | `#b45309` | fills, focus rings | 5.02:1 vs on-accent · ring 4.66:1 on paper |
| `--color-on-accent` | `#ffffff` | text on amber fills | — |
| `--color-accent-ink` | `#92400e` | accent text, links | 6.58:1 on paper · 6.14:1 on wash |
| `--color-accent-wash` | `#f9eddc` | selected states, tags | — |
| `--color-rust` | `#b3261e` | destructive only | 6.06:1 on paper |

### Dark (espresso companion)

| Token | Value | Role | Contrast |
|---|---|---|---|
| `--color-paper` | `#241f1a` | page background | — |
| `--color-paper-raised` | `#2d2822` | chips, inputs, modals | — |
| `--color-ink` | `#ece5d8` | primary text | 13.04:1 on paper · 11.66:1 on raised |
| `--color-ink-soft` | `#b8ad9c` | secondary text, metadata | 7.38:1 on paper · 6.60:1 on raised |
| `--color-ink-faint` | `#9a8e7b` | placeholders, disabled, decoration only | 5.08:1 — decorative use only |
| `--color-line` | `#3a332b` | hairlines | non-text |
| `--color-line-strong` | `#4a4238` | emphasized borders | non-text |
| `--color-accent` | `#d97706` | fills, focus rings | 5.37:1 vs on-accent · ring 5.13:1 on paper |
| `--color-on-accent` | `#1f1b16` | text on amber — flips to espresso | — |
| `--color-accent-ink` | `#e8a33d` | accent text, links | 7.57:1 on paper · 6.24:1 on wash |
| `--color-accent-wash` | `#382d1d` | selected states, tags | — |
| `--color-rust` | `#e46f5d` | destructive only | 5.23:1 on paper · 4.68:1 on raised |

`::selection` uses the wash family (`#f3e3c8` light / `#4a3a1f` dark).

## Type

- **Newsreader Variable** (serif): masthead, index row titles, search input, modal/empty-state headings.
- **Source Sans 3 Variable** (sans): controls, summaries, chips, buttons, body (18px/1.6).
- **JetBrains Mono Variable**: domains, dates, counts, kickers (~13px, uppercase, `letter-spacing: .14em`).
- The type scale is **+20% over studio parity** (Rich, 2026-08-30) — the Reading Room runs a wide 1200px column and reads best larger. Tokens live in `shared-ui.css` (`--font-size-2xs` … `--font-size-7xl`); scale everything through them, never raw px.
- Bundled latin-subset woff2 in `src/fonts/` (`npm run sync-fonts`); MV3 CSP forbids remote fetches. `font-display: swap`; the UI sans is preloaded on the newtab. Never Inter, never system-ui as identity.
- Never use `ink-faint` for readable text; mono metadata is `ink-soft`.

## Surfaces & rhythm

- One centered column (1200px page, 800px search hero) — "The Reading Room": utility row, masthead + dateline + double rule, search hero, launch strip, project pills, the index. Index-row summaries measure to 90ch.
- 8px spacing rhythm. Radii: 8px cards/chips/buttons/inputs, 12px dialogs, full for pills.
- **One shadow** (`--shadow-dialog`) for interrupting surfaces only — modals, toasts, floating menus. Everything else separates by hairline (`--color-line`, `--color-line-strong` on hover). No boxes-within-boxes.

## Component language

- **Index row**: hairline-separated table-of-contents row — serif title, mono date flush right (fades out on hover as action icons fade in over the same slot), soft sans summary, mono domain + tag pills. Not a card. **Hover reveals never shift layout** — date and actions share one slot; chips overlay in place.
- **Launch chip**: pinned pages are utilities (Gmail, Calendar, Jira) — favicon + full user-retitled label, never truncated; hover overlays rename · unpin on the chip's right end without resizing it. The row wraps.
- **Buttons**: primary = filled accent + on-accent text; secondary = quiet outline (line-strong + ink-soft); text links = accent-ink. No hover hops.
- **Modal standard**: raised paper, 12px radius, the shadow, mono uppercase kicker + serif 22px title. Honest scope on destructive copy; cancel is the safe default.
- **Toasts**: pill, raised, hairline + shadow, accent/rust keyed by type.
- The digging-dog loading illustration stays (currentColor strokes re-theme free).

## Accessibility floor

- WCAG 2.2 AA: ratios measured per role per theme (tables above — recompute if any value changes).
- `:focus-visible` accent ring (2px, 2px offset) on every interactive element; dialog focus trap + Esc.
- Pointer targets ≥24px (2.5.8); 40px in dialogs and the search hero.
- Non-text hairline borders are never the sole identifier of a control (text/content carries identification); focus rings ≥4.6:1 in both themes.
- `prefers-reduced-motion` honored globally.
