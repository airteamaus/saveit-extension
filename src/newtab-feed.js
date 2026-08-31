import {
  createFeedRenderer,
  feedScopeKickerMarkup,
  feedDisclosureMarkup
} from './feed-renderer.js';
import { isOptimisticPage } from './pending-saves.js';
import { replaceElementHtml } from './dom-render.js';

const DISCLOSURE_DISMISSED_KEY = 'feed-public-disclosure-dismissed';
const FEED_PAGE_LIMIT = 50;
// The feed renders a fixed window (no infinite scroll: the drawer's
// near-end fetch is short-circuited while the feed owns the results pane),
// so refreshes just re-pull from offset 0, keeping everything already in
// state up to the server's window cap.
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
    const storage = localStorageSafe();
    if (!storage) {
      // Unreachable storage (e.g. cookies blocked): treat as dismissed rather
      // than nagging on every render with no way to dismiss.
      return true;
    }
    try {
      return storage.getItem(DISCLOSURE_DISMISSED_KEY) === '1';
    } catch {
      // Same policy as unreachable storage: a failing read must not nag.
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
    void api.setFeedCachedPages(
      {
        scope: state.scope,
        pages: state.rows,
        pagination: { total_in_window: state.rows.length, next_offset: null, has_more: false }
      },
      { surface: 'feed' }
    );
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
      disclosureSlotEl
        .querySelector('[data-action="dismiss-disclosure"]')
        ?.addEventListener('click', dismissDisclosure);
    }
    // The launch strip already shows my pinned pages above the desk, so my
    // pinned rows are skipped here — they'd otherwise appear twice. Org-mates'
    // pinned saves stay: their pinning is invisible to me, and the strip
    // doesn't show them.
    renderer.renderFeed(state.rows.filter((row) => !(row.mine && row.pinned)));
  }

  async function refresh() {
    try {
      const limit = Math.max(FEED_PAGE_LIMIT, Math.min(state.rows.length, FEED_REFRESH_MAX));
      // skipCache: a realtime-triggered refresh must reorder against the
      // server even when the cache is still fresh — reading the cache here
      // would swallow the event.
      const response = await api.getFeed({ limit, skipCache: true });
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
    // Warm paint from cache, then reconcile with the server. The warm paint
    // marks the surface as displaying so the fresh response re-renders it
    // in place instead of waiting for the caller's renderIdle().
    try {
      const cached = await api.getFeedCachedPages({ surface: 'feed' }, { allowExpired: true });
      if (cached?.pages?.length && state.available !== false) {
        applyResponse(cached);
        renderFeedSurface();
      }
    } catch {
      // Cache read failure is non-fatal.
    }
    await refresh();
  }

  function renderIdle() {
    if (state.available !== true || (!state.rows.length && !state.scope)) {
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
    const row = state.rows.find((entry) => entry.id === id);
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
      notify?.("Couldn't save your vote — try again", { type: 'error' });
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
