// realtime-client.js — owns the single SSE connection for one open new-tab
// page. Uses fetch() (not native EventSource) so it can set the Authorization
// header. Parses SSE frames manually from the ReadableStream. On disconnect
// (15-min server timeout, network error, or page hide) shows a toast once and
// does NOT auto-reconnect — the user refreshes to re-establish.

import { debugWarn } from './config.js';

export class RealtimeClient {
  constructor({ bus, notify, getToken, url }) {
    this.bus = bus;
    this.notify = notify || (() => {});
    this.getToken = getToken;
    this.url = url;
    this.controller = null;
    this.disconnected = false;
    this.buffer = '';
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

    // Reset the disconnect flag from any prior lifecycle so a fresh stream
    // can toast again if it later drops. (disconnect() sets this to suppress
    // the toast on intentional teardown.)
    this.disconnected = false;
    this.controller = new AbortController();

    try {
      const token = await this.getToken();
      if (!token) {
        // Not signed in — no realtime stream. This is the expected path for
        // anonymous users (no token means no stream); gated behind debugWarn so
        // it doesn't spam the console on every newtab open in production.
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
        this.handleDisconnect();
        return;
      }

      await this.readStream(response.body);
    } catch (err) {
      if (err?.name === 'AbortError') {
        return;
      }
      console.warn('[realtime-client] stream error:', err?.message || err);
      this.handleDisconnect();
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

    // Stream ended (server closed — likely the 15-min timeout).
    this.handleDisconnect();
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

  handleDisconnect() {
    if (this.disconnected) return;
    this.disconnected = true;
    this.notify('Refresh to pick up changes', {});
  }

  disconnect() {
    this.disconnected = true;  // suppress the toast on manual disconnect
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
