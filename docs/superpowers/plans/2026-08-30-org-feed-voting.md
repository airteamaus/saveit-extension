# Org Feed Voting Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn the new-tab "Recently saved" desk index into a merged organisation feed with Hacker News-style upvoting, ranked at read time by `votes^0.8 / (age_hours + 2)^1.8`.

**Architecture:** Two phases. Phase A (backend repo `/Users/rich/Code/saveit-backend/`, branch `feat/org-feed-voting`) adds two routes (`POST /vote`, `GET /feed`) to the existing `saveit` Cloud Function, a votes subcollection with transactional `vote_count`, org scope keys on the realtime path, and the missing `company_domain`/`private` writes on things-doc creation. Phase B (extension repo `/Users/rich/Code/saveit-extension/`, branch `feat/org-feed-voting`) adds a feed surface with its own cache prefix, feed rows with an optimistic vote control, a scope kicker, and a one-time public-feed disclosure. Spec: `docs/superpowers/specs/2026-08-30-org-feed-voting-design.md` (extension repo) — the spec is truth; where this plan and the spec disagree, the spec wins.

**Tech Stack:** Node 20 Cloud Functions (Gen 2, raw req/res dispatch — no Express), Firestore via `@google-cloud/firestore`, Jest (backend, colocated `cloud-function/*.test.js`); ES-module extension, Vitest + happy-dom (unit), Playwright (e2e), stylelint/prettier.

## Global Constraints

- Product name in UI copy is **Newtab** — never "SaveIt" (pre-rebrand name).
- Free email domains (gmail.com, outlook.com, …) are **deliberately public orgs** — never gate them out; googlemail.com canonicalizes to gmail.com (Rich, 2026-08-30; do not re-litigate).
- Extension CSS: only `:root` tokens from `src/shared-ui.css` (never raw hex), mono metadata is `--color-ink-soft`, WCAG 2.2 AA, pointer targets ≥24px, hover reveals never shift layout.
- Backend: no new Cloud Functions; only routes on the existing `saveit` function. API changes are additive — never modify an existing route's contract.
- Comments explain **why**, not what. No TODOs in implementation code.
- Backend tests: `cd /Users/rich/Code/saveit-backend/cloud-function && npm test -- <pattern>`. Extension tests: `npx vitest run <file>`. Extension full gate: `just check`. Use `pnpm` (never `npm install`) in either repo.
- Firestore imports come from the directly-installed `@google-cloud/firestore` package (`FieldValue`), while shared helpers resolve via `getSharedPath('<file>.js')` from `./paths` — never a direct `../shared` path in implementation code (tests may use `../shared/...` for mocks, matching existing test files).
- Deploy steps (Task A9 runbook) are operator-gated: **stop and get Rich's explicit go-ahead before running any `gcloud`/deploy/migration command** — the backend has no staging environment; every deploy hits production.

---

# Phase A — Backend (`/Users/rich/Code/saveit-backend/`)

All Phase A work happens on branch `feat/org-feed-voting` (create from `main` in Task A1, commit per task).

### Task A1: Canonicalizing org domain + public-domain set

**Files:**
- Modify: `shared/company-domain.js`
- Modify: `shared/errors.js` (add `ForbiddenError`)
- Create: `cloud-function/company-domain.test.js`

**Interfaces:**
- Produces: `deriveCompanyDomain(email) -> string|null` (now canonicalizes googlemail.com → gmail.com), `isPublicEmailDomain(domain) -> boolean`, `FREE_EMAIL_DOMAINS` (Set), `ForbiddenError` (statusCode 403). Consumed by Tasks A3, A4, A6, A7.

- [ ] **Step 1: Write the failing tests** — create `cloud-function/company-domain.test.js` (this file runs under `cd cloud-function && npm test`; the existing `shared/company-domain.test.js` is outside every jest rootDir and runs nowhere — leave it untouched):

```js
const {
  deriveCompanyDomain,
  isPublicEmailDomain,
  FREE_EMAIL_DOMAINS
} = require('../shared/company-domain.js');
const { ForbiddenError } = require('../shared/errors.js');

describe('deriveCompanyDomain', () => {
  test('lowercases and trims the domain', () => {
    expect(deriveCompanyDomain('Jane@AirTeam.com.au')).toBe('airteam.com.au');
  });

  test('uses the segment after the last @', () => {
    expect(deriveCompanyDomain('a@b@example.com')).toBe('example.com');
  });

  test('returns null for non-emails', () => {
    expect(deriveCompanyDomain('notanemail')).toBeNull();
    expect(deriveCompanyDomain(null)).toBeNull();
    expect(deriveCompanyDomain('user@')).toBeNull();
    expect(deriveCompanyDomain('user@ ')).toBeNull();
  });

  test('canonicalizes googlemail.com to gmail.com', () => {
    expect(deriveCompanyDomain('someone@googlemail.com')).toBe('gmail.com');
    expect(deriveCompanyDomain('someone@GOOGLEMAIL.COM')).toBe('gmail.com');
  });
});

describe('isPublicEmailDomain', () => {
  test('true for well-known free providers', () => {
    expect(isPublicEmailDomain('gmail.com')).toBe(true);
    expect(isPublicEmailDomain('outlook.com')).toBe(true);
    expect(isPublicEmailDomain('yahoo.com')).toBe(true);
  });

  test('false for company domains and null', () => {
    expect(isPublicEmailDomain('airteam.com.au')).toBe(false);
    expect(isPublicEmailDomain(null)).toBe(false);
    expect(isPublicEmailDomain('gmail.com.evil.com')).toBe(false);
  });

  test('googlemail canonicalizes before the check', () => {
    expect(isPublicEmailDomain(deriveCompanyDomain('x@googlemail.com'))).toBe(true);
  });
});

describe('FREE_EMAIL_DOMAINS', () => {
  test('is a Set of lowercase domains', () => {
    expect(FREE_EMAIL_DOMAINS instanceof Set).toBe(true);
    expect(FREE_EMAIL_DOMAINS.has('proton.me')).toBe(true);
  });
});

describe('ForbiddenError', () => {
  test('carries statusCode 403 and is not retriable', () => {
    const err = new ForbiddenError('nope');
    expect(err.statusCode).toBe(403);
    expect(err.retriable).toBe(false);
    expect(err.name).toBe('ForbiddenError');
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `cd /Users/rich/Code/saveit-backend/cloud-function && npm test -- company-domain`
Expected: FAIL (`isPublicEmailDomain is not a function`, `ForbiddenError is not a constructor`, googlemail case returns `googlemail.com`).

- [ ] **Step 3: Implement** — rewrite `shared/company-domain.js`:

```js
// shared/company-domain.js
/**
 * Derive the company domain from a user email.
 *
 * The email domain is the only org-like boundary in SaveIt today — it backs
 * company-project visibility, org-scoped Slack search, and (newly) the org
 * feed. Centralising the derivation here means the main API, the enrich
 * worker, the backfills, and the Slack function all agree on the rule.
 *
 * Free email providers are deliberately NOT excluded: gmail.com is an org
 * like acme.com (approved by Rich 2026-08-30, org feed voting spec). Gmail's
 * googlemail.com alias canonicalizes into gmail.com so both spellings form
 * one org.
 *
 * @param {string|null|undefined} email
 * @returns {string|null} lowercased domain after the last '@', or null
 */

// Same mail provider, different spelling — one org.
const GMAIL_ALIAS_DOMAINS = new Set(['googlemail.com']);

// Drives feed scope *labelling* only ("Everyone using Gmail — public"),
// never gating: an unknown free provider still gets an org feed, just the
// plainer "Everyone at <domain>" label.
const FREE_EMAIL_DOMAINS = new Set([
  'gmail.com',
  'googlemail.com',
  'outlook.com',
  'hotmail.com',
  'hotmail.co.uk',
  'live.com',
  'msn.com',
  'yahoo.com',
  'yahoo.co.uk',
  'icloud.com',
  'me.com',
  'aol.com',
  'proton.me',
  'protonmail.com',
  'gmx.com',
  'mail.com',
  'yandex.com',
  'zoho.com'
]);

function deriveCompanyDomain(email) {
  if (typeof email !== 'string' || !email.includes('@')) return null;
  let domain = email.slice(email.lastIndexOf('@') + 1).toLowerCase().trim();
  if (domain === '') return null;
  if (GMAIL_ALIAS_DOMAINS.has(domain)) domain = 'gmail.com';
  return domain;
}

function isPublicEmailDomain(domain) {
  return typeof domain === 'string' && FREE_EMAIL_DOMAINS.has(domain);
}

module.exports = { deriveCompanyDomain, isPublicEmailDomain, FREE_EMAIL_DOMAINS };
```

Add to `shared/errors.js` (mirroring the `NotFoundError` class shape, exported alongside the others):

```js
/**
 * Caller is authenticated but not allowed to do this (403).
 * Distinct from NotFoundError, which masks existence; ForbiddenError states
 * the rejection openly (e.g. vote authz in the org feed).
 */
class ForbiddenError extends Error {
  constructor(message, details = null) {
    super(message);
    this.name = 'ForbiddenError';
    this.statusCode = 403;
    this.retriable = false;
    this.details = details;
  }
}
```

- [ ] **Step 4: Run to verify pass**

Run: `cd /Users/rich/Code/saveit-backend/cloud-function && npm test -- company-domain`
Expected: PASS (all suites green).

- [ ] **Step 5: Commit**

```bash
cd /Users/rich/Code/saveit-backend
git checkout -b feat/org-feed-voting
git add shared/company-domain.js shared/errors.js cloud-function/company-domain.test.js
git commit -m "feat: canonicalize googlemail into gmail orgs; add public-domain set + ForbiddenError"
```

---

### Task A2: Pure feed-ranking module

**Files:**
- Create: `cloud-function/feed-ranking.js`
- Create: `cloud-function/feed-ranking.test.js`

**Interfaces:**
- Produces: `computeFeedScore(votes, ageHours) -> number`, `sortFeedRows(entries, nowMs?) -> entries` where each entry is `{ id, savedAtMs, voteCount, ...rest }`, `feedWindowStart(now?) -> Date`, constants `FEED_WINDOW_DAYS = 30`, `FEED_WINDOW_CAP = 500`, `FEED_PAGE_DEFAULT_LIMIT = 50`. Consumed by Task A4.

- [ ] **Step 1: Write the failing tests** — `cloud-function/feed-ranking.test.js`:

```js
const {
  computeFeedScore,
  sortFeedRows,
  feedWindowStart,
  FEED_WINDOW_DAYS,
  FEED_WINDOW_CAP,
  FEED_PAGE_DEFAULT_LIMIT
} = require('./feed-ranking');

const HOUR = 3600000;

describe('computeFeedScore', () => {
  test('unvoted saves score 0 regardless of age', () => {
    expect(computeFeedScore(0, 0)).toBe(0);
    expect(computeFeedScore(0, 500)).toBe(0);
  });

  test('negative or non-numeric votes clamp to 0', () => {
    expect(computeFeedScore(-3, 5)).toBe(0);
    expect(computeFeedScore(NaN, 5)).toBe(0);
  });

  test('score decays as age grows (gravity)', () => {
    const fresh = computeFeedScore(1, 1);
    const old = computeFeedScore(1, 24 * 7);
    expect(old).toBeLessThan(fresh);
  });

  test('more votes score higher at the same age', () => {
    expect(computeFeedScore(3, 10)).toBeGreaterThan(computeFeedScore(1, 10));
  });

  test('one vote on a 30-day-old save still outranks an unvoted save', () => {
    expect(computeFeedScore(1, 24 * 30)).toBeGreaterThan(0);
  });
});

describe('sortFeedRows', () => {
  const now = Date.parse('2026-08-30T12:00:00.000Z');

  test('unvoted saves order newest first (recency tie-break)', () => {
    const sorted = sortFeedRows([
      { id: 'old', savedAtMs: now - 10 * HOUR, voteCount: 0 },
      { id: 'new', savedAtMs: now - 1 * HOUR, voteCount: 0 }
    ], now);
    expect(sorted.map(r => r.id)).toEqual(['new', 'old']);
  });

  test('a voted save outranks every unvoted save', () => {
    const sorted = sortFeedRows([
      { id: 'new-unvoted', savedAtMs: now - 1 * HOUR, voteCount: 0 },
      { id: 'old-voted', savedAtMs: now - 24 * 10 * HOUR, voteCount: 1 }
    ], now);
    expect(sorted[0].id).toBe('old-voted');
  });

  test('a fresh vote outranks a stale vote with the same count', () => {
    const sorted = sortFeedRows([
      { id: 'voted-5d-ago', savedAtMs: now - 24 * 5 * HOUR, voteCount: 2 },
      { id: 'voted-1h-ago', savedAtMs: now - 1 * HOUR, voteCount: 2 }
    ], now);
    expect(sorted[0].id).toBe('voted-1h-ago');
  });

  test('equal score and age fall back to id descending for stable pages', () => {
    const sorted = sortFeedRows([
      { id: 'a', savedAtMs: now - HOUR, voteCount: 0 },
      { id: 'b', savedAtMs: now - HOUR, voteCount: 0 }
    ], now);
    expect(sorted.map(r => r.id)).toEqual(['b', 'a']);
  });

  test('preserves extra properties (doc passthrough) and drops the score', () => {
    const doc = { fake: 'doc' };
    const sorted = sortFeedRows([{ id: 'x', savedAtMs: now, voteCount: 1, doc }], now);
    expect(sorted[0].doc).toBe(doc);
    expect(sorted[0]._score).toBeUndefined();
  });

  test('non-finite savedAtMs sorts as oldest, not NaN-poisoned', () => {
    const sorted = sortFeedRows([
      { id: 'broken', savedAtMs: NaN, voteCount: 5 },
      { id: 'fine', savedAtMs: now - 24 * 29 * HOUR, voteCount: 0 }
    ], now);
    expect(sorted[0].id).toBe('fine');
  });
});

describe('window constants', () => {
  test('feedWindowStart is 30 days back at midnight-of-the-call', () => {
    const now = new Date('2026-08-30T12:00:00.000Z');
    const start = feedWindowStart(now);
    expect(start.getTime()).toBe(now.getTime() - FEED_WINDOW_DAYS * 24 * HOUR);
  });

  test('window and page sizes match the spec', () => {
    expect(FEED_WINDOW_DAYS).toBe(30);
    expect(FEED_WINDOW_CAP).toBe(500);
    expect(FEED_PAGE_DEFAULT_LIMIT).toBe(50);
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `cd /Users/rich/Code/saveit-backend/cloud-function && npm test -- feed-ranking`
Expected: FAIL (`Cannot find module './feed-ranking'`).

- [ ] **Step 3: Implement** — `cloud-function/feed-ranking.js`:

```js
// cloud-function/feed-ranking.js
// Hacker News-style gravity ranking, computed at read time. Firestore cannot
// sort by a computed expression, so the feed pulls a bounded window of docs
// and ranks them here (org feed voting spec, 2026-08-30). Keeping this pure
// (no Firestore) is what makes the ranking unit-testable.

// (votes)^VOTE_EXPONENT / (ageHours + AGE_OFFSET)^GRAVITY — the classic HN
// shape. Exponents live here so tuning is a one-line change.
const VOTE_EXPONENT = 0.8;
const GRAVITY = 1.8;
const AGE_OFFSET_HOURS = 2;

const FEED_WINDOW_DAYS = 30;
const FEED_WINDOW_CAP = 500;
const FEED_PAGE_DEFAULT_LIMIT = 50;

function computeFeedScore(votes, ageHours) {
  const v = Math.max(0, Number(votes) || 0);
  const t = Math.max(0, Number(ageHours) || 0) + AGE_OFFSET_HOURS;
  return Math.pow(v, VOTE_EXPONENT) / Math.pow(t, GRAVITY);
}

function feedWindowStart(now = new Date()) {
  return new Date(now.getTime() - FEED_WINDOW_DAYS * 24 * 60 * 60 * 1000);
}

// Entries: { id, savedAtMs, voteCount, ...anything }. Sorted by score DESC,
// then saved_at DESC (unvoted saves read newest-first), then id DESC so a
// page re-fetch is deterministic. Extra properties pass through untouched.
function sortFeedRows(entries, nowMs = Date.now()) {
  const scored = entries.map(entry => {
    const savedAtMs = Number.isFinite(entry.savedAtMs) ? entry.savedAtMs : 0;
    return { ...entry, savedAtMs, _score: computeFeedScore(entry.voteCount, (nowMs - savedAtMs) / 3600000) };
  });
  scored.sort((a, b) =>
    (b._score - a._score) ||
    (b.savedAtMs - a.savedAtMs) ||
    (a.id < b.id ? 1 : a.id > b.id ? -1 : 0)
  );
  return scored.map(({ _score, ...rest }) => rest);
}

module.exports = {
  computeFeedScore,
  feedWindowStart,
  sortFeedRows,
  FEED_WINDOW_DAYS,
  FEED_WINDOW_CAP,
  FEED_PAGE_DEFAULT_LIMIT
};
```

- [ ] **Step 4: Run to verify pass**

Run: `cd /Users/rich/Code/saveit-backend/cloud-function && npm test -- feed-ranking`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
cd /Users/rich/Code/saveit-backend
git add cloud-function/feed-ranking.js cloud-function/feed-ranking.test.js
git commit -m "feat: pure read-time HN gravity ranking for the org feed"
```

---

### Task A3: Vote toggle with transactional count

**Files:**
- Create: `cloud-function/firestore-votes.js`
- Create: `cloud-function/firestore-votes.test.js`

**Interfaces:**
- Consumes: `ForbiddenError` (Task A1), `deriveCompanyDomain` (Task A1), `PageNotFoundError` (existing `shared/errors.js`).
- Produces: `toggleThingVote(thingId, user) -> Promise<{ id, votes, voted }>` where `user` is the withAuth shape (`user.user_id`, `user.email`). Rejects with `ForbiddenError` (`.code` = `VOTE_SELF` | `VOTE_PRIVATE` | `VOTE_CROSS_ORG`) or `PageNotFoundError`. Consumed by Task A5.

- [ ] **Step 1: Write the failing tests** — `cloud-function/firestore-votes.test.js` (mock pattern copied from `firestore-update.test.js`):

```js
const mockGetFirestoreClient = jest.fn();
jest.mock('../shared/firestore-client.js', () => ({
  getFirestoreClient: mockGetFirestoreClient
}));

const { toggleThingVote } = require('./firestore-votes');

const CALLER = { user_id: 'uid-voter', email: 'voter@acme.com' };
const OWNER = 'uid-owner';

function buildThingDoc(data) {
  return { exists: true, data: () => data };
}

function setupFirestore({ thingData, voteDocExists = false, txImpl } = {}) {
  const thingRef = {
    get: jest.fn(),
    collection: jest.fn().mockReturnThis(),
    doc: jest.fn().mockReturnThis()
  };
  const voteRef = { get: jest.fn() };
  const tx = txImpl || {
    get: jest.fn(async (ref) => {
      if (ref === thingRef) return thingData ? buildThingDoc(thingData) : { exists: false, data: () => ({}) };
      if (ref === voteRef) return { exists: voteDocExists, data: () => ({}) };
      return { exists: false, data: () => ({}) };
    }),
    set: jest.fn(),
    delete: jest.fn(),
    update: jest.fn()
  };
  const firestore = {
    collection: jest.fn(() => thingRef),
    runTransaction: jest.fn(async (fn) => fn(tx))
  };
  // thingRef.collection('votes').doc(uid) must return the voteRef: the
  // chained mock above would lose it, so wire it explicitly.
  thingRef.collection = jest.fn(() => ({ doc: jest.fn(() => voteRef) }));
  mockGetFirestoreClient.mockReturnValue(firestore);
  return { firestore, thingRef, voteRef, tx };
}

const BASE_THING = {
  user_id: OWNER,
  user_email: 'owner@acme.com',
  company_domain: 'acme.com',
  private: false,
  deleted: false,
  vote_count: 2
};

describe('toggleThingVote — adding a vote', () => {
  test('creates the vote doc and increments vote_count transactionally', async () => {
    const { tx } = setupFirestore({ thingData: { ...BASE_THING }, voteDocExists: false });
    const result = await toggleThingVote('thing-1', CALLER);
    expect(tx.set).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ uid: 'uid-voter' }));
    expect(tx.update).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({
      vote_count: expect.objectContaining({ _methodName: expect.stringContaining('increment') })
    }));
    expect(result).toEqual({ id: 'thing-1', votes: 3, voted: true });
  });
});

describe('toggleThingVote — removing a vote', () => {
  test('deletes the vote doc and decrements vote_count', async () => {
    const { tx } = setupFirestore({ thingData: { ...BASE_THING }, voteDocExists: true });
    const result = await toggleThingVote('thing-1', CALLER);
    expect(tx.delete).toHaveBeenCalled();
    expect(result).toEqual({ id: 'thing-1', votes: 1, voted: false });
  });
});

describe('toggleThingVote — authz matrix', () => {
  test('rejects a self-vote with 403 VOTE_SELF', async () => {
    setupFirestore({ thingData: { ...BASE_THING, user_id: CALLER.user_id } });
    await expect(toggleThingVote('thing-1', CALLER)).rejects.toMatchObject({
      statusCode: 403, code: 'VOTE_SELF'
    });
  });

  test('rejects a private save with 403 VOTE_PRIVATE (even for the owner)', async () => {
    setupFirestore({ thingData: { ...BASE_THING, private: true } });
    await expect(toggleThingVote('thing-1', CALLER)).rejects.toMatchObject({
      statusCode: 403, code: 'VOTE_PRIVATE'
    });
  });

  test('rejects cross-org with 403 VOTE_CROSS_ORG', async () => {
    setupFirestore({ thingData: { ...BASE_THING, company_domain: 'other.com' } });
    await expect(toggleThingVote('thing-1', CALLER)).rejects.toMatchObject({
      statusCode: 403, code: 'VOTE_CROSS_ORG'
    });
  });

  test('rejects when the caller has no derivable domain (null org)', async () => {
    setupFirestore({ thingData: { ...BASE_THING, company_domain: null } });
    await expect(toggleThingVote('thing-1', CALLER)).rejects.toMatchObject({
      statusCode: 403, code: 'VOTE_CROSS_ORG'
    });
  });

  test('404s for missing and soft-deleted things', async () => {
    setupFirestore({ thingData: null });
    await expect(toggleThingVote('thing-1', CALLER)).rejects.toMatchObject({ statusCode: 404 });
    setupFirestore({ thingData: { ...BASE_THING, deleted: true } });
    await expect(toggleThingVote('thing-1', CALLER)).rejects.toMatchObject({ statusCode: 404 });
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `cd /Users/rich/Code/saveit-backend/cloud-function && npm test -- firestore-votes`
Expected: FAIL (`Cannot find module './firestore-votes'`).

- [ ] **Step 3: Implement** — `cloud-function/firestore-votes.js`:

```js
// cloud-function/firestore-votes.js
const { FieldValue } = require('@google-cloud/firestore');
const { getSharedPath } = require('./paths');
const { getFirestoreClient } = require(getSharedPath('firestore-client.js'));
const { PageNotFoundError } = require(getSharedPath('errors.js'));
const { deriveCompanyDomain } = require(getSharedPath('company-domain.js'));
const logger = require(getSharedPath('logger.js'));

// The repo's atomicity precedent is firestore.batch(), but a vote toggle is
// a conditional read-modify-write (create-or-delete depending on current
// doc existence) — a batch can't express that without a racy second read,
// so this is the repo's first runTransaction.
function forbidden(message, code) {
  const error = new (require(getSharedPath('errors.js')).ForbiddenError)(message);
  error.code = code;
  return error;
}

async function toggleThingVote(thingId, user) {
  const firestore = getFirestoreClient();
  const thingRef = firestore.collection('things').doc(thingId);
  const voteRef = thingRef.collection('votes').doc(user.user_id);

  return firestore.runTransaction(async (tx) => {
    const thingDoc = await tx.get(thingRef);
    if (!thingDoc.exists) {
      throw new PageNotFoundError(thingId);
    }

    const data = thingDoc.data() || {};
    if (data.deleted === true) {
      // Deleted saves are gone from every feed; indistinguishable from
      // never-existing ones (same masking updateThingFields uses).
      throw new PageNotFoundError(thingId);
    }

    if (data.user_id === user.user_id) {
      throw forbidden('You cannot vote on your own save', 'VOTE_SELF');
    }
    if (data.private === true) {
      throw forbidden('Private saves cannot be voted on', 'VOTE_PRIVATE');
    }
    const callerDomain = deriveCompanyDomain(user.email);
    if (!callerDomain || callerDomain !== data.company_domain) {
      throw forbidden('You can only vote on saves from your organisation', 'VOTE_CROSS_ORG');
    }

    const voteDoc = await tx.get(voteRef);
    const currentlyVoted = voteDoc.exists;
    if (currentlyVoted) {
      tx.delete(voteRef);
      tx.update(thingRef, {
        vote_count: FieldValue.increment(-1),
        updated_at: FieldValue.serverTimestamp()
      });
    } else {
      tx.set(voteRef, {
        uid: user.user_id,
        created_at: FieldValue.serverTimestamp()
      });
      tx.update(thingRef, {
        vote_count: FieldValue.increment(1),
        updated_at: FieldValue.serverTimestamp()
      });
    }

    logger.info('Toggled vote', { thing_id: thingId, voter: user.user_id, voted: !currentlyVoted });
    return {
      id: thingId,
      votes: Math.max(0, (data.vote_count || 0) + (currentlyVoted ? -1 : 1)),
      voted: !currentlyVoted
    };
  });
}

module.exports = { toggleThingVote };
```

Note: `ForbiddenError` arrives via `getSharedPath` inside `forbidden()` to match how `firestore-projects.js` consumes shared errors; move it to a top-level const alongside `PageNotFoundError` if you prefer — both resolve identically.

- [ ] **Step 4: Run to verify pass**

Run: `cd /Users/rich/Code/saveit-backend/cloud-function && npm test -- firestore-votes`
Expected: PASS. (If the `FieldValue.increment` mock assertion is brittle against the Firestore version's internal shape, assert instead that `tx.update` was called with `expect.objectContaining({ vote_count: expect.anything() })` — the count delta is covered by the returned `votes` value.)

- [ ] **Step 5: Commit**

```bash
cd /Users/rich/Code/saveit-backend
git add cloud-function/firestore-votes.js cloud-function/firestore-votes.test.js
git commit -m "feat: transactional vote toggle with org/self/private authz"
```

---

### Task A4: Org feed query + formatting

**Files:**
- Create: `cloud-function/firestore-feed.js`
- Create: `cloud-function/firestore-feed.test.js`

**Interfaces:**
- Consumes: `sortFeedRows`, `feedWindowStart`, `FEED_WINDOW_CAP`, `FEED_PAGE_DEFAULT_LIMIT` (Task A2); `deriveCompanyDomain`, `isPublicEmailDomain` (Task A1).
- Produces: `getOrgFeed({ user, limit, offset }) -> Promise<{ scope, pages, pagination }>` with `scope = { type: 'org'|'personal', domain: string|null, public: boolean }`, `pagination = { total_in_window, next_offset: number|null, has_more: boolean }`, and row fields `{ id, url, title, description, domain, reading_time_minutes, saved_at, manual_tags, pinned, ai_summary_brief, primary_classification_label, classifications, votes, voted, mine, saved_by, private }`. Also exports `buildFeedScope(user)` and `formatFeedRow(doc, votedIds, callerUserId)` for tests. Consumed by Task A5.

- [ ] **Step 1: Write the failing tests** — `cloud-function/firestore-feed.test.js`:

```js
const mockGetFirestoreClient = jest.fn();
jest.mock('../shared/firestore-client.js', () => ({
  getFirestoreClient: mockGetFirestoreClient
}));

// Freeze time so age-based scores are deterministic.
const NOW = new Date('2026-08-30T12:00:00.000Z');
jest.useFakeTimers({ now: NOW });

const { getOrgFeed, buildFeedScope, formatFeedRow } = require('./firestore-feed');

function doc(id, data) {
  return { id, data: () => data, ref: { path: `things/${id}/votes/uid-voter` } };
}

function queryStub(docs) {
  const q = {
    where: jest.fn().mockReturnThis(),
    orderBy: jest.fn().mockReturnThis(),
    limit: jest.fn().mockReturnThis(),
    get: jest.fn().mockResolvedValue({ docs })
  };
  return q;
}

function setupFirestore({ orgDocs = [], ownPrivateDocs = [], personalDocs = [], votedDocs = [] }) {
  const calls = { things: [], votes: null };
  const firestore = {
    collection: jest.fn((name) => {
      if (name === 'things') {
        const q = queryStub(orgDocs.length || personalDocs.length ? orgDocs.length ? orgDocs : personalDocs : ownPrivateDocs);
        // Distinguish successive things() queries by first where() value.
        return q;
      }
      throw new Error(`unexpected collection ${name}`);
    }),
    collectionGroup: jest.fn((name) => {
      calls.votes = name;
      return queryStub(votedDocs);
    })
  };
  mockGetFirestoreClient.mockReturnValue(firestore);
  return { firestore, calls };
}

describe('buildFeedScope', () => {
  test('company email -> org scope, not public', () => {
    expect(buildFeedScope({ email: 'rich@acme.com' })).toEqual({
      type: 'org', domain: 'acme.com', public: false
    });
  });

  test('gmail -> org scope, public', () => {
    expect(buildFeedScope({ email: 'a@gmail.com' })).toEqual({
      type: 'org', domain: 'gmail.com', public: true
    });
  });

  test('non-email -> personal scope', () => {
    expect(buildFeedScope({ email: null })).toEqual({
      type: 'personal', domain: null, public: false
    });
  });
});

describe('formatFeedRow', () => {
  test('extends the page shape with votes/voted/mine/saved_by/private', () => {
    const row = formatFeedRow(
      doc('t1', {
        url: 'https://x.com', title: 'X', user_email: 'jane.doe@acme.com',
        user_id: 'uid-owner', private: false, vote_count: 3,
        saved_at: { toDate: () => new Date('2026-08-29T00:00:00.000Z') }
      }),
      new Set(['t1']),
      'uid-voter'
    );
    expect(row.votes).toBe(3);
    expect(row.voted).toBe(true);
    expect(row.mine).toBe(false);
    expect(row.saved_by).toBe('Jane.doe');
    expect(row.private).toBe(false);
    expect(row.saved_at).toBe('2026-08-29T00:00:00.000Z');
  });

  test('private rows are marked and missing vote_count reads 0', () => {
    const row = formatFeedRow(
      doc('t2', { url: 'u', title: 'T', user_email: 'o@acme.com', user_id: 'uid-owner', private: true }),
      new Set(),
      'uid-owner'
    );
    expect(row.private).toBe(true);
    expect(row.mine).toBe(true);
    expect(row.votes).toBe(0);
    expect(row.voted).toBe(false);
  });
});

describe('getOrgFeed', () => {
  const USER = { user_id: 'uid-voter', email: 'voter@acme.com' };

  test('org feed merges org-visible + own-private, ranks voted above unvoted', async () => {
    const freshUnvoted = doc('fresh', {
      url: 'u1', title: 'Fresh', user_email: 'a@acme.com', user_id: 'uid-a',
      private: false, vote_count: 0,
      saved_at: { toDate: () => new Date(NOW.getTime() - 3600000) }
    });
    const oldVoted = doc('veteran', {
      url: 'u2', title: 'Veteran', user_email: 'b@acme.com', user_id: 'uid-b',
      private: false, vote_count: 4,
      saved_at: { toDate: () => new Date(NOW.getTime() - 10 * 24 * 3600000) }
    });
    const ownPrivate = doc('secret', {
      url: 'u3', title: 'Secret', user_email: 'voter@acme.com', user_id: 'uid-voter',
      private: true, vote_count: 0,
      saved_at: { toDate: () => new Date(NOW.getTime() - 2 * 3600000) }
    });
    // First things() query (org-visible) returns both public docs; the
    // second (own-private) returns the private one. The stub returns by call
    // order, so seed orgDocs then ownPrivateDocs.
    const { firestore } = setupFirestore({
      orgDocs: [freshUnvoted, oldVoted],
      ownPrivateDocs: [ownPrivate],
      votedDocs: []
    });
    // Make successive collection('things') calls return different stubs.
    const orgQ = firestore.collection('things');
    const privQ = queryStub([ownPrivate]);
    let thingsCall = 0;
    firestore.collection = jest.fn(() => (thingsCall++ === 0 ? orgQ : privQ));

    const result = await getOrgFeed({ user: USER });
    expect(result.scope).toEqual({ type: 'org', domain: 'acme.com', public: false });
    expect(result.pages.map(p => p.id)).toEqual(['veteran', 'fresh', 'secret']);
    expect(result.pages.find(p => p.id === 'secret').private).toBe(true);
    expect(result.pages.find(p => p.id === 'secret').mine).toBe(true);
    expect(result.pagination.total_in_window).toBe(3);
    expect(result.pagination.has_more).toBe(false);
    expect(result.pagination.next_offset).toBeNull();
  });

  test('offset pagination slices the ranking', async () => {
    const rows = [1, 2, 3].map(n => doc(`t${n}`, {
      url: `u${n}`, title: `T${n}`, user_email: 'a@acme.com', user_id: 'uid-a',
      private: false, vote_count: 0,
      saved_at: { toDate: () => new Date(NOW.getTime() - n * 3600000) }
    }));
    const { firestore } = setupFirestore({ orgDocs: rows, ownPrivateDocs: [] });
    const orgQ = firestore.collection('things');
    const privQ = queryStub([]);
    let thingsCall = 0;
    firestore.collection = jest.fn(() => (thingsCall++ === 0 ? orgQ : privQ));

    const page1 = await getOrgFeed({ user: USER, limit: 2, offset: 0 });
    expect(page1.pages.map(p => p.id)).toEqual(['t1', 't2']);
    expect(page1.pagination.next_offset).toBe(2);
    expect(page1.pagination.has_more).toBe(true);

    const page2 = await getOrgFeed({ user: USER, limit: 2, offset: 2 });
    expect(page2.pages.map(p => p.id)).toEqual(['t3']);
    expect(page2.pagination.has_more).toBe(false);
  });

  test('personal scope runs a single own-saves query', async () => {
    const personal = doc('mine', {
      url: 'u', title: 'Mine', user_email: null, user_id: 'uid-voter',
      private: false, vote_count: 0,
      saved_at: { toDate: () => new Date(NOW.getTime() - 3600000) }
    });
    const { firestore } = setupFirestore({ personalDocs: [personal] });
    const result = await getOrgFeed({ user: { user_id: 'uid-voter', email: 'notanemail' } });
    expect(result.scope.type).toBe('personal');
    expect(result.pages.map(p => p.id)).toEqual(['mine']);
    expect(result.pages[0].mine).toBe(true);
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `cd /Users/rich/Code/saveit-backend/cloud-function && npm test -- firestore-feed`
Expected: FAIL (`Cannot find module './firestore-feed'`).

- [ ] **Step 3: Implement** — `cloud-function/firestore-feed.js`:

```js
// cloud-function/firestore-feed.js
const { getSharedPath } = require('./paths');
const { getFirestoreClient } = require(getSharedPath('firestore-client.js'));
const { deriveCompanyDomain, isPublicEmailDomain } = require(getSharedPath('company-domain.js'));
const {
  feedWindowStart,
  sortFeedRows,
  FEED_WINDOW_CAP,
  FEED_PAGE_DEFAULT_LIMIT
} = require('./feed-ranking');

function buildFeedScope(user) {
  const domain = deriveCompanyDomain(user.email);
  if (!domain) {
    return { type: 'personal', domain: null, public: false };
  }
  return { type: 'org', domain, public: isPublicEmailDomain(domain) };
}

// Display label from the owner's email local part ("jane.doe@x" -> "Jane.doe").
// things docs carry no display name; capitalizing the first letter keeps it
// human without inventing one.
function formatSavedBy(userEmail) {
  if (typeof userEmail !== 'string' || !userEmail.includes('@')) return null;
  const local = userEmail.slice(0, userEmail.indexOf('@'));
  if (!local) return null;
  return local.charAt(0).toUpperCase() + local.slice(1);
}

function formatFeedRow(doc, votedIds, callerUserId) {
  const data = doc.data() || {};
  return {
    id: doc.id,
    url: data.url,
    title: data.title,
    description: data.description ?? null,
    domain: data.domain || null,
    reading_time_minutes: data.reading_time_minutes || null,
    saved_at: data.saved_at?.toDate ? data.saved_at.toDate().toISOString() : data.saved_at ?? null,
    manual_tags: data.manual_tags || [],
    pinned: data.pinned ?? false,
    ai_summary_brief: data.ai_summary_brief ?? null,
    primary_classification_label: data.primary_classification_label ?? null,
    classifications: data.classifications || [],
    votes: data.vote_count || 0,
    voted: votedIds ? votedIds.has(doc.id) : false,
    mine: data.user_id === callerUserId,
    saved_by: formatSavedBy(data.user_email),
    private: data.private === true
  };
}

function toFeedEntry(doc) {
  const data = doc.data() || {};
  const savedAt = data.saved_at?.toDate ? data.saved_at.toDate() : new Date(data.saved_at);
  const ms = savedAt.getTime();
  return {
    id: doc.id,
    savedAtMs: Number.isFinite(ms) ? ms : 0,
    voteCount: data.vote_count || 0,
    doc
  };
}

async function fetchWindow(firestore, whereClauses, windowStart) {
  let query = firestore.collection('things');
  for (const clause of whereClauses) {
    query = query.where(clause.field, clause.op, clause.value);
  }
  query = query
    .where('saved_at', '>=', windowStart)
    .orderBy('saved_at', 'desc')
    .limit(FEED_WINDOW_CAP);
  const snapshot = await query.get();
  return snapshot.docs;
}

// One collection-group query covers the caller's votes for the whole window
// (votes docs carry uid), instead of a per-row subcollection read.
async function getCallerVotedIds(firestore, user, windowStart) {
  const snapshot = await firestore.collectionGroup('votes')
    .where('uid', '==', user.user_id)
    .where('created_at', '>=', windowStart)
    .get();
  const ids = new Set();
  for (const voteDoc of snapshot.docs) {
    // ref.path === `things/{thingId}/votes/{uid}`
    ids.add(voteDoc.ref.path.split('/')[1]);
  }
  return ids;
}

async function getOrgFeed({ user, limit, offset }) {
  const firestore = getFirestoreClient();
  const scope = buildFeedScope(user);
  const windowStart = feedWindowStart();

  let docs;
  if (scope.type === 'personal') {
    docs = await fetchWindow(firestore, [
      { field: 'user_id', op: '==', value: user.user_id },
      { field: 'deleted', op: '==', value: false }
    ], windowStart);
  } else {
    const [orgDocs, ownPrivateDocs] = await Promise.all([
      fetchWindow(firestore, [
        { field: 'company_domain', op: '==', value: scope.domain },
        { field: 'private', op: '==', value: false },
        { field: 'deleted', op: '==', value: false }
      ], windowStart),
      fetchWindow(firestore, [
        { field: 'user_id', op: '==', value: user.user_id },
        { field: 'private', op: '==', value: true },
        { field: 'deleted', op: '==', value: false }
      ], windowStart)
    ]);
    docs = [...orgDocs, ...ownPrivateDocs];
  }

  const votedIds = await getCallerVotedIds(firestore, user, windowStart);

  const pageLimit = Math.max(1, Math.min(
    Number.parseInt(limit, 10) || FEED_PAGE_DEFAULT_LIMIT,
    FEED_WINDOW_CAP
  ));
  const pageOffset = Math.max(0, Number.parseInt(offset, 10) || 0);

  const sorted = sortFeedRows(docs.map(toFeedEntry));
  const pageEntries = sorted.slice(pageOffset, pageOffset + pageLimit);
  const totalInWindow = sorted.length;
  const hasMore = pageOffset + pageEntries.length < totalInWindow;

  return {
    scope,
    pages: pageEntries.map(entry => formatFeedRow(entry.doc, votedIds, user.user_id)),
    pagination: {
      total_in_window: totalInWindow,
      next_offset: hasMore ? pageOffset + pageEntries.length : null,
      has_more: hasMore
    }
  };
}

module.exports = { getOrgFeed, buildFeedScope, formatFeedRow };
```

- [ ] **Step 4: Run to verify pass**

Run: `cd /Users/rich/Code/saveit-backend/cloud-function && npm test -- firestore-feed`
Expected: PASS. (If the shared `setupFirestore` stub fights the two-query shape, adjust the stub per-test as the offset test already does — the assertions, not the stub, are the contract.)

- [ ] **Step 5: Commit**

```bash
cd /Users/rich/Code/saveit-backend
git add cloud-function/firestore-feed.js cloud-function/firestore-feed.test.js
git commit -m "feat: org feed window query, gravity sort, scope metadata"
```

---

### Task A5: HTTP routes POST /vote and GET /feed

**Files:**
- Modify: `cloud-function/index.js` (route matcher + two handlers, dispatched after the realtime route block ~line 1084 and before `switch (req.method)` at ~line 1086)
- Modify: `cloud-function/index.test.js` (new cases)

**Interfaces:**
- Consumes: `toggleThingVote` (A3), `getOrgFeed` (A4), existing `withAuthAndErrorHandling`, `sendErrorResponse`, `validateThingId` (the same import the pin handler uses).
- Produces: `POST /vote` body `{ id }` → `{ id, votes, voted }`; `GET /feed?limit&offset` → `{ scope, pages, pagination }`; 405 for wrong methods on those paths.

- [ ] **Step 1: Write the failing tests** — append to `cloud-function/index.test.js`, following its existing `createResponse()` + mocked-module style. Add to the top-level `jest.mock` block:

```js
jest.mock('./firestore-votes', () => ({ toggleThingVote: jest.fn() }));
jest.mock('./firestore-feed', () => ({ getOrgFeed: jest.fn() }));
```

and import them alongside the other mocked modules:

```js
const { toggleThingVote } = require('./firestore-votes');
const { getOrgFeed } = require('./firestore-feed');
```

New tests (place near the existing pin-handler tests):

```js
describe('POST /vote', () => {
  test('delegates to toggleThingVote with the authed user', async () => {
    toggleThingVote.mockResolvedValue({ id: 'thing-1', votes: 3, voted: true });
    const res = createResponse();
    await savePage({
      method: 'POST',
      path: '/vote',
      headers: { authorization: 'Bearer token' },
      body: { id: 'thing-1' }
    }, res);
    expect(toggleThingVote).toHaveBeenCalledWith('thing-1', expect.objectContaining({ user_id: 'user-123' }));
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({ id: 'thing-1', votes: 3, voted: true });
  });

  test('400 when id is missing', async () => {
    const res = createResponse();
    await savePage({
      method: 'POST',
      path: '/vote',
      headers: { authorization: 'Bearer token' },
      body: {}
    }, res);
    expect(res.status).toHaveBeenCalledWith(400);
  });

  test('405 for GET /vote', async () => {
    const res = createResponse();
    await savePage({
      method: 'GET',
      path: '/vote',
      headers: { authorization: 'Bearer token' },
      query: {}
    }, res);
    expect(res.status).toHaveBeenCalledWith(405);
  });
});

describe('GET /feed', () => {
  test('delegates to getOrgFeed with parsed limit/offset', async () => {
    getOrgFeed.mockResolvedValue({ scope: { type: 'personal' }, pages: [], pagination: {} });
    const res = createResponse();
    await savePage({
      method: 'GET',
      path: '/feed',
      headers: { authorization: 'Bearer token' },
      query: { limit: '25', offset: '50' }
    }, res);
    expect(getOrgFeed).toHaveBeenCalledWith(expect.objectContaining({
      user: expect.objectContaining({ user_id: 'user-123' }),
      limit: 25,
      offset: 50
    }));
    expect(res.status).toHaveBeenCalledWith(200);
  });

  test('works without query params (defaults)', async () => {
    getOrgFeed.mockResolvedValue({ scope: { type: 'personal' }, pages: [], pagination: {} });
    const res = createResponse();
    await savePage({
      method: 'GET',
      path: '/feed',
      headers: { authorization: 'Bearer token' },
      query: {}
    }, res);
    expect(getOrgFeed).toHaveBeenCalledWith(expect.objectContaining({
      limit: undefined,
      offset: undefined
    }));
  });
});
```

(If the mocked auth user in `index.test.js` differs from `user-123`, match whatever `verifyToken.mockResolvedValue` already sets — the contract under test is delegation, not the literal uid.)

- [ ] **Step 2: Run to verify failure**

Run: `cd /Users/rich/Code/saveit-backend/cloud-function && npm test -- index.test`
Expected: FAIL — `/vote` falls through to `handleSavePage` (or 4xx from it), `/feed` falls to `handleGetSavedPages`.

- [ ] **Step 3: Implement** — in `cloud-function/index.js`:

Add requires near the other local module imports:

```js
const { toggleThingVote } = require('./firestore-votes');
const { getOrgFeed } = require('./firestore-feed');
```

Add handlers near `handlePinPage` (~line 834):

```js
// Handler for POST /vote (toggle the caller's vote on a save). Authz rules
// (self/private/cross-org) live in firestore-votes and surface as 403s.
const handleVotePage = withAuthAndErrorHandling(
  async (req, res, user) => {
    const { id } = req.body;

    if (!id) {
      sendErrorResponse(res, 400, 'id is required', { code: 'MISSING_ID' });
      return;
    }

    if (!validateThingId(id)) {
      sendErrorResponse(res, 400, 'Invalid id', { code: 'INVALID_ID' });
      return;
    }

    const result = await toggleThingVote(id, user);
    res.status(200).json(result);
  },
  {
    context: 'vote-page',
    code: 'VOTE_PAGE_FAILED',
    details: 'Failed to toggle vote',
    getLogContext: (req) => ({ id: req.body?.id })
  }
);

// Handler for GET /feed (org feed page, ranked at read time).
const handleGetFeed = withAuthAndErrorHandling(
  async (req, res, user) => {
    const { limit, offset } = req.query;
    const result = await getOrgFeed({
      user,
      limit: limit === undefined ? undefined : parseInt(limit, 10),
      offset: offset === undefined ? undefined : parseInt(offset, 10)
    });
    res.status(200).json(result);
  },
  { context: 'get-feed', code: 'GET_FEED_FAILED', details: 'Failed to get feed' }
);
```

Add a path matcher next to `matchAuthRoute` (~line 986):

```js
// Org feed voting routes. Path-matched like /auth/session because the
// generic GET default is the pages list — /feed must not fall through to it.
function matchFeedRoute(path, method) {
  if (path === '/vote') return method === 'POST' ? 'vote' : null;
  if (path === '/feed') return method === 'GET' ? 'feed' : null;
  return null;
}
```

In `exports.savePage`, after the realtime route dispatch block (~lines 1077-1084) and before `switch (req.method)` (~line 1086), using the same normalized path variable those blocks use:

```js
  if (path === '/vote' || path === '/feed') {
    const feedRoute = matchFeedRoute(path, req.method);
    if (!feedRoute) {
      sendErrorResponse(res, 405, 'Method not allowed', { code: 'METHOD_NOT_ALLOWED' });
      return;
    }
    if (feedRoute === 'vote') {
      return await withAuth(handleVotePage)(req, res);
    }
    return await withAuth(handleGetFeed)(req, res);
  }
```

Note: the auth+error wrapper is applied at handler declaration time (`withAuthAndErrorHandling` returns a `withAuth`-wrapped handler), so dispatch calls the handler directly: `return handleVotePage(req, res);` / `return handleGetFeed(req, res);` — mirror exactly how the pin route would be dispatched if it were path-matched; if the surrounding code shows handlers called bare, call them bare.

- [ ] **Step 4: Run to verify pass**

Run: `cd /Users/rich/Code/saveit-backend/cloud-function && npm test -- index.test`
Expected: PASS (new cases + no regressions in the suite).

- [ ] **Step 5: Commit**

```bash
cd /Users/rich/Code/saveit-backend
git add cloud-function/index.js cloud-function/index.test.js
git commit -m "feat: POST /vote and GET /feed routes on the saveit function"
```

---

### Task A6: Org scope keys on the realtime path

**Files:**
- Modify: `cloud-function/realtime-events.js` (`buildScopeKeys`)
- Modify: `cloud-function/realtime-trigger.js` (pass `companyDomain` at the two things call sites)
- Modify: `cloud-function/realtime-stream.js` (`computeClientScopeKeys`)
- Modify tests: `cloud-function/realtime-events.test.js`, `cloud-function/realtime-stream.test.js`

**Interfaces:**
- Consumes: `deriveCompanyDomain` (A1) — in `realtime-stream.js` via `require(getSharedPath('company-domain.js'))` with `./paths` (paths.js is byte-identical across `cloud-function/` and `cloud-function-realtime/`, and `deploy-realtime-function.sh` copies shared/ in).
- Produces: things events carry `org:<domain>` scope keys; connected clients register `org:<their domain>`. SSE payload shape is unchanged (scopeKeys already flows to clients).

- [ ] **Step 1: Write the failing tests** — add to `cloud-function/realtime-events.test.js`:

```js
  test('adds an org key when the doc carries company_domain', () => {
    expect(buildScopeKeys({ projectIds: [], userId: 'uid-1', companyDomain: 'acme.com' }))
      .toEqual(expect.arrayContaining(['user:uid-1', 'org:acme.com']));
  });

  test('omits the org key when company_domain is null (personal saves)', () => {
    const keys = buildScopeKeys({ projectIds: [], userId: 'uid-1', companyDomain: null });
    expect(keys).not.toContain('org:null');
    expect(keys.every(k => !k.startsWith('org:'))).toBe(true);
  });
```

Add to `cloud-function/realtime-stream.test.js` (in the `computeClientScopeKeys` describe if present, else a new one; import `computeClientScopeKeys` at the top alongside the existing requires):

```js
const { computeClientScopeKeys } = require('./realtime-stream');

describe('computeClientScopeKeys', () => {
  test('registers the org key for a domain email', () => {
    const keys = computeClientScopeKeys({ user_id: 'uid-1', email: 'a@acme.com' }, ['p1']);
    expect(keys.has('org:acme.com')).toBe(true);
    expect(keys.has('user:uid-1')).toBe(true);
    expect(keys.has('project:p1')).toBe(true);
  });

  test('registers no org key without a derivable domain', () => {
    const keys = computeClientScopeKeys({ user_id: 'uid-1', email: null }, []);
    expect([...keys].some(k => k.startsWith('org:'))).toBe(false);
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `cd /Users/rich/Code/saveit-backend/cloud-function && npm test -- realtime`
Expected: FAIL (org cases).

- [ ] **Step 3: Implement**

`cloud-function/realtime-events.js` — `buildScopeKeys`:

```js
function buildScopeKeys({ projectIds, userId, companyDomain }) {
  const keys = (projectIds || []).map(id => `project:${id}`);
  if (userId) {
    keys.push(`user:${userId}`);
  }
  // Org-scoped feed: org-mates' open tabs refetch the feed when any org
  // save changes (org feed voting spec, 2026-08-30). gmail.com is a real,
  // deliberately public org — the key is only added for saves that carry a
  // company_domain (personal/null-domain saves stay owner-scoped).
  if (companyDomain) {
    keys.push(`org:${companyDomain}`);
  }
  return keys;
}
```

`cloud-function/realtime-trigger.js` — at both things call sites (soft-delete branch ~line 81 and active branch ~line 98), add the field:

```js
      scopeKeys: buildScopeKeys({
        projectIds,
        userId,
        companyDomain: docData.company_domain || null
      }),
```

(The projects call site at ~line 126 is unchanged — project events stay project-scoped.)

`cloud-function/realtime-stream.js` — top imports:

```js
const { getSharedPath } = require('./paths');
const { deriveCompanyDomain } = require(getSharedPath('company-domain.js'));
```

(match the file's existing require style; if it already imports via `./paths` for other helpers, extend that.) Then:

```js
function computeClientScopeKeys(user, projectIds) {
  // org:<domain> matches things events from org-mates' saves so the client
  // can refresh its org feed (votes and new saves reorder it live).
  const orgDomain = deriveCompanyDomain(user.email);
  return new Set([
    `user:${user.user_id}`,
    ...(orgDomain ? [`org:${orgDomain}`] : []),
    ...projectIds.map(id => `project:${id}`)
  ]);
}
```

- [ ] **Step 4: Run to verify pass + full backend suite**

Run: `cd /Users/rich/Code/saveit-backend/cloud-function && npm test`
Expected: PASS (whole suite — this task touches shared realtime files; run everything, not just realtime).

- [ ] **Step 5: Commit**

```bash
cd /Users/rich/Code/saveit-backend
git add cloud-function/realtime-events.js cloud-function/realtime-trigger.js cloud-function/realtime-stream.js cloud-function/realtime-events.test.js cloud-function/realtime-stream.test.js
git commit -m "feat: org scope keys on realtime events and SSE clients"
```

---

### Task A7: Write `company_domain` + `private` on things-doc creation

**Files:**
- Modify: `cloud-function-enrich/firestore-writers.js` (`transformThingToFirestoreFormat`)
- Modify: `cloud-function-enrich/firestore-writers.test.js`

**Interfaces:**
- Consumes: `deriveCompanyDomain` (A1) via `cloud-function-enrich/paths.js` (`getSharedPath('company-domain.js')` — the enrich deploy script copies shared/ in).
- Produces: every newly created things doc carries `company_domain` (derived from `user_email`) and `private: false`. Re-enrich updates never touch them (preserved like `user_email`).

- [ ] **Step 1: Write the failing test** — add to `cloud-function-enrich/firestore-writers.test.js` (follow the file's existing mock-`thing` style):

```js
describe('transformThingToFirestoreFormat — org feed fields', () => {
  test('materializes company_domain from user_email and explicit private: false', () => {
    const thing = {
      id: 't1', event_id: 'e1', thing_type: 'web_page',
      user_id: 'uid-1', user_email: 'Jane@Acme.com',
      url: 'https://x.com', title: 'X', saved_at: '2026-08-30T00:00:00Z',
      classifications: []
    };
    const doc = transformThingToFirestoreFormat(thing);
    expect(doc.company_domain).toBe('acme.com');
    expect(doc.private).toBe(false);
  });

  test('null user_email writes null company_domain (owner-scoped save)', () => {
    const doc = transformThingToFirestoreFormat({
      id: 't2', user_id: 'uid-1', user_email: null,
      url: 'u', title: 'T', saved_at: '2026-08-30T00:00:00Z', classifications: []
    });
    expect(doc.company_domain).toBeNull();
    expect(doc.private).toBe(false);
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `cd /Users/rich/Code/saveit-backend/cloud-function-enrich && npm test -- firestore-writers`
Expected: FAIL (`company_domain` undefined).

- [ ] **Step 3: Implement** — in `cloud-function-enrich/firestore-writers.js`: add the import near the top (following the file's existing `getSharedPath` usage):

```js
const { deriveCompanyDomain } = require(getSharedPath('company-domain.js'));
```

In `transformThingToFirestoreFormat`, after the `pinned` line:

```js
    // Org feed scoping: materialize the org key and explicit privacy so
    // Firestore equality queries (feed: company_domain == X, private == false)
    // match every save, not just pre-migration docs.
    company_domain: deriveCompanyDomain(thing.user_email),
    private: thing.private !== undefined ? thing.private : false,
```

Also extend the preserved-fields comment in `buildEnrichmentUpdateObject` (~line 199) to list `company_domain` and `private` next to `user_email` — comment-only change; the update object must keep not touching them.

- [ ] **Step 4: Run to verify pass**

Run: `cd /Users/rich/Code/saveit-backend/cloud-function-enrich && npm test -- firestore-writers`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
cd /Users/rich/Code/saveit-backend
git add cloud-function-enrich/firestore-writers.js cloud-function-enrich/firestore-writers.test.js
git commit -m "feat(enrich): write company_domain + private on thing creation"
```

---

### Task A8: Composite indexes + contracts schema

**Files:**
- Modify: `scripts/create-firestore-indexes.sh` (three new index blocks)
- Modify: `contracts/firestore-things-schema.js` (document `vote_count` + `votes` subcollection)

**Interfaces:**
- Produces: index definitions for (1) `things (company_domain ASC, private ASC, deleted ASC, saved_at DESC)`, (2) `things (user_id ASC, private ASC, deleted ASC, saved_at DESC)`, (3) collection-group `votes (uid ASC, created_at ASC)`. No code consumes these directly; the Firestore query engine does.

- [ ] **Step 1: Add index blocks** — in `scripts/create-firestore-indexes.sh`, after the existing composite-index steps, append three blocks following the exact idiom of "Index 1" (the `index_exists "things" "saved_at"` + `gcloud firestore indexes composite create` + `--async --quiet` pattern). New Step heading and blocks:

```bash
echo "=========================================="
echo "Step N: Composite Indexes (org feed voting)"
echo "=========================================="
echo "Creating composite indexes for the org feed (2026-08-30 spec)"
echo ""

# Feed index 1: org window query —
# things where company_domain == X AND private == false AND deleted == false,
# saved_at >= window, orderBy saved_at DESC.
echo "Feed index 1: things (company_domain ASC, private ASC, deleted ASC, saved_at DESC)"
if index_exists "things" "company_domain"; then
  echo "✓ Already exists (skipping)"
else
  echo "Creating..."
  gcloud firestore indexes composite create \
    --collection-group=things \
    --field-config=field-path=company_domain,order=ASCENDING \
    --field-config=field-path=private,order=ASCENDING \
    --field-config=field-path=deleted,order=ASCENDING \
    --field-config=field-path=saved_at,order=DESCENDING \
    --database="$DATABASE" \
    --project="$PROJECT_ID" \
    --async \
    --quiet
  echo "✓ Index creation initiated"
fi

echo ""

# Feed index 2: own-private window query —
# things where user_id == me AND private == true AND deleted == false,
# saved_at >= window, orderBy saved_at DESC.
echo "Feed index 2: things (user_id ASC, private ASC, deleted ASC, saved_at DESC)"
if index_exists "things" "user_id"; then
  echo "✓ Already exists (skipping)"
else
  echo "Creating..."
  gcloud firestore indexes composite create \
    --collection-group=things \
    --field-config=field-path=user_id,order=ASCENDING \
    --field-config=field-path=private,order=ASCENDING \
    --field-config=field-path=deleted,order=ASCENDING \
    --field-config=field-path=saved_at,order=DESCENDING \
    --database="$DATABASE" \
    --project="$PROJECT_ID" \
    --async \
    --quiet
  echo "✓ Index creation initiated"
fi

echo ""

# Feed index 3: caller's recent votes — collectionGroup('votes')
# where uid == me AND created_at >= window.
echo "Feed index 3: votes collection group (uid ASC, created_at ASC)"
if index_exists "votes" "uid"; then
  echo "✓ Already exists (skipping)"
else
  echo "Creating..."
  gcloud firestore indexes composite create \
    --collection-group=votes \
    --field-config=field-path=uid,order=ASCENDING \
    --field-config=field-path=created_at,order=ASCENDING \
    --database="$DATABASE" \
    --project="$PROJECT_ID" \
    --async \
    --quiet
  echo "✓ Index creation initiated"
fi
```

Caveat for the executor: `index_exists` filters by a single `fieldPath`, and "Feed index 2" shares its first field (`user_id`) with the pre-existing `things (user_id, deleted, saved_at)` index — that filter will see the old index and skip. Fix by filtering on a field unique to each new index: use `index_exists "things" "company_domain"` (unique), and for feed index 2 filter on `private` (`index_exists "things" "private"`), for feed index 3 on `uid`. Verify each `gcloud ... list --filter=...` matches only the intended index before trusting the skip (run the list command manually first).

- [ ] **Step 2: Update the contracts schema** — in `contracts/firestore-things-schema.js`, extend the example doc object (after the `company_domain: 'example.com',` line) and add prose where the file documents fields:

```js
  // Denormalised vote total for the org feed (read-time ranking reads it
  // instead of counting the votes subcollection per row). Maintained
  // transactionally by POST /vote; absent on legacy docs reads as 0.
  vote_count: 0,
```

And a subcollection note next to the doc example:

```js
// Subcollection: things/{id}/votes/{uid} — one doc per vote, doc ID = voter
// uid, fields { uid, created_at }. Existence IS the vote; POST /vote toggles
// it transactionally with vote_count on the parent.
```

- [ ] **Step 3: Run contract validation + shell syntax check**

Run: `cd /Users/rich/Code/saveit-backend && bash -n scripts/create-firestore-indexes.sh && ./contracts/validate-schemas.sh`
Expected: both exit 0.

- [ ] **Step 4: Commit**

```bash
cd /Users/rich/Code/saveit-backend
git add scripts/create-firestore-indexes.sh contracts/firestore-things-schema.js
git commit -m "feat: org feed composite indexes + votes schema contract"
```

---

### Task A9: googlemail backfill script + deploy runbook

**Files:**
- Create: `scripts/migrate-canonicalize-gmail-orgs.js`
- Create: `docs/org-feed-voting-deploy.md` (backend repo docs dir if present; otherwise repo root — check `ls docs` first and place accordingly)

- [ ] **Step 1: Write the backfill script** — `scripts/migrate-canonicalize-gmail-orgs.js`, Style A (mirroring `scripts/migrate-add-org-fields.js`):

```js
/**
 * Migration: canonicalize things.company_domain googlemail.com → gmail.com.
 *
 * deriveCompanyDomain now folds googlemail.com into gmail.com (org feed
 * voting, 2026-08-30), so docs written before that change (and the
 * migrate-add-org-fields backfill) may still carry the alias spelling.
 * Same-alias orgs would otherwise split into two feeds.
 *
 * Idempotent: rewrites only docs whose company_domain is exactly
 * 'googlemail.com'. New docs are written canonical by the enrich worker.
 *
 * Usage: cd cloud-function && node ../scripts/migrate-canonicalize-gmail-orgs.js
 */

const admin = require('firebase-admin');
const path = require('path');

const configPath = path.join(__dirname, '..', 'shared', 'config.js');
const { PROJECT_ID } = require(configPath);

if (!admin.apps.length) {
  admin.initializeApp({ projectId: PROJECT_ID });
}
const firestore = admin.firestore();

async function run() {
  const snapshot = await firestore.collection('things')
    .where('company_domain', '==', 'googlemail.com')
    .get();

  if (snapshot.empty) {
    console.log('No googlemail.com company_domain docs — nothing to do.');
    return;
  }

  const BATCH_SIZE = 500;
  let batch = firestore.batch();
  let batchCount = 0;
  let updated = 0;

  for (const doc of snapshot.docs) {
    batch.update(doc.ref, { company_domain: 'gmail.com' });
    updated += 1;
    batchCount += 1;
    if (batchCount === BATCH_SIZE) {
      await batch.commit();
      console.log(`Committed ${updated} updates…`);
      batch = firestore.batch();
      batchCount = 0;
    }
  }

  if (batchCount > 0) {
    await batch.commit();
  }
  console.log(`Done: ${updated} things docs canonicalized to gmail.com.`);
}

run()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error('Migration failed:', error);
    process.exit(1);
  });
```

- [ ] **Step 2: Dry-check the script parses**

Run: `cd /Users/rich/Code/saveit-backend/cloud-function && node --check ../scripts/migrate-canonicalize-gmail-orgs.js`
Expected: no output, exit 0. **Do not run the script** — it writes to production Firestore and belongs to the operator-gated runbook.

- [ ] **Step 3: Write the runbook** — `docs/org-feed-voting-deploy.md` (create `docs/` if absent):

```markdown
# Org feed voting — deploy runbook (operator-gated)

Every step below touches production (the backend has no staging). Run in
order; stop and confirm with Rich before starting.

1. `./scripts/create-firestore-indexes.sh` — three new composites; wait until
   `gcloud firestore indexes composite list --database="(default)"` shows them
   READY before step 4 (feeds 404-index errors otherwise).
2. `cd cloud-function && node ../scripts/migrate-add-org-fields.js` —
   idempotent safety net for company_domain/private on legacy docs.
3. `cd cloud-function && node ../scripts/migrate-canonicalize-gmail-orgs.js` —
   googlemail → gmail canonicalization.
4. `./scripts/deploy-function.sh` — saveit (new /vote, /feed routes).
5. `./scripts/deploy-realtime-trigger.sh` — org scope keys on event emission.
6. `./scripts/deploy-realtime-function.sh` — org scope keys on SSE clients.
7. Smoke: with a signed-in extension session, `curl -X GET
   "$FUNCTION_URL/feed" -H "Authorization: Bearer <token>"` returns
   `{scope: {...}, pages: [...], pagination: {...}}`; POST /vote twice on an
   org-mate's save returns `{voted: true}` then `{voted: false}`.
8. Watch: two org-mate new tabs open; a vote in one reorders the other
   within a few seconds (SSE → refetch).
```

- [ ] **Step 4: Commit**

```bash
cd /Users/rich/Code/saveit-backend
git add scripts/migrate-canonicalize-gmail-orgs.js docs/org-feed-voting-deploy.md
git commit -m "feat: gmail org canonicalization backfill + deploy runbook"
```

---

# Phase B — Extension (`/Users/rich/Code/saveit-extension/`)

All Phase B work happens on branch `feat/org-feed-voting` (create from `main` in Task B1, commit per task). The extension must stay safe against an undeployed backend: any `/feed` 404 falls back to the personal list (deploy-order bridge).

### Task B1: Feed cache surface plumbing

**Files:**
- Modify: `src/cache-keys.js`
- Modify: `src/api-core.js`
- Create: `tests/unit/api/feed-cache-surface.test.js`

**Interfaces:**
- Produces: `FEED_CACHE_PREFIX = 'feed_cache'`; `API.feedCacheManager` (lazy getter); `API.getFeedCachedPages(scope, options)`, `API.setFeedCachedPages(response, scope)`, `API.invalidateFeedCache(scope)`; `invalidateAllCaches()` now also invalidates feed. Consumed by Tasks B3, B5.

- [ ] **Step 1: Write the failing tests** — `tests/unit/api/feed-cache-surface.test.js`:

```js
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createApiTestHarness } from './test-api-harness.js';

describe('feed cache surface', () => {
  let harness;
  let API;

  beforeEach(() => {
    harness = createApiTestHarness();
    harness.setExtensionMode({ local: {} }, { id: 'test' });
    API = harness.API;
  });

  it('lazily constructs a feedCacheManager with the feed prefix', () => {
    expect(API._feedCacheManager).toBeNull();
    const manager = API.feedCacheManager;
    expect(manager).toBeTruthy();
    expect(manager.CACHE_KEY_PREFIX).toBe('feed_cache');
  });

  it('getFeedCachedPages delegates to the feed cache manager', async () => {
    const cached = { pages: [], scope: null, pagination: {} };
    API._feedCacheManager = { getCachedPages: vi.fn(async () => cached), invalidateCache: vi.fn() };
    await expect(API.getFeedCachedPages({ surface: 'feed' })).resolves.toBe(cached);
    expect(API._feedCacheManager.getCachedPages).toHaveBeenCalledWith({ surface: 'feed' });
  });

  it('setFeedCachedPages and invalidateFeedCache delegate to the feed manager', async () => {
    API._feedCacheManager = { setCachedPages: vi.fn(), invalidateCache: vi.fn() };
    await API.setFeedCachedPages({ pages: [] }, { surface: 'feed' });
    await API.invalidateFeedCache();
    expect(API._feedCacheManager.setCachedPages).toHaveBeenCalled();
    expect(API._feedCacheManager.invalidateCache).toHaveBeenCalledWith(null);
  });

  it('invalidateAllCaches includes the feed surface', async () => {
    API._cacheManager = { invalidateCache: vi.fn() };
    API._projectsCacheManager = { invalidateCache: vi.fn() };
    API._domainsCacheManager = { invalidateCache: vi.fn() };
    API._feedCacheManager = { invalidateCache: vi.fn() };
    await API.invalidateAllCaches();
    expect(API._feedCacheManager.invalidateCache).toHaveBeenCalled();
  });

  it('feed cache manager never shares identity with the pages cache manager', () => {
    expect(API.feedCacheManager).not.toBe(API.cacheManager);
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `cd /Users/rich/Code/saveit-extension && npx vitest run tests/unit/api/feed-cache-surface.test.js`
Expected: FAIL (`_feedCacheManager` undefined, prefix undefined).

- [ ] **Step 3: Implement**

`src/cache-keys.js` — next to the existing prefixes:

```js
export const FEED_CACHE_PREFIX = 'feed_cache';
```

`src/api-core.js`:
1. Import `FEED_CACHE_PREFIX` alongside the existing prefix imports.
2. Next to `API._domainsCacheManager = null;` add `API._feedCacheManager = null;`.
3. Add a getter copying the `projectsCacheManager` pattern verbatim but with `FEED_CACHE_PREFIX` and `_feedCacheManager`.
4. Add the surface accessors next to the domains block:

```js
async getFeedCachedPages(scope = {}, options = {}) {
  if (!this.isExtension) return null;
  return await this.feedCacheManager.getCachedPages(scope, options);
},
async setFeedCachedPages(response, scope = {}) {
  if (!this.isExtension) return;
  return await this.feedCacheManager.setCachedPages(response, scope);
},
async invalidateFeedCache(scope = null) {
  if (!this.isExtension) return;
  return await this.feedCacheManager.invalidateCache(scope);
}
```

5. In `invalidateAllCaches()`, add `this.invalidateFeedCache()` to the existing `Promise.all`.

- [ ] **Step 4: Run to verify pass + suite**

Run: `cd /Users/rich/Code/saveit-extension && npx vitest run tests/unit/api/feed-cache-surface.test.js && npx vitest run`
Expected: PASS (new file + no regressions).

- [ ] **Step 5: Commit**

```bash
cd /Users/rich/Code/saveit-extension
git checkout -b feat/org-feed-voting
git add src/cache-keys.js src/api-core.js tests/unit/api/feed-cache-surface.test.js
git commit -m "feat(api): feed cache surface (feed_cache prefix, lazy manager)"
```

---

### Task B2: Standalone feed mocks

**Files:**
- Create: `src/api-feed-standalone.js`
- Create: `tests/unit/api/feed-standalone.test.js`

**Interfaces:**
- Produces: `getMockFeed(options) -> { scope, pages, pagination }` (scope is `{ type: 'org', domain: 'gmail.com', public: true }` so the public-feed UI states render in standalone dev), `voteStandaloneFeedPage(id) -> { id, votes, voted }`, `resetMockFeedVotesForTests()`. Rows carry `votes`, `voted`, `mine` (first row), `saved_by`. Consumed by Task B3 and the e2e.

- [ ] **Step 1: Write the failing tests** — `tests/unit/api/feed-standalone.test.js`:

```js
import { describe, it, expect, beforeEach } from 'vitest';
import {
  getMockFeed,
  voteStandaloneFeedPage,
  resetMockFeedVotesForTests
} from '../../../src/api-feed-standalone.js';

const basePages = [
  { id: '1', url: 'https://a.com', title: 'A', user_email: 'you@gmail.com', saved_at: '2026-08-29T00:00:00Z' },
  { id: '2', url: 'https://b.com', title: 'B', user_email: 'other@gmail.com', saved_at: '2026-08-28T00:00:00Z' },
  { id: '3', url: 'https://c.com', title: 'C', user_email: 'other2@gmail.com', saved_at: '2026-08-27T00:00:00Z' }
];

describe('getMockFeed', () => {
  beforeEach(() => {
    globalThis.MOCK_DATA = structuredClone(basePages);
    resetMockFeedVotesForTests();
  });

  it('returns feed-shaped rows with votes/voted/mine/saved_by', () => {
    const feed = getMockFeed();
    expect(feed.scope).toEqual({ type: 'org', domain: 'gmail.com', public: true });
    expect(feed.pages[0].mine).toBe(true);
    expect(feed.pages[0].saved_by).toBe('You');
    expect(typeof feed.pages[1].votes).toBe('number');
    expect(feed.pages[1].voted).toBe(false);
  });

  it('paginates with offset and has_more', () => {
    const page1 = getMockFeed({ limit: 2 });
    expect(page1.pages).toHaveLength(2);
    expect(page1.pagination.has_more).toBe(true);
    expect(page1.pagination.next_offset).toBe(2);
    const page2 = getMockFeed({ limit: 2, offset: 2 });
    expect(page2.pages).toHaveLength(1);
    expect(page2.pagination.has_more).toBe(false);
  });
});

describe('voteStandaloneFeedPage', () => {
  beforeEach(() => {
    globalThis.MOCK_DATA = structuredClone(basePages);
    resetMockFeedVotesForTests();
  });

  it('toggles votes on and off for a non-own row', () => {
    const before = getMockFeed().pages.find(p => p.id === '2');
    const on = voteStandaloneFeedPage('2');
    expect(on).toMatchObject({ id: '2', voted: true, votes: before.votes + 1 });
    const off = voteStandaloneFeedPage('2');
    expect(off).toMatchObject({ id: '2', voted: false, votes: before.votes });
  });

  it('throws for an unknown id', () => {
    expect(() => voteStandaloneFeedPage('nope')).toThrow();
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `cd /Users/rich/Code/saveit-extension && npx vitest run tests/unit/api/feed-standalone.test.js`
Expected: FAIL (module not found).

- [ ] **Step 3: Implement** — `src/api-feed-standalone.js`:

```js
// Standalone (file://) feed for UI development. Derives feed rows from
// globalThis.MOCK_DATA with deterministic votes so both voted and unvoted
// rows render without touching mock-data.js. The first row plays the user
// (mine: true) so the disabled own-row chevron is visible.

const DEFAULT_FEED_LIMIT = 50;

const votedOverrides = new Set();

function baseVotes(index) {
  if (typeof globalThis.getMockFeedVotes === 'function') {
    return globalThis.getMockFeedVotes(index) || 0;
  }
  // Every 3rd row (skipping row 0, which is "mine") carries votes.
  return index > 0 && index % 3 === 1 ? 1 + (index % 4) : 0;
}

function buildMockFeedRows() {
  const pages = Array.isArray(globalThis.MOCK_DATA) ? globalThis.MOCK_DATA : [];
  return pages.map((page, index) => ({
    ...page,
    votes: baseVotes(index) + (votedOverrides.has(page.id) ? 1 : 0),
    voted: votedOverrides.has(page.id),
    mine: index === 0,
    saved_by: index === 0 ? 'You' : savedByLabel(page.user_email),
    private: false
  }));
}

function savedByLabel(userEmail) {
  if (typeof userEmail !== 'string' || !userEmail.includes('@')) return null;
  const local = userEmail.slice(0, userEmail.indexOf('@'));
  return local ? local.charAt(0).toUpperCase() + local.slice(1) : null;
}

export function getMockFeed(options = {}) {
  const rows = buildMockFeedRows();
  const limit = options.limit || DEFAULT_FEED_LIMIT;
  const offset = options.offset || 0;
  const page = rows.slice(offset, offset + limit);
  const hasMore = offset + page.length < rows.length;
  // Public gmail scope so the public-feed label + disclosure render in dev.
  return {
    scope: { type: 'org', domain: 'gmail.com', public: true },
    pages: page,
    pagination: {
      total_in_window: rows.length,
      next_offset: hasMore ? offset + page.length : null,
      has_more: hasMore
    }
  };
}

export function voteStandaloneFeedPage(id) {
  const page = (globalThis.MOCK_DATA || []).find(entry => entry.id === id);
  if (!page) {
    throw new Error('Page not found');
  }
  const index = globalThis.MOCK_DATA.indexOf(page);
  const currentlyVoted = votedOverrides.has(id);
  if (currentlyVoted) {
    votedOverrides.delete(id);
  } else {
    votedOverrides.add(id);
  }
  return {
    id,
    votes: baseVotes(index) + (currentlyVoted ? 0 : 1),
    voted: !currentlyVoted
  };
}

export function resetMockFeedVotesForTests() {
  votedOverrides.clear();
}
```

- [ ] **Step 4: Run to verify pass**

Run: `cd /Users/rich/Code/saveit-extension && npx vitest run tests/unit/api/feed-standalone.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
cd /Users/rich/Code/saveit-extension
git add src/api-feed-standalone.js tests/unit/api/feed-standalone.test.js
git commit -m "feat(api): standalone feed mock with toggletable votes"
```

---

### Task B3: Feed API methods

**Files:**
- Create: `src/api-feed.js`
- Modify: `src/api-pages.js` (compose `applyApiFeed`)
- Create: `tests/unit/api/feed-api.test.js`

**Interfaces:**
- Consumes: `_getCachedOrFreshList`, `_fetchWithAuth`, `_executeWithErrorHandling`, `_withCacheMetadata`, `assertRealPageId` (all existing); B1 accessors; B2 mocks.
- Produces: `API.getFeed(options) -> Promise<feed response>` (cached on first page, `skipCache` for load-more offsets), `API.votePage(id) -> Promise<{ id, votes, voted }>`.

- [ ] **Step 1: Write the failing tests** — `tests/unit/api/feed-api.test.js`:

```js
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createApiTestHarness } from './test-api-harness.js';

const FEED_RESPONSE = {
  scope: { type: 'org', domain: 'acme.com', public: false },
  pages: [{ id: 'p1', votes: 2, voted: false, mine: false, saved_by: 'Ann' }],
  pagination: { total_in_window: 1, next_offset: null, has_more: false }
};

function extensionHarness() {
  const harness = createApiTestHarness();
  harness.setExtensionMode({ local: {} }, { id: 'test' });
  global.window = global.window || {};
  global.window.firebaseAuth = {};
  global.window.firebaseGetIdToken = async () => 'token';
  return harness;
}

describe('API.getFeed (extension mode)', () => {
  let API;

  beforeEach(() => {
    const harness = extensionHarness();
    API = harness.API;
    API._feedCacheManager = { getCachedPages: vi.fn(async () => null), setCachedPages: vi.fn() };
  });

  it('fetches /feed with limit/offset params and caches the response', async () => {
    global.fetch = vi.fn(async () => ({
      ok: true,
      json: async () => FEED_RESPONSE
    }));
    const result = await API.getFeed({ limit: 50 });
    expect(global.fetch).toHaveBeenCalledWith(
      expect.stringContaining('/feed'),
      expect.objectContaining({ method: 'GET' })
    );
    expect(result.scope.domain).toBe('acme.com');
    expect(API._feedCacheManager.setCachedPages).toHaveBeenCalled();
  });

  it('serves a fresh cache hit without fetching', async () => {
    API._feedCacheManager.getCachedPages = vi.fn(async () => FEED_RESPONSE);
    global.fetch = vi.fn();
    const result = await API.getFeed();
    expect(global.fetch).not.toHaveBeenCalled();
    expect(result.meta.fromCache).toBe(true);
  });

  it('load-more offsets skip the cache but still fetch', async () => {
    global.fetch = vi.fn(async () => ({
      ok: true,
      json: async () => FEED_RESPONSE
    }));
    await API.getFeed({ offset: 50, skipCache: true });
    expect(global.fetch).toHaveBeenCalled();
    expect(API._feedCacheManager.getCachedPages).not.toHaveBeenCalled();
  });

  it('propagates a 404 with error.status so the UI can bridge to the personal list', async () => {
    global.fetch = vi.fn(async () => ({
      ok: false,
      status: 404,
      json: async () => ({ error: 'Not Found', message: 'nope' })
    }));
    const error = await API.getFeed().catch(e => e);
    expect(error).toBeInstanceOf(Error);
    expect(error.status).toBe(404);
  });
});

describe('API.votePage', () => {
  it('POSTs { id } to /vote in extension mode', async () => {
    const harness = extensionHarness();
    const API = harness.API;
    global.fetch = vi.fn(async () => ({
      ok: true,
      json: async () => ({ id: 'p1', votes: 3, voted: true })
    }));
    const result = await API.votePage('p1');
    expect(global.fetch).toHaveBeenCalledWith(
      expect.stringContaining('/vote'),
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ id: 'p1' })
      })
    );
    expect(result.voted).toBe(true);
  });

  it('rejects optimistic ids before any network call', async () => {
    const harness = extensionHarness();
    global.fetch = vi.fn();
    await expect(harness.API.votePage('optimistic:https://x.com')).rejects.toThrow();
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('toggles the standalone mock in standalone mode', async () => {
    const harness = createApiTestHarness();
    harness.setStandaloneMode();
    globalThis.MOCK_DATA = [{ id: '2', url: 'u', title: 'B', user_email: 'o@gmail.com' }];
    const first = await harness.API.votePage('2');
    const second = await harness.API.votePage('2');
    expect(first.voted).toBe(true);
    expect(second.voted).toBe(false);
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `cd /Users/rich/Code/saveit-extension && npx vitest run tests/unit/api/feed-api.test.js`
Expected: FAIL (`API.getFeed is not a function`).

- [ ] **Step 3: Implement** — `src/api-feed.js`:

```js
import { getMockFeed, voteStandaloneFeedPage } from './api-feed-standalone.js';
import { assertRealPageId } from './pending-saves.js';

function buildFeedCacheScope() {
  return { surface: 'feed' };
}

export function applyApiFeed(API) {
  Object.assign(API, {
    async getFeed(options = {}) {
      if (this.isExtension) {
        return this._getCachedOrFreshList({
          cacheScope: buildFeedCacheScope(),
          readCache: (scope) => this.getFeedCachedPages(scope),
          writeCache: (value, scope) => this.setFeedCachedPages(value, scope),
          fetcher: () => this._fetchWithAuth('/feed', {
            limit: options.limit,
            offset: options.offset
          }),
          normalize: (response) => response,
          mockFetcher: getMockFeed,
          context: 'getFeed',
          options
        });
      }
      return this._withCacheMetadata(getMockFeed(options), false);
    },

    async votePage(id) {
      assertRealPageId(id);
      if (this.isExtension) {
        return this._executeWithErrorHandling(
          async () => this._fetchWithAuth('/vote', null, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ id })
          }),
          'votePage',
          { id }
        );
      }
      return voteStandaloneFeedPage(id);
    }
  });
  return API;
}
```

Then wire it in `src/api-pages.js` (composed inside `applyApiPages` so the existing test harness picks it up with no changes):

```js
import { applyApiFeed } from './api-feed.js';

export function applyApiPages(API) {
  applyApiPagesLists(API);
  applyApiProjects(API);
  applyApiPageActions(API);
  applyApiImport(API);
  applyApiDomains(API);
  applyApiFeed(API);
  return API;
}
```

Note: `_getCachedOrFreshList` passes `options` through, and its `skipCache` option bypasses the cache read — that is exactly the load-more path. The 404 bridge relies on the transport's thrown `Error` carrying `.status` (it does — `api-transport.js` attaches it on `!response.ok`).

- [ ] **Step 4: Run to verify pass + suite**

Run: `cd /Users/rich/Code/saveit-extension && npx vitest run tests/unit/api/feed-api.test.js && npx vitest run`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
cd /Users/rich/Code/saveit-extension
git add src/api-feed.js src/api-pages.js tests/unit/api/feed-api.test.js
git commit -m "feat(api): getFeed cached read + votePage toggle"
```

---

### Task B4: Feed renderer

**Files:**
- Create: `src/feed-renderer.js`
- Create: `tests/unit/newtab/feed-renderer.test.js`
- Modify: `src/newtab.css` (feed classes)
- Modify: `src/newtab.html` (kicker + disclosure slots)

**Interfaces:**
- Consumes: row fields from Task A4/B2; `reconcileKeyedChildren`, `createElementFromHtml`, `escapeHtml`, `formatSavedDate`, `getFaviconUrlForDomain`, `getPageDomain`, `truncateText` (all existing).
- Produces: `renderFeedRowMarkup(row)`, `feedScopeKickerMarkup(scope)`, `feedDisclosureMarkup(scope)`, `feedProviderLabel(domain)`, `createFeedRenderer({ documentObj, resultsContainer }) -> { renderFeed(rows), clear() }`.

- [ ] **Step 1: Write the failing tests** — `tests/unit/newtab/feed-renderer.test.js`:

```js
import { describe, it, expect } from 'vitest';
import {
  renderFeedRowMarkup,
  feedScopeKickerMarkup,
  feedDisclosureMarkup,
  feedProviderLabel
} from '../../../src/feed-renderer.js';

const ROW = {
  id: 't1',
  url: 'https://example.com/a',
  title: 'A great read',
  domain: 'example.com',
  saved_at: '2026-08-29T00:00:00.000Z',
  votes: 4,
  voted: false,
  mine: false,
  saved_by: 'Ann',
  private: false,
  reading_time_minutes: 6,
  ai_summary_brief: 'A summary.',
  manual_tags: []
};

describe('renderFeedRowMarkup', () => {
  it('renders an always-visible vote control with count and aria state', () => {
    const html = renderFeedRowMarkup(ROW);
    expect(html).toContain('data-action="vote"');
    expect(html).toContain('aria-pressed="false"');
    expect(html).toContain('feed-vote-count');
    expect(html).toContain('>4</span>');
  });

  it('marks voted rows active', () => {
    const html = renderFeedRowMarkup({ ...ROW, voted: true, votes: 5 });
    expect(html).toContain('aria-pressed="true"');
    expect(html).toContain('is-active');
  });

  it('disables the chevron on the voter\'s own save with an explanatory title', () => {
    const html = renderFeedRowMarkup({ ...ROW, mine: true });
    expect(html).toContain('disabled');
    expect(html).toContain("You can't vote on your own save");
  });

  it('disables the chevron on optimistic (pending) saves', () => {
    const html = renderFeedRowMarkup({ ...ROW, optimistic: true, id: 'optimistic:x' });
    expect(html).toContain('disabled');
  });

  it('shows attribution and the Only-you marker for private rows', () => {
    const html = renderFeedRowMarkup({ ...ROW, private: true });
    expect(html).toContain('saved by Ann');
    expect(html).toContain('Only you');
  });

  it('hides the saved-by label when the backend sent none', () => {
    const html = renderFeedRowMarkup({ ...ROW, saved_by: null });
    expect(html).not.toContain('saved by');
  });
});

describe('scope kicker', () => {
  it('labels company orgs', () => {
    expect(feedScopeKickerMarkup({ type: 'org', domain: 'acme.com', public: false }))
      .toContain('Everyone at acme.com');
  });

  it('labels public orgs with the provider name', () => {
    expect(feedScopeKickerMarkup({ type: 'org', domain: 'gmail.com', public: true }))
      .toContain('Everyone using Gmail — public');
  });

  it('labels personal scope', () => {
    expect(feedScopeKickerMarkup({ type: 'personal', domain: null, public: false }))
      .toContain('Your saves only');
  });
});

describe('feedDisclosureMarkup', () => {
  it('names the provider and the privacy escape hatch', () => {
    const html = feedDisclosureMarkup({ type: 'org', domain: 'gmail.com', public: true });
    expect(html).toContain('visible to everyone using Gmail');
    expect(html).toContain('Hide from organisation');
    expect(html).toContain('data-action="dismiss-disclosure"');
  });

  it('renders nothing for non-public scopes', () => {
    expect(feedDisclosureMarkup({ type: 'org', domain: 'acme.com', public: false })).toBe('');
    expect(feedDisclosureMarkup({ type: 'personal', domain: null, public: false })).toBe('');
  });
});

describe('feedProviderLabel', () => {
  it('maps known providers, passes domains through', () => {
    expect(feedProviderLabel('gmail.com')).toBe('Gmail');
    expect(feedProviderLabel('outlook.com')).toBe('Outlook');
    expect(feedProviderLabel('acme.com')).toBe('acme.com');
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `cd /Users/rich/Code/saveit-extension && npx vitest run tests/unit/newtab/feed-renderer.test.js`
Expected: FAIL (module not found).

- [ ] **Step 3: Implement** — `src/feed-renderer.js`:

```js
import { createElementFromHtml, replaceElementHtml } from './dom-render.js';
import { reconcileKeyedChildren } from './keyed-dom-list.js';
import {
  escapeHtml,
  formatSavedDate,
  getFaviconUrlForDomain,
  getPageDomain,
  renderPageTags,
  truncateText
} from './newtab-shared.js';
import { isOptimisticPage } from './pending-saves.js';

// Known free providers get a plainer-English label in scope copy. Unknown
// domains render as themselves — the list only shapes wording, never access.
const PROVIDER_LABELS = {
  'gmail.com': 'Gmail',
  'googlemail.com': 'Gmail',
  'outlook.com': 'Outlook',
  'hotmail.com': 'Hotmail',
  'live.com': 'Outlook',
  'yahoo.com': 'Yahoo',
  'icloud.com': 'iCloud',
  'proton.me': 'Proton',
  'protonmail.com': 'Proton'
};

export function feedProviderLabel(domain) {
  return PROVIDER_LABELS[domain] || domain || 'your email provider';
}

export function feedScopeKickerMarkup(scope) {
  if (!scope) {
    return '';
  }
  let label;
  if (scope.type === 'personal') {
    label = 'Your saves only';
  } else if (scope.public) {
    label = `Everyone using ${feedProviderLabel(scope.domain)} — public`;
  } else {
    label = `Everyone at ${scope.domain}`;
  }
  return `<span class="feed-scope-kicker">${escapeHtml(label)}</span>`;
}

export function feedDisclosureMarkup(scope) {
  if (!scope || scope.type !== 'org' || !scope.public) {
    return '';
  }
  return `
    <aside class="feed-disclosure" role="note">
      <p>Saves in this feed are visible to everyone using ${escapeHtml(feedProviderLabel(scope.domain))}. Use “Hide from organisation” on a save to keep it private.</p>
      <button class="feed-disclosure-dismiss" type="button" data-action="dismiss-disclosure">Got it</button>
    </aside>
  `;
}

function voteControlHtml(row) {
  const optimistic = isOptimisticPage(row);
  const disabled = row.mine || optimistic;
  const title = row.mine
    ? "You can't vote on your own save"
    : optimistic
      ? 'Saving…'
      : (row.voted ? 'Remove vote' : 'Upvote');
  return `
    <button
      class="feed-vote ${row.voted ? 'is-active' : ''}"
      type="button"
      data-action="vote"
      data-id="${escapeHtml(row.id)}"
      aria-pressed="${row.voted ? 'true' : 'false'}"
      title="${escapeHtml(title)}"
      aria-label="${escapeHtml(title)}"
      ${disabled ? 'disabled' : ''}
    >
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true">
        <path d="M12 19V5"></path>
        <path d="M5 12l7-7 7 7"></path>
      </svg>
      <span class="feed-vote-count">${escapeHtml(String(row.votes ?? 0))}</span>
    </button>
  `;
}

export function renderFeedRowMarkup(row) {
  const domain = getPageDomain(row);
  const summary = (row.ai_summary_brief || row.description || '').trim();
  const url = row.url || '';
  const navigationAttrs = url
    ? ` data-url="${escapeHtml(url)}" role="link" tabindex="0"`
    : '';
  const meta = [];
  if (domain) {
    meta.push(`<span>${escapeHtml(domain)}</span>`);
  }
  if (row.saved_by) {
    meta.push(`<span>saved by ${escapeHtml(row.saved_by)}</span>`);
  }
  if (row.reading_time_minutes) {
    meta.push(`<span>${row.reading_time_minutes} min read</span>`);
  }
  const tagsHtml = renderPageTags(row);

  // Feed rows reuse the index-row anatomy but drop the personal management
  // actions (edit/pin/privacy/projects/delete) — those belong to the drawer.
  // Voting sits first in the meta line, always visible (DESIGN.md: hover
  // reveals never shift layout; voting is a primary action).
  return `
    <article class="index-row feed-row" data-page-id="${escapeHtml(row.id || '')}"${navigationAttrs}>
      <div class="index-row-main">
        <h3 class="index-row-title">${escapeHtml(row.title || domain || 'Untitled')}</h3>
        <span class="index-row-date">${escapeHtml(formatSavedDate(row.saved_at, { day: 'numeric', month: 'short' }))}</span>
      </div>
      ${summary ? `<p class="index-row-summary">${escapeHtml(truncateText(summary))}</p>` : ''}
      <div class="index-row-footer">
        <div class="index-row-meta">
          ${voteControlHtml(row)}
          ${domain ? `<img class="index-row-favicon" src="${getFaviconUrlForDomain(domain)}" alt="" width="14" height="14">` : ''}
          ${meta.length ? meta.join('<span class="index-row-meta-sep">·</span>') : ''}
          ${row.private ? '<span class="feed-only-you">Only you</span>' : ''}
        </div>
        ${tagsHtml ? `<div class="index-row-tags">${tagsHtml}</div>` : ''}
      </div>
    </article>
  `;
}

export function createFeedRenderer({ documentObj = document, resultsContainer }) {
  // The feed owns its own section beside the drawer's "pages" section so
  // each surface can reconcile without wiping the other; renderFeed clears
  // the pages section because the two lists never show at the same time.
  function ensureFeedSection() {
    if (!resultsContainer) {
      return null;
    }
    resultsContainer.querySelector('[data-section="pages"]')?.remove();
    let section = resultsContainer.querySelector('[data-section="feed"]');
    if (!section) {
      section = createElementFromHtml('<div data-section="feed"></div>', documentObj);
      resultsContainer.append(section);
    }
    return section;
  }

  function renderFeed(rows) {
    const section = ensureFeedSection();
    if (!section) {
      return;
    }
    if (!Array.isArray(rows) || !rows.length) {
      replaceElementHtml(section, `
        <div class="empty-state saved-pages-drawer-state">
          <p>No saves in this feed yet.</p>
        </div>
      `);
      return;
    }
    reconcileKeyedChildren(section, rows, {
      getKey: row => row.id || null,
      getNodeKey: node => node?.dataset?.pageId || null,
      pruneUnkeyed: true,
      renderItem: (row, existingNode) => {
        const next = createElementFromHtml(renderFeedRowMarkup(row), documentObj);
        return existingNode && existingNode.outerHTML === next?.outerHTML
          ? existingNode
          : next;
      }
    });
  }

  function clear() {
    resultsContainer?.querySelector('[data-section="feed"]')?.remove();
  }

  return { renderFeed, clear };
}
```

Add the CSS to `src/newtab.css` (tokens only, mono metadata in `ink-soft`, ≥24px targets):

```css
/* Org feed: scope kicker rides the desk-index header beside the title. */
.feed-scope-kicker {
  font-family: var(--font-mono);
  font-size: var(--font-size-xs);
  letter-spacing: 0.14em;
  text-transform: uppercase;
  color: var(--color-ink-soft);
}

/* Vote control: always visible, never hover-revealed. */
.feed-vote {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  min-height: 24px;
  padding: 2px 8px 2px 4px;
  border: 0;
  border-radius: 8px;
  background: transparent;
  color: var(--color-ink-soft);
  font-family: var(--font-mono);
  font-size: var(--font-size-xs);
  cursor: pointer;
}

.feed-vote svg {
  width: 16px;
  height: 16px;
}

.feed-vote:hover:not(:disabled) {
  background: var(--color-accent-wash);
  color: var(--color-accent-ink);
}

.feed-vote.is-active {
  color: var(--color-accent-ink);
}

.feed-vote:disabled {
  cursor: default;
  opacity: 0.7;
}

.feed-vote-count {
  min-width: 1ch;
}

.feed-only-you {
  font-family: var(--font-mono);
  font-size: var(--font-size-xs);
  color: var(--color-ink-soft);
  border: 1px solid var(--color-line-strong);
  border-radius: 999px;
  padding: 1px 8px;
}

/* One-time public-feed disclosure: hairline-separated note, not a box. */
.feed-disclosure {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  gap: 12px;
  padding: 8px 0;
  border-top: 1px solid var(--color-line);
  border-bottom: 1px solid var(--color-line);
  margin-bottom: 8px;
}

.feed-disclosure p {
  margin: 0;
  font-size: var(--font-size-sm);
  color: var(--color-ink-soft);
}

.feed-disclosure-dismiss {
  border: 0;
  background: transparent;
  padding: 4px 0;
  color: var(--color-accent-ink);
  font-family: var(--font-sans);
  font-size: var(--font-size-sm);
  text-decoration: underline;
  cursor: pointer;
}

.feed-disclosure-dismiss:hover {
  color: var(--color-accent);
}
```

In `src/newtab.html`, add two slots inside `.desk-index` — the kicker after the title in the header, the disclosure between header and results:

```html
<div id="desk-index-header" class="desk-index-header">
  <h2 id="desk-index-title" class="desk-index-title">Recently saved</h2>
  <span id="feed-scope-kicker-slot"></span>
  <label class="desk-sort-label">… existing sort control …</label>
</div>
<div id="feed-disclosure-slot"></div>
```

- [ ] **Step 4: Run to verify pass + lint CSS**

Run: `cd /Users/rich/Code/saveit-extension && npx vitest run tests/unit/newtab/feed-renderer.test.js && just lint-css && npm run format:check`
Expected: PASS (fix any stylelint/prettier nits with `just lint-css-fix` / `npm run format` before committing).

- [ ] **Step 5: Commit**

```bash
cd /Users/rich/Code/saveit-extension
git add src/feed-renderer.js src/newtab.css src/newtab.html tests/unit/newtab/feed-renderer.test.js
git commit -m "feat(feed): feed rows with vote control, scope kicker, disclosure"
```

---

### Task B5: Feed controller

**Files:**
- Create: `src/newtab-feed.js`
- Create: `tests/unit/newtab/newtab-feed.test.js`

**Interfaces:**
- Consumes: `API.getFeed`, `API.votePage`, `API.getFeedCachedPages`, `API.setFeedCachedPages` (B3); `createFeedRenderer`, `feedScopeKickerMarkup`, `feedDisclosureMarkup` (B4).
- Produces: `createFeedController({ api, documentObj, resultsContainer, kickerSlotEl, disclosureSlotEl, notify }) -> { load, refresh, renderIdle, hide, handleVote, dismissDisclosure, isAvailable }`. `renderIdle() -> boolean` (false = caller should render the personal list). `hide()` clears the feed section, kicker, and disclosure.

- [ ] **Step 1: Write the failing tests** — `tests/unit/newtab/newtab-feed.test.js`:

```js
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createFeedController } from '../../../src/newtab-feed.js';

const FEED = {
  scope: { type: 'org', domain: 'acme.com', public: false },
  pages: [
    { id: 'own', title: 'Mine', votes: 0, voted: false, mine: true },
    { id: 'theirs', title: 'Theirs', votes: 2, voted: false, mine: false }
  ],
  pagination: { total_in_window: 2, next_offset: null, has_more: false }
};

function buildDom() {
  document.body.innerHTML = `
    <div id="results"></div>
    <span id="kicker"></span>
    <div id="disclosure"></div>
  `;
  return {
    resultsContainer: document.getElementById('results'),
    kickerSlotEl: document.getElementById('kicker'),
    disclosureSlotEl: document.getElementById('disclosure')
  };
}

function buildController(overrides = {}) {
  const dom = buildDom();
  const api = {
    getFeed: vi.fn(async () => FEED),
    votePage: vi.fn(async () => ({ id: 'theirs', votes: 3, voted: true })),
    getFeedCachedPages: vi.fn(async () => null),
    setFeedCachedPages: vi.fn()
  };
  const notify = vi.fn();
  const controller = createFeedController({
    api,
    documentObj: document,
    notify,
    ...dom,
    ...overrides
  });
  return { controller, api, notify, ...dom };
}

describe('createFeedController', () => {
  it('loads the feed, renders rows, and reports available', async () => {
    const { controller } = buildController();
    await controller.load();
    expect(controller.isAvailable()).toBe(true);
    expect(controller.renderIdle()).toBe(true);
    expect(document.querySelectorAll('.feed-row')).toHaveLength(2);
    expect(document.getElementById('kicker').textContent).toContain('Everyone at acme.com');
  });

  it('marks itself unavailable on error (personal-list bridge handled by caller)', async () => {
    const { controller } = buildController();
    controller._testSetError(new Error('boom'));
    await controller.refresh();
    expect(controller.isAvailable()).toBe(false);
    expect(controller.renderIdle()).toBe(false);
  });

  it('optimistically toggles a vote and reverts on failure with an error toast', async () => {
    const { controller, notify } = buildController();
    await controller.load();
    await controller.handleVote('theirs');
    let row = document.querySelector('[data-page-id="theirs"] .feed-vote');
    expect(row.getAttribute('aria-pressed')).toBe('true');
    expect(row.textContent).toContain('3');

    controller._testSetVoteFailure(new Error('offline'));
    await controller.handleVote('theirs');
    row = document.querySelector('[data-page-id="theirs"] .feed-vote');
    expect(row.getAttribute('aria-pressed')).toBe('false');
    expect(notify).toHaveBeenCalledWith("Couldn't save your vote — try again", { type: 'error' });
  });

  it('ignores votes on own rows and pending saves', async () => {
    const { controller, api } = buildController();
    await controller.load();
    await controller.handleVote('own');
    expect(api.votePage).not.toHaveBeenCalled();
  });

  it('shows the disclosure once for public scopes and never again after dismissal', async () => {
    const { controller } = buildController({
      api: {
        getFeed: vi.fn(async () => ({ ...FEED, scope: { type: 'org', domain: 'gmail.com', public: true } })),
        votePage: vi.fn(),
        getFeedCachedPages: vi.fn(async () => null),
        setFeedCachedPages: vi.fn()
      }
    });
    await controller.load();
    expect(document.getElementById('disclosure').textContent).toContain('visible to everyone using Gmail');
    controller.dismissDisclosure();
    expect(document.getElementById('disclosure').textContent).toBe('');
    await controller.refresh();
    expect(document.getElementById('disclosure').textContent).toBe('');
  });

  it('hide() clears the feed section and kicker', async () => {
    const { controller } = buildController();
    await controller.load();
    controller.hide();
    expect(document.querySelectorAll('.feed-row')).toHaveLength(0);
    expect(document.getElementById('kicker').textContent).toBe('');
  });
});
```

(The `_testSetError` / `_testSetVoteFailure` hooks are test seams: the first makes the *next* `getFeed`/`votePage` throw; implement them as small setters used only by tests — or, cleaner, pass `api` mocks that reject on later calls and drop the hooks; pick one and keep test and implementation consistent.)

- [ ] **Step 2: Run to verify failure**

Run: `cd /Users/rich/Code/saveit-extension && npx vitest run tests/unit/newtab/newtab-feed.test.js`
Expected: FAIL (module not found).

- [ ] **Step 3: Implement** — `src/newtab-feed.js`:

```js
import { createFeedRenderer, feedScopeKickerMarkup, feedDisclosureMarkup } from './feed-renderer.js';
import { isOptimisticPage } from './pending-saves.js';
import { replaceElementHtml } from './dom-render.js';

const DISCLOSURE_DISMISSED_KEY = 'feed-public-disclosure-dismissed';
const FEED_PAGE_LIMIT = 50;
// Refreshes re-pull from offset 0 but keep everything the user has scrolled
// to load, capped at the server's window cap.
const FEED_REFRESH_MAX = 500;

export function createFeedController({
  api,
  documentObj = document,
  resultsContainer,
  kickerSlotEl,
  disclosureSlotEl,
  notify
}) {
  const renderer = createFeedRenderer({ documentObj, resultsContainer });
  const state = {
    rows: [],
    scope: null,
    // null = never loaded; true = feed shown; false = unavailable (404
    // bridge, auth error) → the desk index falls back to the personal list.
    available: null,
    displaying: false
  };

  function localStorageSafe() {
    try {
      return documentObj.defaultView?.localStorage || null;
    } catch {
      return null;
    }
  }

  function disclosureDismissed() {
    try {
      return localStorageSafe()?.getItem(DISCLOSURE_DISMISSED_KEY) === '1';
    } catch {
      // Unreachable storage: treat as dismissed rather than nagging.
      return true;
    }
  }

  function markDisclosureDismissed() {
    try {
      localStorageSafe()?.setItem(DISCLOSURE_DISMISSED_KEY, '1');
    } catch {
      // Best-effort: an in-session repeat is acceptable.
    }
  }

  function persistToCache() {
    if (!state.scope) {
      return;
    }
    void api.setFeedCachedPages({
      scope: state.scope,
      pages: state.rows,
      pagination: { total_in_window: state.rows.length, next_offset: null, has_more: false }
    }, { surface: 'feed' });
  }

  function applyResponse(response) {
    state.rows = Array.isArray(response?.pages) ? response.pages : [];
    state.scope = response?.scope || null;
    state.available = true;
    if (state.displaying) {
      renderFeedSurface();
    }
  }

  function renderFeedSurface() {
    state.displaying = true;
    if (kickerSlotEl) {
      replaceElementHtml(kickerSlotEl, feedScopeKickerMarkup(state.scope));
    }
    if (disclosureSlotEl) {
      const showDisclosure = state.scope?.public && !disclosureDismissed();
      replaceElementHtml(disclosureSlotEl, showDisclosure ? feedDisclosureMarkup(state.scope) : '');
      disclosureSlotEl.querySelector('[data-action="dismiss-disclosure"]')
        ?.addEventListener('click', dismissDisclosure);
    }
    renderer.renderFeed(state.rows);
  }

  async function refresh() {
    try {
      const limit = Math.max(FEED_PAGE_LIMIT, Math.min(state.rows.length, FEED_REFRESH_MAX));
      const response = await api.getFeed({ limit });
      applyResponse(response);
      persistToCache();
    } catch (error) {
      // 404 = old backend without /feed: stay down and let the caller's
      // personal-list fallback render. Anything else is transient — retry
      // on the next realtime event or reconnect.
      state.available = false;
      if (state.displaying) {
        hide();
      }
      console.error('[feed] refresh failed:', error);
    }
  }

  async function load() {
    // Warm paint from cache, then reconcile with the server.
    try {
      const cached = await api.getFeedCachedPages({ surface: 'feed' }, { allowExpired: true });
      if (cached?.pages?.length && state.available !== false) {
        applyResponse(cached);
        state.displaying = false; // paint only; the fresh fetch re-renders
        renderFeedSurface();
      }
    } catch {
      // Cache read failure is non-fatal.
    }
    await refresh();
  }

  function renderIdle() {
    if (state.available !== true || !state.rows.length && !state.scope) {
      return false;
    }
    renderFeedSurface();
    return true;
  }

  function hide() {
    state.displaying = false;
    renderer.clear();
    if (kickerSlotEl) {
      replaceElementHtml(kickerSlotEl, '');
    }
    if (disclosureSlotEl) {
      replaceElementHtml(disclosureSlotEl, '');
    }
  }

  function dismissDisclosure() {
    markDisclosureDismissed();
    if (disclosureSlotEl) {
      replaceElementHtml(disclosureSlotEl, '');
    }
  }

  async function handleVote(id) {
    const row = state.rows.find(entry => entry.id === id);
    if (!row || row.mine || isOptimisticPage(row)) {
      return;
    }
    const previous = { votes: row.votes, voted: row.voted };
    row.votes = Math.max(0, (row.votes || 0) + (row.voted ? -1 : 1));
    row.voted = !row.voted;
    // Order deliberately unchanged here: rank is server-computed and settles
    // via the realtime-triggered refresh (spec: optimistic toggle, no local
    // re-rank).
    if (state.displaying) {
      renderer.renderFeed(state.rows);
    }
    try {
      await api.votePage(id);
      persistToCache();
    } catch (error) {
      Object.assign(row, previous);
      if (state.displaying) {
        renderer.renderFeed(state.rows);
      }
      console.error('[feed] vote failed:', error);
      notify("Couldn't save your vote — try again", { type: 'error' });
    }
  }

  return {
    load,
    refresh,
    renderIdle,
    hide,
    handleVote,
    dismissDisclosure,
    isAvailable: () => state.available === true
  };
}
```

If you kept the `_testSetError`/`_testSetVoteFailure` seams from Step 1, implement them as two tiny functions setting module-state flags consumed by `refresh`/`handleVote` — or adjust the tests to reject via the `api` mocks and drop the seams (preferred; tests then exercise the real paths).

- [ ] **Step 4: Run to verify pass**

Run: `cd /Users/rich/Code/saveit-extension && npx vitest run tests/unit/newtab/newtab-feed.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
cd /Users/rich/Code/saveit-extension
git add src/newtab-feed.js tests/unit/newtab/newtab-feed.test.js
git commit -m "feat(feed): feed controller with warm paint, optimistic votes, disclosure"
```

---

### Task B6: App wiring (idle dispatch, events, realtime)

**Files:**
- Modify: `src/newtab-app.js` (create controller, bus subscription, onConnect)
- Modify: `src/newtab-drawer-ui.js` (idle-branch delegation + hide on query/scope)
- Modify: `src/newtab-drawer-runtime.js` (thread `feedController` into UI controller + events)
- Modify: `src/newtab-drawer-events.js` (`vote` delegation case)
- Modify: `src/newtab-page.js` (element lookups for the two new slots)

**Interfaces:**
- Consumes: `createFeedController` (B5) and all prior tasks.
- Produces: idle desk index renders the org feed; query/scope active → personal list as today; `page_updated` events carrying an `org:` scope key refresh the feed; reconnect (`onConnect`) refreshes the feed.

- [ ] **Step 1: Element lookups** — `src/newtab-page.js`, inside `getNewtabElements` next to `deskIndexTitle`:

```js
    feedScopeKickerSlot: documentObj.getElementById('feed-scope-kicker-slot'),
    feedDisclosureSlot: documentObj.getElementById('feed-disclosure-slot'),
```

- [ ] **Step 2: Create the controller + subscribe** — `src/newtab-app.js`, after `drawerController` is created (~line 173) and before the realtime bus subscriptions (~line 188):

```js
  // Org feed: the idle desk index is the organisation feed; the drawer
  // (search/manage) stays personal. Falls back to the personal list while
  // the backend lacks /feed (deploy-order bridge).
  const feedController = createFeedController({
    api,
    documentObj,
    resultsContainer: elements.savedPagesDrawerResults,
    kickerSlotEl: elements.feedScopeKickerSlot,
    disclosureSlotEl: elements.feedDisclosureSlot,
    notify: toast.show
  });
```

with the import added at the top: `import { createFeedController } from './newtab-feed.js';`.

Extend the existing `page_updated` subscription (~line 192) — the SSE server only forwards an event to clients whose scope keys intersect, so any `org:` key on a received event means *my* org:

```js
  realtimeBus.subscribe('page_updated', (event) => {
    void (async () => {
      await savedPagesStore.refreshInitial();
      if ((event.scopeKeys || []).some(key => key.startsWith('org:'))) {
        void feedController.refresh();
      }
      // … existing enrichment runtime-message block unchanged …
    })();
  });
```

Extend `onConnect` (~line 253):

```js
    onConnect: () => {
      void drawerController.refreshOpenScopes();
      void feedController.refresh();
    }
```

Kick off the initial load where the drawer first loads (find the signed-in start path in `newtab-app.js` / `newtab-page.js` — the same place that calls `drawerController.load()` on auth success; commonly the auth signed-in callback and the post-`start()` load):

```js
  void feedController.load();
```

Place it wherever `drawerController.load()` is invoked on sign-in/start so a cold open warms the feed in parallel with the drawer.

- [ ] **Step 3: Idle dispatch in the UI controller** — `src/newtab-drawer-ui.js`:

Add `feedController = null` to the `createDrawerUiController({...})` parameter list (after `documentObj`).

In `renderResults()`:
1. Right after the `const hasQuery = Boolean(trimmedQuery);` line (~126), add:

```js
    // Any drawer activity (search, project/domain scope) retires the feed
    // surface until the desk is idle again.
    if (hasQuery || state.selectedProjectId || state.selectedDomainId) {
      feedController?.hide();
    }
```

2. In the idle branch, after the launch-strip render decision (~line 171, after the `if (pinnedPages.length) … else …` block) and before `if (!state.pages.length) {`, add:

```js
    // Idle desk: the org feed owns the index. renderIdle() returning false
    // means the feed is unavailable (old backend / signed out / not loaded)
    // — fall through to the personal list exactly as before the feed.
    if (!hasScope && feedController?.renderIdle()) {
      return;
    }
```

- [ ] **Step 4: Thread through the runtime + events** — `src/newtab-drawer-runtime.js`:
1. Add `feedController = null` to `createSavedPagesDrawerController`'s destructure (alongside `deskSort`, `datelineEl`, etc.).
2. Pass `feedController` into the `createDrawerUiControllerFn({...})` call (~line 92).
3. In the events wiring (~lines 182-211) add `handleDrawerVote: (id) => feedController?.handleVote(id)` to the object passed to `initSavedPagesDrawerEvents`.

`src/newtab-drawer-events.js`:
1. Add `handleDrawerVote` to the injected params.
2. In the click delegation (after the `pin` case, ~line 118):

```js
  if (action === 'vote') {
    void handleDrawerVote(id);
    return;
  }
```

- [ ] **Step 5: Thread the controller from the app** — in `src/newtab-app.js`, pass `feedController` into `createSavedPagesDrawerControllerFn({...})` (a new property on the existing deps object, after `notify`). The runtime destructures it (Step 4.1). If the events file receives its handlers through a data-controller object rather than direct params, follow that file's existing injection pattern for `handleDrawerPin` — `handleDrawerVote` must arrive the same way.

- [ ] **Step 6: Run the full unit suite + lint**

Run: `cd /Users/rich/Code/saveit-extension && npx vitest run && just lint-js && just lint-css && npm run format:check`
Expected: all PASS.

- [ ] **Step 7: Commit**

```bash
cd /Users/rich/Code/saveit-extension
git add src/newtab-app.js src/newtab-drawer-ui.js src/newtab-drawer-runtime.js src/newtab-drawer-events.js src/newtab-page.js
git commit -m "feat(feed): wire org feed into the idle desk index + realtime refresh"
```

---

### Task B7: E2E + docs + full gate

**Files:**
- Create: `tests/e2e/feed-voting.spec.js`
- Modify: `DESIGN.md` (component language: feed row + vote affordance)
- Modify: `docs/README.md` (behavior note)

- [ ] **Step 1: Write the e2e spec** — `tests/e2e/feed-voting.spec.js` (Playwright, standalone `file://` pattern from `standalone.spec.js`):

```js
import { test, expect } from '@playwright/test';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const newtabPath = path.resolve(__dirname, '../../src/newtab.html');

test.beforeEach(async ({ page }) => {
  await page.goto(`file://${newtabPath}`);
  await page.waitForSelector('#saved-pages-results');
});

test('idle desk renders the org feed with a public scope kicker', async ({ page }) => {
  await page.waitForSelector('.feed-row');
  await expect(page.locator('#feed-scope-kicker-slot')).toContainText('Everyone using Gmail — public');
});

test('public-feed disclosure shows once and stays dismissed', async ({ page }) => {
  await page.waitForSelector('.feed-disclosure');
  await page.click('.feed-disclosure-dismiss');
  await expect(page.locator('#feed-disclosure-slot')).toBeEmpty();
  await page.reload();
  await page.waitForSelector('.feed-row');
  await expect(page.locator('#feed-disclosure-slot')).toBeEmpty();
});

test('voting toggles the count and chevron state on an org-mate row', async ({ page }) => {
  await page.waitForSelector('.feed-row');
  const votable = page.locator('.feed-vote:not([disabled])').first();
  const before = await votable.locator('.feed-vote-count').innerText();
  await votable.click();
  await expect(votable).toHaveAttribute('aria-pressed', 'true');
  const after = await votable.locator('.feed-vote-count').innerText();
  expect(Number(after)).toBe(Number(before) + 1);
  await votable.click();
  await expect(votable).toHaveAttribute('aria-pressed', 'false');
  const restored = await votable.locator('.feed-vote-count').innerText();
  expect(Number(restored)).toBe(Number(before));
});

test('own row shows points but a disabled chevron', async ({ page }) => {
  await page.waitForSelector('.feed-row');
  const ownRow = page.locator('.feed-row').first(); // mock row 0 is "mine"
  await expect(ownRow.locator('.feed-vote')).toBeDisabled();
});

test('searching switches back to the personal list, clearing hides the feed', async ({ page }) => {
  await page.waitForSelector('.feed-row');
  await page.fill('#saved-pages-search-input', 'something');
  await page.waitForTimeout(400); // 250ms debounce
  await expect(page.locator('[data-section="feed"]')).toHaveCount(0);
});
```

(Confirm the search input's actual id in `newtab.html` before running — use whatever the search form field is; if the selector differs, adjust only the locator, not the assertions. If the disclosure e2e is flaky because localStorage persists across the disclosure test's reload, scope each test's `browserContext` or dismiss state reset in `beforeEach` via `page.addInitScript(() => localStorage.removeItem('feed-public-disclosure-dismissed'))`.)

- [ ] **Step 2: Run the e2e headless**

Run: `cd /Users/rich/Code/saveit-extension && just test-e2e`
Expected: PASS, including the pre-existing warming-flow failure being the ONLY allowed red (it fails on `main` before this work — memory: `warming-flow.spec.js:286`).

- [ ] **Step 3: Docs**

`DESIGN.md` — extend "Component language" with:

```markdown
- **Feed row**: the idle index row in org mode — same table-of-contents anatomy as the index row, minus personal management actions. An always-visible vote control (chevron + mono points) leads the meta line; `aria-pressed` marks the voted state; the voter's own row disables the chevron. Attribution ("saved by X") and an "Only you" mono tag ride the same meta line. The header gains a mono scope kicker ("Everyone at acme.com" / "Everyone using Gmail — public" / "Your saves only"), and public scopes get a one-time hairline disclosure above the index.
```

`docs/README.md` — add a short behavior note in the feature list: the new tab's "Recently saved" index shows saves from everyone sharing your email domain, upvotable, ranked by votes and age over a rolling 30-day window; free email providers form public feeds; "Hide from organisation" keeps a save private.

- [ ] **Step 4: Full local gate**

Run: `cd /Users/rich/Code/saveit-extension && just check`
Expected: PASS (tests, lint, validate, build, CSP).

- [ ] **Step 5: Commit**

```bash
cd /Users/rich/Code/saveit-extension
git add tests/e2e/feed-voting.spec.js DESIGN.md docs/README.md
git commit -m "test(feed): e2e vote toggle + docs for the org feed index"
```

---

## Self-review (completed during planning)

- **Spec coverage:** ranking + window (A2/A4), votes toggle + no self-votes + org/private authz (A3/A5), merged org feed + own-private stitch (A4), scope labels + one-time disclosure (B4/B5/B7), `scope.public` flag (A1/A4), googlemail canonicalization (A1/A7/A9), realtime fan-out to org-mates (A6, mandatory per spec), additive endpoints (A5), `/feed`-404 bridge (B3/B5/B6), standalone mocks (B2/B7), cache surface isolation (B1), backfill + indexes + runbook (A8/A9). Slack voting, downvotes, explicit org entities: out of scope per spec — not planned.
- **Known deltas from earlier assumptions** (recorded so the executor isn't surprised): `user.email` (not `user_email`) is the withAuth field; realtime fan-out today is owner+projects only, which is why A6 exists; `company_domain`/`private` were NOT written on creation before A7; backend has no transaction precedent — A3 introduces the first with justification; `index_exists` in the index script filters by one field, so feed index 2 must filter on `private` (A8 caveat).
- **Execution order:** A1→A2→A3→A4→A5, then A6/A7/A8/A9 in any order; B1→B2→B3, B4 anytime, B5 after B3+B4, B6 after B5, B7 last. Deploy (A9 runbook) only after both phases are merged and Rich approves.
