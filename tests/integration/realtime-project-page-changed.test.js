// Integration test for the realtime push end-to-end (client-side) flow:
//   SSE frame  ->  RealtimeClient (parse)  ->  RealtimeEventBus (dispatch)
//   ->  subscriber mirroring production wiring  ->  store.refreshInitial()
//
// This is the "focused integration fallback" sanctioned by the task brief: the
// E2E Playwright suite runs the real extension in a headed browser and cannot
// easily intercept fetch() to return a streamed SSE body (Playwright route
// fulfillment is buffered, and the real-extension tests are skipped in CI).
// Here we exercise the real RealtimeClient parsing path + the real
// RealtimeEventBus pub/sub + a subscriber that mirrors how newtab-app.js /
// newtab-drawer-runtime.js react to a 'project_page_changed' event, and assert
// the matching store's refreshInitial() fires with the right event data.

import { describe, expect, test, vi, beforeEach } from 'vitest';
import { RealtimeClient } from '../../src/realtime-client.js';
import { RealtimeEventBus } from '../../src/realtime-event-bus.js';

// Build a ReadableStream that yields the given string chunks in sequence (the
// same shape a fetch().body ReadableStream has). Encoded as UTF-8 just like a
// real text/event-stream response.
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

// A canned SSE stream containing exactly one 'project_page_changed' event whose
// payload mirrors the EventDoc shape the backend emits (Task 3's formatSseFrame).
// Frame format per the SSE spec: "event: <type>\ndata: <json>\n\n".
const PROJECT_PAGE_CHANGED_SSE = [
  'event: project_page_changed\n',
  'data: {"type":"project_page_changed","change":"added","projectId":"proj-42","pageId":"page-7","scopeKeys":["project:proj-42"],"emittedAt":"2026-07-14T00:00:00.000Z"}\n\n'
];

// Mock project store: only tracks refreshInitial calls so the subscriber can
// target it. Mirrors the shape of a WarmCacheListStore for our purposes.
function makeMockStore() {
  return { refreshInitial: vi.fn() };
}

describe('realtime push: project_page_changed -> refreshInitial', () => {
  let mockFetch;
  let notify;

  beforeEach(() => {
    mockFetch = vi.fn();
    global.fetch = mockFetch;
    notify = vi.fn();
  });

  // Build the client + bus + subscribers exactly as newtab-app.js wires them
  // for the 'project_page_changed' event type, but with mock stores standing in
  // for savedPagesStore / projectsStore. The subscriber mirrors the production
  // handler in newtab-drawer-runtime.js: refresh the open project's page list
  // when the event's projectId matches the currently-selected project, and
  // always refresh the projects list.
  function wireRealtime({ selectedProjectId }) {
    const bus = new RealtimeEventBus();
    const savedPagesStore = makeMockStore();
    const projectsStore = makeMockStore();

    // This subscriber is a faithful copy of handleRealtimeProjectEvent in
    // newtab-drawer-runtime.js (the only production consumer of this event).
    bus.subscribe('project_page_changed', (event) => {
      if (event?.projectId && event.projectId === selectedProjectId) {
        savedPagesStore.refreshInitial();
      }
      projectsStore.refreshInitial();
    });

    const client = new RealtimeClient({
      bus,
      notify,
      getToken: async () => 'test-token',
      url: 'https://example.test/events/stream'
    });

    return { bus, client, savedPagesStore, projectsStore };
  }

  test('matching project: refreshes both the open project pages and the projects list', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      status: 200,
      body: makeReadableStream(PROJECT_PAGE_CHANGED_SSE),
      headers: new Map()
    });

    const { client, savedPagesStore, projectsStore } = wireRealtime({
      selectedProjectId: 'proj-42' // matches the event's projectId
    });

    await client.connect();
    // Allow the stream reader microtask to flush before asserting.
    await new Promise((r) => setTimeout(r, 10));

    // The event's projectId matches the open project: its page list must refresh.
    expect(savedPagesStore.refreshInitial).toHaveBeenCalledTimes(1);
    // The projects list always refreshes (page counts may have changed).
    expect(projectsStore.refreshInitial).toHaveBeenCalledTimes(1);
  });

  test('non-matching project: refreshes only the projects list, not the open project pages', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      status: 200,
      body: makeReadableStream(PROJECT_PAGE_CHANGED_SSE),
      headers: new Map()
    });

    const { client, savedPagesStore, projectsStore } = wireRealtime({
      selectedProjectId: 'proj-other' // does NOT match proj-42 in the event
    });

    await client.connect();
    await new Promise((r) => setTimeout(r, 10));

    // The open project is a different one: its page list must NOT refresh.
    expect(savedPagesStore.refreshInitial).not.toHaveBeenCalled();
    // The projects list still refreshes (page counts may have changed).
    expect(projectsStore.refreshInitial).toHaveBeenCalledTimes(1);
  });

  test('the event delivered to the subscriber carries the parsed payload (change, pageId, projectId)', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      status: 200,
      body: makeReadableStream(PROJECT_PAGE_CHANGED_SSE),
      headers: new Map()
    });

    // Capture the raw event the production-style subscriber receives, to prove
    // the whole client -> bus pipeline preserves the SSE payload fields.
    const bus = new RealtimeEventBus();
    const received = vi.fn();
    bus.subscribe('project_page_changed', received);

    const client = new RealtimeClient({
      bus,
      notify,
      getToken: async () => 'test-token',
      url: 'https://example.test/events/stream'
    });

    await client.connect();
    await new Promise((r) => setTimeout(r, 10));

    expect(received).toHaveBeenCalledTimes(1);
    expect(received).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'project_page_changed',
        change: 'added',
        projectId: 'proj-42',
        pageId: 'page-7',
        scopeKeys: ['project:proj-42']
      })
    );
  });

  test('heartbeat comments interleaved with the event do not break the flow', async () => {
    // Real SSE streams interleave ": keepalive" comments; the parser must skip
    // them and still deliver the real frame to the matching subscriber.
    mockFetch.mockResolvedValue({
      ok: true,
      status: 200,
      body: makeReadableStream([': keepalive\n\n', ...PROJECT_PAGE_CHANGED_SSE, ': keepalive\n\n']),
      headers: new Map()
    });

    const { client, savedPagesStore, projectsStore } = wireRealtime({
      selectedProjectId: 'proj-42'
    });

    await client.connect();
    await new Promise((r) => setTimeout(r, 10));

    expect(savedPagesStore.refreshInitial).toHaveBeenCalledTimes(1);
    expect(projectsStore.refreshInitial).toHaveBeenCalledTimes(1);
  });

  test('the Authorization header is sent on the SSE request', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      status: 200,
      body: makeReadableStream(PROJECT_PAGE_CHANGED_SSE),
      headers: new Map()
    });

    const { client } = wireRealtime({ selectedProjectId: 'proj-42' });
    await client.connect();
    await new Promise((r) => setTimeout(r, 10));

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
});
