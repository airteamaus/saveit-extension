import { describe, expect, test, vi } from 'vitest';
import { RealtimeEventBus } from '../../src/realtime-event-bus.js';

describe('RealtimeEventBus', () => {
  test('dispatch calls subscribed handler for matching type', () => {
    const bus = new RealtimeEventBus();
    const handler = vi.fn();
    bus.subscribe('project_page_changed', handler);
    bus.dispatch({ type: 'project_page_changed', change: 'added', projectId: 'p1' });
    expect(handler).toHaveBeenCalledWith({ type: 'project_page_changed', change: 'added', projectId: 'p1' });
  });

  test('dispatch does not call handler for non-matching type', () => {
    const bus = new RealtimeEventBus();
    const handler = vi.fn();
    bus.subscribe('project_page_changed', handler);
    bus.dispatch({ type: 'page_updated', change: 'enriched' });
    expect(handler).not.toHaveBeenCalled();
  });

  test('unsubscribe removes the handler', () => {
    const bus = new RealtimeEventBus();
    const handler = vi.fn();
    const unsubscribe = bus.subscribe('project_page_changed', handler);
    unsubscribe();
    bus.dispatch({ type: 'project_page_changed', change: 'added' });
    expect(handler).not.toHaveBeenCalled();
  });

  test('multiple handlers for the same type all fire', () => {
    const bus = new RealtimeEventBus();
    const h1 = vi.fn();
    const h2 = vi.fn();
    bus.subscribe('project_page_changed', h1);
    bus.subscribe('project_page_changed', h2);
    bus.dispatch({ type: 'project_page_changed', change: 'added' });
    expect(h1).toHaveBeenCalled();
    expect(h2).toHaveBeenCalled();
  });

  test('clear removes all subscribers', () => {
    const bus = new RealtimeEventBus();
    const handler = vi.fn();
    bus.subscribe('project_page_changed', handler);
    bus.clear();
    bus.dispatch({ type: 'project_page_changed', change: 'added' });
    expect(handler).not.toHaveBeenCalled();
  });

  test('dispatch with no subscribers is a no-op', () => {
    const bus = new RealtimeEventBus();
    expect(() => bus.dispatch({ type: 'page_updated', change: 'enriched' })).not.toThrow();
  });

  test('a failing subscriber does not break other subscribers', () => {
    const bus = new RealtimeEventBus();
    const failingHandler = vi.fn(() => { throw new Error('boom'); });
    const healthyHandler = vi.fn();
    bus.subscribe('project_page_changed', failingHandler);
    bus.subscribe('project_page_changed', healthyHandler);
    // Suppress console.error from the catch block during this test
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    bus.dispatch({ type: 'project_page_changed', change: 'added' });
    expect(failingHandler).toHaveBeenCalled();
    expect(healthyHandler).toHaveBeenCalled();
    spy.mockRestore();
  });
});
