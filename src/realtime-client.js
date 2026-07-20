// realtime-client.js — owns the single SSE connection for one open new-tab
// page. Uses fetch() (not native EventSource) so it can set the Authorization
// header. Parses SSE frames manually from the ReadableStream.
//
// On an unintentional drop (15-min server timeout, network error, bad
// response) the client auto-reconnects with exponential backoff (1s → 2s →
// 4s → … capped at 30s) up to maxReconnectAttempts. A catch-up onConnect
// refresh runs on each successful (re)connection so events missed during the
// gap are reconciled. Only after all reconnect attempts fail (or there's no
// session token) does the client give up and toast "Refresh to pick up
// changes". Intentional teardown via disconnect() cancels the reconnect timer
// and never toasts.

import { debugWarn } from './config.js';

const INITIAL_BACKOFF_MS = 1000;
const MAX_BACKOFF_MS = 30_000;
const MAX_RECONNECT_ATTEMPTS = 10;

export class RealtimeClient {
  constructor({
    bus,
    notify,
    getToken,
    url,
    onConnect = null,
    // Test seams for the scheduler. Production uses real setTimeout/clearTimeout.
    scheduleTimer = (fn, ms) => setTimeout(fn, ms),
    cancelTimer = id => clearTimeout(id),
    maxReconnectAttempts = MAX_RECONNECT_ATTEMPTS,
    initialBackoffMs = INITIAL_BACKOFF_MS,
    maxBackoffMs = MAX_BACKOFF_MS
  }) {
    this.bus = bus;
    this.notify = notify || (() => {});
    this.getToken = getToken;
    this.url = url;
    // Fired once per successful stream establishment. The newtab page uses it
    // to run a catch-up refresh: SSE has no replay buffer, so events that fired
    // during a disconnect are lost unless we re-pull on connect.
    this.onConnect = onConnect;
    this.controller = null;
    // `disconnected` marks intentional teardown (disconnect()). While true,
    // the client will not schedule reconnects or toast. handleDisconnect()
    // (unintentional drop) leaves it false so the reconnect path runs.
    this.disconnected = false;
    this.buffer = '';
    this.scheduleTimer = scheduleTimer;
    this.cancelTimer = cancelTimer;
    this.maxReconnectAttempts = maxReconnectAttempts;
    this.initialBackoffMs = initialBackoffMs;
    this.maxBackoffMs = maxBackoffMs;
    this.reconnectTimerId = null;
    this.reconnectAttempts = 0;
  }

  // Whether a stream is currently open. Callers (e.g. the newtab pagehide /
  // pageshow lifecycle) use this to decide whether to connect after a bfcache
  // restore without orphaning an existing stream.
  isConnected() {
    return this.controller !== null && !this.disconnected;
  }

  async connect() {
    // Idempotent guard: if a stream is already open, keep it. Without this,
    // a second connect() (e.g. a pageshow bfcache-restore firing while the
    // original stream is still alive) would create a fresh AbortController
    // and orphan the previous one, leaking the connection.
    if (this.isConnected()) {
      return;
    }

    // connect() is the user-driven entry (newtab open, bfcache restore). It
    // starts a fresh attempt chain, so reset the backoff counter and the
    // intentional-teardown flag. handleUnintentionalDisconnect() schedules
    // further attempts via scheduleReconnect() without going through here.
    this.disconnected = false;
    this.clearReconnectTimer();
    this.reconnectAttempts = 0;

    await this.attemptConnection();
  }

  // One connection attempt. On success, reads the stream until it ends, then
  // treats the end as an unintentional disconnect (schedule a reconnect). On
  // failure (no token, bad response, fetch error), same. Only an intentional
  // disconnect() stops the chain.
  async attemptConnection() {
    this.controller = new AbortController();

    try {
      const token = await this.getToken();
      if (!token) {
        // Not signed in. This is the expected path for anonymous users, not a
        // transient failure — don't hammer the server with reconnects. Gated
        // behind debugWarn so it doesn't spam the console on every newtab open.
        debugWarn('[realtime-client] no session token; realtime stream skipped');
        return;
      }

      const response = await fetch(this.url, {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: 'text/event-stream'
        },
        signal: this.controller.signal
      });

      if (!response.ok || !response.body) {
        console.warn('[realtime-client] stream rejected:', response.status, response.ok ? 'no body' : '');
        this.handleUnintentionalDisconnect();
        return;
      }

      // Stream is up — reset the backoff counter so the NEXT drop (whenever it
      // happens) starts fresh rather than continuing a prior attempt chain.
      this.reconnectAttempts = 0;

      // SSE has no replay — any event that fired between a prior disconnect and
      // this connect is gone. Kick off the catch-up refresh so the store
      // reconciles missed updates, but don't await it: the refresh is a network
      // round-trip and awaiting would delay delivery of events that arrive
      // while it's in flight. Guarded so a refresh failure (auth expired,
      // network blip) never tears down the live stream.
      if (this.onConnect) {
        Promise.resolve(this.onConnect()).catch(err => {
          console.warn('[realtime-client] onConnect callback failed:', err?.message || err);
        });
      }

      await this.readStream(response.body);
      // readStream returned — the server closed the stream (likely the 15-min
      // timeout). Treat as an unintentional drop and reconnect.
      this.handleUnintentionalDisconnect();
    } catch (err) {
      if (err?.name === 'AbortError') {
        // Intentional cancel from disconnect(). Don't reconnect — the flag is
        // already set and the timer is already cleared there.
        return;
      }
      console.warn('[realtime-client] stream error:', err?.message || err);
      this.handleUnintentionalDisconnect();
    }
  }

  // Schedule the next reconnect attempt with exponential backoff, unless this
  // was an intentional teardown or we've exhausted attempts. Giving up toasts
  // once — the user must refresh to re-establish. The toast message stays the
  // same so existing copy/UI is unchanged.
  handleUnintentionalDisconnect() {
    if (this.disconnected) return;
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      this.notify('Refresh to pick up changes', {});
      return;
    }

    const attempt = this.reconnectAttempts;
    this.reconnectAttempts += 1;
    // Exponential backoff capped at maxBackoffMs: 1s, 2s, 4s, …, 30s, 30s, …
    const delay = Math.min(this.initialBackoffMs * (2 ** attempt), this.maxBackoffMs);
    this.reconnectTimerId = this.scheduleTimer(() => {
      this.reconnectTimerId = null;
      void this.attemptConnection();
    }, delay);
  }

  clearReconnectTimer() {
    if (this.reconnectTimerId !== null) {
      this.cancelTimer(this.reconnectTimerId);
      this.reconnectTimerId = null;
    }
  }

  async readStream(body) {
    const reader = body.getReader();
    const decoder = new TextDecoder();

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        this.buffer += decoder.decode(value, { stream: true });
        this.processBuffer();
      }
    } finally {
      reader.releaseLock?.();
    }
    // Stream ended (server closed — likely the 15-min timeout). The caller
    // (attemptConnection) handles the reconnect scheduling on return.
  }

  processBuffer() {
    // SSE frames are separated by a blank line (\n\n).
    let separatorIndex;
    while ((separatorIndex = this.buffer.indexOf('\n\n')) !== -1) {
      const frame = this.buffer.slice(0, separatorIndex);
      this.buffer = this.buffer.slice(separatorIndex + 2);
      this.parseFrame(frame);
    }
  }

  parseFrame(frame) {
    const lines = frame.split('\n');
    let type = null;
    const dataLines = [];

    for (const line of lines) {
      if (line.startsWith(':')) {
        // Comment / heartbeat — skip just this line, not the whole frame.
        // The backend sends heartbeats as standalone frames today, but using
        // `continue` (not `return`) means a comment coexisting with data lines
        // in the same frame wouldn't discard the data.
        continue;
      }
      if (line.startsWith('event: ')) {
        type = line.slice(7).trim();
      } else if (line.startsWith('data: ')) {
        dataLines.push(line.slice(6));
      }
    }

    if (!type || dataLines.length === 0) return;

    let data;
    try {
      data = JSON.parse(dataLines.join('\n'));
    } catch {
      // Malformed JSON — skip, don't crash the stream.
      console.warn('[realtime-client] malformed SSE data:', dataLines.join('\n'));
      return;
    }

    // The `event:` line and the JSON body's `type` should agree. If the body
    // omits `type`, use the event-line value but warn (the backend normally
    // includes it). If both are present but disagree, warn about the contract
    // mismatch — the bus keys on event.type and would silently no-op on drift.
    if (!data.type) {
      console.warn('[realtime-client] SSE data missing type field; using event-line type:', type);
      data.type = type;
    } else if (type && data.type !== type) {
      console.warn('[realtime-client] SSE event-line type differs from data.type:', type, 'vs', data.type);
    }

    this.bus.dispatch(data);
  }

  disconnect() {
    // Intentional teardown (pagehide / newtab close). Mark disconnected so
    // any in-flight attemptConnection sees it and bails, cancel the in-flight
    // fetch, and cancel any pending reconnect timer so we don't fire a
    // reconnect after the page is gone. No toast — this is user-driven.
    this.disconnected = true;
    this.clearReconnectTimer();
    if (this.controller) {
      this.controller.abort();
      this.controller = null;
    }
    // The bus is created per-newtab-page-instance, so clearing subscribers on
    // disconnect is safe (no other code holds a reference). Guards the call so
    // a bus without clear() (e.g. a plain stub) doesn't throw.
    this.bus.clear?.();
  }
}
