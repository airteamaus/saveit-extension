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
// exercise the real error paths. Entries in overrides.api replace defaults.
function buildController(overrides = {}) {
  const dom = buildDom();
  const api = {
    getFeed: vi.fn(async () => FEED),
    votePage: vi.fn(async () => ({ id: 'theirs', votes: 3, voted: true })),
    getFeedCachedPages: vi.fn(async () => null),
    setFeedCachedPages: vi.fn(),
    ...overrides.api
  };
  const notify = overrides.notify ?? vi.fn();
  const controller = createFeedController({
    api,
    documentObj: overrides.documentObj ?? document,
    notify,
    ...dom
  });
  return { controller, api, notify, ...dom };
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

  it('loads the feed, renders rows, and reports available', async () => {
    const { controller } = buildController();
    await controller.load();
    expect(controller.isAvailable()).toBe(true);
    expect(controller.renderIdle()).toBe(true);
    expect(document.querySelectorAll('.feed-row')).toHaveLength(2);
    expect(document.getElementById('kicker').textContent).toContain('Everyone at acme.com');
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
            return FEED;
          }
          throw new Error('boom');
        })
      }
    });
    await controller.load();
    controller.renderIdle();
    expect(document.querySelectorAll('.feed-row')).toHaveLength(2);
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
    await controller.handleVote('theirs');
    let row = document.querySelector('[data-page-id="theirs"] .feed-vote');
    expect(row.getAttribute('aria-pressed')).toBe('true');
    expect(row.textContent).toContain('3');
    // A successful vote persists the toggled state back to the feed cache.
    expect(api.setFeedCachedPages).toHaveBeenCalledWith(
      expect.objectContaining({
        pages: expect.arrayContaining([
          expect.objectContaining({ id: 'theirs', votes: 3, voted: true })
        ])
      }),
      { surface: 'feed' }
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
        getFeed: vi.fn(async () => ({
          ...FEED,
          pages: [
            ...FEED.pages,
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

  it('shows the disclosure once for public scopes and never again after dismissal', async () => {
    const { controller } = buildController({
      api: {
        getFeed: vi.fn(async () => ({
          ...FEED,
          scope: { type: 'org', domain: 'gmail.com', public: true }
        }))
      }
    });
    await controller.load();
    controller.renderIdle();
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
          ...FEED,
          scope: { type: 'org', domain: 'gmail.com', public: true }
        }))
      }
    });
    await controller.load();
    expect(controller.renderIdle()).toBe(true);
    expect(document.querySelectorAll('.feed-row')).toHaveLength(2);
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
        getFeedCachedPages: vi.fn(async () => ({ ...FEED, pages: [FEED.pages[1]] }))
      }
    });
    const pending = controller.load();
    expect(api.getFeedCachedPages).toHaveBeenCalledWith(
      { surface: 'feed' },
      { allowExpired: true }
    );
    await vi.waitFor(() => {
      // Warm paint lands before the network response resolves.
      expect(document.querySelectorAll('.feed-row')).toHaveLength(1);
    });
    resolveFeed(FEED);
    await pending;
    expect(document.querySelectorAll('.feed-row')).toHaveLength(2);
    expect(controller.isAvailable()).toBe(true);
    expect(api.setFeedCachedPages).toHaveBeenCalled();
  });

  it('refresh re-pulls from offset 0 with a limit that keeps the loaded rows', async () => {
    const many = Array.from({ length: 60 }, (_, i) => ({
      id: `p${i}`,
      title: `Page ${i}`,
      votes: 0,
      voted: false,
      mine: false
    }));
    const { controller, api } = buildController({
      api: { getFeedCachedPages: vi.fn(async () => ({ ...FEED, pages: many })) }
    });
    await controller.load();
    expect(api.getFeed).toHaveBeenCalledWith({ limit: 60 });
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
