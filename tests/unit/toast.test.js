import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';

import { createToastRegion } from '../../src/toast.js';

// The toast region is a tiny transient-message host. These tests pin the
// behaviours callers rely on: show() injects the message, type sets the
// modifier + role, and the toast auto-dismisses after the configured duration.

describe('toast region', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    document.body.innerHTML = '<div id="toast-region"></div>';
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('shows the message and auto-dismisses after the duration', () => {
    const container = document.getElementById('toast-region');
    const region = createToastRegion({ container, documentObj: document, durationMs: 3000 });

    region.show('Browser bookmark sync enabled');

    const toast = container.querySelector('.toast');
    expect(toast).not.toBeNull();
    expect(toast.textContent).toBe('Browser bookmark sync enabled');
    expect(toast.getAttribute('role')).toBe('status');

    // rAF callback (flaked via fake timers + setTimeout fallback) adds visible.
    vi.advanceTimersByTime(10);
    expect(toast.classList.contains('toast--visible')).toBe(true);

    // Not yet dismissed at 2999ms.
    vi.advanceTimersByTime(2989);
    expect(container.querySelector('.toast')).not.toBeNull();

    // Gone after the full duration.
    vi.advanceTimersByTime(2);
    expect(container.querySelector('.toast')).toBeNull();
  });

  it('applies the success/error modifier and role', () => {
    const container = document.getElementById('toast-region');
    const region = createToastRegion({ container, documentObj: document });

    region.show('Sync failed — try again', { type: 'error' });

    const toast = container.querySelector('.toast');
    expect(toast.classList.contains('toast--error')).toBe(true);
    expect(toast.getAttribute('role')).toBe('alert');
  });

  it('replaces the active toast when a new one is shown before timeout', () => {
    const container = document.getElementById('toast-region');
    const region = createToastRegion({ container, documentObj: document, durationMs: 3000 });

    region.show('First message');
    vi.advanceTimersByTime(1000);
    region.show('Second message');

    const toasts = container.querySelectorAll('.toast');
    expect(toasts.length).toBe(1);
    expect(container.querySelector('.toast').textContent).toBe('Second message');
  });

  it('no-ops gracefully when the region is not mounted', () => {
    const region = createToastRegion({ container: null, documentObj: document });
    // Should not throw.
    region.show('anything');
    expect(document.querySelectorAll('.toast').length).toBe(0);
  });
});
