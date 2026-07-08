import { describe, expect, it, vi } from 'vitest';

import { resolveInitialAuthState } from '../../src/firebase-auth-state.js';

describe('resolveInitialAuthState', () => {
  it('resolves with the user from the first auth callback', async () => {
    const user = { uid: 'user-1' };
    const subscribe = vi.fn(cb => cb(user));

    const result = await resolveInitialAuthState({ subscribe });

    expect(result).toEqual({ user, timedOut: false });
  });

  it('invokes onChange on the first callback and on later auth changes', async () => {
    const onChange = vi.fn();
    let listener;
    const subscribe = vi.fn(cb => { listener = cb; });

    const promise = resolveInitialAuthState({ subscribe, onChange });
    listener({ uid: 'user-1' });
    await promise;

    // First callback fired onChange; a subsequent change must still call it,
    // because the listener stays registered after the promise resolves.
    onChange.mockClear();
    listener(null);
    expect(onChange).toHaveBeenCalledWith(null);
  });

  it('awaits the first onChange before resolving, so callers can gate startup on it', async () => {
    let releaseOnChange;
    const onChange = vi.fn(() => new Promise(resolve => { releaseOnChange = resolve; }));
    let resolveFirst;
    const subscribe = vi.fn(cb => { resolveFirst = () => cb({ uid: 'user-1' }); });

    const promise = resolveInitialAuthState({ subscribe, onChange });
    resolveFirst();

    // onChange has started but not finished; the promise must still be pending.
    await new Promise(r => setTimeout(r, 0));
    expect(onChange).toHaveBeenCalledTimes(1);
    let resolved = false;
    promise.then(() => { resolved = true; });
    await new Promise(r => setTimeout(r, 0));
    expect(resolved).toBe(false);

    releaseOnChange();
    await expect(promise).resolves.toEqual({ user: { uid: 'user-1' }, timedOut: false });
  });

  it('treats subsequent onChange calls as fire-and-forget (does not block)', async () => {
    // Slow first onChange, instant second change: the second must not delay
    // resolution beyond the first.
    let listener;
    const subscribe = vi.fn(cb => { listener = cb; });
    const onChange = vi.fn(() => new Promise(() => {})); // never resolves

    const promise = resolveInitialAuthState({ subscribe, onChange });
    listener({ uid: 'user-1' });
    // The first onChange never resolves, so the promise should stay pending
    // (this confirms the first onChange IS awaited, not fire-and-forget).
    let resolved = false;
    promise.then(() => { resolved = true; });
    await new Promise(r => setTimeout(r, 0));
    expect(resolved).toBe(false);
  });

  it('normalises a falsy first user to null', async () => {
    const subscribe = vi.fn(cb => cb(undefined));
    const result = await resolveInitialAuthState({ subscribe });
    expect(result).toEqual({ user: null, timedOut: false });
  });

  it('resolves only once even if multiple callbacks fire', async () => {
    let listener;
    const subscribe = vi.fn(cb => { listener = cb; });
    const onChange = vi.fn();
    const resolveSpy = vi.fn();

    const promise = resolveInitialAuthState({ subscribe, onChange }).then(result => {
      resolveSpy(result);
      return result;
    });
    listener({ uid: 'user-1' });
    listener({ uid: 'user-2' });
    await promise;

    expect(resolveSpy).toHaveBeenCalledTimes(1);
    expect(resolveSpy).toHaveBeenCalledWith({ user: { uid: 'user-1' }, timedOut: false });
    expect(onChange).toHaveBeenCalledTimes(2);
  });

  it('times out with timedOut: true when no callback fires', async () => {
    vi.useFakeTimers();
    try {
      const subscribe = vi.fn(() => {});
      const promise = resolveInitialAuthState({ subscribe, timeoutMs: 10_000 });

      // No listener fires; only the timeout should resolve it.
      await vi.advanceTimersByTimeAsync(10_000);

      await expect(promise).resolves.toEqual({ user: null, timedOut: true });
    } finally {
      vi.useRealTimers();
    }
  });

  it('clears the timeout when a callback wins the race', async () => {
    vi.useFakeTimers();
    try {
      let listener;
      const subscribe = vi.fn(cb => { listener = cb; });
      const promise = resolveInitialAuthState({ subscribe, timeoutMs: 10_000 });

      listener({ uid: 'user-1' });
      await expect(promise).resolves.toEqual({ user: { uid: 'user-1' }, timedOut: false });

      // A late timeout must not change the resolved value or reject — the
      // timer is cleared on resolve.
      await vi.advanceTimersByTimeAsync(20_000);
      await expect(promise).resolves.toEqual({ user: { uid: 'user-1' }, timedOut: false });
    } finally {
      vi.useRealTimers();
    }
  });

  it('surfaces a late first callback via onChange after the timeout fired', async () => {
    vi.useFakeTimers();
    try {
      let listener;
      const subscribe = vi.fn(cb => { listener = cb; });
      const onChange = vi.fn();
      const promise = resolveInitialAuthState({ subscribe, onChange, timeoutMs: 10_000 });

      await vi.advanceTimersByTimeAsync(10_000);
      await expect(promise).resolves.toEqual({ user: null, timedOut: true });

      // A late first callback (e.g. a slow session restore) must NOT re-resolve
      // the promise, but SHOULD still fire onChange so the UI can recover
      // instead of being left on the signed-out state.
      onChange.mockReset();
      listener({ uid: 'user-1' });
      await vi.advanceTimersByTimeAsync(0);
      expect(onChange).toHaveBeenCalledWith({ uid: 'user-1' });
      await expect(promise).resolves.toEqual({ user: null, timedOut: true });
    } finally {
      vi.useRealTimers();
    }
  });
});
