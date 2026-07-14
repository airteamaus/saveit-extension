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
});
