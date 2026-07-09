# Client-side page capture at save time

**Date:** 2026-07-09
**Status:** Approved design, pending implementation plan
**Repos:** `saveit-extension` (primary) + `saveit-backend`

## Problem

When a user saves a page, the extension sends only `{ url, title, saved_at, projectId? }`
to the backend (`src/background.js:417`). The browser already holds the real title the user
sees — including for auth-gated pages, because the browser carries the user's session.

The backend then throws that good data away. Enrichment is fully server-side and async
(`saveit-backend/cloud-function-enrich/`): the URL is fetched through **Jina AI Reader**
(`r.jina.ai/<url>`), a proxy with no access to the user's session. For a Google Drive doc,
Jina gets a login page. Then `extractBasicMetadata` (`enrichment-core.js:108-110`)
**prefers Jina's title over the browser title the extension sent**, so the correct title is
overwritten with "Sign in – Google Accounts".

`isBlockedContent` (`jina-reader.js:24`) only catches explicit block phrases and Cloudflare
challenges. A 200-status login page sails through and gets enriched as if it were real
content. There is no auth-wall detection.

The result: auth-gated pages lose their title and description, and on the Jina path (bulk
import), login-page content is silently stored as real metadata.

## Goal

Capture title, description, and cleaned content from the page in the browser at save time —
where the user's session is live — and make the client the authoritative source for
single-page saves. Replace Jina as the content source for normal saves, while keeping Jina
as the source for bulk import (which has no active page). Do this with explicit contracts
and no hidden fallbacks.

## Key decisions (locked during brainstorming)

1. **Full content capture.** The client sends title + description + cleaned article text,
   enough to drive the backend's AI step (summaries, classifications) — not metadata only.
2. **On-demand capture at save time** via `chrome.scripting.executeScript`, using the
   existing `activeTab` grant. No always-on content scripts, no new host permissions. Bulk
   import is out of scope for client capture (no active tab).
3. **Client is the source for single saves; Jina is the source for bulk import.** This is a
   dispatch on input origin, not a fallback ladder. No source ever chains to another.
4. **Capture failure** (chrome:// pages, PDFs, crashed tabs, CSP-blocked injection) → save
   URL + title, skip enrichment. No Jina. The failure is visible, not masked.
5. **Readability-only extraction.** Mozilla Readability (`@mozilla/readability`) is the
   sole extractor. No hand-rolled heuristic is written now; one is gated on telemetry, not
   assumed.
6. **`source` is required and explicit everywhere downstream.** Ingress normalizes once for
   legacy clients; all stored data and downstream logic are explicit. Backfill makes
   existing records explicit.
7. **Jina path gets honest failure handling.** Login-wall and auth/Cloudflare failures are
   detected and recorded, not stored as real metadata.

## Approach considered and rejected

- **Client supplies metadata, backend keeps Jina on single saves (Approach A).** Jina still
  runs on every save with its output shadowed. Wastes a fetch and retains the auth-wall
  failure mode. Doesn't actually replace Jina. Rejected.
- **Client does everything including AI (Approach C).** Moves the LLM step into the browser,
  which fights the documented architecture (`save in extension -> Cloud Function -> BigQuery
  -> async enrichment -> Firestore`) and would put credentials in the client. Rejected.
- **Hand-rolled heuristic as the primary extractor.** Works on ~60-70% of pages, fails
  silently on the rest (no `<article>` tag, mid-content ads, multi-column layouts). People
  who hand-roll it end up building a worse Readability. Research was decisive — see Sources.

## Contract & data model

The current single-save payload is `{ url, title, saved_at, projectId? }`. The new shape is
additive: existing fields are unchanged, new data is nested under `client`, and a `source`
marker drives the enrichment dispatch.

```js
{
  url: tab.url,
  title: tab.title,              // unchanged: browser tab title, always present
  saved_at: '...',
  projectId: '...',              // optional, unchanged

  source: 'client',              // REQUIRED: 'client' | 'jina' — drives enrichment dispatch
  client: {                      // present on every single save (even on capture failure)
    title: '...',                //   document.title / og:title
    description: '...',          //   meta/og description, may be ''
    content: '...',              //   Readability textContent, capped ~12k chars; null on capture failure
    excerpt: '...',              //   Readability's gist
    byline: '...',               //   author (Readability / meta author)
    site_name: '...',
    image: '...',                //   og:image — stored now, consumed later (follow-up)
    published_time: '...',       //   article:published_time
    lang: '...',
    captured_at: '...',          //   ISO timestamp
    capture_method: 'readability' | 'none'   // telemetry + trust signal
  }
}
```

### Design choices

- **`source: 'client'` is always set on single saves** — even when capture fails. Every
  single save from the new extension is client-sourced; the backend never guesses from
  which fields are non-null (no implicit contracts).
- **`source: 'jina'`** for bulk import and (during the legacy window) for old extension
  versions that don't send `source`.
- **`client` is present even on capture failure** (with `content: null`,
  `capture_method: 'none'`). The backend writes URL + title and skips the AI step — its
  existing "basic mode". No special-casing, no Jina.
- **Nested `client` object** keeps new data namespaced and obvious vs. legacy fields.
- **`capture_method`** records what happened: `'readability'` or `'none'`. It is how we'll
  know whether the extractor is working and whether a heuristic is ever justified.

### Field scope

`title`, `description`, and `content` fix the core problem and feed the existing AI step.
The rest (`byline`, `image`, `published_time`, `lang`, `excerpt`, `site_name`) are cheap
enrichment that Readability and meta tags give for free; the backend stores them now and
may consume them in a follow-up. The highest-impact follow-up field is `image`, which could
replace the current DuckDuckGo favicon thumbnail with the page's real og:image.

## Extension-side capture

Capture runs inside the existing `saveCurrentPage` message handler in `src/background.js`,
which already runs on a user gesture (the popup save click), so the `activeTab` grant is
live.

```
popup "Save" click
  → sendRuntimeMessage({ action: 'saveCurrentPage', projectId? })
  → background: getActiveTab()
  → background: capturePageContent(tab)        ← NEW
       → chrome.scripting.executeScript(Readability-based fn, world: 'ISOLATED')
       → returns client{} object, or signals failure
  → background: savePageFromTab(tab, { projectId, client })
       → POST { url, title, saved_at, projectId?, source:'client', client }
```

### Capture function

Runs via `chrome.scripting.executeScript` with `world: 'ISOLATED'` (governed by the
extension's CSP, not the page's — so page CSP cannot block it):

1. Read meta/og tags: `og:title`, `og:description`, `og:image`,
   `article:published_time`, `meta[name=author]`, `meta[name=description]`,
   `meta[property=og:site_name]`.
2. Clone the document (`document.cloneNode(true)`) — Readability mutates the DOM it is
   given, so the live page must never be passed.
3. Run `new Readability(clone).parse()`. If it returns an article, use its `title`,
   `textContent`, `excerpt`, `byline`, `siteName`, `lang`, `length`.
4. If Readability returns `null`, there is no heuristic — `content` is `null`,
   `capture_method` is `'none'`.
5. Truncate `content` to ~12k chars, head-weighted (intros carry the most summary signal).
6. On any throw, or on `chrome://` / `file://` / PDF viewer where injection is disallowed,
   capture returns null-equivalent; the caller sets `capture_method: 'none'`,
   `content: null`.

### Permission change

Add `"scripting"` to `permissions` in `manifest.json`. No new `host_permissions` —
`activeTab` covers injection into the active tab on the user gesture. No `content_scripts`
declaration. `"scripting"` is a quiet permission (no install-time host warning), so
existing users are not re-prompted.

### Readability dependency

Vendor `@mozilla/readability` into `src/lib/readability.js`. 11KB gzipped, zero
dependencies, runs in the content-script world where it has a real `document`. The exact
vendoring mechanism (vs. npm install) is to be confirmed against `scripts/bundle.js`
during planning.

### Timing

Capture runs before the POST, and the POST waits for it. Readability adds ~10-30ms
(typical) — invisible to the user. On hard failure, `savePageFromTab` proceeds with the
`source: 'client'`, `content: null` shape so the save still goes through; only enrichment
is skipped.

## Backend-side dispatch

The single change point is `enrichment-core.js`'s `enrichEvent`. Today it always does
`fetchOrRetrieveContent` (Jina) → `extractBasicMetadata` → `enrichWithAI` →
`writeThingToFirestore`. The new version branches at the top on `event.source`.

```
if event.source === 'client':
    clientContent = event.client
    if clientContent.content != null:
        metadata from clientContent (title/description/author/image/published_time)
        AI step fed clientContent.content
        write thing
    else:
        // capture failed — basic mode
        title from clientContent.title || event.title
        description null, AI skipped
        write thing
else if event.source === 'jina':
    today's path — BUT with honest failure handling (below)
```

### What changes where

1. **`handleSavePage`** (`cloud-function/index.js`) — read `source` and `client` from
   `req.body`. Ingress shim: a POST lacking `source` is accepted only for legacy clients,
   recorded explicitly as `source: 'jina'`, with a deprecation warning logged. Once the
   extension has shipped and auto-updated, the shim is removed. Persist `source` into the
   BigQuery `save_events` row; thread `source` + `client` into the enrichment trigger
   payload. No change to the response shape.
2. **Enrichment event plumbing** — the controller (`enrichPages`) and worker (`enrichWorker`)
   pass `source` + `client` through to `enrichEvent`. They become fields on the event object.
   Mechanical threading, no logic.
3. **`enrichEvent`** (`enrichment-core.js`) — the branch above. For `source: 'client'` with
   content: skip `fetchOrRetrieveContent` entirely (Jina is never called), build metadata
   from the `client` object, feed `client.content` to `enrichWithAI`. For `source: 'client'`
   with null content: skip both Jina and AI, write a basic thing. For `source: 'jina'`:
   today's path with honest failure handling.
4. **`extractBasicMetadata`** — gains a client-aware path. When `source === 'client'`,
   title comes from `client.title` (falling back to `event.title` only if `client.title` is
   empty), description from `client.description`. No Jina involvement on this path.
5. **`buildThingObject`** — writes additional client fields (`byline`/`author`, `image`,
   `published_time`, `lang`) into the Firestore `things` doc if present. Additive.
6. **`isBlockedContent` / Jina honest failure handling** — extend detection so login-wall
   and auth/Cloudflare failures are treated as a failed fetch, not real content.

### Jina honest failure handling (new)

Today `isBlockedContent` catches explicit block phrases and Cloudflare challenges, and a
caught block → basic mode. The gap: a 200-status login page (Google "Sign in", SaaS login
screens) sails through and its content is stored as real metadata.

The fix extends detection so login-wall and auth-failure content is treated as a *failed
fetch*, not real content:

- Expand `isBlockedContent` (or add a sibling detector) to recognize common login-wall
  signatures: "sign in", "log in", "please sign in to continue", 401/403-shaped responses,
  Google/sso auth screens — alongside the existing block/Cloudflare patterns.
- When detected: discard Jina's content, write basic mode (title from the bookmark's title,
  no description, no AI), and record the failure as a first-class signal (telemetry + a
  field on the event so it is visible in the stored record).
- This mirrors the client capture-failure path: `source: 'jina'` + content-failed → basic
  mode. Symmetry, not a fallback.

**Known limitation:** login-wall detection is heuristic and will not be perfect. Subtle
login screens may slip through (false negatives); a legitimate page that happens to say
"sign in" could be flagged (false positives). The current state — silently storing
login-page metadata — is the worse option, so best-effort detection plus a visible failure
signal is the right trade. Tune the patterns against real bulk-import data during planning.

### Explicit `source` everywhere

`source` is required and explicit everywhere downstream. The boundary normalizes once at
ingress only; everything else (BigQuery, Firestore, enrichment event, `enrichEvent`,
`buildThingObject`) treats `source` as authoritative and never infers from absence.

**Backfill** (one-time, makes existing records explicit):
- **BigQuery `save_events`**: ADD COLUMN `source`, then `UPDATE ... SET source = 'jina'
  WHERE source IS NULL` on all existing rows (every prior save went through Jina — a
  recorded fact, not an inference).
- **Firestore `things`**: add `source` field, backfill all existing docs to `'jina'`
  (every prior thing was enriched via Jina — a recorded fact).

After backfill there are zero ambiguous records. Going forward the schema rejects saves
that omit `source`.

### Contract artifacts to update

- `contracts/save_events.schema.json` — `source` required (enum: `'client'` | `'jina'`),
  `client` object optional. Add optional `fetch_status` (enum: `'ok'` | `'auth_wall'` |
  `'blocked'` | `'capture_failed'`) recording how content acquisition ended for either
  source.
- `contracts/firestore-things-schema.js` — add `source` (required), optional
  `author`/`image`/`published_time`/`lang`, and `fetch_status` (mirrors the save_events
  value) so the outcome is visible on the stored thing.

### Backward compatibility

- **Old extension + new backend** → ingress normalizes absent `source` to `'jina'`,
  deprecation warning logged, behaves exactly as today.
- **New extension + old backend** → new fields ignored by the old `handleSavePage` (it
  reads only `url`/`title`), Jina runs as today. No breakage, no benefit until both sides
  ship. This is why the order can be either direction.

## Failure modes and testing

Each scenario maps to a unit or e2e test. Tests target failure modes, not just the happy
path.

| Scenario | Expected behavior | Test layer |
|---|---|---|
| Normal public article (single save) | `source:'client'`, Readability content, full AI enrichment, Jina never called | e2e |
| Auth-gated page, user logged in (Google Drive doc) | `source:'client'`, real title/description/content from the authenticated session, full AI enrichment | e2e (the core win) |
| Readability returns `null` (dashboard/app page) | `source:'client'`, `content:null`, `capture_method:'none'`, basic mode (URL+title), no AI | unit |
| `chrome://` or `about:` page, PDF viewer | `executeScript` injection disallowed → capture returns null → basic mode | unit |
| CSP blocks injection | ISOLATED world is CSP-immune, but if injection itself throws → null → basic mode | unit |
| Bulk import (N bookmarks) | `source:'jina'` for each, today's path | existing e2e |
| Bulk import hits auth wall (Jina gets login page) | detected → basic mode, no login-page metadata stored, `fetch_failed` recorded | unit + integration |
| Legacy extension (no `source`) on new backend | ingress normalizes to `source:'jina'`, deprecation warning logged, behaves as today | unit |
| New extension on old backend | new fields ignored, Jina runs as today — no breakage, no benefit | manual |

## Telemetry signals

These are the "no masking" proof points — every failure is visible somewhere.

- **`capture_method` distribution** (`readability` vs `none`): if `none` climbs, that is the
  evidence for or against building a heuristic.
- **`source` distribution**: confirms client capture is replacing Jina for single saves.
- **Jina-path `fetch_failed` rate**: how often bulk import hits walls; calibrates the
  detection.
- **Enrichment outcome per `source`**: confirms client-sourced saves get summaries and
  jina-basic-mode ones do not pretend to.

## Rollout

Two surfaces, order-independent, backward-compatible at every step. Recommended order:
**backend first**, so the new contract is in production before the extension depends on it.

1. **Backend** (safe to ship anytime): adds `source` handling, the ingress shim, honest Jina
   failure detection, backfill. Old extension keeps working exactly as today. The new
   extension's richer payload is simply ignored until step 2's extension is live.
2. **Extension**: adds capture + sends `source: 'client'`. Once it auto-updates, single
   saves stop calling Jina.

## Follow-ups (explicitly out of scope)

- **Migration of existing pages.** Client capture is save-time-only, so existing
  pages cannot auto-benefit. Realistic options, to be specced later: (a) re-open-and-re-save
  each; (b) run a one-off re-enrichment that explicitly hits Jina for them, using the new
  honest-failure handling so any stored with login garbage get re-detected; (c) leave them
  as-is.
- **UI for new fields** (`image`, `author`, `published_time`). Stored now, consumed later.
  The highest-impact is `image` replacing the DuckDuckGo favicon thumbnail.
- **Heuristic extractor.** Gated on telemetry: if `capture_method: 'none'` fires on pages
  that obviously should be summarizable, that evidence justifies building one — and tells us
  which pages it must handle.
- **Client-side AI.** Enrichment stays server-side per the documented architecture.

## Sources

- [Mozilla Readability — GitHub](https://github.com/mozilla/readability)
- [@mozilla/readability — npm](https://www.npmjs.com/package/@mozilla/readability)
- [Simon Willison's TIL — Readability.js usage](https://til.simonwillison.net/readability)
- [Defuddle — GitHub (kepano)](https://github.com/kepano/defuddle) — considered, rejected
  as overkill for the generic article → LLM case
- [Show HN: LLMFeeder — extract clean content for LLMs using Readability.js](https://news.ycombinator.com/item?id=44175077)
- [Content scripts | Chrome for Developers](https://developer.chrome.com/docs/extensions/develop/concepts/content-scripts)
- [chrome.scripting API | Chrome for Developers](https://developer.chrome.com/docs/extensions/reference/api/scripting)
- [scripting.executeScript() — MDN](https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/API/scripting/executeScript)
- [The Open Graph Protocol — ogp.me](https://ogp.me/)
