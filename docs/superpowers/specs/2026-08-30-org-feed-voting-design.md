# Org feed voting — design

> Approved in conversation 2026-08-30. Adds Hacker News-style upvoting to the
> new-tab desk index and turns that index into a merged organisation feed.

## Summary

The new tab's "Recently saved" desk index becomes an **organisation feed**:
saves from everyone sharing the caller's email domain, interleaved and ranked
by votes and age. Org-mates upvote each other's saves; upvoted saves resist
the ranking's gravity and survive the front page longer than unvoted saves.
The saved-pages drawer (search, projects, tag filters) stays personal and
keeps today's ordering.

Ranking is computed **at read time** in the Cloud Function (chosen over a
materialized score + scheduled recompute job, and over a vote-as-bump
timestamp — see "Alternatives considered"). No new Cloud Function, no
scheduler, no write amplification; scores are always fresh.

## Product decisions

| Decision | Choice |
|---|---|
| Who votes | Org-mates vote on each other's saves (same company email domain) |
| Front page scope | Merged org feed on the idle desk index; drawer stays personal |
| Private saves | Visible in the feed only to their owner, marked "Only you"; org-mates never see them |
| Vote rules | One vote per org-mate per save; click again to unvote (toggle); no votes on your own saves |
| Ranking | HN gravity formula, read-time, over a bounded 30-day window |
| Points display | Mono count beside an always-visible chevron button on each feed row |
| Free email domains | Shared public orgs — gmail.com (including googlemail.com), outlook.com, yahoo.com, etc. follow the same domain-is-your-org rule as company domains |
| Scope clarity | The feed header always labels the audience — "Everyone at acme.com" for company orgs, "Everyone using Gmail — public" for free-provider orgs, "Your saves only" for un-domainable addresses — plus a one-time disclosure for public feeds |

## Ranking algorithm

```
score = votes^0.8 / (age_hours + 2)^1.8
order  = score DESC, saved_at DESC, id DESC
```

- Every save starts at 0 votes. All unvoted saves score 0 and tie-break to
  newest first — a new save enters at the top among the unvoted.
- Any vote lifts a save above every unvoted save; gravity then erodes the
  lift over days and further votes re-raise it. Vote count matters: three
  votes keep a save afloat roughly three times one vote.
- Exponents are constants in one tunable spot in the backend. The client
  never computes rank; it renders server order only.
- **Window:** saves older than 30 days leave the feed (they remain in the
  drawer). Each read considers at most 500 window docs.
- Pinning does not apply in the feed. Pinning is a personal-drawer/launch-strip
  concept; the feed is pure score.

The score function is a pure exported backend function so unit tests can pin
its behavior: unvoted recency order, vote-outranks-unvoted, decay over time,
count sensitivity, tie-breaks.

## Backend design

### Data model (Firestore)

`things/{id}` gains three fields:

- `company_domain` — lowercase org key derived from the owner's email via the
  existing `deriveCompanyDomain` rule (`shared/company-domain.js`) — the same
  rule shared projects and Slack search already use. **Free email providers
  are not excluded**: gmail.com is an org like acme.com, deliberately
  (approved by Rich 2026-08-30), with the clarity requirements below. One
  addition: the derivation canonicalizes `googlemail.com` → `gmail.com` so
  Gmail's alias domain forms a single org. This canonicalization lives in
  `deriveCompanyDomain` itself, which also unifies shared-project visibility
  for googlemail/gmail users — a deliberate, stated change, not a hidden one.
  Written at save/enrich time; a one-off backfill sets it on existing docs.
- `private` normalized to explicit `false` where absent. Firestore equality
  filters skip docs missing a field, so the org query (`private == false`)
  requires the value materialized. The privacy toggle already writes
  true/false explicitly; the backfill covers historical docs.
- `vote_count` — denormalized integer maintained transactionally.

`things/{id}/votes/{uid}` — one document per vote; document ID is the voter's
uid, existence *is* the vote. Fields: `uid`, `created_at`. Toggle =
create-or-delete plus transactional `vote_count` inc/dec on the thing.

New composite indexes (added per the implementation plan): the org window
query (`company_domain`, `private`, `saved_at DESC`), the own-private query
(`user_id`, `private`, `saved_at DESC`), and votes-by-uid (`uid`,
`created_at DESC` collection-group).

### Endpoints (additive — existing routes untouched)

**`POST /vote` `{ id }`** — toggles the caller's vote on thing `id`.

- Auth: standard `withAuth`.
- Server rejects with 403 + reason: votes on your own save, saves outside
  your company domain, private saves not owned by the caller.
- Returns `{ id, votes, voted }`.

**`GET /feed?limit&offset`** — one org-feed page (default 50 rows).

1. Pull the 30-day window with two queries: org-visible
   (`company_domain == caller's, private == false, saved_at >= window,
   orderBy saved_at DESC`) and the caller's own private saves, stitched in.
   Callers with a null org domain (no usable email domain) get a single
   own-saves query (`user_id == caller`) instead — the feed degenerates to
   today's personal list, and their saves carry `company_domain: null` so no
   one else's org query can match them.
2. Compute the gravity score in-function over window docs; sort; slice at
   `offset`.
3. Each row carries the usual page fields plus `votes`, `voted` (caller's
   state), `saved_by` (the local part of the owner's email, capitalized —
   things docs carry `user_email`, no display name), and `private`.
4. The caller's `voted` flags come from one extra collection-group query
   (`votes where uid == caller, created_at >= window start`), not per-doc
   lookups.
5. The response carries a `scope` object: `{ type: 'org', domain,
   public: boolean }` or `{ type: 'personal' }`. The server owns the rule, so
   the client renders exactly the scope the server computed — never a locally
   derived guess at the domain. `public` is true for well-known free-provider
   domains (gmail.com, outlook.com, hotmail.com, yahoo.com, icloud.com,
   proton.me, …) from a small server-side list. The list only drives wording,
   never gating — an unknown free provider just gets the standard
   "Everyone at <domain>" label, which is still true.

Offset pagination is within the computed ranking; pages can drift slightly as
votes change the ranking between fetches (acceptable — HN pages drift too).
The keyed DOM list on the client reconciles by page id, so cross-page
duplicates merge.

### Realtime

Vote writes update `things/{id}.vote_count`, so the existing `things/{id}`
Firestore trigger fires and SSE delivers a refresh to open tabs: org-mates'
feeds reorder live and new saves appear live. The extension's existing
`onConnect` catch-up re-pulls open scopes; the feed becomes one of them.

Verification item for the implementation plan: confirm the realtime fan-out
reaches org-mates, not just the doc owner (current routing is built around
per-user accessible-projects). If owner-scoped, extend routing additively.
This check is **mandatory before launch**, not optional polish: gmail.com is
now a single org spanning every Gmail user of the product, so a vote on a
Gmail user's save must fan out to a potentially very large connected
population — the routing path has to stay cheap and correct at that scale.

### Ops

No new Cloud Function — two routes on the existing `saveit` function. The
backfill is an idempotent script in the backend repo (same conventions as
`rebuild-aggregates`): writes `company_domain` and explicit `private: false`
onto all things docs.

## Extension design

### Surfaces

- Idle desk index (no query, no scope): renders the org feed.
- Drawer opened for search/manage: renders the personal list exactly as
  today. The launch strip stays personal.

### Scope label (always visible)

The desk-index header carries a persistent mono kicker labelling the feed's
audience, driven by the server's `scope` object: "Everyone at acme.com" for
company orgs, "Everyone using Gmail — public" for free-provider orgs, "Your
saves only" for null-domain callers. It is plain text in the header — not a
tooltip, not hover-revealed — so who can see these saves is never ambiguous.
The feed's empty state echoes the same scope ("No saves from acme.com yet" /
"No saves yet").

Because free-provider orgs are effectively public, clarity goes one step
further for them: the first time a `public` feed renders, a one-time
disclosure callout states plainly that saves from this feed are visible to
everyone using that email provider, and that "Hide from organisation" makes a
save private. Dismissed once, remembered locally, never shown again.

### Data layer

The feed is a new API-facade surface with its own `CacheManager`
(`feed_cache` prefix), following the per-surface cache architecture: paint
the cached feed instantly, reconcile with the server in the background.
`POST /vote` goes through the shared authenticated transport. The realtime
client is unchanged; a live `things` event or reconnect re-fetches the feed
and the keyed DOM list reconciles rows in place by page id.

### Row UI (DESIGN.md constraints)

- Vote control at the start of the row's mono meta line: chevron button +
  points count, always visible (not hover-reveal), 24px target,
  `aria-pressed` for the voted state.
- Own saves: count renders, chevron disabled, title "You can't vote on your
  own save".
- Optimistic saves (pending enrichment) follow the existing
  disabled-actions pattern.
- Attribution: "saved by Alice" in mono meta. Private rows: "Only you" mono
  tag.
- Standalone mode (`file://`) gets mock feed data with votes for UI
  development.

### Optimistic votes

Clicking toggles local `voted`/`votes` immediately **without reordering** —
order is server-computed and settles on the refetch the realtime event
triggers. On failure (offline, 403, 5xx) the optimistic state reverts and a
toast explains.

### Compatibility bridge

Old extensions never call `/feed` or `/vote` — additive, no version bump
needed. During the deploy window, if `/feed` 404s (new extension, old
backend), the desk index silently renders the personal list as today. This is
a deliberate deploy-order bridge, not a hidden fallback: it disappears once
the backend is deployed and the feed 404 path is covered by a test.

## Error handling

- `/vote` failure reverts the optimistic toggle and toasts
  ("Couldn't save your vote — try again").
- `/feed` failure renders the existing error-state panel; the warm cache
  paints last-known content on reconnect per existing cache patterns.
- No-self-vote is enforced server-side (403) and reflected client-side
  (disabled chevron).

## Testing

- **Backend units:** score function (unvoted recency order,
  vote-outranks-unvoted, decay over time, count sensitivity, tie-breaks);
  `/vote` authz matrix (self-vote, cross-org, private, toggle idempotency);
  `/feed` (org scoping, private stitching, `voted` flags, window cutoff,
  `scope` object for company-org / public-org / personal callers);
  `deriveCompanyDomain` canonicalization (googlemail.com → gmail.com);
  backfill idempotency.
- **Extension units:** feed caching; optimistic vote + revert; row states
  (own-row disabled chevron, mono count, "Only you"); scope label rendering
  for all scope variants; the one-time public-feed disclosure (shows once for
  `public` scopes, never for company/personal); the `/feed`-404 bridge.
- **E2E:** vote on an org-mate's save → count increments → reorder after
  refresh; unvote; own-save chevron disabled.
- **Local bar:** `just check` green before wrap-up.

## Alternatives considered

- **Materialized `hot_score` + scheduled recompute.** Firestore-native
  cursors and cheapest reads, but requires an eighth Cloud Function plus
  Cloud Scheduler wiring (the backend's top known friction is already "7
  functions, 5 deploy scripts"), rewrites every org doc on a cycle, and
  cursors drift as scores move between pages.
- **Vote-as-bump timestamp** (`display_at = max(saved_at, last_vote_at)`).
  Simplest possible, but votes don't accumulate: one vote on a month-old
  save jumps it above everything saved this week, and count never affects
  rank. Forum bump semantics, not HN voting.

## Out of scope (v1)

- Voting from Slack (`/links`) — the vote surface is the extension feed only.
- Downvotes, comment threads, vote aging beyond the gravity formula.
- Explicit org entities / invitations. Email domain remains the org boundary,
  free providers included — gmail.com is one public org by design, and the
  clarity mechanisms above (scope label, one-time disclosure) are how that
  is communicated, not a gating rule.
