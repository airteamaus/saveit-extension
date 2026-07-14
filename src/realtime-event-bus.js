// realtime-event-bus.js — typed pub/sub that decouples the SSE transport
// (RealtimeClient) from the surfaces that react to changes (stores, sidebar,
// pending-save clearer). Subscribers register for an event type; the bus
// dispatches parsed SSE events to all matching subscribers.

export class RealtimeEventBus {
  constructor() {
    this.subscribers = new Map();
  }

  subscribe(eventType, handler) {
    if (!this.subscribers.has(eventType)) {
      this.subscribers.set(eventType, new Set());
    }
    this.subscribers.get(eventType).add(handler);
    return () => {
      const set = this.subscribers.get(eventType);
      if (set) {
        set.delete(handler);
        if (set.size === 0) {
          this.subscribers.delete(eventType);
        }
      }
    };
  }

  dispatch(event) {
    const set = this.subscribers.get(event?.type);
    if (!set) return;
    for (const handler of set) {
      try {
        handler(event);
      } catch (err) {
        // A failing subscriber must not break other subscribers.
        console.error('[realtime-event-bus] subscriber threw:', err);
      }
    }
  }

  clear() {
    this.subscribers.clear();
  }
}
