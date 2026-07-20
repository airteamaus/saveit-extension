import { describe, expect, test, vi, beforeEach } from 'vitest';
import { RealtimeClient } from '../../src/realtime-client.js';

// Helper: build a ReadableStream from an array of string chunks.
function makeReadableStream(chunks) {
  const encoder = new TextEncoder();
  return new ReadableStream({
    start(controller) {
      for (const chunk of chunks) {
        controller.enqueue(encoder.encode(chunk));
      }
      controller.close();
    }
  });
}

describe('RealtimeClient', () => {
  let mockFetch;
  let bus;
  let notify;

  beforeEach(() => {
    bus = { dispatch: vi.fn() };
    notify = vi.fn();
    mockFetch = vi.fn();
    global.fetch = mockFetch;
  });

  function makeClient() {
    return new RealtimeClient({
      bus,
      notify,
      getToken: async () => 'test-token',
      url: 'https://example.test/events/stream'
    });
  }

  test('connect sets Authorization header and calls fetch', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      status: 200,
      body: makeReadableStream([]),
      headers: new Map()
    });
    const client = makeClient();
    await client.connect();
    expect(mockFetch).toHaveBeenCalledWith(
      'https://example.test/events/stream',
      expect.objectContaining({
        method: 'GET',
        headers: expect.objectContaining({
          Authorization: 'Bearer test-token',
          Accept: 'text/event-stream'
        })
      })
    );
  });

  test('parses an SSE event frame and dispatches to bus', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      status: 200,
      body: makeReadableStream([
        'event: project_page_changed\n',
        'data: {"type":"project_page_changed","change":"added","projectId":"p1"}\n\n'
      ]),
      headers: new Map()
    });
    const client = makeClient();
    await client.connect();
    // Allow the stream reader microtask to flush.
    await new Promise(r => setTimeout(r, 10));
    expect(bus.dispatch).toHaveBeenCalledWith({
      type: 'project_page_changed',
      change: 'added',
      projectId: 'p1'
    });
  });

  test('ignores heartbeat comments', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      status: 200,
      body: makeReadableStream([': keepalive\n\n']),
      headers: new Map()
    });
    const client = makeClient();
    await client.connect();
    await new Promise(r => setTimeout(r, 10));
    expect(bus.dispatch).not.toHaveBeenCalled();
  });

  test('on stream close, shows toast once and does not reconnect', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      status: 200,
      body: makeReadableStream([]),  // immediately closes
      headers: new Map()
    });
    const client = makeClient();
    await client.connect();
    await new Promise(r => setTimeout(r, 10));
    expect(notify).toHaveBeenCalledWith('Refresh to pick up changes', {});
    // No second fetch (no reconnect).
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  test('on fetch error, shows toast and does not reconnect', async () => {
    mockFetch.mockRejectedValue(new Error('network'));
    const client = makeClient();
    await client.connect();
    await new Promise(r => setTimeout(r, 10));
    expect(notify).toHaveBeenCalledWith('Refresh to pick up changes', {});
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  test('skips a malformed JSON frame and continues the stream', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      status: 200,
      body: makeReadableStream([
        // First frame: malformed JSON — must be skipped, not crash the stream.
        // The `event:` line is required so parseFrame advances past the
        // `if (!type) return` guard and actually reaches JSON.parse (and its
        // catch). Without it the frame is dropped before the catch runs.
        'event: page_updated\ndata: {not-json}\n\n',
        // Second frame: valid — must still be dispatched after the skip.
        'event: page_updated\ndata: {"type":"page_updated","change":"enriched"}\n\n'
      ]),
      headers: new Map()
    });
    const client = makeClient();
    await client.connect();
    // Allow the stream reader microtask to flush both frames.
    await new Promise(r => setTimeout(r, 10));
    // Only the valid frame is dispatched (the malformed one is skipped).
    expect(bus.dispatch).toHaveBeenCalledTimes(1);
    expect(bus.dispatch).toHaveBeenCalledWith({
      type: 'page_updated',
      change: 'enriched'
    });
  });

  test('injects event-line type when data omits type', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      status: 200,
      body: makeReadableStream([
        'event: project_page_changed\ndata: {"change":"added","projectId":"p1"}\n\n'
      ]),
      headers: new Map()
    });
    const client = makeClient();
    await client.connect();
    await new Promise(r => setTimeout(r, 10));
    expect(bus.dispatch).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'project_page_changed', change: 'added', projectId: 'p1' })
    );
  });

  test('disconnect aborts the fetch', async () => {
    let capturedSignal;
    mockFetch.mockImplementation((url, opts) => {
      capturedSignal = opts.signal;
      return new Promise(() => {});  // never resolves
    });
    const client = makeClient();
    // connect() runs until the stream closes — don't await it (the mock fetch
    // never resolves, so awaiting would deadlock). Start it, let fetch be
    // invoked, then disconnect.
    client.connect();
    await new Promise(r => setTimeout(r, 10));
    client.disconnect();
    expect(capturedSignal.aborted).toBe(true);
    expect(notify).not.toHaveBeenCalled();  // manual disconnect does not toast
  });

  test('isConnected reflects the stream state across the lifecycle', async () => {
    mockFetch.mockImplementation(() => new Promise(() => {}));  // stays open
    const client = makeClient();

    expect(client.isConnected()).toBe(false);

    client.connect();  // not awaited — the mock never resolves
    await new Promise(r => setTimeout(r, 10));
    expect(client.isConnected()).toBe(true);

    client.disconnect();
    expect(client.isConnected()).toBe(false);
  });

  test('connect is idempotent: a second connect while open does not open a second stream', async () => {
    mockFetch.mockImplementation(() => new Promise(() => {}));  // stays open
    const client = makeClient();

    client.connect();
    await new Promise(r => setTimeout(r, 10));
    await client.connect();  // second call while the first is still open

    // Exactly one fetch — the second connect early-returned without orphaning
    // the first stream's AbortController.
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  test('after disconnect, connect reopens the stream and re-arms the disconnect toast', async () => {
    // First connect: stream closes immediately → toast fires.
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      body: makeReadableStream([]),
      headers: new Map()
    });
    const client = makeClient();
    await client.connect();
    await new Promise(r => setTimeout(r, 10));
    expect(notify).toHaveBeenCalledTimes(1);

    // The stream has ended and disconnected; reconnect must succeed and the
    // toast must fire again when the second stream also closes.
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      body: makeReadableStream([]),
      headers: new Map()
    });
    await client.connect();
    await new Promise(r => setTimeout(r, 10));
    expect(mockFetch).toHaveBeenCalledTimes(2);
    expect(notify).toHaveBeenCalledTimes(2);  // re-armed after the reconnect
  });

  // Regression: SSE has no replay buffer and the client doesn't auto-reconnect,
  // so events that fire during a disconnect are lost. The onConnect callback
  // lets the newtab page run a catch-up refreshInitial each time the stream
  // (re)establishes, picking up missed updates via the standard update-check.
  test('fires onConnect once when the stream establishes successfully', async () => {
    const onConnect = vi.fn().mockResolvedValue(undefined);
    mockFetch.mockResolvedValue({
      ok: true,
      status: 200,
      body: makeReadableStream([]),
      headers: new Map()
    });
    const client = new RealtimeClient({
      bus,
      notify,
      getToken: async () => 'test-token',
      url: 'https://example.test/events/stream',
      onConnect
    });
    await client.connect();
    await new Promise(r => setTimeout(r, 10));

    expect(onConnect).toHaveBeenCalledTimes(1);
  });

  test('does not fire onConnect when the stream is rejected (no body / non-ok)', async () => {
    const onConnect = vi.fn();
    mockFetch.mockResolvedValue({
      ok: false,
      status: 401,
      body: null,
      headers: new Map()
    });
    const client = new RealtimeClient({
      bus,
      notify,
      getToken: async () => 'test-token',
      url: 'https://example.test/events/stream',
      onConnect
    });
    await client.connect();
    await new Promise(r => setTimeout(r, 10));

    expect(onConnect).not.toHaveBeenCalled();
  });

  test('does not fire onConnect when there is no session token', async () => {
    // Anonymous users (no token) never open the stream, so no catch-up needed.
    const onConnect = vi.fn();
    mockFetch.mockResolvedValue({
      ok: true,
      status: 200,
      body: makeReadableStream([]),
      headers: new Map()
    });
    const client = new RealtimeClient({
      bus,
      notify,
      getToken: async () => null,
      url: 'https://example.test/events/stream',
      onConnect
    });
    await client.connect();
    await new Promise(r => setTimeout(r, 10));

    expect(mockFetch).not.toHaveBeenCalled();
    expect(onConnect).not.toHaveBeenCalled();
  });

  test('a throwing onConnect does not break the stream or prevent events', async () => {
    // The catch-up refresh must never tear down the live stream.
    const onConnect = vi.fn().mockRejectedValue(new Error('refresh failed'));
    mockFetch.mockResolvedValue({
      ok: true,
      status: 200,
      body: makeReadableStream([
        'event: page_updated\n',
        'data: {"type":"page_updated","change":"enriched","pageId":"p1"}\n\n'
      ]),
      headers: new Map()
    });
    const client = new RealtimeClient({
      bus,
      notify,
      getToken: async () => 'test-token',
      url: 'https://example.test/events/stream',
      onConnect
    });
    await client.connect();
    await new Promise(r => setTimeout(r, 10));

    expect(onConnect).toHaveBeenCalledTimes(1);
    // The stream still delivered the event despite the catch-up rejection.
    expect(bus.dispatch).toHaveBeenCalledWith({
      type: 'page_updated',
      change: 'enriched',
      pageId: 'p1'
    });
  });
});
