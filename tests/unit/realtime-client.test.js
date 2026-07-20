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

  function makeClient(overrides = {}) {
    return new RealtimeClient({
      bus,
      notify,
      getToken: async () => 'test-token',
      url: 'https://example.test/events/stream',
      // Default to real timers so existing tests that don't care about
      // reconnect still work. Tests that exercise backoff inject fakes.
      scheduleTimer: (fn, ms) => setTimeout(fn, ms),
      cancelTimer: id => clearTimeout(id),
      ...overrides
    });
  }

  // A fake scheduler that captures scheduled callbacks without running them,
  // so backoff tests can assert exactly which delays were requested and fire
  // them on demand. `flushMicrotasks` lets an async attemptConnection settle
  // between ticks.
  function makeFakeScheduler() {
    const scheduled = [];
    const scheduleTimer = (fn, ms) => {
      const id = scheduled.length;
      scheduled.push({ fn, ms, id, fired: false });
      return id;
    };
    const cancelTimer = id => {
      if (scheduled[id]) scheduled[id].cancelled = true;
    };
    const fire = async (id) => {
      const entry = scheduled[id];
      if (!entry || entry.cancelled || entry.fired) return;
      entry.fired = true;
      entry.fn();
      // Let the async attemptConnection settle.
      await new Promise(r => setTimeout(r, 0));
    };
    const fireAll = async () => {
      // Fire in order, skipping cancelled. New entries scheduled by fires are
      // picked up on the next loop iteration.
      for (let i = 0; i < scheduled.length; i++) {
        await fire(i);
      }
    };
    return { scheduled, scheduleTimer, cancelTimer, fire, fireAll };
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

  test('on stream close, schedules a reconnect with backoff (no toast)', async () => {
    // The server closes the stream (15-min timeout). The client must reconnect
    // silently rather than toast — toasting on every periodic server-side close
    // would be noise. Toast only fires after all attempts are exhausted.
    mockFetch.mockResolvedValue({
      ok: true,
      status: 200,
      body: makeReadableStream([]),  // immediately closes
      headers: new Map()
    });
    const scheduler = makeFakeScheduler();
    const client = makeClient({ ...scheduler });
    await client.connect();
    await new Promise(r => setTimeout(r, 0));

    expect(notify).not.toHaveBeenCalled();
    expect(scheduler.scheduled).toHaveLength(1);
    expect(scheduler.scheduled[0].ms).toBe(1000);  // initial backoff
  });

  test('on fetch error, schedules a reconnect with backoff (no toast)', async () => {
    mockFetch.mockRejectedValue(new Error('network'));
    const scheduler = makeFakeScheduler();
    const client = makeClient({ ...scheduler });
    await client.connect();
    await new Promise(r => setTimeout(r, 0));

    expect(notify).not.toHaveBeenCalled();
    expect(scheduler.scheduled).toHaveLength(1);
    expect(scheduler.scheduled[0].ms).toBe(1000);
  });

  test('reconnect succeeds and fires onConnect again (catch-up on every reconnect)', async () => {
    // First stream closes immediately; the scheduled reconnect opens a second
    // stream that delivers an event. onConnect must fire on both.
    const onConnect = vi.fn().mockResolvedValue(undefined);
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      body: makeReadableStream([]),
      headers: new Map()
    });
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      body: makeReadableStream([
        'event: page_updated\n',
        'data: {"type":"page_updated","change":"enriched","pageId":"p1"}\n\n'
      ]),
      headers: new Map()
    });
    const scheduler = makeFakeScheduler();
    const client = makeClient({ ...scheduler, onConnect });
    await client.connect();
    await new Promise(r => setTimeout(r, 0));

    expect(onConnect).toHaveBeenCalledTimes(1);
    expect(scheduler.scheduled).toHaveLength(1);

    // Fire the scheduled reconnect.
    await scheduler.fire(0);

    expect(mockFetch).toHaveBeenCalledTimes(2);
    await new Promise(r => setTimeout(r, 10));
    expect(onConnect).toHaveBeenCalledTimes(2);
    expect(bus.dispatch).toHaveBeenCalledWith({
      type: 'page_updated',
      change: 'enriched',
      pageId: 'p1'
    });
  });

  test('backoff doubles across attempts and caps at maxBackoffMs', async () => {
    mockFetch.mockRejectedValue(new Error('network'));  // every attempt fails
    const scheduler = makeFakeScheduler();
    const client = makeClient({
      ...scheduler,
      maxReconnectAttempts: 6,
      maxBackoffMs: 5000
    });
    await client.connect();
    await new Promise(r => setTimeout(r, 0));

    // Fire each scheduled reconnect in turn; collect the delays.
    const delays = [];
    for (let i = 0; i < scheduler.scheduled.length; i++) {
      delays.push(scheduler.scheduled[i].ms);
      await scheduler.fire(i);
    }

    // 1s, 2s, 4s, 5s (capped), 5s, 5s — six attempts then give-up.
    expect(delays).toEqual([1000, 2000, 4000, 5000, 5000, 5000]);
  });

  test('toasts once and stops reconnecting after maxReconnectAttempts', async () => {
    mockFetch.mockRejectedValue(new Error('network'));
    const scheduler = makeFakeScheduler();
    const client = makeClient({ ...scheduler, maxReconnectAttempts: 3 });
    await client.connect();
    await new Promise(r => setTimeout(r, 0));

    // Drain the whole attempt chain.
    await scheduler.fireAll();

    expect(notify).toHaveBeenCalledTimes(1);
    expect(notify).toHaveBeenCalledWith('Refresh to pick up changes', {});
    // No further reconnect scheduled after giving up.
    expect(scheduler.scheduled.filter(s => !s.cancelled)).toHaveLength(3);
  });

  test('a successful stream resets the backoff counter for the next drop', async () => {
    // Initial connect fails, first retry fails, second retry succeeds, then the
    // stream closes. The drop AFTER the success should start from the initial
    // backoff (1s), not continue the prior chain (which would be 4s).
    mockFetch
      .mockRejectedValueOnce(new Error('net'))   // initial connect → backoff 1s
      .mockRejectedValueOnce(new Error('net'))   // retry 0 → backoff 2s
      .mockResolvedValueOnce({                    // retry 1 → success, reset
        ok: true, status: 200, body: makeReadableStream([]), headers: new Map()
      });                                         // stream closes → backoff 1s again
    const scheduler = makeFakeScheduler();
    const client = makeClient({ ...scheduler });
    await client.connect();
    await new Promise(r => setTimeout(r, 0));

    await scheduler.fire(0);  // retry 0 fails
    await scheduler.fire(1);  // retry 1 succeeds, stream closes
    // Let the successful stream read, close, and schedule its reconnect.
    await new Promise(r => setTimeout(r, 10));

    // The post-success reconnect should be back at the initial 1s backoff,
    // proving the success reset the counter.
    const lastScheduled = scheduler.scheduled[scheduler.scheduled.length - 1];
    expect(lastScheduled.ms).toBe(1000);
  });

  test('disconnect cancels the pending reconnect timer', async () => {
    mockFetch.mockRejectedValue(new Error('network'));
    const scheduler = makeFakeScheduler();
    const client = makeClient({ ...scheduler });
    await client.connect();
    await new Promise(r => setTimeout(r, 0));

    expect(scheduler.scheduled).toHaveLength(1);
    client.disconnect();
    expect(scheduler.scheduled[0].cancelled).toBe(true);
    expect(notify).not.toHaveBeenCalled();
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

  test('after disconnect, a manual connect reopens the stream and resets backoff', async () => {
    // First connect: stream closes immediately → reconnect is scheduled
    // (silent, no toast under the new contract).
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      body: makeReadableStream([]),
      headers: new Map()
    });
    const scheduler = makeFakeScheduler();
    const client = makeClient({ ...scheduler });
    await client.connect();
    await new Promise(r => setTimeout(r, 10));
    expect(notify).not.toHaveBeenCalled();
    expect(scheduler.scheduled).toHaveLength(1);

    // User navigates away (pagehide) then comes back. The pending reconnect
    // timer is cancelled by disconnect(); a fresh connect() reopens the stream
    // and starts a new backoff chain.
    client.disconnect();
    expect(scheduler.scheduled[0].cancelled).toBe(true);

    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      body: makeReadableStream([]),
      headers: new Map()
    });
    await client.connect();
    await new Promise(r => setTimeout(r, 10));
    expect(mockFetch).toHaveBeenCalledTimes(2);
    // The fresh connect schedules a new reconnect from initial backoff. The
    // pre-disconnect timer was cancelled, so exactly one live timer remains.
    const liveTimers = scheduler.scheduled.filter(s => !s.cancelled);
    expect(liveTimers).toHaveLength(1);
    expect(liveTimers[0].ms).toBe(1000);
  });

  // Regression: SSE has no replay buffer, so events that fire during a
  // disconnect are lost. The onConnect callback lets the newtab page run a
  // catch-up refreshOpenScopes each time the stream (re)establishes, picking up
  // missed updates via the standard update-check. Auto-reconnect fires onConnect
  // on every successful (re)connection, not just the first.
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
