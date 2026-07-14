// realtime-client.js — owns the single SSE connection for one open new-tab
// page. Uses fetch() (not native EventSource) so it can set the Authorization
// header. Parses SSE frames manually from the ReadableStream. On disconnect
// (15-min server timeout, network error, or page hide) shows a toast once and
// does NOT auto-reconnect — the user refreshes to re-establish.

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

  async connect() {
    const token = await this.getToken();
    if (!token) {
      // Not signed in — no realtime stream. Silently skip.
      return;
    }

    this.controller = new AbortController();

    try {
      const response = await fetch(this.url, {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: 'text/event-stream'
        },
        signal: this.controller.signal
      });

      if (!response.ok || !response.body) {
        this.handleDisconnect();
        return;
      }

      await this.readStream(response.body);
    } catch (err) {
      if (err?.name === 'AbortError') {
        // Manual disconnect via disconnect() — don't toast.
        return;
      }
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
        // Comment / heartbeat — ignore.
        return;
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

    // The `event:` line is the authority for type; fall back to it if the
    // JSON body doesn't include type (it normally does, but don't rely on
    // the redundancy — the bus keys on event.type and would silently no-op).
    data.type = data.type || type;

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
  }
}
