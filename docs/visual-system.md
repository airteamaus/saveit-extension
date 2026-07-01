# Visual System

A reference for the SaveIt UI's visual language. Keeps new surfaces coherent with the existing new-tab page and toolbar popup.

## Design principle: quiet materiality

The product is about *saving and returning* — a calm library, not a dense feed. Objects exist and hold content at rest; interaction elevates them. Whitespace is valued. The brand (sage green) is an atmosphere, not just an accent fleck.

- **Sparse over dense** — whitespace is structure, not wasted space.
- **Objects at rest** — cards and panels are recognizable without hover.
- **Recent over exhaustive** — show what's relevant now.
- **Calm, warm, flat** — no heavy shadows or gradients at rest; elevation is feedback.

## Palette roles

Defined as `light-dark()` tokens in `src/shared-ui.css` `:root`.

| Token | Role |
|---|---|
| `--color-primary` `#5b8c7a` | Sage green. The single accent: logo, primary actions, selection, focus. |
| `--color-primary-hover` `#4a7567` | Deeper sage for hover/active. |
| `--color-paper` | Warm paper tone for distinct content zones (e.g. card summaries). Warmer than the bg. |
| `--color-forest` `#2f5d4f` | Deep sage for depth / future gradient ends. |
| `--color-bg` | Page background. Warm off-white in light, near-black in dark. |
| `--color-surface` | Card/panel fills. White in light, green-tinted ("garden at dusk") in dark. |
| `--color-text` / `-light` / `-lighter` | Three-step text hierarchy. |
| `--color-border` | Soft structural borders. |
| `--color-shared` | Green for shared/collaborative indicators. |
| `--color-danger` / `-hover` | Red for destructive actions. |
| `--notes-bg` / `-border` / `-text` | Amber notes palette — reserved for "your own writing" surfaces (the notes textarea). Warm = authored content. |

## Type scale — t-shirt sizing

One step ≈ 1–2px. Use these tokens; do not add literal `font-size` values in components.

| Token | rem | px |
|---|---|---|
| `--font-size-2xs` | 0.625 | 10 |
| `--font-size-xs` | 0.6875 | 11 |
| `--font-size-sm` | 0.75 | 12 |
| `--font-size-md` | 0.8125 | 13 |
| `--font-size-lg` | 0.875 | 14 |
| `--font-size-xl` | 0.9375 | 15 |
| `--font-size-2xl` | 1 | 16 |
| `--font-size-3xl` | 1.125 | 18 |
| `--font-size-4xl` | 1.1875 | 19 |
| `--font-size-5xl` | 1.25 | 20 |
| `--font-size-6xl` | 1.5 | 24 |
| `--font-size-7xl` | 1.75 | 28 |

Font stacks: `--font-sans` (system-ui), `--font-mono`.

## Radius scale

| Token | Value | Use |
|---|---|---|
| `--radius-sm` | 4px | Tight corners (favicons, small icons) |
| `--radius-md` | 8px | Inputs, small buttons, content zones |
| `--radius-lg` | 12px | Buttons |
| `--radius-xl` | 16px | Cards, panels |
| `--radius-2xl` | 24px | Dialogs |
| `--radius-full` | 999px | Pills |
| `--radius-circle` | 50% | Avatars, spinners |

## Spacing scale

`--spacing-xs` 4 · `sm` 8 · `md` 16 · `lg` 24 · `xl` 32. Use one generous gap (24–32px) between major zones; tighter rhythm (8–12px) within.

## Theme

Light / dark / auto via `light-dark()` on the tokens + `color-scheme: light dark` on `:root`. Applied through `html[data-theme]` (set by `theme-manager.js` on the new-tab page; `toolbar-popup-theme.js` reads the same `theme-preference` localStorage key for the popup). Both surfaces share the token system so they stay in parity automatically.

## Component language

- **Cards** — faint surface fill + soft border at rest; on hover, stronger fill + accent border + `--shadow-sm`.
- **Panels** (sidebar) — same materiality, slightly lighter fill.
- **Dialogs** — frosted glass (`backdrop-filter: blur`) + `--radius-2xl` + large shadow. The strongest existing component language; promote as the modal standard.
- **Content zones** (summary, notes) — `--color-paper` backing so content-rich cards read as varied.
- **Pills/chips** — `--radius-full`, transparent at rest, faint primary tint when active.

## Voice

State copy is calm and warm, not clinical or twee: "Gathering your saved pages…", "Save a page and it will appear here.", "Could not reach your saved pages". Loading states use the wagging-dog illustration's friendly tone.
