// save-poll.js — poll loop that detects when a freshly-saved page's enrichment
// has completed, so the optimistic tile can be reconciled with the real doc.
//
// The loop is plain setTimeout/setInterval-based so it can be driven by either
// the background service worker (via browser.alarms, which wake the SW) or a
// long-lived page. It is dependency-free and fully unit-testable with fake
// timers: the caller supplies `checkFn` (resolves true when the page exists),
// `onFound` (reconcile: clear the pending record + invalidate cache), and
// `onGiveUp` (stop after the last attempt — the optimistic tile remains; the
// next manual/TTL refresh reconciles if the doc eventually lands).

// Increasing intervals (ms). Tuned to bracket the ~28s AI-enrichment latency:
// catch a fast enrichment at 8s, the common case around 35-50s, and give up
// after ~90s (enrichment that takes longer is likely failed and the tile is
// still a valid saved-page placeholder). Kept monotonically non-decreasing so
// the poll ramps rather than thrashes.
export const SAVE_POLL_INTERVALS_MS = [8000, 12000, 15000, 20000, 20000, 20000];

export function createSavePoll({ checkFn, onFound, onGiveUp, scheduler = setTimeout, clearer = clearTimeout } = {}) {
  if (typeof checkFn !== 'function') {
    throw new Error('createSavePoll requires a checkFn');
  }

  let timerId = null;
  let attempt = 0;
  let stopped = false;

  function clearPending() {
    if (timerId !== null) {
      clearer(timerId);
      timerId = null;
    }
  }

  async function tick() {
    timerId = null;
    if (stopped) {
      return;
    }

    let found = false;
    try {
      found = await checkFn();
    } catch {
      // Transient errors (network, SW wake hiccup) are treated as not-found.
      // The poll continues to the next interval rather than aborting.
      found = false;
    }

    if (stopped) {
      return;
    }

    if (found) {
      stopped = true;
      onFound?.();
      return;
    }

    attempt++;
    if (attempt >= SAVE_POLL_INTERVALS_MS.length) {
      stopped = true;
      onGiveUp?.();
      return;
    }

    timerId = scheduler(tick, SAVE_POLL_INTERVALS_MS[attempt]);
  }

  return {
    start() {
      if (stopped || timerId !== null) {
        return;
      }
      timerId = scheduler(tick, SAVE_POLL_INTERVALS_MS[0]);
    },
    stop() {
      stopped = true;
      clearPending();
    },
    isStopped() {
      return stopped;
    }
  };
}
