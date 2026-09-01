import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createFeedController } from '../../../src/newtab-feed.js';

const FEED = {
  scope: { type: 'org', domain: 'acme.com', public: false },
  pages: [
    { id: 'own', title: 'Mine', votes: 0, voted: false, mine: true },
    { id: 'theirs', title: 'Theirs', votes: 2, voted: false, mine: false }
  ],
  pagination: { total_in_window: 2, next_offset: null, has_more: false }
};

// The default view's response shape: own saves only, org identity retained
// (the switcher labels its org segment from scope.domain).
const FEED_PERSONAL = {
  scope: { type: 'personal', domain: 'acme.com', public: false },
  pages: [{ id: 'own', title: 'Mine', votes: 0, voted: false, mine: true }],
  pagination: { total_in_window: 1, next_offset: null, has_more: false }
};

// happy-dom as wired up by this repo's vitest config exposes `localStorage`
// on globalThis but it evaluates to undefined, so the controller's
// document.defaultView.localStorage access would hit its "storage
// unreachable" fallback. Install a Map-backed Storage stub the controller
// can actually read and write.
function buildLocalStorageStub() {
  const store = new Map();
  return {
    getItem: (key) => (store.has(key) ? store.get(key) : null),
    setItem: (key, value) => store.set(String(key), String(value)),
    removeItem: (key) => store.delete(key),
    clear: () => store.clear(),
    key: (index) => Array.from(store.keys())[index] ?? null,
    get length() {
      return store.size;
    }
  };
}

const localStorageStub = buildLocalStorageStub();
Object.defineProperty(globalThis, 'localStorage', {
  value: localStorageStub,
  configurable: true,
  writable: true
});

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

// Chrome with all cookies blocked throws SecurityError on the
// window.localStorage access itself — before any method call. Mirror that
// shape: everything else on the document forwards to the real one (bound, so
// renderer DOM calls keep working); only defaultView.localStorage throws.
function buildBlockedStorageDocument() {
  const view = new Proxy(globalThis, {
    get(target, prop) {
      if (prop === 'localStorage') {
        throw new DOMException('Storage access denied', 'SecurityError');
      }
      return Reflect.get(target, prop);
    }
  });
  return new Proxy(document, {
    get(target, prop) {
      if (prop === 'defaultView') {
        return view;
      }
      const value = Reflect.get(target, prop);
      return typeof value === 'function' ? value.bind(target) : value;
    }
  });
}

// Failure injection happens through these api mocks (a rejecting getFeed /
// votePage), not through test-only hooks on the controller, so the tests
// exercise the real error paths. The default getFeed honours the scope
// param the controller sends, like the real backend. Entries in
// overrides.api replace defaults.
function buildController(overrides = {}) {
  const dom = buildDom();
  // structuredClone: controller mutations (optimistic pin/delete/edit) must
  // never leak into the shared fixtures and poison later tests.
  const api = {
    getFeed: vi.fn(async (options = {}) =>
      structuredClone(options.scope === 'personal' ? FEED_PERSONAL : FEED)
    ),
    votePage: vi.fn(async () => ({ id: 'theirs', votes: 3, voted: true })),
    updatePage: vi.fn(async () => ({ success: true })),
    pinPage: vi.fn(async () => ({ success: true })),
    deletePage: vi.fn(async () => ({ success: true })),
    getFeedCachedPages: vi.fn(async () => null),
    setFeedCachedPages: vi.fn(),
    ...overrides.api
  };
  const notify = overrides.notify ?? vi.fn();
  const controller = createFeedController({
    api,
    documentObj: overrides.documentObj ?? document,
    notify,
    openProjectsEditor: overrides.openProjectsEditor ?? null,
    ...dom
  });
  return { controller, api, notify, ...dom };
}

function switcherButtons() {
  return [...document.querySelectorAll('[data-feed-view]')];
}

describe('createFeedController', () => {
  beforeEach(() => {
    // The disclosure "dismissed" flag persists in localStorage; reset it so
    // test order can't leak dismissal state across cases.
    localStorageStub.clear();
    // Failure-path tests expect the controller to console.error the cause.
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('defaults to the personal view: own saves only, scope=personal requested', async () => {
    const { controller, api } = buildController();
    await controller.load();
    expect(controller.getView()).toBe('personal');
    expect(controller.isAvailable()).toBe(true);
    expect(controller.renderIdle()).toBe(true);
    expect(api.getFeed).toHaveBeenCalledWith(
      expect.objectContaining({ scope: 'personal', skipCache: true })
    );
    // Own row renders; the org-mate row does not.
    expect(document.querySelector('[data-page-id="own"]')).not.toBeNull();
    expect(document.querySelector('[data-page-id="theirs"]')).toBeNull();
    // The switcher labels both segments and marks personal pressed; the
    // org kicker text stays hidden in the personal view.
    const buttons = switcherButtons();
    expect(buttons.map((b) => b.textContent.trim())).toEqual(['Your saves', 'Acme']);
    expect(buttons[0].getAttribute('aria-pressed')).toBe('true');
    expect(buttons[1].getAttribute('aria-pressed')).toBe('false');
    expect(document.getElementById('kicker').textContent).not.toContain('Everyone at');
  });

  it('switching to the org view fetches without scope and renders org rows + kicker', async () => {
    const { controller, api } = buildController();
    await controller.load();
    controller.renderIdle();
    await controller.switchView('org');
    expect(controller.getView()).toBe('org');
    expect(api.getFeed).toHaveBeenLastCalledWith(
      expect.not.objectContaining({ scope: 'personal' })
    );
    expect(document.querySelector('[data-page-id="theirs"]')).not.toBeNull();
    expect(document.getElementById('kicker').textContent).toContain('Everyone at acme.com');
    const buttons = switcherButtons();
    expect(buttons[0].getAttribute('aria-pressed')).toBe('false');
    expect(buttons[1].getAttribute('aria-pressed')).toBe('true');
    // Switching back re-scopes the fetch and drops the org-mate row.
    await controller.switchView('personal');
    expect(api.getFeed).toHaveBeenLastCalledWith(
      expect.objectContaining({ scope: 'personal' })
    );
    expect(document.querySelector('[data-page-id="theirs"]')).toBeNull();
  });

  it('switching views reads the target view’s cache key, and writes never cross views', async () => {
    const { controller, api } = buildController({
      api: {
        getFeedCachedPages: vi.fn(async (scope) =>
          scope.feedScope === 'org' ? { ...FEED, pages: [FEED.pages[1]] } : null
        )
      }
    });
    await controller.load();
    expect(api.getFeedCachedPages).toHaveBeenCalledWith(
      { surface: 'feed', feedScope: 'personal' },
      { allowExpired: true }
    );
    await controller.switchView('org');
    // The org cache warm-painted the org-mate row before the fresh fetch.
    expect(api.getFeedCachedPages).toHaveBeenCalledWith(
      { surface: 'feed', feedScope: 'org' },
      { allowExpired: true }
    );
    expect(controller.isAvailable()).toBe(true);
  });

  it('treats an org response to a personal request as unavailable (deploy-order bridge)', async () => {
    // A backend without ?scope=personal answers the org feed: rendering org
    // rows under "Your saves" would mislabel them — the desk must fall back
    // to the personal list instead.
    const { controller } = buildController({
      api: { getFeed: vi.fn(async () => structuredClone(FEED)) }
    });
    await controller.load();
    expect(controller.isAvailable()).toBe(false);
    expect(controller.renderIdle()).toBe(false);
    expect(document.querySelectorAll('.feed-row')).toHaveLength(0);
  });

  it('refreshIfView gates realtime refreshes to the active view', async () => {
    const { controller, api } = buildController();
    await controller.load();
    controller.renderIdle();
    api.getFeed.mockClear();
    // An org: event while the personal view is displayed must not re-pull.
    controller.refreshIfView('org');
    expect(api.getFeed).not.toHaveBeenCalled();
    // A user-scoped event does.
    controller.refreshIfView('personal');
    await vi.waitFor(() => expect(api.getFeed).toHaveBeenCalled());
  });

  it('loadMore grows the personal archive on scroll, deduping overlaps', async () => {
    const page1 = [{ id: 'p1', title: 'One', votes: 0, voted: false, mine: true }];
    const page2 = [
      { id: 'p1', title: 'One', votes: 0, voted: false, mine: true }, // overlap echo
      { id: 'p2', title: 'Two', votes: 0, voted: false, mine: true }
    ];
    const { controller, api } = buildController({
      api: {
        getFeed: vi
          .fn()
          .mockResolvedValueOnce({
            scope: { type: 'personal', domain: 'acme.com', public: false },
            pages: page1,
            pagination: { total_in_window: 864, next_offset: 1, has_more: true }
          })
          .mockResolvedValueOnce({
            scope: { type: 'personal', domain: 'acme.com', public: false },
            pages: page2,
            pagination: { total_in_window: 864, next_offset: 2, has_more: false }
          })
      }
    });
    await controller.load();
    controller.renderIdle();
    expect(document.querySelectorAll('.feed-row')).toHaveLength(1);

    await controller.loadMore();
    expect(api.getFeed).toHaveBeenLastCalledWith({
      limit: 50,
      offset: 1,
      skipCache: true,
      scope: 'personal'
    });
    const rowIds = [...document.querySelectorAll('.feed-row')].map((el) => el.dataset.pageId);
    expect(rowIds).toEqual(['p1', 'p2']);
    // Exhausted: a further call is a no-op.
    api.getFeed.mockClear();
    await controller.loadMore();
    expect(api.getFeed).not.toHaveBeenCalled();
  });

  it('loadMore never grows the org view — it is a fixed ranked window by design', async () => {
    const { controller, api } = buildController({
      api: {
        getFeed: vi.fn(async (options = {}) => ({
          scope: { type: 'org', domain: 'acme.com', public: false },
          pages: FEED.pages,
          // Even with more available, the org view must not page.
          pagination: { total_in_window: 2, next_offset: 2, has_more: true }
        }))
      }
    });
    await controller.load();
    controller.renderIdle();
    await controller.switchView('org');
    api.getFeed.mockClear();
    await controller.loadMore();
    expect(api.getFeed).not.toHaveBeenCalled();
  });

  it('a refresh restores a deeply scrolled personal list instead of collapsing it', async () => {
    const deep = Array.from({ length: 3 }, (_, i) => ({
      id: `d${i}`,
      title: `Deep ${i}`,
      votes: 0,
      voted: false,
      mine: true
    }));
    let call = 0;
    const { controller } = buildController({
      api: {
        getFeed: vi.fn(async () => {
          call += 1;
          // Call 1: initial load returns the full 3-row depth. Call 2: the
          // realtime refresh only re-pulls page one (1 row, has_more). Calls
          // 3+: depth restoration pages the archive back to 3 rows.
          if (call === 1) {
            return {
              scope: { type: 'personal', domain: 'acme.com', public: false },
              pages: deep,
              pagination: { total_in_window: 864, next_offset: 3, has_more: true }
            };
          }
          if (call === 2) {
            return {
              scope: { type: 'personal', domain: 'acme.com', public: false },
              pages: deep.slice(0, 1),
              pagination: { total_in_window: 864, next_offset: 1, has_more: true }
            };
          }
          return {
            scope: { type: 'personal', domain: 'acme.com', public: false },
            pages: deep.slice(1),
            pagination: { total_in_window: 864, next_offset: 3, has_more: false }
          };
        })
      }
    });
    await controller.load();
    controller.renderIdle();
    expect(document.querySelectorAll('.feed-row')).toHaveLength(3);

    await controller.refresh();
    const rowIds = [...document.querySelectorAll('.feed-row')].map((el) => el.dataset.pageId);
    expect(rowIds).toEqual(['d0', 'd1', 'd2']);
  });

  it('marks itself unavailable on error (personal-list bridge handled by caller)', async () => {
    const { controller } = buildController({
      api: {
        getFeed: vi.fn(async () => {
          throw new Error('boom');
        })
      }
    });
    await controller.refresh();
    expect(controller.isAvailable()).toBe(false);
    expect(controller.renderIdle()).toBe(false);
  });

  it('hides a rendered feed when a later refresh fails', async () => {
    let calls = 0;
    const { controller } = buildController({
      api: {
        getFeed: vi.fn(async () => {
          calls += 1;
          if (calls === 1) {
            return structuredClone(FEED_PERSONAL);
          }
          throw new Error('boom');
        })
      }
    });
    await controller.load();
    controller.renderIdle();
    expect(document.querySelectorAll('.feed-row')).toHaveLength(1);
    await controller.refresh();
    expect(controller.isAvailable()).toBe(false);
    expect(document.querySelectorAll('.feed-row')).toHaveLength(0);
    expect(document.getElementById('kicker').textContent).toBe('');
  });

  it('optimistically toggles a vote and reverts on failure with an error toast', async () => {
    let rejectVote;
    const { controller, notify, api } = buildController({
      api: {
        votePage: vi
          .fn()
          .mockResolvedValueOnce({ id: 'theirs', votes: 3, voted: true })
          .mockImplementationOnce(
            () =>
              new Promise((_, reject) => {
                rejectVote = reject;
              })
          )
      }
    });
    await controller.load();
    controller.renderIdle();
    await controller.switchView('org');
    await controller.handleVote('theirs');
    let row = document.querySelector('[data-page-id="theirs"] .feed-vote');
    expect(row.getAttribute('aria-pressed')).toBe('true');
    expect(row.textContent).toContain('3');
    // A successful vote persists the toggled state back to the org view's
    // feed cache.
    expect(api.setFeedCachedPages).toHaveBeenCalledWith(
      expect.objectContaining({
        pages: expect.arrayContaining([
          expect.objectContaining({ id: 'theirs', votes: 3, voted: true })
        ])
      }),
      { surface: 'feed', feedScope: 'org' }
    );

    // Second toggle fails: the optimistic un-vote paints first, then the
    // failure reverts the row to the last persisted (voted) state.
    const pending = controller.handleVote('theirs');
    row = document.querySelector('[data-page-id="theirs"] .feed-vote');
    expect(row.getAttribute('aria-pressed')).toBe('false');
    expect(row.textContent).toContain('2');
    rejectVote(new Error('offline'));
    await pending;
    row = document.querySelector('[data-page-id="theirs"] .feed-vote');
    expect(row.getAttribute('aria-pressed')).toBe('true');
    expect(row.textContent).toContain('3');
    expect(notify).toHaveBeenCalledWith("Couldn't save your vote — try again", { type: 'error' });
  });

  it('ignores votes on own rows, pending saves, and unknown ids', async () => {
    const { controller, api } = buildController({
      api: {
        getFeed: vi.fn(async (options = {}) => ({
          ...(options.scope === 'personal' ? FEED_PERSONAL : FEED),
          pages: [
            ...(options.scope === 'personal' ? FEED_PERSONAL.pages : FEED.pages),
            {
              id: 'optimistic:https://pending.example/x',
              title: 'Pending',
              votes: 0,
              voted: false,
              mine: false
            }
          ]
        }))
      }
    });
    await controller.load();
    controller.renderIdle();
    await controller.handleVote('own');
    await controller.handleVote('optimistic:https://pending.example/x');
    await controller.handleVote('missing-id');
    expect(api.votePage).not.toHaveBeenCalled();
  });

  it("skips my pinned rows (the launch strip shows them above) but keeps org-mates' pinned saves", async () => {
    const { controller } = buildController({
      api: {
        getFeed: vi.fn(async () => ({
          ...FEED,
          pages: [
            { ...FEED.pages[0], pinned: true }, // mine + pinned -> skipped
            { ...FEED.pages[1], pinned: true }, // org-mate + pinned -> kept
            { id: 'plain-mine', title: 'Mine', votes: 0, voted: false, mine: true, pinned: false }
          ]
        }))
      }
    });
    await controller.load();
    await controller.switchView('org');
    controller.renderIdle();

    const rowIds = [...document.querySelectorAll('.feed-row')].map((el) => el.dataset.pageId);
    expect(rowIds).toEqual(['theirs', 'plain-mine']);
  });

  it('toggles privacy on my rows optimistically, flipping the tag, and reverts on failure', async () => {
    const { controller, api, notify } = buildController();
    await controller.load();
    controller.renderIdle();

    // 'own' is mine + shared; the eye makes it private, tag flips to Only you.
    let row = document.querySelector('[data-page-id="own"]');
    expect(row.querySelector('.index-row-scope-tag')?.textContent).toContain('Shared');
    await controller.handleTogglePrivacy('own');
    row = document.querySelector('[data-page-id="own"]');
    expect(row.querySelector('.index-row-scope-tag')?.textContent).toContain('Only you');
    expect(api.updatePage).toHaveBeenCalledWith('own', { private: true });

    // Failure path: revert and toast.
    api.updatePage.mockRejectedValueOnce(new Error('offline'));
    await controller.handleTogglePrivacy('own');
    row = document.querySelector('[data-page-id="own"]');
    expect(row.querySelector('.index-row-scope-tag')?.textContent).toContain('Only you');
    expect(notify).toHaveBeenCalledWith("Couldn't change privacy — try again", { type: 'error' });
  });

  it("privacy toggle ignores org-mates' rows", async () => {
    const { controller, api } = buildController();
    await controller.load();
    await controller.handleTogglePrivacy('theirs');
    expect(api.updatePage).not.toHaveBeenCalled();
  });

  it('pinning my row hands it to the launch strip (row leaves the feed), reverting on failure', async () => {
    const succeed = buildController();
    await succeed.controller.load();
    succeed.controller.renderIdle();
    expect(document.querySelector('[data-page-id="own"]')).not.toBeNull();

    await succeed.controller.handlePin('own');
    expect(document.querySelector('[data-page-id="own"]')).toBeNull();
    expect(succeed.api.pinPage).toHaveBeenCalledWith('own', true);

    const fail = buildController({
      api: {
        pinPage: vi.fn(async () => {
          throw new Error('offline');
        })
      }
    });
    await fail.controller.load();
    fail.controller.renderIdle();
    await fail.controller.handlePin('own');
    expect(document.querySelector('[data-page-id="own"]')).not.toBeNull();
    expect(fail.notify).toHaveBeenCalledWith("Couldn't pin the page — try again", {
      type: 'error'
    });
  });

  it('deleting my row removes it optimistically and restores on failure', async () => {
    const succeed = buildController();
    await succeed.controller.load();
    succeed.controller.renderIdle();

    await succeed.controller.handleDelete('own');
    expect(document.querySelector('[data-page-id="own"]')).toBeNull();
    expect(succeed.api.deletePage).toHaveBeenCalledWith('own');

    const fail = buildController({
      api: {
        deletePage: vi.fn(async () => {
          throw new Error('offline');
        })
      }
    });
    await fail.controller.load();
    fail.controller.renderIdle();
    await fail.controller.handleDelete('own');
    expect(document.querySelector('[data-page-id="own"]')).not.toBeNull();
    expect(fail.notify).toHaveBeenCalledWith("Couldn't delete the page — try again", {
      type: 'error'
    });
  });

  it('edit: start shows the inline form, submit saves and closes, failure keeps the form', async () => {
    const { controller, api } = buildController();
    await controller.load();
    controller.renderIdle();

    await controller.handleEditStart('own');
    expect(document.querySelector('[data-page-id="own"] .feed-edit-form')).not.toBeNull();

    await controller.handleEditSubmit('own', {
      title: 'New title',
      ai_summary_brief: 'New summary'
    });
    expect(api.updatePage).toHaveBeenCalledWith('own', {
      title: 'New title',
      ai_summary_brief: 'New summary'
    });
    expect(document.querySelector('[data-page-id="own"] .feed-edit-form')).toBeNull();
    expect(document.querySelector('[data-page-id="own"] .index-row-title').textContent).toBe(
      'New title'
    );

    const fail = buildController({
      api: {
        updatePage: vi.fn(async () => {
          throw new Error('offline');
        })
      }
    });
    await fail.controller.load();
    fail.controller.renderIdle();
    await fail.controller.handleEditStart('own');
    await fail.controller.handleEditSubmit('own', { title: 'Nope', ai_summary_brief: '' });
    expect(fail.notify).toHaveBeenCalledWith("Couldn't save your changes — try again", {
      type: 'error'
    });
    expect(document.querySelector('[data-page-id="own"] .feed-edit-form')).not.toBeNull();
  });

  it('edit cancel closes the form without touching the row', async () => {
    const { controller, api } = buildController();
    await controller.load();
    controller.renderIdle();

    await controller.handleEditStart('own');
    controller.handleEditCancel();
    expect(document.querySelector('[data-page-id="own"] .feed-edit-form')).toBeNull();
    expect(api.updatePage).not.toHaveBeenCalled();
  });

  it('projects delegates to the injected editor opener, own rows only', async () => {
    const openProjectsEditor = vi.fn();
    const { controller } = buildController({ openProjectsEditor });
    await controller.load();

    await controller.handleProjects('own');
    expect(openProjectsEditor).toHaveBeenCalledWith('own');
    await controller.handleProjects('theirs');
    expect(openProjectsEditor).toHaveBeenCalledTimes(1);
  });

  it('shows the disclosure in the org view for public scopes, once, after org switch', async () => {
    const publicPersonal = {
      ...FEED_PERSONAL,
      scope: { type: 'personal', domain: 'gmail.com', public: true }
    };
    const publicOrg = {
      ...FEED,
      scope: { type: 'org', domain: 'gmail.com', public: true }
    };
    const { controller } = buildController({
      api: {
        getFeed: vi.fn(async (options = {}) =>
          structuredClone(options.scope === 'personal' ? publicPersonal : publicOrg)
        )
      }
    });
    await controller.load();
    controller.renderIdle();
    // Personal view never carries the disclosure, even for public orgs.
    expect(document.getElementById('disclosure').textContent).toBe('');
    await controller.switchView('org');
    expect(document.getElementById('disclosure').textContent).toContain(
      'visible to everyone using Gmail'
    );
    controller.dismissDisclosure();
    expect(document.getElementById('disclosure').textContent).toBe('');
    await controller.refresh();
    expect(document.getElementById('disclosure').textContent).toBe('');
  });

  it('never shows the disclosure for non-public scopes', async () => {
    const { controller } = buildController();
    await controller.load();
    controller.renderIdle();
    expect(document.getElementById('disclosure').textContent).toBe('');
    // Safe to call with nothing rendered.
    controller.dismissDisclosure();
    expect(document.getElementById('disclosure').textContent).toBe('');
  });

  it('treats unreachable storage as dismissed so a public feed renders without the disclosure', async () => {
    // localStorageSafe() catches the SecurityError and returns null; the
    // controller must honor that as "dismissed" or the disclosure would
    // render on every public-scope render with a no-op dismiss button.
    const { controller } = buildController({
      documentObj: buildBlockedStorageDocument(),
      api: {
        getFeed: vi.fn(async () => ({
          ...FEED_PERSONAL,
          scope: { type: 'personal', domain: 'gmail.com', public: true }
        }))
      }
    });
    await controller.load();
    expect(controller.renderIdle()).toBe(true);
    expect(document.querySelectorAll('.feed-row')).toHaveLength(1);
    expect(document.getElementById('disclosure').textContent).toBe('');
  });

  it('paints the warm cache first, then reconciles with a fresh fetch', async () => {
    let resolveFeed;
    const { controller, api } = buildController({
      api: {
        getFeed: vi.fn(
          () =>
            new Promise((resolve) => {
              resolveFeed = resolve;
            })
        ),
        getFeedCachedPages: vi.fn(async () => ({ ...FEED_PERSONAL, pages: [FEED_PERSONAL.pages[0]] }))
      }
    });
    const pending = controller.load();
    expect(api.getFeedCachedPages).toHaveBeenCalledWith(
      { surface: 'feed', feedScope: 'personal' },
      { allowExpired: true }
    );
    await vi.waitFor(() => {
      // Warm paint lands before the network response resolves.
      expect(document.querySelectorAll('.feed-row')).toHaveLength(1);
    });
    resolveFeed(FEED_PERSONAL);
    await pending;
    expect(document.querySelectorAll('.feed-row')).toHaveLength(1);
    expect(controller.isAvailable()).toBe(true);
    expect(api.setFeedCachedPages).toHaveBeenCalled();
  });

  it('refresh re-pulls from offset 0 with a limit that keeps the loaded rows, bypassing the cache', async () => {
    const many = Array.from({ length: 60 }, (_, i) => ({
      id: `p${i}`,
      title: `Page ${i}`,
      votes: 0,
      voted: false,
      mine: true
    }));
    const { controller, api } = buildController({
      api: { getFeedCachedPages: vi.fn(async () => ({ ...FEED_PERSONAL, pages: many })) }
    });
    await controller.load();
    // skipCache: a realtime-triggered refresh must reorder against the
    // server even when the feed cache is still fresh.
    expect(api.getFeed).toHaveBeenCalledWith({ limit: 60, skipCache: true, scope: 'personal' });
    // load()'s initial fetch still uses the cached path: the warm paint
    // reads getFeedCachedPages before the fresh fetch lands.
    expect(api.getFeedCachedPages).toHaveBeenCalledWith(
      { surface: 'feed', feedScope: 'personal' },
      { allowExpired: true }
    );
  });

  it('refresh() alone skips the cache so realtime events reorder the feed', async () => {
    const { controller, api } = buildController();
    await controller.refresh();
    expect(api.getFeed).toHaveBeenCalledTimes(1);
    expect(api.getFeed).toHaveBeenCalledWith({ limit: 50, skipCache: true, scope: 'personal' });
    expect(api.getFeedCachedPages).not.toHaveBeenCalled();
  });

  it('hide() clears the feed section, kicker, and disclosure', async () => {
    const { controller } = buildController();
    await controller.load();
    controller.renderIdle();
    controller.hide();
    expect(document.querySelectorAll('.feed-row')).toHaveLength(0);
    expect(document.getElementById('kicker').textContent).toBe('');
    expect(document.getElementById('disclosure').textContent).toBe('');
  });
});
