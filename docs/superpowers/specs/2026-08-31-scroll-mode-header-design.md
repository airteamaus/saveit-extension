# Scroll mode — Reading Room header collapse

- **Date:** 2026-08-31
- **Status:** Approved in brainstorming session (direction B: retire the masthead; utility row hides entirely; search hero slims)
- **Provenance:** Extends the shipped pinned-strip favicon collapse (`16d90fe`, `7662b70`). `DESIGN.md` at the repo root stays authoritative for the resting state; this spec only defines the scrolled state.

## 1. Context and motivation

In the wide layout `.desk-page` is height-locked and `#saved-pages-results` is the inner scroller, so the entire header stack stays fixed on screen while the user browses the index. Measured from the current CSS, that fixed stack is ~360px: page padding 20 · utility row 32 · masthead ~90 · search hero ~56 · favicon strip ~26 · project pills ~25 · index header ~41 incl. its top margin · five 14px gaps (70). On a 900px-tall window that is ~40% of the viewport permanently consumed mid-browse.

The shipped favicon collapse is mostly a horizontal win: it saves ~2px of height unless the strip was wrapped. Scroll mode reclaims ~190px of vertical space properly while keeping every control one flick of the scroll wheel away.

## 2. Approved behavior

One class, `is-scroll-mode`, on `.desk-page`. Pure CSS reacts to it; no element is re-parented, duplicated, or unmounted.

| Element | Resting | Scroll mode |
|---|---|---|
| Masthead (wordmark, dateline, double rule) | ~90px | Collapses to zero — identity is established and the tab already says "New tab" |
| Utility row (Projects ▾ · Data & sync · avatar / Sign in) | ~46px incl. gap | Collapses to zero entirely (chosen over merging into the pills row: merging bought only ~25px for DOM reparenting or duplicated controls) |
| Search hero | ~56px, 19.2px serif input, text `Find` button | Slims to a quiet pill: input 19.2→14.4px (`--font-size-2xl` → `--font-size-sm`), form padding 6→4px, **height pinned at 40px** (DESIGN.md a11y floor: 40px targets in the search hero), `Find` collapses to an icon-only button — a return-arrow glyph (carriage-return semantics for "submit"), `aria-label`/`title` keep the word "Find", Enter still submits, ≥24px target |
| Launch strip | labeled chips | Unchanged — favicon-only collapse stays as shipped |
| Project pills | wrapped pills | Unchanged |
| Index header (Recently saved · Sort) | ~41px | Unchanged — the orientation anchor |
| `.desk-page` gaps | 14px | 8px |

Resulting fixed header once scrolled: **~168px** (vs ~360px resting) — ~190px reclaimed. Signed-out users lose the Sign-in button with the utility row; it returns at the top, which is one scroll flick away.

## 3. Trigger and thresholds

`updateLaunchStripCollapse` in `src/newtab-drawer-events.js` generalizes into a scroll-mode update that additionally toggles `is-scroll-mode` on the page container. The strip keeps its own `is-collapsed` class and 48px threshold — shipped behavior and tests untouched.

Scroll mode itself uses **hysteresis** so a large collapsing header cannot jitter at its own boundary:

- Enter at `scrollTop >= 96px`
- Exit at `scrollTop <= 32px`

Constants live beside the existing `LAUNCH_STRIP_COLLAPSE_SCROLL_PX`. Both scroller paths (the results container in the wide layout; `document.scrollingElement` in the narrow-layout fallback) already call the update function from their scroll listeners, so the toggle reads whichever element the firing listener passed.

## 4. Motion

~180ms ease (matches the strip) on: `max-height` + `opacity` + `visibility` (masthead, utility row), `font-size` + padding (search pill), `gap` (`.desk-page`). Collapse ceilings get ~30% headroom over resting heights (~120px masthead, ~40px utility) so text-scale changes never clip; `overflow: hidden` on the collapsing blocks. `visibility` flips discretely, timed with the collapse: content is unreachable (tab order, hit-testing) the moment it finishes hiding and immediately reachable on reveal.

A zero-height element still carries its flex `gap` on both sides, so the collapsed masthead and utility row also animate their margins to negate the scroll-mode gap (`-8px` on each side that borders a sibling). Without this, ~24px of empty space lingers where the masthead was.

Scrolling back up reveals progressively rather than at once — the strip re-expands at its own 48px threshold, then the full header at 32px — which reads as intentional staging.

`prefers-reduced-motion: reduce` (existing media blocks in both stylesheets): state swaps apply instantly, no transitions.

## 5. Correctness and accessibility

- Collapsed blocks use `visibility: hidden`, not just `max-height: 0` — otherwise the wordmark link, Projects trigger, Data & sync, and Sign-in stay in the tab order while invisible.
- The search input never unmounts: focus and typed text survive the mode change. Clear button and focus ring unchanged.
- Resting state is pixel-identical to today — zero visual change below the enter threshold.
- WCAG 2.2 AA floor holds in scroll mode: search pill 40px target, favicon chips ≥24px, contrast roles unchanged, `:focus-visible` ring untouched.

## 6. Scope

- `src/newtab.css` — `.desk-page.is-scroll-mode` block (masthead/utility collapse, search pill, gap tightening, icon-only Find) + reduced-motion additions.
- `src/newtab-drawer-events.js` — generalize the update function; enter/exit constants.
- `tests/unit/newtab-drawer-events.test.js` — extend the existing `launch strip scroll collapse` suite (happy-dom `scrollTop` override pattern already established there).

No HTML changes, no new dependencies, no extension/backend contract involvement.

## 7. Testing and verification

Unit (extend the existing suite):

- enters scroll mode at 96px, not at 95px (both scroller paths)
- exits at 32px, stays in scroll mode at 33px
- the two collapse systems stay independent: at 60px the strip is collapsed while the header is still resting; scrolling back up, at 40px the strip has re-expanded while the header is still in scroll mode

Local quality bar: `just lint` and `just test` green. Manual QA in the Brave dev install: both themes, reduced-motion toggle, narrow width (body-scroll path), signed-out state, keyboard tab order mid-scroll, search focus held across the transition.
