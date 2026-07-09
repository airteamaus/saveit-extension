import { describe, expect, it, vi } from 'vitest';

import { createSavePoll, SAVE_POLL_INTERVALS_MS } from '../../src/save-poll.js';

// Fake timers let us advance time deterministically without real waits.
import { vi as vitestVi } from 'vitest';

describe('save-poll', () => {
  beforeEach(() => {
    vitestVi.useFakeTimers();
  });

  afterEach(() => {
    vitestVi.useRealTimers();
    vitestVi.clearAllMocks();
  });

  it('exposes increasing poll intervals', () => {
    expect(SAVE_POLL_INTERVALS_MS.length).toBeGreaterThan(0);
    for (let i = 1; i < SAVE_POLL_INTERVALS_MS.length; i++) {
      expect(SAVE_POLL_INTERVALS_MS[i]).toBeGreaterThanOrEqual(SAVE_POLL_INTERVALS_MS[i - 1]);
    }
  });

  it('calls onFound and stops as soon as checkFn resolves true', async () => {
    const checkFn = vitestVi.fn(async () => true);
    const onFound = vitestVi.fn();
    const onGiveUp = vitestVi.fn();

    const poll = createSavePoll({ checkFn, onFound, onGiveUp });
    poll.start();

    // first check fires after the first interval
    await vitestVi.advanceTimersByTimeAsync(SAVE_POLL_INTERVALS_MS[0] + 10);

    expect(checkFn).toHaveBeenCalledTimes(1);
    expect(onFound).toHaveBeenCalledTimes(1);
    expect(onGiveUp).not.toHaveBeenCalled();
  });

  it('keeps polling until checkFn resolves true', async () => {
    let calls = 0;
    const checkFn = vitestVi.fn(async () => {
      calls++;
      return calls >= 3; // found on the 3rd check
    });
    const onFound = vitestVi.fn();
    const onGiveUp = vitestVi.fn();

    const poll = createSavePoll({ checkFn, onFound, onGiveUp });
    poll.start();

    await vitestVi.advanceTimersByTimeAsync(SAVE_POLL_INTERVALS_MS[0] + 10);
    expect(checkFn).toHaveBeenCalledTimes(1);
    expect(onFound).not.toHaveBeenCalled();

    await vitestVi.advanceTimersByTimeAsync(SAVE_POLL_INTERVALS_MS[1] + 10);
    expect(checkFn).toHaveBeenCalledTimes(2);
    expect(onFound).not.toHaveBeenCalled();

    await vitestVi.advanceTimersByTimeAsync(SAVE_POLL_INTERVALS_MS[2] + 10);
    expect(checkFn).toHaveBeenCalledTimes(3);
    expect(onFound).toHaveBeenCalledTimes(1);
    expect(onGiveUp).not.toHaveBeenCalled();
  });

  it('calls onGiveUp after all intervals are exhausted without a find', async () => {
    const checkFn = vitestVi.fn(async () => false);
    const onFound = vitestVi.fn();
    const onGiveUp = vitestVi.fn();

    const poll = createSavePoll({ checkFn, onFound, onGiveUp });
    poll.start();

    // advance past all intervals
    const total = SAVE_POLL_INTERVALS_MS.reduce((a, b) => a + b, 0) + 100;
    await vitestVi.advanceTimersByTimeAsync(total);

    expect(checkFn).toHaveBeenCalledTimes(SAVE_POLL_INTERVALS_MS.length);
    expect(onFound).not.toHaveBeenCalled();
    expect(onGiveUp).toHaveBeenCalledTimes(1);
  });

  it('stops polling when stop() is called', async () => {
    const checkFn = vitestVi.fn(async () => false);
    const onFound = vitestVi.fn();
    const onGiveUp = vitestVi.fn();

    const poll = createSavePoll({ checkFn, onFound, onGiveUp });
    poll.start();
    poll.stop();

    await vitestVi.advanceTimersByTimeAsync(SAVE_POLL_INTERVALS_MS[0] + 1000);

    expect(checkFn).not.toHaveBeenCalled();
    expect(onFound).not.toHaveBeenCalled();
    expect(onGiveUp).not.toHaveBeenCalled();
  });

  it('a checkFn rejection does not crash the poll (treated as not-found, keeps going)', async () => {
    let calls = 0;
    const checkFn = vitestVi.fn(async () => {
      calls++;
      if (calls === 1) {
        throw new Error('transient network error');
      }
      return true;
    });
    const onFound = vitestVi.fn();

    const poll = createSavePoll({ checkFn, onFound, onGiveUp: vitestVi.fn() });
    poll.start();

    await vitestVi.advanceTimersByTimeAsync(SAVE_POLL_INTERVALS_MS[0] + 10);
    // first check threw — treated as not found, poll continues
    expect(onFound).not.toHaveBeenCalled();

    await vitestVi.advanceTimersByTimeAsync(SAVE_POLL_INTERVALS_MS[1] + 10);
    expect(onFound).toHaveBeenCalledTimes(1);
  });
});
